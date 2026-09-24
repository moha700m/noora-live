export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return pcm;
}

export function pcm16ToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    out[i] = (pcm[i] ?? 0) / 0x8000;
  }
  return out;
}

export function downsampleAverage(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate <= outRate + 1) return input.slice();
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j] ?? 0;
    out[i] = sum / (end - start);
  }
  return out;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

export function base64ToPcm16(value: string): Int16Array {
  const bytes = base64ToBytes(value);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return new Int16Array(copy.buffer);
}

export function sampleRateFromMime(mime: string | undefined, fallback = 24_000): number {
  const match = /rate=(\d+)/.exec(mime ?? "");
  if (!match) return fallback;
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

export const CAPTURE_CHUNK_SAMPLES = 640;
