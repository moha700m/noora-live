# نورة

مكالمة صوتية من المتصفح. الفهم من Gemini Live، والنطق من Vibi بصوت محدد.

المسار:

الميكروفون → Gemini Live → نص الرد → Vibi TTS → سماعات المتصفح.

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
- رمز صوت Vibi

الإعدادات تُحفظ في `data/settings.json` على GitHub، والمكالمة التالية تقرأها بدون إعادة بناء.

```bash
ADMIN_PASSWORD=
SETTINGS_GITHUB_TOKEN=
VIBI_API_KEY=
GEMINI_API_KEY=
```

`VIBI_API_KEY` مفتاح api.vibi.pro ويبقى على السيرفر فقط. الصوت الافتراضي: `rpGHcNQJvO8dFNNFNj1v`. النموذج: `eleven_multilingual_v2`، واللغة `ar`. النتيجة ملف صوتي بعد اكتمال مهمة النطق، مو بث مباشر.

## Vercel

1. افتح المشروع على Vercel.
2. Settings → Environment Variables → `GEMINI_API_KEY` و `VIBI_API_KEY`
3. فعّلهما لـ Production.
4. اعمل Redeploy حتى يلتقط النشر المتغيرات.

## الأمان

المفاتيح لا تدخل إلى مكونات العميل ولا إلى `NEXT_PUBLIC_*` ولا إلى التخزين المحلي.
