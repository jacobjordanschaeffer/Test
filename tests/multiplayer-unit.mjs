import { test } from "node:test";
import assert from "node:assert/strict";
import { validState, profile, cleanCode, Lobby } from "../src/multiplayer.js";
test("network profiles constrain names, vehicle and color", () => {
  assert.deepEqual(profile({ name: "<Host>", vehicle: 99, paint: "red" }), {
    name: "Host",
    vehicle: 0,
    paint: "#d4e5da",
  });
  assert.equal(profile(null).name, "Driver");
  assert.equal(profile({ name: { toString: "bad" } }).name, "Driver");
  assert.equal(cleanCode(" ab-c!1234 "), "ABC1234");
});
test("network snapshots reject invalid coordinates, speed, and progress", () => {
  const s = { x: 0, z: 7, yaw: 0, speed: 10, cp: 0 };
  assert.ok(validState(s));
  for (const patch of [
    { x: Infinity },
    { z: -10000 },
    { yaw: NaN },
    { speed: 100 },
    { cp: 22 },
    { cp: -1 },
    { cp: 0.5 },
  ])
    assert.ok(!validState({ ...s, ...patch }));
});
test("only host can start and all players must be ready", () => {
  const room = new Lobby();
  room.isHost = false;
  assert.equal(room.begin(), false);
  room.isHost = true;
  room.phase = "lobby";
  room.id = "host";
  room.players = {
    host: { id: "host", ready: true },
    guest: { id: "guest", ready: false },
  };
  assert.equal(room.begin(), false);
  room.players.guest.ready = true;
  assert.equal(room.begin(), true);
  assert.equal(room.phase, "race");
  assert.ok(room.race.startAt > Date.now() + 4000);
  room.back();
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.guest.ready, false);
  assert.equal(room.players.host.ready, true);
});
