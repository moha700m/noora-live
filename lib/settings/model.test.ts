import assert from "node:assert/strict";
import test from "node:test";
import { takeSpeakable } from "../audio/phrases.ts";
import { composeInstruction, DEFAULT_SETTINGS, DEFAULT_VOICE_ID, normalizeSettings } from "./model.ts";

test("settings keep the vibi voice and compose the three fields", () => {
  const settings = normalizeSettings({ hook: "بو نايف", dialect: "سعودي", system: "مختصر", voiceId: "rpGHcNQJvO8dFNNFNj1v" });
  assert.equal(settings.voiceId, DEFAULT_VOICE_ID);
  const instruction = composeInstruction(settings);
  assert.match(instruction, /الهوية/);
  assert.match(instruction, /اللهجة/);
  assert.match(instruction, /النظام/);
  assert.match(composeInstruction(settings), /وضع الشخص الواحد/);
  assert.match(composeInstruction(settings, "group"), /وضع المجموعة/);
  assert.equal(normalizeSettings({ voiceId: "bad" }).voiceId, DEFAULT_VOICE_ID);
});

test("fallback stays Bu Nayef and waits for the turn", () => {
  assert.match(DEFAULT_SETTINGS.hook, /بو نايف/);
  assert.equal(DEFAULT_SETTINGS.voiceId, DEFAULT_VOICE_ID);
  assert.doesNotMatch(DEFAULT_SETTINGS.hook, /نورة/);
  const solo = composeInstruction(DEFAULT_SETTINGS);
  assert.match(solo, /انتظر لين يخلّص المتكلم/);
  assert.doesNotMatch(solo, /افهمي|تستنين|نورة/);
  assert.doesNotMatch(composeInstruction(DEFAULT_SETTINGS, "group"), /استمعي|تقاطعين/);
});

test("speech waits for a phrase boundary", () => {
  assert.equal(takeSpeakable("هلا", false).speak, "");
  const ready = takeSpeakable("المكالمة وصلت، كيف أساعدك؟ تمام", false);
  assert.equal(ready.speak, "المكالمة وصلت، كيف أساعدك؟");
  assert.match(ready.rest, /تمام/);
  assert.equal(takeSpeakable("تمام، كمّل الكلام", false, true).speak, "تمام،");
});
