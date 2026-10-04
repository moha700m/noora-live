import { composeInstruction, type ListenMode } from "../settings/model";
import { loadSettings } from "../settings/store";
import { MSG } from "../utils/messages";

const CHAT_MODELS = ["gpt-4.1", "gpt-4o", "gpt-4.1-mini"];
const TRANSCRIBE_MODELS = ["gpt-4o-mini-transcribe", "whisper-1"];

export type TurnMessage = { role: "user" | "assistant"; content: string };

function readKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value || value === "undefined") return undefined;
  return value;
}

async function openai(path: string, body: BodyInit, contentType?: string): Promise<Response> {
  const key = readKey();
  if (!key) throw Object.assign(new Error(MSG.notConfigured), { status: 503 });
  return fetch(`https://api.openai.com${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      ...(contentType ? { "content-type": contentType } : {}),
    },
    body,
  });
}

async function transcribe(file: File): Promise<string> {
  let last = "";
  for (const model of TRANSCRIBE_MODELS) {
    const form = new FormData();
    form.set("model", model);
    form.set("language", "ar");
    form.set("prompt", "مكالمة سعودية عن Call of Duty. كلام عامي.");
    form.set("file", file, file.name || "speech.wav");
    const response = await openai("/v1/audio/transcriptions", form);
    const payload = (await response.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
    if (response.ok && payload?.text) return payload.text.trim();
    last = payload?.error?.message || `transcribe ${response.status}`;
    if (response.status !== 400 && response.status !== 404) break;
  }
  throw new Error(last || "تعذر فهم الكلام.");
}

async function reply(instruction: string, history: TurnMessage[], heard: string): Promise<string> {
  const messages = [
    {
      role: "system",
      content: `${instruction}\n\nالمتكلم خلص كلامه. لا تقاطعه ولا تكمّل جملته.\nافهم المقصود الحقيقي، مو أول كلمة. إذا الكلام ناقص أو مو واضح، اسأل سؤال واحد قصير بدل ما تخمّن.\nالرد صوتي: جملتين أو ثلاث إذا الموقف يبي شرح، وفيها ملاحظة كود دقيقة إذا السؤال عن اللعب. بدون مقدمة وبدون تفكير ظاهر.`,
    },
    ...history.slice(-8),
    { role: "user", content: heard },
  ];
  let last = "";
  for (const model of CHAT_MODELS) {
    const response = await openai(
      "/v1/chat/completions",
      JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 220,
        messages,
      }),
      "application/json",
    );
    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    } | null;
    const text = payload?.choices?.[0]?.message?.content?.trim();
    if (response.ok && text) return text;
    last = payload?.error?.message || `chat ${response.status}`;
    if (response.status !== 400 && response.status !== 404) break;
  }
  throw new Error(last || "تعذر تجهيز الرد.");
}

export async function runTurn(file: File, history: TurnMessage[], mode: ListenMode): Promise<{ heard: string; reply: string }> {
  if (!readKey()) throw Object.assign(new Error(MSG.notConfigured), { status: 503 });
  const settings = await loadSettings();
  const instruction = composeInstruction(settings, mode);
  const heard = await transcribe(file);
  if (!heard) throw new Error("ما وضح الكلام.");
  const answer = await reply(instruction, history, heard);
  return { heard, reply: answer };
}
