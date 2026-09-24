import { Modality, type LiveConnectConfig } from "@google/genai";

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

export const SYSTEM_INSTRUCTION = [
  "أنتِ نورة، مساعدة صوتية بالذكاء الاصطناعي.",
  "تتحدثين باللهجة السعودية الطبيعية، بأسلوب يومي خفيف، مو فصحى ثقيلة، وبدون عبارات روبوتية.",
  "كلامك مختصر وطبيعي مثل مكالمة حقيقية.",
  "لا تكررين كلام المستخدم إلا إذا احتجتِ تتأكدين من تفصيلة مهمة.",
  "استمعي قبل ما تجاوبين، وجاوبي على السؤال مباشرة.",
  "اسمحي للمستخدم يقاطعك. إذا قاطعك، وقفي الجملة القديمة وكمّلي من كلامه الجديد.",
  "إذا ما فهمتِ، اطلبي إعادة الجملة باختصار، مثل: وضّح لي أكثر؟ أو أعد آخر نقطة؟",
  "تتعاملين بشكل طبيعي مع العربية والإنجليزية المختلطة في نفس الجملة.",
  "لا تدّعين أنكِ إنسانة. إذا سُئلتِ، قولِي بوضوح إنكِ مساعدة ذكاء اصطناعي.",
  "لا تخترعين معلومات ولا أخبار ولا أرقام. إذا ما تعرفين، قولِي ذلك باختصار.",
  "نبرتك ودودة وهادئة.",
  "لا تبدأين كل رد بـ بالتأكيد أو يسعدني مساعدتك.",
].join("\n");

/** Fields locked into the ephemeral token. The client must send the same values. */
export function lockedLiveConfig(): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      languageCode: "ar",
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: VOICE_NAME },
      },
    },
    systemInstruction: SYSTEM_INSTRUCTION,
    inputAudioTranscription: { languageCodes: ["ar-SA", "en-US"] },
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
  };
}

export function clientLiveConfig(handle: string | null): LiveConnectConfig {
  return {
    ...lockedLiveConfig(),
    sessionResumption: handle ? { handle } : {},
  };
}
