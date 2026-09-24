import { useEffect, useRef } from "react";
import type { TranscriptLine } from "../../lib/gemini/types";
import { ASSISTANT_NAME } from "../../lib/gemini/config";
import { textDirection } from "../../lib/audio/transcript";

type TranscriptProps = {
  lines: TranscriptLine[];
  open: boolean;
};

export function Transcript({ lines, open }: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines, open]);

  if (!open) return null;

  return (
    <section
      ref={scroller}
      aria-label="نص المكالمة"
      className="max-h-52 w-full overflow-y-auto rounded-3xl border border-fg/10 bg-fg/5 px-4 py-3 text-start"
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted">ستظهر المحادثة هنا أثناء المكالمة.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {lines.map((line) => {
            const label = line.role === "user" ? "المستخدم" : ASSISTANT_NAME;
            return (
              <li key={line.id}>
                <p className="text-xs text-muted">{label}</p>
                <p
                  dir={textDirection(line.text)}
                  className={`text-base leading-relaxed text-fg ${line.partial ? "opacity-80" : ""}`}
                >
                  {line.text}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
