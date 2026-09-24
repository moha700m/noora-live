import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "noora_admin";

export function adminPassword(): string | undefined {
  const value = process.env.ADMIN_PASSWORD?.trim();
  if (!value || value === "undefined") return undefined;
  return value;
}

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("noora-admin-v1").digest("base64url");
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function isAdminRequest(request: Request): boolean {
  const password = adminPassword();
  if (!password) return false;
  const cookie = readCookie(request, ADMIN_COOKIE);
  if (!cookie) return false;
  const expected = sessionToken(password);
  const left = Buffer.from(cookie);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function adminCookie(password: string): string {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${sessionToken(password)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`;
}

export function clearAdminCookie(): string {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
