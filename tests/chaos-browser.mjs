import { chromium } from "playwright";
let stage = "loading";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:5173/?qa&simulation");
  await page.waitForFunction(() => window.gameQA);
  stage = "graphics settings";
  await page.locator("[data-action=settings]").click();
  await page.locator("#graphics").selectOption("performance");
  assert.equal(
    (await page.evaluate(() => gameQA.getState())).graphics.scale,
    0.75,
  );
  assert.equal(
    (await page.evaluate(() => gameQA.getState())).graphics.shadows,
    false,
  );
  await page.reload();
  await page.waitForFunction(() => window.gameQA);
  assert.equal(
    (await page.evaluate(() => gameQA.getState())).graphics.mode,
    "performance",
  );
  console.log("Performance graphics settings apply and persist");
  stage = "free roam";
  await page.locator("[data-action=free]").click();
  stage = "boost";
  await page.evaluate(() => gameQA.hazard("boost"));
  await page.waitForFunction(() => gameQA.getState().chaos.lastHit === "boost");
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => gameQA.getState().speed > 30);
  await page.keyboard.up("KeyW");
  console.log("Boost pad increases actual truck speed above normal maximum");
  stage = "pothole";
  await page.evaluate(() => gameQA.hazard("pothole"));
  await page.waitForFunction(
    () =>
      gameQA.getState().chaos.lastHit === "pothole" &&
      gameQA.getState().speed < 10,
  );
  console.log("Pothole slows the truck");
  stage = "oil";
  await page.evaluate(() => gameQA.hazard("oil"));
  await page.waitForFunction(
    () =>
      gameQA.getState().chaos.lastHit === "oil" &&
      gameQA.getState().chaos.oilUntil > gameQA.getState().chaos.clock,
  );
  console.log("Oil activates reduced grip");
  stage = "roadblock";
  await page.evaluate(() => gameQA.hazard("roadblock"));
  await page.waitForFunction(() => gameQA.getState().speed < 0);
  console.log("Roadblock collision stops and rebounds a real moving truck");
  stage = "monster";
  await page.evaluate(() => gameQA.monster());
  await page.waitForFunction(() =>
    document
      .querySelector("#chaos-status")
      ?.textContent.includes("GODZILLA INCOMING"),
  );
  await page.evaluate(async () => {
    const { rubblePoints } = await import("/src/chaos-rules.js");
    const p = rubblePoints(gameQA.getState().chaos.event)[0];
    gameQA.teleport(p.x, p.z);
    gameQA.advanceChaos(4.3);
  });
  await page.waitForFunction(
    () => gameQA.getState().chaos.lastHit === "rubble",
  );
  await page.evaluate(() => gameQA.renderFrame());
  await page.screenshot({ path: "/tmp/tokyo-chaos.png" });
  console.log("Monster warning and rubble impact work and render");
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(
    "::error title=Arcade " +
      stage +
      "::" +
      String(error.stack)
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A"),
  );
  throw error;
} finally {
  await browser.close();
}
