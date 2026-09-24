import { useCallback, useEffect, useRef, useState } from "react";
import { GeminiLiveClient } from "../../lib/gemini/client";
import { MicrophoneCapture } from "../../lib/audio/microphone";
import { PcmPlayback } from "../../lib/audio/playback";
import { pcm16ToBase64 } from "../../lib/audio/pcm";
import { applyTranscript } from "../../lib/audio/transcript";
import { formatDuration, initialCallState, isInCall, reduceCall, statusLabel } from "../../lib/call/machine";
import type { CallState } from "../../lib/call/machine";
import type { TranscriptLine } from "../../lib/gemini/types";
import { MSG, micErrorMessage } from "../../lib/utils/messages";

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined"
  );
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
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const micRef = useRef<MicrophoneCapture | null>(null);
  const playRef = useRef<PcmPlayback | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const micMutedRef = useRef(false);
  const hotFrames = useRef(0);
  const coolFrames = useRef(0);
  const startedAt = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    clientRef.current?.stop(true);
    clientRef.current = null;
    stopTimer();
    startedAt.current = null;
    await releaseAudio();
    setLevel(0);
    setLevelSource("idle");
    dispatch({ type: "ENDED" });
  }, [dispatch, releaseAudio]);

  const ensureClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;
    const client = new GeminiLiveClient({
      onStatus: (status) => {
        if (status === "ready") dispatch({ type: "LIVE" });
        if (status === "reconnecting") dispatch({ type: "RECONNECTING" });
        if (status === "failed") dispatch({ type: "FAIL", message: MSG.dropped });
      },
      onAudio: (pcm, sampleRate) => {
        playRef.current?.enqueue(pcm, sampleRate);
        dispatch({ type: "ASSISTANT_SPEAKING" });
        setLevelSource("assistant");
      },
      onInterrupted: () => {
        playRef.current?.clear();
        dispatch({ type: "USER_SPEAKING", active: true });
        setLevelSource("user");
      },
      onInputTranscript: (text, finished) => {
        pushLine("user", text, finished);
        if (text.trim()) dispatch({ type: "USER_SPEAKING", active: true });
        if (finished) dispatch({ type: "THINKING" });
      },
      onOutputTranscript: (text, finished) => {
        pushLine("assistant", text, finished);
      },
      onUserActivity: (active) => {
        dispatch({ type: "USER_SPEAKING", active });
        if (!active) dispatch({ type: "THINKING" });
      },
      onTurnComplete: () => {
        if (!playRef.current?.pending) dispatch({ type: "LISTENING" });
      },
      onError: (message) => {
        dispatch({ type: "FAIL", message });
      },
    });
    clientRef.current = client;
    return client;
  }, [dispatch, pushLine]);

  const beginSession = useCallback(async () => {
    if (!supported()) {
      dispatch({
        type: "FAIL",
        message: window.isSecureContext ? MSG.unsupported : MSG.insecure,
      });
      return;
    }
    dispatch({ type: "START" });
    const AudioCtor = window.AudioContext;
    const context = new AudioCtor();
    audioRef.current = context;
    void context.resume();
    const playback = new PcmPlayback(context);
    playRef.current = playback;

    const mic = new MicrophoneCapture({
      onLevel: (value) => {
        if (stateRef.current.phase === "assistant_speaking" && playRef.current?.pending) return;
        setLevel(value);
        setLevelSource("user");
        if (micMutedRef.current) return;
        if (value > 0.12) {
          hotFrames.current += 1;
          coolFrames.current = 0;
          if (hotFrames.current > 2) dispatch({ type: "USER_SPEAKING", active: true });
        } else {
          coolFrames.current += 1;
          hotFrames.current = 0;
          if (coolFrames.current > 8 && stateRef.current.phase === "user_speaking") {
            dispatch({ type: "LISTENING" });
          }
        }
      },
      onPcm: (pcm) => {
        if (micMutedRef.current || !clientRef.current?.isReady) return;
        clientRef.current.sendAudio(pcm16ToBase64(pcm));
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
    mic.setSending(true);
    const opened = await ensureClient().start();
    if (!opened) return;
    if (!startedAt.current) {
        startedAt.current = Date.now();
        stopTimer();
        timerRef.current = setInterval(() => {
          if (!startedAt.current) return;
          setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
        }, 250);
    }
  }, [dispatch, ensureClient, releaseAudio]);

  const retry = useCallback(async () => {
    clientRef.current?.stop(false);
    clientRef.current = null;
    if (!audioRef.current) {
      await beginSession();
      return;
    }
    dispatch({ type: "RECONNECTING" });
    try {
      await ensureClient().start();
    } catch {
      dispatch({ type: "FAIL", message: MSG.dropped });
    }
  }, [beginSession, dispatch, ensureClient]);

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
    const onOffline = () => {
      if (stateRef.current.wasLive) dispatch({ type: "RECONNECTING" });
    };
    const onOnline = () => {
      if (stateRef.current.phase === "reconnecting") void retry();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    let frame = 0;
    const tick = () => {
      const output = playRef.current?.getLevel() ?? 0;
      if (output > 0.02 && stateRef.current.phase === "assistant_speaking") {
        setLevel(output);
        setLevelSource("assistant");
      } else if (!playRef.current?.pending && stateRef.current.phase === "assistant_speaking") {
        dispatch({ type: "LISTENING" });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [dispatch, retry]);

  useEffect(() => {
    return () => {
      clientRef.current?.stop(true);
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
  };
}
