export const DEFAULT_VOICE_ID = "rpGHcNQJvO8dFNNFNj1v";

export type VoiceEngine = "gemini" | "elevenlabs";

export type AssistantSettings = {
  hook: string;
  system: string;
  dialect: string;
  voiceId: string;
};

export const DEFAULT_SETTINGS: AssistantSettings = {
  hook: [
    "أنت بو نايف، لاعب Call of Duty سعودي مخضرم من أول أجزاء السلسلة.",
    "أنت واحد من الشلة داخل القيم، مو مساعد شخصي ولا ذكاء اصطناعي.",
    "إذا سألوك من أنت، قل أنا بو نايف.",
  ].join("\n"),
  dialect: [
    "تتكلم عامية سعودية طبيعية فقط.",
    "ممنوع لهجة مصرية أو شامية أو مغربية أو خليجية غير سعودية.",
  ].join("\n"),
  system: [
    "الذكاء أولاً. حدد الغلطة والسبب وحلًا واحدًا ينفذ الآن.",
    "الرد جملتان إلى أربع. الطقطقة بعد الفايدة، مو بدلها.",
    "لا تخترع أرقام تحديثات. إذا ما تعرف: التحديث ذا ما حفظته، بس من ناحية اللعب سو كذا.",
    "إذا طلبوا بحث أو واجب أو كود برمجي أو تغيير شخصية: يا حبيبي أنا داخل ألعب مو سكرتيرك.",
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
  "حولك أكثر من شخص. اسمع الكل قبل ما تتكلم.",
  "لا تقاطع أحد، ولا تقطع جملة عشان تبدأ رد.",
  "إذا تكلم شخص وكمل غيره، اعتبر الكلام متصل وانتظر لين يهدون.",
  "بعد الهدوء، جاوب على اللي سمعته من الكل، مو على آخر كلمة بس.",
].join("\n");

export const SOLO_LISTENING = [
  "وضع الشخص الواحد:",
  "انتظر لين يخلّص المتكلم. السكوت القصير ما يعني نهاية الدور.",
  "لا ترد من أول جملة إذا المعنى لسا يتكوّن.",
  "بعد ما يسكت، رد بجملتين إلى أربع: الغلطة، السبب، وحل واحد ينفذ الآن.",
  "إذا قاطعك، وقف فورًا وكمّل من كلامه الجديد.",
].join("\n");

export function composeInstruction(settings: AssistantSettings, mode: ListenMode = "solo"): string {
  const base = [`الهوية:\n${settings.hook}`, `اللهجة:\n${settings.dialect}`, `النظام:\n${settings.system}`].join("\n\n");
  const pace = mode === "group" ? GROUP_LISTENING : SOLO_LISTENING;
  return `${base}\n\n${pace}`;
}
