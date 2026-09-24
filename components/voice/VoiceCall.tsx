"use client";

import { Phone } from "lucide-react";
import { ASSISTANT_NAME } from "../../lib/gemini/config";
import { MSG } from "../../lib/utils/messages";
import { AudioOrb } from "./AudioOrb";
import { CallControls } from "./CallControls";
import { CallStatus } from "./CallStatus";
import { Transcript } from "./Transcript";
import { useVoiceCall } from "./useVoiceCall";

export function VoiceCall() {
  const call = useVoiceCall();
  const failedBeforeLive = call.state.phase === "error" && !call.state.wasLive;
  const showCall = call.inCall || (call.state.wasLive && call.state.phase === "error");
  const orbMode = call.levelSource === "assistant" ? "assistant" : call.levelSource === "user" ? "user" : "idle";

  return (
    <main className="call-shell">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-between px-6 py-10">
        <p className="text-xs text-muted">
          يعمل بواسطة Gemini Live · <a className="text-teal" href="/admin">الإدارة</a>
        </p>

        <div className="flex w-full flex-col items-center gap-6">
          <AudioOrb level={showCall ? call.level : 0} mode={showCall ? orbMode : "idle"} live={showCall} />
          <CallStatus
            title={ASSISTANT_NAME}
            subtitle={showCall ? undefined : "مساعدة صوتية بالذكاء الاصطناعي"}
            status={showCall || call.state.phase === "error" || call.state.phase === "ended" ? call.status : "اضغط لبدء مكالمة صوتية"}
            timer={showCall ? call.seconds : undefined}
            connected={showCall && call.state.phase !== "connecting" && call.state.phase !== "requesting_permission" && call.state.phase !== "error"}
          />
          {call.state.phase === "error" && call.state.errorMessage ? (
            <p className="text-center text-sm text-coral" role="alert">
              {call.state.errorMessage}
            </p>
          ) : null}
          <Transcript lines={call.lines} open={call.transcriptOpen && (showCall || call.lines.length > 0)} />
        </div>

        <div className="flex w-full flex-col items-center gap-4 pb-2">
          {showCall ? (
            <CallControls
              micMuted={call.state.micMuted}
              speakerMuted={call.state.speakerMuted}
              transcriptOpen={call.transcriptOpen}
              onToggleMic={call.toggleMic}
              onToggleSpeaker={call.toggleSpeaker}
              onToggleTranscript={() => call.setTranscriptOpen((open) => !open)}
              onEnd={() => void call.endCall()}
              disabled={call.state.phase === "ending"}
            />
          ) : (
            <button
              type="button"
              className="grid h-24 w-24 place-items-center rounded-full bg-teal text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
              aria-label="بدء المكالمة"
              onClick={() => void call.beginSession()}
            >
              <Phone className="h-8 w-8" />
            </button>
          )}
          {call.state.phase === "error" && call.state.wasLive ? (
            <button type="button" className="text-sm text-teal underline-offset-4 hover:underline" onClick={() => void call.retry()}>
              إعادة الاتصال
            </button>
          ) : null}
          {failedBeforeLive ? (
            <p className="text-center text-xs text-muted">
              {call.state.errorMessage === MSG.notConfigured
                ? "أضف GEMINI_API_KEY ثم أعد نشر الموقع."
                : "تقدر تحاول مرة ثانية."}
            </p>
          ) : null}
          {!showCall ? <span className="sr-only">بدء المكالمة</span> : null}
        </div>
      </div>
    </main>
  );
}
