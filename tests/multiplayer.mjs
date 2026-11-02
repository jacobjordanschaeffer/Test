import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const errors = [];
const contexts = [];
const pages = [];
async function client() {
  const context = await browser.newContext({
    viewport: { width: 960, height: 700 },
  });
  contexts.push(context);
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://localhost:5173/?qa&low&simulation" +
      (process.env.TEST_PUBLIC_PEER ? "" : "&localPeer"),
  );
  await page.waitForFunction(() => window.gameQA);
  return page;
}
const state = (p) => p.evaluate(() => gameQA.getState());
try {
  const host = await client(),
    guest = await client();
  await host.locator("[data-action=online]").click();
  await host.locator("#driver-name").fill("Host");
  await host.locator("[data-action=create-room]").click();
  await host.waitForFunction(() => gameQA.getState().online?.phase === "lobby");
  const code = (await state(host)).online.code;
  console.log("Created room", code);
  await guest.locator("[data-action=online]").click();
  await guest.locator("#driver-name").fill("Friend");
  await guest.locator("#room-code").fill(code);
  await guest.locator("[data-action=join-room]").click();
  await guest.waitForFunction(
    () => gameQA.getState().online?.players.length === 2,
  );
  await host.waitForFunction(
    () => gameQA.getState().online?.players.length === 2,
  );
  assert.equal(
    await host.locator("[data-action=start-online]").isDisabled(),
    true,
  );
  await guest.locator("#lobby-name").fill("New Friend");
  await guest.locator("[data-action=save-name]").click();
  await host.waitForFunction(() =>
    gameQA.getState().online.players.some((p) => p.name === "New Friend"),
  );
  await guest.locator("#lobby-name").fill("Friend");
  await guest.locator("[data-action=save-name]").click();
  await host.locator("#lobby-name").fill("New Host");
  await host.locator("[data-action=save-name]").click();
  await guest.waitForFunction(() =>
    gameQA.getState().online.players.some((p) => p.name === "New Host"),
  );
  await host.locator("#lobby-name").fill("Host");
  await host.locator("[data-action=save-name]").click();
  await guest.waitForFunction(() =>
    gameQA.getState().online.players.some((p) => p.name === "Host"),
  );
  console.log("Guest and host name changes synchronize in the lobby");
  await guest.locator("[data-action=ready]").click();
  await host.waitForFunction(() =>
    gameQA.getState().online.players.every((p) => p.ready),
  );
  await host.locator("[data-action=start-online]").click();
  await guest.waitForFunction(() => gameQA.getState().screen === "drive");
  assert.equal(
    (await state(host)).online.race.startAt,
    (await state(guest)).online.race.startAt,
  );
  console.log(
    "Two independent browsers joined, ready check and synchronized start pass",
  );
  await host.waitForFunction(() => gameQA.getState().countdown === 0);
  await guest.waitForFunction(() => gameQA.getState().countdown === 0);
  await host.keyboard.down("KeyW");
  await host.waitForFunction(() => gameQA.getState().speed > 10);
  await host.keyboard.up("KeyW");
  await guest.waitForFunction(() =>
    gameQA
      .getState()
      .online.players.some((p) => p.name === "Host" && p.state?.speed > 5),
  );
  assert.equal((await state(guest)).online.remotes, 1);
  await guest.evaluate(() => gameQA.renderFrame());
  console.log("Remote truck movement synchronized and rendered");
  assert.deepEqual(
    (await state(host)).chaos.hazards,
    (await state(guest)).chaos.hazards,
  );
  await host.evaluate(() => gameQA.monster());
  await guest.waitForFunction(() => gameQA.getState().chaos.event?.id === 0);
  assert.deepEqual(
    (await state(host)).chaos.event,
    (await state(guest)).chaos.event,
  );
  console.log("Hazard layout and monster attacks synchronize across browsers");

  await host.keyboard.press("Escape");
  const before = (await state(host)).elapsed;
  await host.waitForTimeout(1000);
  assert.ok((await state(host)).elapsed > before + 0.5);
  await host.locator("[data-action=resume]").click();
  console.log("Online clock continues through pause");
  for (let i = 1; i <= 21; i++) {
    await host.evaluate((i) => gameQA.teleport(...gameQA.route[i]), i);
    await host.waitForFunction((i) => gameQA.getState().cp === i, i);
    await host.waitForTimeout(120);
  }
  await guest.waitForFunction(() =>
    gameQA
      .getState()
      .online.players.some((p) => p.name === "Host" && p.finish > 0),
  );
  assert.equal((await state(host)).screen, "results");
  assert.equal((await state(guest)).screen, "drive");
  console.log("Finish results broadcast while other driver continues racing");
  for (let i = 1; i <= 21; i++) {
    await guest.evaluate((i) => gameQA.teleport(...gameQA.route[i]), i);
    await guest.waitForFunction((i) => gameQA.getState().cp === i, i);
    await guest.waitForTimeout(180);
  }
  await host.waitForFunction(() =>
    gameQA
      .getState()
      .online.players.some((p) => p.name === "Friend" && p.finish > 0),
  );
  assert.equal((await state(guest)).screen, "results");
  console.log("Guest checkpoint progress and finish validated by host");

  await host.locator("[data-action=return-lobby]").click();
  await guest.waitForFunction(() => gameQA.getState().screen === "lobby");
  assert.equal(
    (await state(guest)).online.players.find((p) => p.name === "Friend").ready,
    false,
  );
  await guest.locator("[data-action=ready]").click();
  await host.waitForFunction(() =>
    gameQA.getState().online.players.every((p) => p.ready),
  );
  await host.locator("[data-action=start-online]").click();
  await guest.waitForFunction(() => gameQA.getState().screen === "drive");
  assert.equal((await state(guest)).cp, 0);
  assert.ok((await state(guest)).countdown > 0);
  console.log("Rematch resets progress and ready status");
  await host.close();
  await guest.waitForFunction(() => gameQA.getState().screen === "online");
  assert.ok(await guest.locator(".online-error").textContent());
  console.log("Host departure returns guest to menu with explanation");
  assert.deepEqual(errors, []);
  console.log("Multiplayer browser checks passed with no JS errors.");
} catch (error) {
  for (const p of pages) {
    if (!p.isClosed()) console.log("Failure state:", await state(p));
  }
  console.log("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
