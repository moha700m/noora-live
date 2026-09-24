const BOUNDARY = /[.!?؟،\n]/;

export function takeSpeakable(buffer: string, finished: boolean): { speak: string; rest: string } {
  const text = buffer.replace(/\s+/g, " ");
  if (!text.trim()) return { speak: "", rest: "" };
  if (finished) return { speak: text.trim(), rest: "" };

  const match = BOUNDARY.exec(text);
  if (match && match.index >= 8) {
    const cut = match.index + 1;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  if (text.trim().length >= 90) {
    const space = text.lastIndexOf(" ", 90);
    const cut = space > 20 ? space : 90;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  return { speak: "", rest: text };
}
