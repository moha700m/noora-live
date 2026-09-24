import type { ReactNode } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";

type CallControlsProps = {
  micMuted: boolean;
  speakerMuted: boolean;
  transcriptOpen: boolean;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onToggleTranscript: () => void;
  onEnd: () => void;
  disabled?: boolean;
};

export function CallControls({
  micMuted,
  speakerMuted,
  transcriptOpen,
  onToggleMic,
  onToggleSpeaker,
  onToggleTranscript,
  onEnd,
  disabled,
}: CallControlsProps) {
  return (
    <div className="flex items-end justify-center gap-3">
      <RoundButton
        label={micMuted ? "إلغاء كتم الميكروفون" : "كتم الميكروفون"}
        pressed={micMuted}
        onClick={onToggleMic}
        disabled={disabled}
      >
        {micMuted ? <MicOff /> : <Mic />}
      </RoundButton>
      <RoundButton
        label={speakerMuted ? "إلغاء كتم صوت المساعدة" : "كتم صوت المساعدة"}
        pressed={speakerMuted}
        onClick={onToggleSpeaker}
        disabled={disabled}
      >
        {speakerMuted ? <VolumeX /> : <Volume2 />}
      </RoundButton>
      <RoundButton
        label={transcriptOpen ? "إخفاء المحادثة" : "إظهار المحادثة"}
        pressed={transcriptOpen}
        onClick={onToggleTranscript}
        disabled={disabled}
      >
        <span className="text-xs font-semibold leading-none">نص</span>
      </RoundButton>
      <button
        type="button"
        className="grid h-16 w-16 place-items-center rounded-full bg-coral text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
        aria-label="إنهاء المكالمة"
        onClick={onEnd}
        disabled={disabled}
      >
        <PhoneOff />
      </button>
    </div>
  );
}

function RoundButton({
  label,
  pressed,
  onClick,
  disabled,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-14 w-14 place-items-center rounded-full border border-fg/15 bg-fg/5 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50 ${pressed ? "bg-fg/15" : ""}`}
    >
      {children}
    </button>
  );
}
