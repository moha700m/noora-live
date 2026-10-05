import assert from "node:assert/strict";
import test from "node:test";
import { PhraseSpeaker } from "./speaker.ts";

const audioResponse = () => new Response(new Uint8Array([1, 0]), { headers: { "content-type": "application/octet-stream" } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("Vibi MP3 uses shared decode and announces activity only after scheduling", async () => {
  const originalFetch = globalThis.fetch;
  let finishEnqueue!: (accepted: boolean) => void;
  let decoded = 0;
  let active = 0;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "audio/mpeg" } });
  try {
    const speaker = new PhraseSpeaker({
      decode: async () => {
        decoded += 1;
        return { sampleRate: 44100, getChannelData: () => new Float32Array([0.5, -0.5]) } as AudioBuffer;
      },
      enqueue: (pcm, rate) => {
        assert.equal(rate, 44100);
        assert.equal(pcm.length, 2);
        return new Promise<boolean>((resolve) => { finishEnqueue = resolve; });
      },
      clear() {},
    }, () => { active += 1; }, () => assert.fail("unexpected audio failure"));
    speaker.push("رد بو نايف", true);
    await tick();
    assert.equal(decoded, 1);
    assert.equal(active, 0);
    finishEnqueue(true);
    await tick();
    assert.equal(active, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("speaker only reports active after enqueue accepts audio", async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let errors = 0;
  globalThis.fetch = async () => audioResponse();
  try {
    const speaker = new PhraseSpeaker({ enqueue: async () => false, decode: async () => ({} as AudioBuffer), clear() {} }, () => { active += 1; }, () => { errors += 1; });
    speaker.push("Reply.", true);
    await tick();
    assert.equal(active, 0);
    assert.equal(errors, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a new queue is pumped after clear interrupts an old request", async () => {
  const originalFetch = globalThis.fetch;
  let releaseFirst!: (response: Response) => void;
  let requests = 0;
  const accepted: number[] = [];
  let active = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>((resolve) => { releaseFirst = resolve; });
    return audioResponse();
  };
  try {
    const speaker = new PhraseSpeaker({ enqueue: async (pcm) => { accepted.push(pcm[0] ?? 0); return true; }, decode: async () => ({} as AudioBuffer), clear() {} }, () => { active += 1; }, () => {});
    speaker.push("Old reply.", true);
    await tick();
    speaker.clear();
    speaker.push("New reply.", true);
    releaseFirst(audioResponse());
    await tick();
    await tick();
    assert.equal(requests, 2);
    assert.equal(accepted.length, 1);
    assert.equal(active, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
