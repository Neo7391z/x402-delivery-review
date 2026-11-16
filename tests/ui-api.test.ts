import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
// Raw HTTP preserves the Host header under test (fetch implementations may replace it).
const fetch = (url: string, options: any = {}) =>
  new Promise<{ status: number; json: () => Promise<any> }>(
    (resolve, reject) => {
      const req = request(
        url,
        { method: options.method || "GET", headers: options.headers },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              json: async () => JSON.parse(raw),
            }),
          );
        },
      );
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    },
  );
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createUiApi } from "../src/ui-api.js";
import { UiJobs } from "../src/ui-jobs.js";
test("local signing API requires allowed host/origin, session token and explicit consent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "delivery-api-"));
  let calls = 0;
  const jobs = new UiJobs(dir, async () => {
    calls++;
    throw Error("test runner stopped");
  });
  const api = createUiApi(jobs);
  const server = createServer((req, res) => void api(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const host = { Host: "127.0.0.1:4173" };
  try {
    assert.equal((await fetch(base + "/api/ui/config")).status, 403);
    assert.equal(
      (
        await fetch(base + "/api/ui/config", {
          headers: { ...host, Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    const config = await fetch(base + "/api/ui/config", { headers: host }).then(
      (r) => r.json(),
    );
    assert.equal(calls, 0);
    assert.equal(config.latestJob, null);
    const data = { id: randomUUID(), scenario: "bad", consent: true };
    const headers = {
      ...host,
      "Content-Type": "application/json",
      "X-Delivery-CSRF": config.csrfToken,
      Origin: "http://127.0.0.1:4173",
    };
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers: host,
          body: JSON.stringify(data),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.invalid" },
          body: JSON.stringify(data),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...data, consent: false }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...data, rpc: "https://evil.invalid" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers,
          body: "x".repeat(2100),
        })
      ).status,
      413,
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await fetch(base + "/api/ui/jobs", {
          method: "POST",
          headers,
          body: JSON.stringify(data),
        })
      ).status,
      202,
    );
    await new Promise((r) => setTimeout(r, 30));
    const repeated = await fetch(base + "/api/ui/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    assert.equal(repeated.status, 202);
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
