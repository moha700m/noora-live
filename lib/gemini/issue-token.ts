import { GoogleGenAI } from "@google/genai";
import { MODEL_NAME, lockedLiveConfig } from "./config";
import { isAllowedTokenRequest } from "./origin";
import type { TokenFailure } from "./types";
import { MSG } from "../utils/messages";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; reset: number }>();

function readApiKey(): string | undefined {
  const value = process.env["GEMINI_API_KEY"];
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined") return undefined;
  return trimmed;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function isRateLimited(request: Request): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.reset < now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > MAX_PER_WINDOW;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function failure(error: TokenFailure["error"], message: string, status: number): Response {
  const body: TokenFailure = { ok: false, error, message };
  return json(body, status);
}

export async function handleTokenRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return failure("method_not_allowed", MSG.connectFailed, 405);
  }
  if (!isAllowedTokenRequest(request)) {
    return failure("forbidden", MSG.forbidden, 403);
  }
  if (isRateLimited(request)) {
    return failure("rate_limited", MSG.rateLimited, 429);
  }

  const apiKey = readApiKey();
  if (!apiKey) {
    return failure("not_configured", MSG.notConfigured, 503);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();
    const created = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: MODEL_NAME,
          config: lockedLiveConfig(),
        },
      },
    });
    if (!created.name) {
      return failure("upstream", MSG.connectFailed, 502);
    }
    return json(
      {
        ok: true,
        token: created.name,
        expireTime: created.expireTime ?? expireTime,
        newSessionExpireTime: created.newSessionExpireTime ?? newSessionExpireTime,
      },
      200,
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const name = error instanceof Error ? error.name : "Error";
      console.error("[gemini-token] request failed", name);
    }
    return failure("upstream", MSG.connectFailed, 502);
  }
}
