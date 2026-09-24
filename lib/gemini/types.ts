export type TokenSuccess = {
  ok: true;
  token: string;
  expireTime: string;
  newSessionExpireTime: string;
  instruction: string;
  engine: "gemini" | "elevenlabs";
};

export type TokenFailure = {
  ok: false;
  error: "not_configured" | "method_not_allowed" | "forbidden" | "rate_limited" | "upstream";
  message: string;
};

export type TokenResponse = TokenSuccess | TokenFailure;

export type TranscriptRole = "user" | "assistant";

export type TranscriptLine = {
  id: string;
  role: TranscriptRole;
  text: string;
  partial: boolean;
};

export type CallPhase =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "connected"
  | "user_speaking"
  | "assistant_thinking"
  | "assistant_speaking"
  | "reconnecting"
  | "muted"
  | "ending"
  | "ended"
  | "error";
