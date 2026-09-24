export function isAllowedTokenRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (site === "same-origin" || site === "same-site" || site === "none") return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!hostHeader) return false;
  try {
    const host = hostHeader.split(",")[0]?.trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
