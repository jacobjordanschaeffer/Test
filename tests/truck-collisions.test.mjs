import { test } from "node:test";
import assert from "node:assert/strict";
import {
  truckContact,
  applyTruckBump,
  validBump,
} from "../src/truck-collisions.js";
import { resolveCollision } from "../src/route.js";
const body = (id, x, z, speed = 0, yaw = 0) => ({
  id,
  vehicle: 0,
  state: {
    x,
    z,
    speed,
    yaw,
    vx: -Math.sin(yaw) * speed,
    vz: -Math.cos(yaw) * speed,
  },
});
test("rear-end impact transfers momentum and separates both trucks", () => {
  const a = body("a", 0, -60, 20),
    b = body("b", 0, -62);
  const hit = truckContact(a, b);
  assert.ok(hit);
  assert.ok(validBump(hit.a) && validBump(hit.b));
  applyTruckBump(a.state, hit.a, [], resolveCollision);
  applyTruckBump(b.state, hit.b, [], resolveCollision);
  assert.ok(a.state.speed < 20);
  assert.ok(b.state.speed > 0);
  assert.ok(Math.abs(a.state.z - b.state.z) > 2);
});
test("side contact pushes sideways while separated cars do not collide", () => {
  const a = body("a", 0, -60),
    b = body("b", 1.4, -60);
  assert.ok(truckContact(a, b));
  assert.equal(truckContact(a, body("c", 4, -60)), null);
});
test("swept head-on contact catches fast crossings between packets", () => {
  const a = body("a", 0, -64, 40),
    b = body("b", 0, -60, 40, Math.PI);
  const hit = truckContact(a, b, { x: 0, z: -60 }, { x: 0, z: -64 });
  assert.ok(hit);
  applyTruckBump(a.state, hit.a, [], resolveCollision);
  applyTruckBump(b.state, hit.b, [], resolveCollision);
  assert.ok(a.state.z > b.state.z);
  assert.ok(a.state.speed < 1 && b.state.speed < 1);
});
test("reset teleports are not interpreted as swept crashes", () => {
  assert.equal(
    truckContact(
      body("a", 0, -100),
      body("b", 0, -60),
      { x: 0, z: 0 },
      { x: 0, z: -60 },
    ),
    null,
  );
});
test("impacts do not push through solid scenery and invalid impulses are rejected", () => {
  const a = body("a", 0, -60).state;
  applyTruckBump(
    a,
    { dx: 3, dz: 0, dvx: 3, dvz: 0, dyaw: 0 },
    [{ x: 3, z: -60, w: 2, d: 4 }],
    resolveCollision,
  );
  assert.equal(a.x, 0);
  assert.equal(
    validBump({ dx: 0, dz: 0, dvx: Infinity, dvz: 0, dyaw: 0 }),
    false,
  );
});
