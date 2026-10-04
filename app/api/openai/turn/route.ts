import { isAllowedTokenRequest } from "../../../../lib/gemini/origin";
import { runTurn, type TurnMessage } from "../../../../lib/openai/turn";
import type { ListenMode } from "../../../../lib/settings/model";
import { MSG } from "../../../../lib/utils/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedTokenRequest(request)) return json({ ok: false, message: MSG.forbidden }, 403);
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size < 800) {
    return json({ ok: false, message: "المقطع قصير جدًا." }, 400);
  }
  let history: TurnMessage[] = [];
  try {
    const raw = JSON.parse(String(form?.get("history") || "[]")) as TurnMessage[];
    if (Array.isArray(raw)) {
      history = raw
        .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
        .slice(-8);
    }
  } catch {
    history = [];
  }
  const mode: ListenMode = form?.get("mode") === "group" ? "group" : "solo";
  try {
    const result = await runTurn(audio, history, mode);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 502;
    const message = error instanceof Error ? error.message : MSG.connectFailed;
    return json({ ok: false, message }, status === 503 ? 503 : 502);
  }
}
