"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneCapture } from "../../lib/audio/microphone";
import { PcmPlayback } from "../../lib/audio/playback";
import { applyTranscript } from "../../lib/audio/transcript";
import { formatDuration, initialCallState, isInCall, reduceCall, statusLabel } from "../../lib/call/machine";
import type { CallState } from "../../lib/call/machine";
import type { TranscriptLine } from "../../lib/gemini/types";
import { PhraseSpeaker } from "../../lib/audio/speaker";
import type { ListenMode } from "../../lib/settings/model";
import { MSG, micErrorMessage } from "../../lib/utils/messages";

const SPEECH_LEVEL = 0.035;

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined"
  );
}

function wavBlob(chunks: Int16Array[], rate = 16000): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pcm = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const bytes = pcm.length * 2;
  const write = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}

export function useVoiceCall() {
  const [state, setState] = useState<CallState>(initialCallState);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [levelSource, setLevelSource] = useState<"user" | "assistant" | "idle">("idle");

  const stateRef = useRef(state);
  stateRef.current = state;
  const lineSeq = useRef(0);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const playRef = useRef<PcmPlayback | null>(null);
  const speakerRef = useRef<PhraseSpeaker | null>(null);
  const [mode, setMode] = useState<ListenMode>("solo");
  const modeRef = useRef<ListenMode>("solo");
  modeRef.current = mode;
  const audioRef = useRef<AudioContext | null>(null);
  const micMutedRef = useRef(false);
  const startedAt = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const samplesRef = useRef(0);
  const busyRef = useRef(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const voiceSince = useRef<number | null>(null);
  const lastVoiceAt = useRef(0);
  const heardSpeech = useRef(false);

  const dispatch = useCallback((event: Parameters<typeof reduceCall>[1]) => {
    setState((current) => {
      const next = reduceCall(current, event);
      micMutedRef.current = next.micMuted;
      return next;
    });
  }, []);

  const pushLine = useCallback((role: TranscriptLine["role"], text: string, finished: boolean) => {
    lineSeq.current += 1;
    const id = `${role}-${lineSeq.current}`;
    setLines((current) => applyTranscript(current, role, text, finished, id));
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseAudio = useCallback(async () => {
    micRef.current?.stop();
    micRef.current = null;
    speakerRef.current?.clear();
    speakerRef.current = null;
    await playRef.current?.close();
    playRef.current = null;
    const ctx = audioRef.current;
    audioRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const endCall = useCallback(async () => {
    dispatch({ type: "END" });
    stopTimer();
    startedAt.current = null;
    chunksRef.current = [];
    samplesRef.current = 0;
    heardSpeech.current = false;
    await releaseAudio();
    setLevel(0);
    setLevelSource("idle");
    dispatch({ type: "ENDED" });
  }, [dispatch, releaseAudio]);

  const flush = useCallback(async () => {
    if (busyRef.current || micMutedRef.current || !heardSpeech.current) return;
    const chunks = chunksRef.current;
    const samples = samplesRef.current;
    chunksRef.current = [];
    samplesRef.current = 0;
    heardSpeech.current = false;
    voiceSince.current = null;
    lastVoiceAt.current = 0;
    if (samples < 16000 * 0.28) return;
    busyRef.current = true;
    dispatch({ type: "THINKING" });
    try {
      const body = new FormData();
      body.set("audio", wavBlob(chunks), "speech.wav");
      body.set("history", JSON.stringify(historyRef.current.slice(-10)));
      body.set("mode", modeRef.current);
      const response = await fetch("/api/openai/turn", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; heard?: string; reply?: string; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.reply) {
        dispatch({ type: "FAIL", message: payload?.message || MSG.connectFailed });
        return;
      }
      if (payload.heard) {
        pushLine("user", payload.heard, true);
        historyRef.current.push({ role: "user", content: payload.heard });
      }
      pushLine("assistant", payload.reply, true);
      historyRef.current.push({ role: "assistant", content: payload.reply });
      speakerRef.current?.setFast(true);
      speakerRef.current?.push(payload.reply, true);
      speakerRef.current?.finish();
      dispatch({ type: "ASSISTANT_SPEAKING" });
      setLevelSource("assistant");
    } catch {
      dispatch({ type: "FAIL", message: MSG.connectFailed });
    } finally {
      busyRef.current = false;
    }
  }, [dispatch, pushLine]);

  const beginSession = useCallback(async () => {
    if (!supported()) {
      dispatch({ type: "FAIL", message: window.isSecureContext ? MSG.unsupported : MSG.insecure });
      return;
    }
    dispatch({ type: "START" });
    const context = new AudioContext();
    audioRef.current = context;
    await context.resume();
    const playback = new PcmPlayback(context);
    playRef.current = playback;
    const speaker = new PhraseSpeaker(
      playback,
      () => {
        dispatch({ type: "ASSISTANT_SPEAKING" });
        setLevelSource("assistant");
      },
      () => {
        /* voice failure should not kill the call */
      },
    );
    speakerRef.current = speaker;
    speaker.setFast(true);
    const mic = new MicrophoneCapture({
      onLevel: (value) => {
        const now = Date.now();
        const talking = value > SPEECH_LEVEL;
        if (!busyRef.current) {
          setLevel(value);
          setLevelSource(talking ? "user" : "idle");
        }
        if (micMutedRef.current) return;
        if (talking) {
          if (!voiceSince.current) voiceSince.current = now;
          lastVoiceAt.current = now;
          heardSpeech.current = true;
          if (now - voiceSince.current > 140) dispatch({ type: "USER_SPEAKING", active: true });
          if (speakerRef.current?.busy && now - voiceSince.current > 320) {
            speakerRef.current.clear();
            playRef.current?.clear();
          }
          return;
        }
        if (voiceSince.current && now - lastVoiceAt.current > 260) voiceSince.current = null;
        if (busyRef.current || speakerRef.current?.busy || !heardSpeech.current) return;
        const gap = modeRef.current === "group" ? 1300 : 750;
        if (lastVoiceAt.current && now - lastVoiceAt.current > gap && samplesRef.current > 16000 * 0.28) void flush();
      },
      onPcm: (pcm) => {
        if (micMutedRef.current || busyRef.current) return;
        chunksRef.current.push(pcm);
        samplesRef.current += pcm.length;
        if (samplesRef.current > 16000 * 14 && heardSpeech.current) void flush();
      },
    });
    micRef.current = mic;
    try {
      await mic.start(context);
    } catch (error) {
      await releaseAudio();
      dispatch({ type: "FAIL", message: micErrorMessage(error, window.isSecureContext) });
      return;
    }
    dispatch({ type: "PERMISSION_GRANTED" });
    dispatch({ type: "LIVE" });
    mic.setSending(true);
    if (!startedAt.current) {
      startedAt.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        if (!startedAt.current) return;
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
    }
  }, [dispatch, flush, releaseAudio]);

  const retry = useCallback(async () => {
    await beginSession();
  }, [beginSession]);

  const toggleMic = useCallback(() => {
    const nextMuted = !micMutedRef.current;
    dispatch({ type: "TOGGLE_MIC" });
    micRef.current?.setSending(!nextMuted);
  }, [dispatch]);

  const toggleSpeaker = useCallback(() => {
    const next = !stateRef.current.speakerMuted;
    dispatch({ type: "TOGGLE_SPEAKER" });
    playRef.current?.setMuted(next);
    if (next) playRef.current?.clear();
  }, [dispatch]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void audioRef.current?.resume();
    };
    document.addEventListener("visibilitychange", onVis);
    let frame = 0;
    const tick = () => {
      const output = playRef.current?.getLevel() ?? 0;
      if (output > 0.02 && stateRef.current.phase === "assistant_speaking") {
        setLevel(output);
        setLevelSource("assistant");
      } else if (!playRef.current?.pending && !speakerRef.current?.busy && stateRef.current.phase === "assistant_speaking") {
        dispatch({ type: "LISTENING" });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [dispatch]);

  useEffect(() => {
    return () => {
      speakerRef.current?.clear();
      micRef.current?.stop();
      void playRef.current?.close();
      void audioRef.current?.close();
      stopTimer();
    };
  }, []);

  return {
    state,
    status: statusLabel(state),
    inCall: isInCall(state),
    lines,
    transcriptOpen,
    setTranscriptOpen,
    seconds: formatDuration(seconds),
    level,
    levelSource,
    beginSession,
    endCall,
    retry,
    toggleMic,
    toggleSpeaker,
    mode,
    setMode,
  };
}
