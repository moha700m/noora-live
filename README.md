# نورة

مكالمة صوتية مباشرة من المتصفح مع مساعدة ذكاء اصطناعي سعودية، عبر Gemini Live.

المسار:

الميكروفون في المتصفح → Gemini Live API → صوت نورة الأصلي → سماعات المتصفح.

لا يوجد رقم هاتف، ولا Twilio، ولا وسيط صوتي على السيرفر. السيرفر ينشئ ephemeral token فقط.

## Local development

```bash
npm install
npm run dev
```

## الإدارة

اللوحة على `/admin`.

تعدّل منها:

- الهوك
- اللهجة
- النظام
- معرف صوت ElevenLabs

الإعدادات تُحفظ في `data/settings.json` على GitHub، والمكالمة التالية تقرأها بدون إعادة بناء.

```bash
ADMIN_PASSWORD=
SETTINGS_GITHUB_TOKEN=
ELEVENLABS_API_KEY=
```

`SETTINGS_GITHUB_TOKEN` توكن GitHub بصلاحية تعديل هذا المستودع فقط. `ELEVENLABS_API_KEY` يخلي الرد يُنطق بصوت ElevenLabs بدل صوت Gemini. إذا المفتاح غير موجود، المكالمة تبقى على صوت Gemini.

الصوت الافتراضي: `qdCWAGl7lBhHi8DaA3b0`. نموذج النطق: `eleven_v3_conversational`، والإخراج PCM 24kHz.


## Vercel

1. افتح المشروع على Vercel.
2. Settings → Environment Variables → `GEMINI_API_KEY`
3. فعّله لـ Production و Preview إذا تحتاجه.
4. اعمل Redeploy حتى يلتقط النشر الجديد المتغير.

## النموذج والصوت

- النموذج: `gemini-3.8-live` (الاسم المستقر في توثيق Google لسبتمبر 2026).
- الصوت: `Aoede` (صوت أنثوي، Breezy).
- الإدخال: PCM 16-bit little-endian أحادي، 16kHz، `audio/pcm;rate=16000`.
- الإخراج: PCM أصلي من Live API، عادة 24kHz.
- الإعدادات القابلة للتعديل في `lib/gemini/config.ts`: `APP_NAME` و `ASSISTANT_NAME` و `MODEL_NAME` و `VOICE_NAME` و `SYSTEM_INSTRUCTION` و `MAX_RECONNECT_ATTEMPTS`.

## Architecture

- `app/api/gemini/token/route.ts` يقرأ `GEMINI_API_KEY` على السيرفر وينشئ رمزًا قصير العمر (`uses: 1`) مقيدًا بالنموذج وإعداد الصوت.
- المتصفح يتصل مباشرة بـ Gemini Live باستخدام الرمز، ويرسل صوت الميكروفون بعد `setupComplete`.
- المقاطعة تعتمد على `serverContent.interrupted` وتفرّغ طابور التشغيل.
- استئناف الجلسة يحفظ `sessionResumption` handle ويعيد الاتصال بمحاولات محدودة.
- النص الحي من `inputAudioTranscription` و `outputAudioTranscription`.

## الأمان

المفتاح لا يدخل إلى مكونات العميل ولا إلى `NEXT_PUBLIC_*` ولا إلى التخزين المحلي. مسار الرمز `POST` فقط، مع `Cache-Control: no-store`، وفحص نفس المصدر، وبدون طباعة المفتاح أو الرمز في السجلات.
