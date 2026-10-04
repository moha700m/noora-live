import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { json } from "../../../../lib/http/json";
import { isVoiceId } from "../../../../lib/settings/model";
import { loadSettings } from "../../../../lib/settings/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const hits = new Map<string, { count: number; reset: number }>();
const VIBI = "https://api.vibi.pro";

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 16;
}

function headers(key: string): HeadersInit {
  return { "xi-api-key": key, "content-type": "application/json" };
}

async function waitForAudio(key: string, id: string): Promise<string | null> {
  const deadline = Date.now() + 48_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const detail = await fetch(`${VIBI}/v1/history/${id}`, { headers: { "xi-api-key": key }, cache: "no-store" });
    if (!detail.ok) continue;
    const body = (await detail.json()) as {
      status?: string;
      result?: { audio_url?: string };
    };
    if (body.status === "failed") return null;
    if (body.status === "completed" && body.result?.audio_url) return body.result.audio_url;
  }
  return null;
}

export async function POST(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: "غير مسموح." }, 403);
  if (limited(request)) return json({ ok: false, message: "محاولات كثيرة." }, 429);
  const key = process.env.VIBI_API_KEY?.trim();
  if (!key) return json({ ok: false, message: "صوت Vibi غير مفعّل بعد." }, 503);

  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 800) : "";
  } catch {
    text = "";
  }
  if (text.length < 2) return json({ ok: false, message: "النص قصير." }, 400);

  const settings = await loadSettings();
  const voiceId = isVoiceId(settings.voiceId) ? settings.voiceId : "";
  if (!voiceId) return json({ ok: false, message: "معرف الصوت غير صالح." }, 400);

  const created = await fetch(`${VIBI}/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      language_code: "ar",
      provider: "elevenlabs",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1 },
    }),
  });
  if (!created.ok) return json({ ok: false, message: "تعذر تشغيل صوت المساعدة." }, 502);
  const task = (await created.json()) as { id?: string };
  if (!task.id) return json({ ok: false, message: "تعذر تشغيل صوت المساعدة." }, 502);

  const audioUrl = await waitForAudio(key, task.id);
  if (!audioUrl) return json({ ok: false, message: "تعذر تشغيل صوت المساعدة." }, 502);
  const audio = await fetch(audioUrl, { headers: { "xi-api-key": key }, cache: "no-store" });
  if (!audio.ok || !audio.body) return json({ ok: false, message: "تعذر تشغيل صوت المساعدة." }, 502);
  return new Response(audio.body, {
    status: 200,
    headers: {
      "content-type": audio.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}
