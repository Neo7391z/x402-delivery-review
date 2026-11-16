/** Explicit mocked network-failure UI test. It never reaches a signing endpoint. */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { server } from "../src/server.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const attempts = [];
try {
  await page.route("**/api/ui/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/config"))
      return route.fulfill({
        json: { csrfToken: "a".repeat(64), latestJob: null },
      });
    if (req.method() === "POST") {
      attempts.push(req.postDataJSON());
      return route.fulfill({
        status: 503,
        json: { error: "Deliberate offline test failure" },
      });
    }
    return route.fulfill({ status: 404, json: { error: "No confirmed job" } });
  });
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(
    () => document.querySelector("#fresh-ui").dataset.ready === "true",
  );
  await page.locator("#fresh-scenario").selectOption("good");
  await page.locator("#fresh-consent").check();
  await page.locator("#fresh-start").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#fresh-status")
      .textContent.startsWith("Start uncertain"),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document
      .querySelector("#fresh-status")
      .textContent.includes("no confirmed job"),
  );
  if (
    attempts.length !== 1 ||
    (await page.locator("#fresh-scenario").inputValue()) !== "good"
  )
    throw Error("Reload lost original request scenario or auto-submitted");
  if (await page.locator("#fresh-consent").isChecked())
    throw Error("Consent silently restored");
  await page.locator("#fresh-consent").check();
  await page.locator("#fresh-start").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#fresh-status")
      .textContent.startsWith("Start uncertain"),
  );
  if (
    attempts.length !== 2 ||
    attempts[0].id !== attempts[1].id ||
    attempts[1].scenario !== "good"
  )
    throw Error("Retry changed request identity");
  await fs.writeFile(
    "evidence/v6/browser-offline-qa.json",
    JSON.stringify(
      {
        passed: true,
        mode: "Mocked browser network-failure test; no transaction",
        scenarioRetained: true,
        requestIdRetained: true,
        noAutoSubmissionOnReload: true,
        consentNotSilentlyRestored: true,
      },
      null,
      2,
    ),
  );
  console.log("Offline UI uncertain-start/reload/retry PASS");
} finally {
  await browser.close();
  server.close();
}
