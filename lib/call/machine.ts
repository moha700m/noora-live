import type { CallPhase } from "../gemini/types";

export type CallState = {
  phase: CallPhase;
  micMuted: boolean;
  speakerMuted: boolean;
  errorMessage: string | null;
  wasLive: boolean;
};

export type CallEvent =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "LIVE" }
  | { type: "USER_SPEAKING"; active: boolean }
  | { type: "THINKING" }
  | { type: "ASSISTANT_SPEAKING" }
  | { type: "LISTENING" }
  | { type: "RECONNECTING" }
  | { type: "TOGGLE_MIC" }
  | { type: "TOGGLE_SPEAKER" }
  | { type: "END" }
  | { type: "ENDED" }
  | { type: "FAIL"; message: string };

export const initialCallState: CallState = {
  phase: "idle",
  micMuted: false,
  speakerMuted: false,
  errorMessage: null,
  wasLive: false,
};

const livePhases: CallPhase[] = [
  "connected",
  "user_speaking",
  "assistant_thinking",
  "assistant_speaking",
  "reconnecting",
  "muted",
];

export function reduceCall(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case "RESET":
      return initialCallState;
    case "START":
      return { ...initialCallState, phase: "requesting_permission" };
    case "PERMISSION_GRANTED":
      if (state.phase === "ending" || state.phase === "ended") return state;
      return { ...state, phase: "connecting", errorMessage: null };
    case "LIVE":
      return {
        ...state,
        phase: state.micMuted ? "muted" : "connected",
        wasLive: true,
        errorMessage: null,
      };
    case "USER_SPEAKING":
      if (!state.wasLive || state.phase === "ending" || state.phase === "reconnecting") return state;
      if (state.micMuted) return { ...state, phase: "muted" };
      return { ...state, phase: event.active ? "user_speaking" : "connected" };
    case "THINKING":
      if (!state.wasLive || state.phase === "ending") return state;
      return { ...state, phase: "assistant_thinking" };
    case "ASSISTANT_SPEAKING":
      if (!state.wasLive || state.phase === "ending") return state;
      return { ...state, phase: "assistant_speaking" };
    case "LISTENING":
      if (!state.wasLive || state.phase === "ending") return state;
      return { ...state, phase: state.micMuted ? "muted" : "connected" };
    case "RECONNECTING":
      if (state.phase === "ending" || state.phase === "ended") return state;
      return { ...state, phase: "reconnecting", wasLive: true };
    case "TOGGLE_MIC": {
      if (!state.wasLive && state.phase !== "connecting") return state;
      const micMuted = !state.micMuted;
      let phase = state.phase;
      if (micMuted && (phase === "connected" || phase === "user_speaking")) phase = "muted";
      if (!micMuted && phase === "muted") phase = "connected";
      return { ...state, micMuted, phase };
    }
    case "TOGGLE_SPEAKER":
      if (state.phase === "idle" || state.phase === "ended") return state;
      return { ...state, speakerMuted: !state.speakerMuted };
    case "END":
      if (state.phase === "idle" || state.phase === "ended") return state;
      return { ...state, phase: "ending" };
    case "ENDED":
      return { ...initialCallState, phase: "ended" };
    case "FAIL":
      return { ...state, phase: "error", errorMessage: event.message };
    default:
      return state;
  }
}

export function isInCall(state: CallState): boolean {
  return livePhases.includes(state.phase) || state.phase === "connecting" || state.phase === "requesting_permission" || state.phase === "ending";
}

export function statusLabel(state: CallState): string {
  switch (state.phase) {
    case "requesting_permission":
    case "connecting":
      return "جاري الاتصال…";
    case "reconnecting":
      return "جاري إعادة الاتصال…";
    case "assistant_speaking":
      return "تتحدث…";
    case "assistant_thinking":
      return "تفكر…";
    case "user_speaking":
    case "connected":
      return "تستمع…";
    case "muted":
      return "المايك مكتوم";
    case "ending":
      return "جاري إنهاء المكالمة…";
    case "ended":
      return "انتهت المكالمة";
    case "error":
      return state.errorMessage ?? "تعذر الاتصال بالمساعدة الصوتية.";
    default:
      return "";
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}
