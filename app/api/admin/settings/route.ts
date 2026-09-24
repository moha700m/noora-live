import { isAdminRequest } from "../../../../lib/admin/session";
import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { json } from "../../../../lib/http/json";
import { normalizeSettings, voiceIdError } from "../../../../lib/settings/model";
import { canSaveSettings, loadSettings, saveSettings } from "../../../../lib/settings/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function locked() {
  return json({ ok: false, message: "سجّل الدخول أولًا." }, 401);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return locked();
  const settings = await loadSettings();
  return json(
    {
      ok: true,
      settings,
      elevenLabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
      canSave: canSaveSettings(),
    },
    200,
  );
}

export async function PUT(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: "غير مسموح." }, 403);
  if (!isAdminRequest(request)) return locked();
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const raw = body && typeof body === "object" ? (body as { voiceId?: unknown }) : {};
  const typedVoice = typeof raw.voiceId === "string" ? raw.voiceId : "";
  const voiceError = voiceIdError(typedVoice);
  if (voiceError) return json({ ok: false, message: voiceError }, 400);
  const settings = normalizeSettings(body);
  const result = await saveSettings(settings);
  if (result === "no_token") {
    return json(
      { ok: false, message: "الحفظ يحتاج SETTINGS_GITHUB_TOKEN بصلاحية تعديل هذا المستودع." },
      503,
    );
  }
  if (result === "failed") return json({ ok: false, message: "تعذر حفظ الإعدادات." }, 502);
  return json({ ok: true, settings }, 200);
}
