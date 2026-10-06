import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { json } from "../../../../lib/http/json";
import { isVoiceId } from "../../../../lib/settings/model";
import { loadSettings } from "../../../../lib/settings/store";
import { validatePhraseText } from "../../../../lib/soundboard/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const CACHE_SETTINGS_VERSION = "eleven-v3-ar-natural-v1-050-075";

const hits = new Map<string, { count: number; reset: number }>();
const VIBI = "https://api.vibi.pro";
const MODELS = ["eleven_v3"];

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 24;
}

function headers(key: string): HeadersInit {
  return { "xi-api-key": key, "content-type": "application/json" };
}

export async function GET(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false }, 403);
  const settings = await loadSettings();
  const voiceId = isVoiceId(settings.voiceId) ? settings.voiceId : "";
  if (!voiceId) return json({ ok: false }, 400);
  return json({ ok: true, cacheVersion: `${voiceId}:${CACHE_SETTINGS_VERSION}` }, 200);
}

async function waitForAudio(key: string, id: string): Promise<{ url?: string; reason?: string }> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const detail = await fetch(`${VIBI}/v1/history/${id}`, { headers: { "xi-api-key": key }, cache: "no-store" });
    if (!detail.ok) {
      if (detail.status === 401 || detail.status === 403 || detail.status === 402) return { reason: `history_${detail.status}` };
      continue;
    }
    const body = (await detail.json()) as {
      status?: string;
      result?: { audio_url?: string };
    };
    if (body.status === "failed") return { reason: "generation_failed" };
    if (body.status === "completed" && body.result?.audio_url) return { url: body.result.audio_url };
  }
  return { reason: "generation_timeout" };
}

export async function POST(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: "غير مسموح." }, 403);
  if (limited(request)) return json({ ok: false, message: "محاولات كثيرة." }, 429);
  const key = process.env.VIBI_API_KEY?.trim();
  if (!key) return json({ ok: false, message: "صوت Vibi غير مفعّل بعد." }, 503);

  let rawText: unknown = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    rawText = body.text;
  } catch {
    rawText = "";
  }
  const validated = validatePhraseText(rawText);
  if (validated.error) return json({ ok: false, message: validated.error }, 400);
  const text = validated.text;

  const settings = await loadSettings();
  const voiceId = isVoiceId(settings.voiceId) ? settings.voiceId : "";
  if (!voiceId) return json({ ok: false, message: "معرف الصوت غير صالح." }, 400);

  let taskId = "";
  let createStatus = 0;
  for (const model of MODELS) {
    const created = await fetch(`${VIBI}/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: "ar",
        provider: "elevenlabs",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    createStatus = created.status;
    if (!created.ok) continue;
    const task = (await created.json()) as { id?: string };
    if (task.id) {
      taskId = task.id;
      break;
    }
  }
  if (!taskId) return speechFailure(`create_${createStatus}`);

  const result = await waitForAudio(key, taskId);
  if (!result.url) return speechFailure(result.reason || "generation_failed");
  const audio = await fetch(result.url, { headers: { "xi-api-key": key }, cache: "no-store" });
  if (!audio.ok || !audio.body) return speechFailure(`download_${audio.status}`);
  return new Response(audio.body, {
    status: 200,
    headers: {
      "content-type": audio.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}

function speechFailure(code: string) {
  console.warn("vibi_speech_failed", { code });
  return json({ ok: false, code, message: code === "generation_timeout" ? "تأخر تجهيز الصوت؛ جرّب مرة ثانية بعد شوي." : "تعذر تجهيز صوت بو نايف؛ جرّب مرة ثانية." }, 502);
}
