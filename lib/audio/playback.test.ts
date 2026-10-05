import assert from "node:assert/strict";
import test from "node:test";
import { PcmPlayback } from "./playback.ts";

class FakeParam {
  value = 1;
  cancelScheduledValues() {}
  setValueAtTime(value: number) { this.value = value; }
}

class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 1;
  destination = {};
  resumeImpl: () => Promise<void> = async () => { this.state = "running"; };
  sources: { starts: number[]; stop(): void; disconnect(): void; onended: (() => void) | null }[] = [];
  decodes = 0;
  createGain() { return { gain: new FakeParam(), connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 0, connect() {}, disconnect() {}, getByteTimeDomainData() {} }; }
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, copyToChannel() {} };
  }
  createBufferSource() {
    const source = { starts: [] as number[], stop() {}, disconnect() {}, onended: null as (() => void) | null,
      buffer: null as unknown as AudioBuffer, connect() {}, start(at: number) { this.starts.push(at); } };
    this.sources.push(source);
    return source;
  }
  async decodeAudioData() { this.decodes += 1; return {} as AudioBuffer; }
  resume() { return this.resumeImpl(); }
  async close() { this.state = "closed"; }
  asAudioContext() { return this as unknown as AudioContext; }
}

test("enqueue resumes the original context and schedules only after it is running", async () => {
  const context = new FakeContext();
  const playback = new PcmPlayback(context.asAudioContext());
  assert.equal(await playback.enqueue(new Int16Array([100, -100]), 24_000), true);
  assert.equal(context.state, "running");
  assert.equal(context.sources.length, 1);
  assert.deepEqual(context.sources[0]?.starts, [1.05]);
});

test("failed resume never reports accepted playback", async () => {
  const context = new FakeContext();
  context.resumeImpl = async () => { throw new Error("blocked"); };
  const playback = new PcmPlayback(context.asAudioContext());
  assert.equal(await playback.enqueue(new Int16Array([100]), 24_000), false);
  assert.equal(context.sources.length, 0);
});

test("clear during a pending resume cannot revive audio", async () => {
  const context = new FakeContext();
  let finishResume!: () => void;
  context.resumeImpl = () => new Promise<void>((resolve) => { finishResume = () => { context.state = "running"; resolve(); }; });
  const playback = new PcmPlayback(context.asAudioContext());
  const queued = playback.enqueue(new Int16Array([100]), 24_000);
  playback.clear();
  finishResume();
  assert.equal(await queued, false);
  assert.equal(context.sources.length, 0);
});

test("decode uses the playback context", async () => {
  const context = new FakeContext();
  const playback = new PcmPlayback(context.asAudioContext());
  await playback.decode(new ArrayBuffer(1));
  assert.equal(context.decodes, 1);
});
