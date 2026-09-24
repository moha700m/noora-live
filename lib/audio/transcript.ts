import type { TranscriptLine, TranscriptRole } from "../gemini/types";

export function mergeTranscriptText(previous: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return previous;
  if (!previous) return next;
  if (next === previous || previous.endsWith(next)) return previous;
  if (next.startsWith(previous)) return next;
  if (previous.startsWith(next)) return previous;
  return previous + next;
}

export function textDirection(text: string): "rtl" | "ltr" {
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return latin > arabic ? "ltr" : "rtl";
}

export function applyTranscript(
  lines: TranscriptLine[],
  role: TranscriptRole,
  text: string,
  finished: boolean,
  id: string,
): TranscriptLine[] {
  const incoming = text.trim();
  if (!incoming && !finished) return lines;
  const next = lines.slice();
  const last = next[next.length - 1];

  if (last && last.role === role && last.partial) {
    const merged = incoming ? mergeTranscriptText(last.text, incoming) : last.text;
    if (!merged && finished) {
      next.pop();
      return next;
    }
    next[next.length - 1] = { ...last, text: merged, partial: !finished };
    return next;
  }

  if (!incoming) return lines;
  if (last && last.role === role && !last.partial && (last.text === incoming || last.text.endsWith(incoming))) {
    return lines;
  }

  next.push({ id, role, text: incoming, partial: !finished });
  return next;
}
