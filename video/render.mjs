import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:4173");
await page
  .locator(".brands img")
  .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
await page.screenshot({ path: "video/01-ready.png" });
await page.getByRole("button", { name: "Run local review demo" }).click();
await page.waitForFunction(
  () => document.querySelector("#status strong").textContent === "PAUSED",
);
await page.screenshot({ path: "video/04-paused.png" });
for (const n of [2, 3]) {
  await page.evaluate((n) => window.stage(n), n);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `video/0${n}-stage.png` });
}
const response = await page.request.get("http://127.0.0.1:4173/api/demo");
const demo = await response.json();
await fs.writeFile("evidence/demo-output.json", JSON.stringify(demo, null, 2));
await page.locator("#prepare").evaluate((e) => (e.open = true));
await page.locator("#header").fill(demo.header);
await page
  .locator("#body")
  .fill(
    "Independent validators review evidence; challenges can escalate disagreement. Correctness remains uncertain.",
  );
await page.getByRole("button", { name: "Prepare unsigned packet" }).click();
await page.waitForFunction(() =>
  document.querySelector("#output").textContent.includes("submitted"),
);
const packet = JSON.parse(await page.locator("#output").textContent());
if (packet.submitted !== false) throw Error("Unexpected submission");
const bad = await page.request.post("http://127.0.0.1:4173/api/prepare", {
  data: { header: "bad", body: "x" },
});
if (bad.status() !== 400) throw Error("Invalid header accepted");
await page.setViewportSize({ width: 390, height: 844 });
await page.locator("#prepare").evaluate((e) => (e.open = false));
await page.screenshot({ path: "video/mobile.png", fullPage: true });
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Mobile overflow");
await fs.writeFile(
  "evidence/ui-qa.json",
  JSON.stringify(
    {
      errors,
      imagesLoaded: true,
      runButton: true,
      unsignedPacket: true,
      invalidHeaderStatus: bad.status(),
      mobileOverflow: false,
    },
    null,
    2,
  ),
);
if (errors.length) throw Error(errors.join("\n"));
await browser.close();
