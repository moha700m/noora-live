import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { json } from "../../../../lib/http/json";
import { isVoiceId } from "../../../../lib/settings/model";
import { loadSettings } from "../../../../lib/settings/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const hits = new Map<string, { count: number; reset: number }>();

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 40;
}

const MODEL_ID = "eleven_v3_conversational";

export async function POST(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: "غير مسموح." }, 403);
  if (limited(request)) return json({ ok: false, message: "محاولات كثيرة." }, 429);
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return json({ ok: false, message: "صوت ElevenLabs غير مفعّل بعد." }, 503);

  let text = "";
  let previousText = "";
  try {
    const body = (await request.json()) as { text?: unknown; previousText?: unknown };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 800) : "";
    previousText = typeof body.previousText === "string" ? body.previousText.trim().slice(-100) : "";
  } catch {
    text = "";
  }
  if (text.length < 2) return json({ ok: false, message: "النص قصير." }, 400);

  const settings = await loadSettings();
  const voiceId = isVoiceId(settings.voiceId) ? settings.voiceId : "";
  if (!voiceId) return json({ ok: false, message: "معرف الصوت غير صالح." }, 400);

  const upstream = await fetch(
    "https://api.elevenlabs.io/v1/text-to-dialogue/stream?output_format=pcm_24000",
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "content-type": "application/json",
        accept: "application/octet-stream",
      },
      body: JSON.stringify({
        inputs: [{ text, voice_id: voiceId }],
        model_id: MODEL_ID,
        language_code: "ar",
        settings: previousText ? { previous_text: previousText } : undefined,
      }),
    },
  );
  if (!upstream.ok || !upstream.body) {
    return json({ ok: false, message: "تعذر تشغيل صوت المساعدة." }, 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
      "x-audio-rate": "24000",
    },
  });
}
