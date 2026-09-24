export const MSG = {
  allowMic: "اسمح باستخدام الميكروفون لبدء المكالمة.",
  micFailed: "تعذر الوصول إلى الميكروفون.",
  notConfigured: "الخدمة الصوتية غير مفعلة بعد.",
  connectFailed: "تعذر الاتصال بالمساعدة الصوتية.",
  reconnecting: "جاري إعادة الاتصال…",
  dropped: "انقطع الاتصال",
  insecure: "الموقع يحتاج اتصالًا آمنًا لاستخدام الميكروفون.",
  unsupported: "المتصفح لا يدعم المكالمة الصوتية هنا.",
  rateLimited: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
  forbidden: "تعذر بدء المكالمة من هذا المصدر.",
} as const;

export function micErrorMessage(error: unknown, secureContext = true): string {
  if (!secureContext) return MSG.insecure;
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return MSG.allowMic;
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return MSG.micFailed;
  }
  if (name === "NotSupportedError" || name === "SecurityError") return MSG.unsupported;
  return MSG.micFailed;
}

export function tokenErrorMessage(error: string | undefined): string {
  if (error === "not_configured") return MSG.notConfigured;
  if (error === "rate_limited") return MSG.rateLimited;
  if (error === "forbidden") return MSG.forbidden;
  return MSG.connectFailed;
}
