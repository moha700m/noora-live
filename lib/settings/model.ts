export const DEFAULT_VOICE_ID = "qdCWAGl7lBhHi8DaA3b0";

export type VoiceEngine = "gemini" | "elevenlabs";

export type AssistantSettings = {
  hook: string;
  system: string;
  dialect: string;
  voiceId: string;
};

export const DEFAULT_SETTINGS: AssistantSettings = {
  hook: [
    "أنتِ نورة، مساعدة صوتية بالذكاء الاصطناعي.",
    "لا تدّعين أنكِ إنسانة. إذا سُئلتِ، قولِي بوضوح إنكِ مساعدة ذكاء اصطناعي.",
  ].join("\n"),
  dialect: [
    "تتحدثين باللهجة السعودية الطبيعية، بأسلوب يومي خفيف، مو فصحى ثقيلة، وبدون عبارات روبوتية.",
    "تتعاملين بشكل طبيعي مع العربية والإنجليزية المختلطة في نفس الجملة.",
  ].join("\n"),
  system: [
    "كلامك مختصر وطبيعي مثل مكالمة حقيقية.",
    "لا تكررين كلام المستخدم إلا إذا احتجتِ تتأكدين من تفصيلة مهمة.",
    "استمعي قبل ما تجاوبين، وجاوبي على السؤال مباشرة.",
    "اسمحي للمستخدم يقاطعك. إذا قاطعك، وقفي الجملة القديمة وكمّلي من كلامه الجديد.",
    "إذا ما فهمتِ، اطلبي إعادة الجملة باختصار، مثل: وضّح لي أكثر؟",
    "لا تخترعين معلومات ولا أخبار ولا أرقام. إذا ما تعرفين، قولِي ذلك باختصار.",
    "نبرتك ودودة وهادئة.",
    "لا تبدأين كل رد بـ بالتأكيد أو يسعدني مساعدتك.",
  ].join("\n"),
  voiceId: DEFAULT_VOICE_ID,
};

function clip(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text) return fallback;
  return text.slice(0, 4000);
}

export function isVoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{10,40}$/.test(value.trim());
}

export function voiceIdError(value: string): string | null {
  const id = value.trim();
  if (!id) return "اكتب رمز الصوت.";
  if (!isVoiceId(id)) return "رمز الصوت لازم يكون حروفًا وأرقامًا، من 10 إلى 40.";
  return null;
}

export function normalizeSettings(input: unknown): AssistantSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    hook: clip(raw.hook, DEFAULT_SETTINGS.hook),
    system: clip(raw.system, DEFAULT_SETTINGS.system),
    dialect: clip(raw.dialect, DEFAULT_SETTINGS.dialect),
    voiceId: isVoiceId(raw.voiceId) ? raw.voiceId.trim() : DEFAULT_VOICE_ID,
  };
}

export type ListenMode = "solo" | "group";

export const GROUP_LISTENING = [
  "وضع المجموعة:",
  "حولك أكثر من شخص، مو متكلم واحد. استمعي للجميع قبل ما تتكلمين.",
  "لا تقاطعين أحد، ولا تقطعين جملة عشان تبدين رد.",
  "إذا تكلم شخص وكمل غيره، اعتبري الكلام متصل وانتظري لين يهدون.",
  "ميّزي الأفكار إذا تغيّر المتكلم، ورتبي النقاط بدون ما تخترعين أسماء.",
  "لا تنسبين كلام لشخص إذا ما تبين. قولي: في نقطة، وفي نقطة ثانية.",
  "بعد الهدوء، جاويبي باختصار على اللي سمعته من الكل، مو على آخر كلمة بس.",
  "قاعدة المقاطعة تتوقف في هذا الوضع: الاستماع أولى من الرد السريع.",
].join("\n");

export function composeInstruction(settings: AssistantSettings, mode: ListenMode = "solo"): string {
  const base = [`الهوية:\n${settings.hook}`, `اللهجة:\n${settings.dialect}`, `النظام:\n${settings.system}`].join("\n\n");
  return mode === "group" ? `${base}\n\n${GROUP_LISTENING}` : base;
}
