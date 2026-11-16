import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { server } from "../src/server.ts";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(
    () => !document.querySelector("#fresh-recheck").hidden,
    {},
    { timeout: 15000 },
  );
  const before = await page.evaluate(() =>
    localStorage.getItem("delivery-review-ui-job-v6"),
  );
  await page.locator("#fresh-recheck").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#fresh-recheck").disabled &&
      /Read-only recheck (verified|HOLD)/.test(
        document.querySelector("#fresh-status").textContent,
      ),
    {},
    { timeout: 60000 },
  );
  const job = await page.request
    .get("http://127.0.0.1:4173/api/ui/jobs/" + before)
    .then((r) => r.json());
  if (!job.recheck?.verified || job.effectReplayed !== false)
    throw Error("Read-only recovery did not verify");
  await page.screenshot({ path: "video/v6-ui-recheck.png", fullPage: true });
  await fs.writeFile(
    "evidence/v6/browser-recovery-qa.json",
    JSON.stringify(
      {
        passed: true,
        jobId: before,
        serverRestartRestoredCompletedJob: true,
        recheckVerified: true,
        effectReplayed: false,
        errors,
        originalReviewTransaction: job.result.reviewTransactionHash,
        recheckTransaction: job.recheck.transactionHash,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log("Browser restart and read-only recheck PASS");
} finally {
  await browser.close();
  server.close();
}
