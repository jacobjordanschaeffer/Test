import { test } from "node:test";
import assert from "node:assert/strict";
import { GraphicsQuality } from "../src/graphics.js";
function renderer() {
  return {
    shadowMap: {},
    setPixelRatio(value) {
      this.ratio = value;
    },
  };
}
test("performance mode lowers resolution and disables shadows", () => {
  const r = renderer(),
    q = new GraphicsQuality(r, { ratio: 2, mode: "performance" });
  assert.equal(r.ratio, 0.75);
  assert.equal(r.shadowMap.enabled, false);
  q.set("high");
  assert.equal(r.ratio, 1.5);
  assert.equal(r.shadowMap.enabled, true);
});
test("auto mode adapts slow frames and respects a resolution floor", () => {
  const r = renderer(),
    q = new GraphicsQuality(r, { ratio: 1.25 });
  for (let i = 0; i < 1000; i++) q.observe(0.05);
  assert.equal(r.ratio, 0.65);
  assert.equal(r.shadowMap.enabled, false);
  q.set("high");
  for (let i = 0; i < 100; i++) q.observe(0.1);
  assert.equal(r.ratio, 1.25);
});

test("auto mode still adapts when the device is severely frame-limited", () => {
  const r = renderer(),
    q = new GraphicsQuality(r);
  for (let i = 0; i < 12; i++) q.observe(0.25);
  assert.ok(r.ratio < 1);
  assert.equal(r.shadowMap.enabled, false);
});
