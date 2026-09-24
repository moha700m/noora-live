import { ActivityHandling, EndSensitivity, Modality, StartSensitivity, type LiveConnectConfig } from "@google/genai";
import { composeInstruction, DEFAULT_SETTINGS, type ListenMode } from "../settings/model";

export const APP_NAME = "نورة";
export const ASSISTANT_NAME = "نورة";

/** Stable Gemini Live model confirmed in Google docs (September 2026). */
export const MODEL_NAME = "gemini-3.8-live";

/** Female prebuilt voice. Aoede is listed as "Breezy" / Female. */
export const VOICE_NAME = "Aoede";

export const MAX_RECONNECT_ATTEMPTS = 5;

export const INPUT_SAMPLE_RATE = 16_000;
export const OUTPUT_SAMPLE_RATE = 24_000;
export const INPUT_MIME = "audio/pcm;rate=16000";

export const SYSTEM_INSTRUCTION = composeInstruction(DEFAULT_SETTINGS);

export function lockedLiveConfig(instruction = SYSTEM_INSTRUCTION, mode: ListenMode = "solo"): LiveConnectConfig {
  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      languageCode: "ar",
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: VOICE_NAME },
      },
    },
    systemInstruction: instruction,
    inputAudioTranscription: { languageCodes: ["ar-SA", "en-US"] },
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
  };
  if (mode === "group") {
    config.realtimeInputConfig = {
      activityHandling: ActivityHandling.NO_INTERRUPTION,
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 500,
        silenceDurationMs: 2200,
      },
    };
  } else {
    config.realtimeInputConfig = {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 280,
      },
    };
  }
  return config;
}

export function clientLiveConfig(
  handle: string | null,
  instruction = SYSTEM_INSTRUCTION,
  mode: ListenMode = "solo",
): LiveConnectConfig {
  return {
    ...lockedLiveConfig(instruction, mode),
    sessionResumption: handle ? { handle } : {},
  };
}
