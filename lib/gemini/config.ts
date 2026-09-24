import { Modality, type LiveConnectConfig } from "@google/genai";
import { composeInstruction, DEFAULT_SETTINGS } from "../settings/model";

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

/** Fields locked into the ephemeral token. The client must send the same values. */
export function lockedLiveConfig(instruction = SYSTEM_INSTRUCTION): LiveConnectConfig {
  return {
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
}

export function clientLiveConfig(handle: string | null, instruction = SYSTEM_INSTRUCTION): LiveConnectConfig {
  return {
    ...lockedLiveConfig(instruction),
    sessionResumption: handle ? { handle } : {},
  };
}
