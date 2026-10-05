import assert from "node:assert/strict";
import test from "node:test";
import { shouldBarge, TurnBuffer } from "./turn-buffer.ts";

function pcm(samples: number): Int16Array {
  return new Int16Array(samples);
}

test("long silence then speech keeps only a short preroll", () => {
  const buffer = new TurnBuffer();
  for (let i = 0; i < 40; i += 1) buffer.push(pcm(16_000), false);
  assert.equal(buffer.heardSpeech, false);
  assert.equal(buffer.ready(false), false);
  buffer.push(pcm(8_000), true);
  assert.equal(buffer.heardSpeech, true);
  assert.ok(buffer.samples <= 16_000 * 0.4 + 8_000);
  assert.equal(buffer.ready(true), false);
  assert.equal(buffer.ready(false), true);
});

test("continuous speech past 14 seconds does not become a turn by itself", () => {
  const buffer = new TurnBuffer();
  buffer.push(pcm(1_000), true);
  for (let i = 0; i < 16; i += 1) buffer.push(pcm(16_000), true);
  assert.equal(buffer.ready(true), false);
  assert.ok(buffer.samples <= 16_000 * 18);
  assert.equal(buffer.ready(false), true);
  const taken = buffer.take();
  assert.ok(taken && taken.length > 0);
  assert.equal(buffer.heardSpeech, false);
});

test("barge-in includes playback that is still scheduled", () => {
  assert.equal(shouldBarge(false, true, 320), true);
  assert.equal(shouldBarge(true, false, 320), true);
  assert.equal(shouldBarge(false, false, 800), false);
  assert.equal(shouldBarge(true, true, 200), false);
});
