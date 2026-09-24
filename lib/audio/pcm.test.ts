import assert from "node:assert/strict";
import test from "node:test";
import { base64ToPcm16, downsampleAverage, floatToPcm16, pcm16ToBase64 } from "./pcm.ts";
import { applyTranscript, mergeTranscriptText } from "./transcript.ts";
import { reconnectDelayMs } from "../utils/backoff.ts";
import { isAllowedTokenRequest } from "../gemini/origin.ts";

test("pcm16 roundtrip stays little-endian", () => {
  const input = new Float32Array([0, 0.5, -1]);
  const encoded = pcm16ToBase64(floatToPcm16(input));
  const decoded = base64ToPcm16(encoded);
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[1] - 16383) < 3);
  assert.equal(decoded[2], -32768);
});

test("downsample reduces 48k to 16k", () => {
  const input = new Float32Array(48);
  const out = downsampleAverage(input, 48_000, 16_000);
  assert.equal(out.length, 16);
});

test("transcript does not duplicate cumulative text", () => {
  const first = applyTranscript([], "user", "هلا", false, "1");
  const grown = applyTranscript(first, "user", "هلا نورة", false, "2");
  assert.equal(grown.length, 1);
  assert.equal(grown[0]?.text, "هلا نورة");
  const again = applyTranscript(grown, "user", "هلا نورة", true, "3");
  assert.equal(again.length, 1);
  assert.equal(again[0]?.partial, false);
  assert.equal(mergeTranscriptText("هلا", "هلا"), "هلا");
});

test("reconnect delay is capped", () => {
  assert.equal(reconnectDelayMs(0), 400);
  assert.equal(reconnectDelayMs(8), 8000);
});

test("token request rejects cross-site calls", () => {
  const blocked = new Request("https://noora.example/api/gemini/token", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
  });
  assert.equal(isAllowedTokenRequest(blocked), false);
  const same = new Request("https://noora.example/api/gemini/token", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
  assert.equal(isAllowedTokenRequest(same), true);
});
