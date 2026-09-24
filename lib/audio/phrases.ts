const SENTENCE = /[.!?؟\n]/;

/** Speak in full sentences so the voice stays continuous, like a phone call. */
export function takeSpeakable(buffer: string, finished: boolean): { speak: string; rest: string } {
  const text = buffer.replace(/\s+/g, " ");
  if (!text.trim()) return { speak: "", rest: "" };
  if (finished) return { speak: text.trim(), rest: "" };

  const match = SENTENCE.exec(text);
  if (match && match.index >= 18) {
    const cut = match.index + 1;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  if (text.trim().length >= 180) {
    const space = text.lastIndexOf(" ", 180);
    const cut = space > 40 ? space : 180;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  return { speak: "", rest: text };
}
