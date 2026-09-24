import { adminCookie, adminPassword } from "../../../../lib/admin/session";
import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { json } from "../../../../lib/http/json";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const hits = new Map<string, { count: number; reset: number }>();

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    hits.set(ip, { count: 1, reset: now + 10 * 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 8;
}

export async function POST(request: Request) {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: "غير مسموح." }, 403);
  if (limited(request)) return json({ ok: false, message: "محاولات كثيرة. انتظر ثم أعد المحاولة." }, 429);
  const password = adminPassword();
  if (!password) return json({ ok: false, message: "لوحة الإدارة غير مفعلة بعد." }, 503);

  let given = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    given = typeof body.password === "string" ? body.password : "";
  } catch {
    given = "";
  }
  const left = Buffer.from(given);
  const right = Buffer.from(password);
  const same = left.length === right.length && timingSafeEqual(left, right);
  if (!same) return json({ ok: false, message: "كلمة المرور غير صحيحة." }, 401);
  return json({ ok: true }, 200, { "set-cookie": adminCookie(password) });
}
