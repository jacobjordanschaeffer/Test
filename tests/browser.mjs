import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const state = () => page.evaluate(() => gameQA.getState());
try {
  await page.goto("http://localhost:5173/?qa&low");
  await page.waitForFunction(() => window.gameQA);
  await page.screenshot({ path: "/tmp/tokyo-home.png" });
  console.log("Home renders");
  await page.getByRole("button", { name: "The Garage" }).click();
  await page.getByRole("button", { name: "→", exact: true }).click();
  assert.equal((await state()).selected, 1);
  await page.getByRole("button", { name: "Paint #d95b46" }).click();
  assert.equal((await state()).paint, "#d95b46");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Free Roam" }).click();
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    () => gameQA.getState().speed > 12 && gameQA.getState().position[2] < 0,
  );
  await page.keyboard.up("KeyW");
  assert.ok((await state()).position[2] < 0);
  await page.keyboard.press("KeyC");
  assert.equal((await state()).cameraMode, 1);
  await page.screenshot({ path: "/tmp/tokyo-interior.png" });
  await page.keyboard.press("KeyC");
  assert.equal((await state()).cameraMode, 2);
  await page.keyboard.press("KeyM");
  assert.ok(
    await page.evaluate(() =>
      document.querySelector(".map").classList.contains("hidden"),
    ),
  );
  await page.keyboard.press("KeyR");
  assert.ok(Math.abs((await state()).position[2] - 7) < 1);
  console.log(
    "Driving, cameras, minimap, reset, paint, vehicle selection pass",
  );
  await page.keyboard.press("Escape");
  const frozen = (await state()).position;
  await page.waitForTimeout(300);
  assert.deepEqual((await state()).position, frozen);
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.locator("[data-action=settings]").click();
  await page.locator("#lighting").selectOption("Night");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Start Tokyo Run" }).click();
  assert.ok((await state()).countdown > 0);
  await page.evaluate(() => gameQA.skipCountdown());
  // Out-of-order checkpoints cannot advance the run.
  await page.evaluate(() => gameQA.teleport(...gameQA.route[5]));
  await page.waitForTimeout(400);
  assert.equal((await state()).cp, 0);
  const geometry = await page.evaluate(async () => {
    const { resolveCollision } = await import("/src/route.js");
    const blocked = [];
    for (let i = 1; i < gameQA.route.length; i++) {
      const a = gameQA.route[i - 1],
        b = gameQA.route[i],
        n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        if (
          resolveCollision(
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            1.05,
            gameQA.boxes,
          )
        ) {
          blocked.push(i);
          break;
        }
      }
    }
    return { blocked, obstacles: gameQA.boxes.length };
  });
  assert.deepEqual(geometry.blocked, []);
  console.log("All route centre lines clear:", geometry);
  const fullDrive = await page.evaluate(async () => {
    const { drive } = await import("/src/physics.js");
    const s = { x: 0, z: 7, speed: 0, yaw: 0, steer: 0, vx: 0, vz: 0 };
    let goal = 1,
      hits = 0;
    for (let tick = 0; tick < 120000 && goal < gameQA.route.length; tick++) {
      let p = gameQA.route[goal],
        dx = p[0] - s.x,
        dz = p[1] - s.z,
        d = Math.hypot(dx, dz);
      if (d < 14) {
        goal++;
        continue;
      }
      const desired = Math.atan2(-dx, -dz),
        error = Math.atan2(
          Math.sin(desired - s.yaw),
          Math.cos(desired - s.yaw),
        );
      const target = Math.abs(error) > 0.25 || d < 55 ? 9 : 23;
      const input = {
        turn: Math.max(-1, Math.min(1, error * 2.5)),
        throttle: s.speed < target ? 1 : 0,
        brake: s.speed > target + 1 ? 0.45 : 0,
        hand: false,
      };
      if (
        drive(
          s,
          input,
          1 / 60,
          { power: 8.7, grip: 7.8, max: 27 },
          gameQA.boxes,
        )
      )
        hits++;
    }
    return { goal, hits, x: s.x, z: s.z };
  });
  assert.equal(fullDrive.goal, 22);
  console.log("Entire route driven through shared physics:", fullDrive);
  for (let i = 1; i <= 21; i++) {
    await page.evaluate((i) => gameQA.teleport(...gameQA.route[i]), i);
    await page.waitForFunction((i) => gameQA.getState().cp === i, i);
  }
  assert.equal((await state()).screen, "results");
  assert.ok(
    await page.evaluate(
      () => Number(localStorage.getItem("tokyo-run-best")) > 0,
    ),
  );
  await page.getByRole("button", { name: "One more run" }).click();
  assert.equal((await state()).cp, 0);
  assert.ok((await state()).countdown > 0);
  console.log("Sequential checkpoints, finish, best time, restart pass");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("button", { name: "Free Roam" }).click();
  await page.screenshot({ path: "/tmp/tokyo-drive.png" });
  assert.deepEqual(errors, []);
  console.log("No browser errors. All browser checks passed.");
} finally {
  await browser.close();
}
