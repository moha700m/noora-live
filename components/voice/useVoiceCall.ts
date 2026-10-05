"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneCapture } from "../../lib/audio/microphone";
import { PcmPlayback } from "../../lib/audio/playback";
import { applyTranscript } from "../../lib/audio/transcript";
import { shouldBarge, TurnBuffer } from "../../lib/audio/turn-buffer";
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
  const [voiceError, setVoiceError] = useState<string | null>(null);

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
  const busyRef = useRef(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const bufferRef = useRef(new TurnBuffer());
  const voiceSince = useRef<number | null>(null);
  const lastVoiceAt = useRef(0);
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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
    sessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    bufferRef.current.reset();
    dispatch({ type: "END" });
    stopTimer();
    startedAt.current = null;
    setVoiceError(null);
    await releaseAudio();
    setLevel(0);
    setLevelSource("idle");
    dispatch({ type: "ENDED" });
  }, [dispatch, releaseAudio]);

  const flush = useCallback(async () => {
    if (busyRef.current || micMutedRef.current || !bufferRef.current.ready(false)) return;
    const chunks = bufferRef.current.take();
    voiceSince.current = null;
    lastVoiceAt.current = 0;
    if (!chunks) return;
    const session = sessionRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    busyRef.current = true;
    dispatch({ type: "THINKING" });
    try {
      const body = new FormData();
      body.set("audio", wavBlob(chunks), "speech.wav");
      body.set("history", JSON.stringify(historyRef.current.slice(-10)));
      body.set("mode", modeRef.current);
      const response = await fetch("/api/openai/turn", { method: "POST", body, signal: controller.signal });
      if (session !== sessionRef.current) return;
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; heard?: string; reply?: string; message?: string } | null;
      if (session !== sessionRef.current) return;
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
      setVoiceError(null);
      speakerRef.current?.setFast(true);
      speakerRef.current?.push(payload.reply, true);
      speakerRef.current?.finish();
      dispatch({ type: "ASSISTANT_SPEAKING" });
      setLevelSource("assistant");
    } catch (error) {
      if (session !== sessionRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
      dispatch({ type: "FAIL", message: MSG.connectFailed });
    } finally {
      if (session === sessionRef.current) busyRef.current = false;
    }
  }, [dispatch, pushLine]);

  const beginSession = useCallback(async () => {
    if (!supported()) {
      dispatch({ type: "FAIL", message: window.isSecureContext ? MSG.unsupported : MSG.insecure });
      return;
    }
    sessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    bufferRef.current.reset();
    voiceSince.current = null;
    lastVoiceAt.current = 0;
    setVoiceError(null);
    await releaseAudio();
    dispatch({ type: "START" });
    const context = new AudioContext();
    audioRef.current = context;
    await context.resume();
    const playback = new PcmPlayback(context);
    playRef.current = playback;
    const speaker = new PhraseSpeaker(
      playback,
      () => {
        setVoiceError(null);
        dispatch({ type: "ASSISTANT_SPEAKING" });
        setLevelSource("assistant");
      },
      () => {
        setVoiceError("تعذر تشغيل الصوت. المكالمة مستمرة، تقدر تتكلم.");
        dispatch({ type: "LISTENING" });
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
          if (now - voiceSince.current > 140) dispatch({ type: "USER_SPEAKING", active: true });
          const sustained = now - voiceSince.current;
          if (shouldBarge(Boolean(speakerRef.current?.busy), Boolean(playRef.current?.pending), sustained)) {
            speakerRef.current?.clear();
            playRef.current?.clear();
          }
          return;
        }
        if (voiceSince.current && now - lastVoiceAt.current > 260) voiceSince.current = null;
        if (busyRef.current || speakerRef.current?.busy || playRef.current?.pending) return;
        const gap = modeRef.current === "group" ? 1300 : 750;
        if (lastVoiceAt.current && now - lastVoiceAt.current > gap && bufferRef.current.ready(false)) void flush();
      },
      onPcm: (pcm) => {
        if (micMutedRef.current || busyRef.current) return;
        const talking = Date.now() - lastVoiceAt.current < 260;
        bufferRef.current.push(pcm, talking);
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
      sessionRef.current += 1;
      abortRef.current?.abort();
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
    voiceError,
    beginSession,
    endCall,
    retry,
    toggleMic,
    toggleSpeaker,
    mode,
    setMode,
  };
}
