export const MIN_PHRASE_LENGTH = 2;
export const MAX_PHRASE_LENGTH = 280;

export function validatePhraseText(value: unknown): { text: string; error: null } | { text: string; error: string } {
  if (typeof value !== "string") return { text: "", error: "اكتب عبارة صوتية." };
  const text = value.trim();
  if (text.length < MIN_PHRASE_LENGTH) return { text, error: "العبارة قصيرة؛ اكتب حرفين على الأقل." };
  if (text.length > MAX_PHRASE_LENGTH) return { text, error: "العبارة طويلة؛ الحد ٢٨٠ حرفًا." };
  return { text, error: null };
}
