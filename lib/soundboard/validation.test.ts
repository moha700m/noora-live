import assert from "node:assert/strict";
import test from "node:test";
import { validatePhraseText } from "./validation.ts";
import { audioCacheKey, parseSavedPhrases } from "./storage.ts";

test("phrase validation trims edges, preserves interior whitespace, and enforces UTF-16 limits", () => {
  assert.deepEqual(validatePhraseText("  خذوا  الموقع  "), { text: "خذوا  الموقع", error: null });
  assert.ok(validatePhraseText(" x ").error);
  assert.equal(validatePhraseText("😀".repeat(140)).error, null);
  assert.ok(validatePhraseText("😀".repeat(141)).error);
});

test("saved phrase storage accepts v1 records and rejects corrupt payloads", () => {
  assert.deepEqual(parseSavedPhrases(null), []);
  const valid = JSON.stringify({ version: 1, phrases: [{ id: "one", text: "  هلا  بالشلة ", createdAt: 1, updatedAt: 2 }] });
  assert.deepEqual(parseSavedPhrases(valid), [{ id: "one", text: "هلا  بالشلة", createdAt: 1, updatedAt: 2 }]);
  assert.equal(parseSavedPhrases("{"), null);
  assert.equal(parseSavedPhrases(JSON.stringify({ version: 2, phrases: [] })), null);
  assert.equal(parseSavedPhrases(JSON.stringify({ version: 1, phrases: [{ id: "", text: "ok", createdAt: 1, updatedAt: 1 }] })), null);
});

test("audio cache key changes with voice/settings version and exact phrase", () => {
  assert.notEqual(audioCacheKey("voice-a:v1", "هلا"), audioCacheKey("voice-b:v1", "هلا"));
  assert.notEqual(audioCacheKey("voice-a:v1", "هلا"), audioCacheKey("voice-a:v1", "هلا!"));
});
