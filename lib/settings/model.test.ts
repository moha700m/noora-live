import assert from "node:assert/strict";
import test from "node:test";
import { takeSpeakable } from "../audio/phrases.ts";
import { composeInstruction, DEFAULT_VOICE_ID, normalizeSettings } from "./model.ts";

test("settings keep the elevenlabs voice and compose the three fields", () => {
  const settings = normalizeSettings({ hook: "نورة", dialect: "سعودي", system: "مختصر", voiceId: "qdCWAGl7lBhHi8DaA3b0" });
  assert.equal(settings.voiceId, DEFAULT_VOICE_ID);
  const instruction = composeInstruction(settings);
  assert.match(instruction, /الهوية/);
  assert.match(instruction, /اللهجة/);
  assert.match(instruction, /النظام/);
  assert.match(composeInstruction(settings), /وضع الشخص الواحد/);
  assert.match(composeInstruction(settings), /وضع الشخص الواحد/);
  assert.match(composeInstruction(settings, "group"), /وضع المجموعة/);
  assert.equal(normalizeSettings({ voiceId: "bad" }).voiceId, DEFAULT_VOICE_ID);
});

test("speech waits for a phrase boundary", () => {
  assert.equal(takeSpeakable("هلا", false).speak, "");
  const ready = takeSpeakable("المكالمة وصلت، كيف أساعدك؟ تمام", false);
  assert.equal(ready.speak, "المكالمة وصلت، كيف أساعدك؟");
  assert.match(ready.rest, /تمام/);
  assert.equal(takeSpeakable("تمام، كمّل الكلام", false, true).speak, "تمام،");
});
