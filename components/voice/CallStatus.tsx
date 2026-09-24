type CallStatusProps = {
  title: string;
  subtitle?: string;
  status: string;
  timer?: string;
  connected?: boolean;
};

export function CallStatus({ title, subtitle, status, timer, connected }: CallStatusProps) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
      {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      {connected ? <p className="text-sm text-teal">متصلة</p> : null}
      {timer ? (
        <p className="font-mono text-lg tabular-nums text-fg" aria-label="مدة المكالمة">
          {timer}
        </p>
      ) : null}
      {status ? (
        <p className="min-h-6 text-base text-fg" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}
