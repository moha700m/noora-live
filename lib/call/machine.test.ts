import assert from "node:assert/strict";
import test from "node:test";
import { initialCallState, reduceCall, statusLabel } from "./machine.ts";

test("mute stops the listening state and end call resets", () => {
  let state = reduceCall(initialCallState, { type: "START" });
  state = reduceCall(state, { type: "PERMISSION_GRANTED" });
  state = reduceCall(state, { type: "LIVE" });
  assert.equal(statusLabel(state), "تستمع…");
  state = reduceCall(state, { type: "TOGGLE_MIC" });
  assert.equal(state.micMuted, true);
  assert.equal(state.phase, "muted");
  state = reduceCall(state, { type: "TOGGLE_SPEAKER" });
  assert.equal(state.speakerMuted, true);
  state = reduceCall(state, { type: "END" });
  state = reduceCall(state, { type: "ENDED" });
  assert.equal(state.phase, "ended");
  assert.equal(state.micMuted, false);
});

test("reconnect failure surfaces a dropped call", () => {
  let state = reduceCall(initialCallState, { type: "LIVE" });
  state = reduceCall(state, { type: "RECONNECTING" });
  assert.equal(statusLabel(state), "جاري إعادة الاتصال…");
  state = reduceCall(state, { type: "FAIL", message: "انقطع الاتصال" });
  assert.equal(state.phase, "error");
  assert.equal(state.errorMessage, "انقطع الاتصال");
});
