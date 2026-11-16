import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { server } from "../src/server.ts";
const mode = process.env.UI_MODE || "sandbox";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: "video/captures", size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.goto("http://127.0.0.1:4173");
  await page.locator("#legacy").evaluate((e) => (e.open = true));
  await page
    .locator(".brands img")
    .evaluateAll((xs) => Promise.all(xs.map((x) => x.decode())));
  await page.screenshot({ path: `video/${mode}-ready.png`, fullPage: true });
  await page.locator(mode === "sandbox" ? "#sandbox" : "#court").click();
  await page.waitForFunction(
    () => !document.querySelector("#retry").disabled,
    {},
    { timeout: 60000 },
  );
  const before = await page.locator("#timeline").textContent();
  if (
    !before.includes(
      mode === "sandbox" ? "provider signature verified" : "Court REWORK",
    )
  )
    throw Error("Expected workflow missing: " + before);
  await page.screenshot({ path: `video/${mode}-review.png`, fullPage: true });
  await page.locator("#retry").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#timeline")
      .textContent.includes("BLOCKED before fetch"),
  );
  const after = await page.locator("#timeline").textContent();
  if (
    !after.includes(
      mode === "sandbox"
        ? "Provider requests this session: 2 / deliveries: 1"
        : "Provider requests this session: 0 / deliveries: 0",
    )
  )
    throw Error("Unexpected provider calls");
  await page.screenshot({ path: `video/${mode}-blocked.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `video/${mode}-mobile.png`, fullPage: true });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile overflow");
  if (errors.length) throw Error(errors.join("\n"));
  await fs.writeFile(
    `evidence/ui-qa-${mode}.json`,
    JSON.stringify(
      {
        passed: true,
        browser: "Official Chrome headless shell 157",
        mode,
        errors,
        imagesLoaded: true,
        mobileOverflow: false,
        before,
        after,
      },
      null,
      2,
    ),
  );
  console.log("UI QA PASS " + mode);
} finally {
  await context.close();
  await browser.close();
  server.close();
}
