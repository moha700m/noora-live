export function reconnectDelayMs(attempt: number): number {
  const safe = Math.max(0, attempt);
  return Math.min(8_000, 400 * 2 ** safe);
}
