/** Real browser-driven transaction run. Explicitly authorized synthetic zero-fee Studionet only. */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { server } from "../src/server.ts";
if (!process.argv.includes("--authorized-studionet-only"))
  throw Error(
    "Live UI QA publishes synthetic data on zero-fee Studionet; pass --authorized-studionet-only explicitly",
  );
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 1050 },
  recordVideo: { dir: "video/captures", size: { width: 1280, height: 1050 } },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const states = [];
let jobId;
page.on("response", async (response) => {
  if (response.url().includes("/api/ui/jobs/")) {
    try {
      const j = await response.json();
      if (j.id) {
        jobId = j.id;
        if (
          states.at(-1)?.phase !== j.phase ||
          states.at(-1)?.status !== j.status
        )
          states.push({
            phase: j.phase,
            status: j.status,
            at: new Date().toISOString(),
          });
      }
    } catch {}
  }
});
try {
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(
    () => document.querySelector("#fresh-ui").dataset.ready === "true",
    {},
    { timeout: 15000 },
  );
  if (await page.locator("#fresh-new").isVisible())
    await page.locator("#fresh-new").click();
  if (!(await page.locator("#fresh-start").isDisabled()))
    throw Error("Consent gate missing");
  await page.locator("#fresh-ui").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "video/v6-ui-consent.png", fullPage: true });
  await page.locator("#fresh-consent").check();
  await page.waitForFunction(
    () => !document.querySelector("#fresh-start").disabled,
  );
  await page.waitForTimeout(1500);
  await page.locator("#fresh-start").click();
  await page.waitForFunction(
    () => document.querySelector("#fresh-proof").textContent.includes("Run:"),
    {},
    { timeout: 15000 },
  );
  const storedId = await page.evaluate(() =>
    localStorage.getItem("delivery-review-ui-job-v6"),
  );
  jobId = storedId;
  const config = await page.request
    .get("http://127.0.0.1:4173/api/ui/config")
    .then((r) => r.json());
  const duplicate = await page.request
    .post("http://127.0.0.1:4173/api/ui/jobs", {
      headers: {
        "X-Delivery-CSRF": config.csrfToken,
        "Content-Type": "application/json",
      },
      data: { id: jobId, scenario: "bad", consent: true },
    })
    .then((r) => r.json());
  if (duplicate.id !== jobId) throw Error("Duplicate click created new job");
  await page.reload();
  await page.waitForFunction(
    (id) => document.querySelector("#fresh-proof").textContent.includes(id),
    jobId,
    { timeout: 15000 },
  );
  if (!(await page.locator("#fresh-start").isDisabled()))
    throw Error("Reload enabled duplicate signing");
  await page.locator("#fresh-ui").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "video/v6-ui-pending.png", fullPage: true });
  await page.waitForFunction(
    () =>
      /^(FINALIZED|HOLD|FAILED|INTERRUPTED)/.test(
        document.querySelector("#fresh-status").textContent,
      ),
    {},
    { timeout: 480000 },
  );
  const job = await page.request
    .get("http://127.0.0.1:4173/api/ui/jobs/" + jobId)
    .then((r) => r.json());
  await fs.mkdir("evidence/v6", { recursive: true });
  await fs.writeFile(
    "evidence/v6/browser-live-job.json",
    JSON.stringify(job, null, 2),
  );
  await page.screenshot({ path: "video/v6-ui-result.png", fullPage: true });
  await page.waitForTimeout(6000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "video/v6-ui-mobile.png", fullPage: true });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile overflow");
  const qa = {
    passed: job.status === "COMPLETED",
    jobId,
    duplicateSameId: true,
    reloadSameJob: true,
    consentRequired: true,
    errors,
    mobileOverflow: false,
    states,
    actualStatus: job.status,
    result: job.result ?? null,
    scope:
      "Actual browser opt-in and API-triggered fresh contract deployment/review; no historical result substitution",
  };
  await fs.writeFile(
    "evidence/v6/browser-live-qa.json",
    JSON.stringify(qa, null, 2),
  );
  if (job.status !== "COMPLETED")
    throw Error("Live run did not complete: " + JSON.stringify(job));
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify(qa));
  const video = await page.video().path();
  await context.close();
  await fs.copyFile(video, "video/v6-browser-lifecycle.webm");
} finally {
  await context.close();
  await browser.close();
  server.close();
}
