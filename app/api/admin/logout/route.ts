import { clearAdminCookie } from "../../../../lib/admin/session";
import { json } from "../../../../lib/http/json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST() {
  return json({ ok: true }, 200, { "set-cookie": clearAdminCookie() });
}
