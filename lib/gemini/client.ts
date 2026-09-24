import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./config";
import type { ListenMode, VoiceEngine } from "../settings/model";
import { MAX_RECONNECT_ATTEMPTS, MODEL_NAME, INPUT_MIME, clientLiveConfig } from "./config";
import { MSG, tokenErrorMessage } from "../utils/messages";
import { reconnectDelayMs } from "../utils/backoff";

export type LiveStatus = "connecting" | "ready" | "reconnecting" | "failed" | "closed";

export type LiveClientHandlers = {
  onStatus: (status: LiveStatus) => void;
  onAudio: (pcm: Int16Array, sampleRate: number) => void;
  onInterrupted: () => void;
  onInputTranscript: (text: string, finished: boolean) => void;
  onOutputTranscript: (text: string, finished: boolean) => void;
  onUserActivity: (active: boolean) => void;
  onTurnComplete: () => void;
  onSession?: (info: { engine: VoiceEngine; instruction: string }) => void;
  onError: (message: string) => void;
};

type TokenPayload = {
  ok?: boolean;
  token?: string;
  error?: string;
  message?: string;
  instruction?: string;
  engine?: VoiceEngine;
};

async function fetchEphemeralToken(mode: ListenMode): Promise<{ token: string; instruction: string; engine: VoiceEngine }> {
  const response = await fetch("/api/gemini/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ mode }),
  });
  let payload: TokenPayload | null = null;
  try {
    payload = (await response.json()) as TokenPayload;
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.ok || typeof payload.token !== "string" || !payload.token) {
    throw Object.assign(new Error(payload?.message || tokenErrorMessage(payload?.error)), {
      code: payload?.error || "upstream",
    });
  }
  return {
    token: payload.token,
    instruction: payload.instruction?.trim() || SYSTEM_INSTRUCTION,
    engine: payload.engine === "elevenlabs" ? "elevenlabs" : "gemini",
  };
}

function mimeRate(mime: string | undefined): number {
  const match = /rate=(\d+)/.exec(mime ?? "");
  const rate = match ? Number(match[1]) : 24_000;
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
}

export class GeminiLiveClient {
  private session: Session | null = null;
  private handle: string | null = null;
  private stopped = true;
  private ready = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private instruction = SYSTEM_INSTRUCTION;
  private mode: ListenMode = "group";
  private generation = 0;

  constructor(private readonly handlers: LiveClientHandlers) {}

  get isReady(): boolean {
    return this.ready && !this.stopped;
  }

  async start(mode: ListenMode = "group"): Promise<boolean> {
    this.mode = mode;
    this.stopped = false;
    this.attempt = 0;
    return this.open(false);
  }

  sendAudio(pcmBase64: string): void {
    if (!this.ready || !this.session || this.stopped) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: pcmBase64, mimeType: INPUT_MIME },
      });
    } catch {
      this.handlers.onError(MSG.connectFailed);
    }
  }

  stop(forgetSession = true): void {
    this.stopped = true;
    this.ready = false;
    this.clearTimer();
    const current = this.session;
    this.session = null;
    if (forgetSession) this.handle = null;
    try {
      current?.close();
    } catch {
      /* already closed */
    }
    this.handlers.onStatus("closed");
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async open(isReconnect: boolean): Promise<boolean> {
    if (this.stopped) return false;
    const generation = ++this.generation;
    this.ready = false;
    this.handlers.onStatus(isReconnect ? "reconnecting" : "connecting");

    try {
      const previous = this.session;
      this.session = null;
      try {
        previous?.close();
      } catch {
        /* ignore */
      }

      const session = await fetchEphemeralToken(this.mode);
      if (this.stopped || generation !== this.generation) return false;
      this.instruction = session.instruction;
      this.handlers.onSession?.({ engine: session.engine, instruction: session.instruction });

      const ai = new GoogleGenAI({
        apiKey: session.token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const live = await ai.live.connect({
        model: MODEL_NAME,
        config: clientLiveConfig(this.handle, this.instruction, this.mode),
        callbacks: {
          onopen: () => {
            /* setupComplete is the real ready signal */
          },
          onmessage: (message) => {
            if (generation !== this.generation || this.stopped) return;
            this.onMessage(message);
          },
          onerror: () => {
            if (generation !== this.generation || this.stopped) return;
            this.ready = false;
          },
          onclose: () => {
            if (generation !== this.generation || this.stopped) return;
            this.ready = false;
            this.session = null;
            this.scheduleRetry();
          },
        },
      });

      if (this.stopped || generation !== this.generation) {
        try {
          live.close();
        } catch {
          /* ignore */
        }
        return false;
      }
      this.session = live;
      return true;
    } catch (error) {
      if (this.stopped || generation !== this.generation) return false;
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "not_configured" || code === "forbidden" || code === "rate_limited") {
        this.stopped = true;
        this.handlers.onError(error instanceof Error ? error.message : tokenErrorMessage(code));
        this.handlers.onStatus("failed");
        return false;
      }
      this.scheduleRetry();
      return false;
    }
  }

  private onMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.ready = true;
      this.attempt = 0;
      this.handlers.onStatus("ready");
    }

    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) {
      this.handle = update.newHandle;
    }

    if (message.goAway) {
      this.ready = false;
      this.scheduleRetry(true);
    }

    const activity = message.voiceActivity?.voiceActivityType;
    if (activity === "ACTIVITY_START") this.handlers.onUserActivity(true);
    if (activity === "ACTIVITY_END") this.handlers.onUserActivity(false);

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) this.handlers.onInterrupted();

    const interim = content.interimInputTranscription?.text;
    if (interim) this.handlers.onInputTranscript(interim, false);
    if (content.inputTranscription?.text || content.inputTranscription?.finished) {
      this.handlers.onInputTranscript(
        content.inputTranscription.text ?? "",
        Boolean(content.inputTranscription.finished),
      );
    }
    if (content.outputTranscription?.text || content.outputTranscription?.finished) {
      this.handlers.onOutputTranscript(
        content.outputTranscription.text ?? "",
        Boolean(content.outputTranscription.finished),
      );
    }

    if (!content.interrupted) {
      for (const part of content.modelTurn?.parts ?? []) {
        const inline = part.inlineData;
        if (!inline?.data) continue;
        this.handlers.onAudio(decodePcm(inline.data), mimeRate(inline.mimeType));
      }
    }

    if (content.turnComplete) this.handlers.onTurnComplete();
  }

  private scheduleRetry(proactive = false): void {
    if (this.stopped) return;
    this.ready = false;
    if (!proactive) this.attempt += 1;
    if (this.attempt > MAX_RECONNECT_ATTEMPTS) {
      this.stopped = true;
      this.handlers.onError(MSG.dropped);
      this.handlers.onStatus("failed");
      return;
    }
    this.handlers.onStatus("reconnecting");
    this.clearTimer();
    const delay = proactive ? 250 : reconnectDelayMs(this.attempt - 1);
    this.timer = setTimeout(() => {
      void this.open(true);
    }, delay);
  }
}

function decodePcm(data: string): Int16Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return new Int16Array(copy.buffer);
}
