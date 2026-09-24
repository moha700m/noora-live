const SENTENCE = /[.!?؟\n]/;
const QUICK = /[.!?؟،\n]/;

/** Group waits for a full sentence. Solo starts speaking on the first short clause. */
export function takeSpeakable(
  buffer: string,
  finished: boolean,
  fast = false,
): { speak: string; rest: string } {
  const text = buffer.replace(/\s+/g, " ");
  if (!text.trim()) return { speak: "", rest: "" };
  if (finished) return { speak: text.trim(), rest: "" };

  const match = (fast ? QUICK : SENTENCE).exec(text);
  const minimum = fast ? 4 : 18;
  if (match && match.index >= minimum) {
    const cut = match.index + 1;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  const limit = fast ? 28 : 180;
  if (text.trim().length >= limit) {
    const space = text.lastIndexOf(" ", limit);
    const cut = space > (fast ? 8 : 40) ? space : limit;
    return { speak: text.slice(0, cut).trim(), rest: text.slice(cut) };
  }
  return { speak: "", rest: text };
}