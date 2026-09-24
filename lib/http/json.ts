export function json(body: unknown, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(JSON.stringify(body), { status, headers });
}
