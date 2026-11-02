import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeHazards,
  roadblockBoxes,
  seedFrom,
  ChaosEffects,
  monsterSlot,
  makeMonsterEvent,
  monsterPhase,
  rubblePoints,
} from "../src/chaos-rules.js";
import { onRoad, resolveCollision } from "../src/route.js";
test("shared seed produces identical course hazards", () => {
  assert.deepEqual(
    makeHazards(seedFrom("race-a")),
    makeHazards(seedFrom("race-a")),
  );
  assert.notDeepEqual(makeHazards(1), makeHazards(2));
});
test("hazards stay on the road and barriers leave the middle lane open", () => {
  const hazards = makeHazards(94);
  assert.equal(hazards.filter((h) => h.type === "boost").length, 21);
  assert.equal(hazards.filter((h) => h.type === "pothole").length, 21);
  const boxes = roadblockBoxes(hazards);
  assert.equal(boxes.length, 21);
  for (const h of hazards) assert.ok(onRoad(h.x, h.z));
  for (const b of boxes) {
    assert.ok(resolveCollision(b.x, b.z, 1, boxes));
    assert.ok(Math.min(b.w, b.d) < 1);
  }
});
test("boost, oil, pothole impacts expire and have per-hazard cooldowns", () => {
  const effects = new ChaosEffects(),
    s = { speed: 20, yaw: 0, vx: 0, vz: -20 };
  assert.ok(effects.hit("boost", "boost", 0, s));
  assert.ok(s.speed > 20);
  assert.equal(effects.hit("boost", "boost", 0.1, s), false);
  const normal = { max: 27, power: 8, grip: 8 };
  assert.ok(effects.specification(normal, 1).max > 27);
  assert.equal(effects.specification(normal, 3).max, 27);
  effects.hit("oil", "oil", 3, s);
  assert.ok(effects.specification(normal, 4).grip < normal.grip);
  assert.equal(effects.specification(normal, 6).grip, normal.grip);
  const before = s.speed;
  effects.hit("hole", "pothole", 6, s);
  assert.ok(s.speed < before * 0.6);
  effects.reset();
  assert.equal(effects.boostUntil, 0);
});
test("monster schedule, warning, rubble positions, and wave are shared and bounded", () => {
  assert.equal(monsterSlot(17), -1);
  assert.equal(monsterSlot(18), 0);
  assert.equal(monsterSlot(60), 1);
  const a = makeMonsterEvent(0, 18, { x: 0, z: -30, cp: 0 }),
    b = makeMonsterEvent(0, 18, { x: 0, z: -30, cp: 0 });
  assert.deepEqual(a, b);
  assert.ok(onRoad(a.x, a.z));
  assert.equal(monsterPhase(a, 19).warning, true);
  assert.equal(monsterPhase(a, 22).warning, false);
  assert.equal(monsterPhase(a, 25).wave, 12);
  assert.equal(monsterPhase(a, 32).active, false);
  assert.equal(rubblePoints(a).length, 3);
  for (const p of rubblePoints(a)) assert.ok(onRoad(p.x, p.z));
});
