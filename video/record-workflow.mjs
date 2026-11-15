import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { server } from "../src/server.ts";
const mode = process.env.UI_MODE || "sandbox",
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  recordVideo: { dir: "video/captures", size: { width: 1280, height: 1000 } },
});
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:4173");
  await page.waitForTimeout(2500);
  await page.locator(mode === "sandbox" ? "#sandbox" : "#court").hover();
  await page.waitForTimeout(1000);
  await page.locator(mode === "sandbox" ? "#sandbox" : "#court").click();
  await page.waitForFunction(
    () => !document.querySelector("#retry").disabled,
    {},
    { timeout: 60000 },
  );
  await page.waitForTimeout(5000);
  await page.locator("#retry").hover();
  await page.waitForTimeout(1000);
  await page.locator("#retry").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#timeline")
      .textContent.includes("BLOCKED before fetch"),
  );
  await page.waitForTimeout(6000);
  const path = await page.video().path();
  await context.close();
  await fs.copyFile(path, `video/${mode}-workflow.webm`);
  console.log(mode + " recorded");
} finally {
  await browser.close();
  server.close();
}
