type AudioOrbProps = {
  level: number;
  mode: "idle" | "user" | "assistant";
  live: boolean;
};

export function AudioOrb({ level, mode, live }: AudioOrbProps) {
  const clamped = Math.max(0, Math.min(1, level));
  return (
    <div className="relative grid h-44 w-44 place-items-center" aria-hidden="true">
      <span
        className="orb-ring"
        style={{ transform: `scale(${1 + clamped * 0.18})`, opacity: 0.35 + clamped * 0.4 }}
      />
      <span
        className="orb-ring orb-ring-inner"
        style={{ transform: `scale(${1 + clamped * 0.08})` }}
      />
      <span
        className={`orb-core ${live ? "orb-core-live" : ""} ${mode === "assistant" ? "orb-core-speak" : ""}`}
        style={{ transform: `scale(${1 + clamped * 0.06})` }}
      />
    </div>
  );
}
