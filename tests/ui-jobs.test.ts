import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { UiJobs, type Runner } from "../src/ui-jobs.js";
const contract = "0x" + "a".repeat(40),
  tx = "0x" + "b".repeat(64),
  evidence = "c".repeat(64);
const fixture: Runner = async (o) => {
  await o.onProgress?.("CONTRACT_READY", { contractAddress: contract });
  await o.onProgress?.("EVIDENCE_READY", { evidenceId: evidence });
  await o.onProgress?.("REVIEW_PENDING", { reviewTransactionHash: tx });
  return {
    runId: o.runId,
    scenario: o.scenario,
    contractAddress: contract,
    evidenceId: evidence,
    reviewTransactionHash: tx,
    verification: {
      verified: true,
      effect: "PAUSE",
      decision: "REWORK",
      evidenceId: evidence,
      transactionHash: tx,
      contractAddress: contract,
    },
    controllerState: "PAUSE",
    requestCountBeforeAttempt: 2,
    requestCountAfterAttempt: 2,
    nextRequestBlockedBeforeFetch: true,
    nextDeliveryCompleted: false,
  } as any;
};
const terminal = async (jobs: UiJobs, id: string) => {
  for (let i = 0; i < 200; i++) {
    const j = await jobs.get(id);
    if (j.status !== "RUNNING") return j;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Job never completed");
};
async function setup(
  fn: (jobs: UiJobs, dir: string) => Promise<void>,
  runner: Runner = fixture,
) {
  const dir = await mkdtemp(join(tmpdir(), "delivery-ui-"));
  try {
    await fn(new UiJobs(dir, runner), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("explicit opt-in is required before runner starts", async () => {
  let calls = 0;
  await setup(
    async (jobs) => {
      await assert.rejects(
        jobs.start({
          id: randomUUID(),
          scenario: "bad",
          consent: false,
        } as any),
        /consent/,
      );
      assert.equal(calls, 0);
    },
    async (o) => {
      calls++;
      return fixture(o);
    },
  );
});
test("double-click/repeated POST uses one job and one runner", async () => {
  let calls = 0;
  await setup(
    async (jobs) => {
      const input = {
        id: randomUUID(),
        scenario: "bad" as const,
        consent: true as const,
      };
      const [a, b] = await Promise.all([jobs.start(input), jobs.start(input)]);
      assert.equal(a.id, b.id);
      assert.equal((await terminal(jobs, a.id)).status, "COMPLETED");
      await jobs.start(input);
      assert.equal(calls, 1);
    },
    async (o) => {
      calls++;
      return fixture(o);
    },
  );
});
test("active distinct run and conflicting idempotency body are rejected", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await setup(
    async (jobs) => {
      const id = randomUUID();
      await jobs.start({ id, scenario: "bad", consent: true });
      await assert.rejects(
        jobs.start({ id: randomUUID(), scenario: "bad", consent: true }),
        /active/,
      );
      await assert.rejects(
        jobs.start({ id, scenario: "good", consent: true }),
        /conflicts/,
      );
      release();
      await terminal(jobs, id);
    },
    async (o) => {
      await gate;
      return fixture(o);
    },
  );
});
test("reload/status polling never invokes runner again", async () => {
  let calls = 0;
  await setup(
    async (jobs) => {
      const id = randomUUID();
      await jobs.start({ id, scenario: "bad", consent: true });
      await terminal(jobs, id);
      for (let i = 0; i < 5; i++) await jobs.get(id);
      assert.equal(calls, 1);
    },
    async (o) => {
      calls++;
      return fixture(o);
    },
  );
});
test("restart marks unfinished durable job interrupted; same ID never broadcasts", async () => {
  await setup(
    async (jobs, dir) => {
      const id = randomUUID();
      await writeFile(
        join(dir, id + ".json"),
        JSON.stringify({
          id,
          runId: "ui-" + id,
          scenario: "bad",
          status: "RUNNING",
          phase: "REVIEW_PENDING",
          details: {},
          events: [],
          createdAt: new Date().toISOString(),
        }),
      );
      const restored = await jobs.get(id);
      assert.equal(restored.status, "INTERRUPTED");
      assert.equal(
        (await jobs.start({ id, scenario: "bad", consent: true })).status,
        "INTERRUPTED",
      );
    },
    async () => {
      throw Error("must never run");
    },
  );
});
test("read-only recovery with missing proof does not sign or invent a result", async () => {
  await setup(
    async (jobs, dir) => {
      const id = randomUUID();
      await writeFile(
        join(dir, id + ".json"),
        JSON.stringify({
          id,
          runId: "ui-" + id,
          scenario: "bad",
          status: "INTERRUPTED",
          phase: "REVIEW_PENDING",
          details: {},
          events: [],
          createdAt: new Date().toISOString(),
        }),
      );
      const result = await jobs.recheck(id);
      assert.equal(result.status, "INTERRUPTED");
      assert.match(result.recoveryError!, /unavailable/);
      assert.equal(result.result, undefined);
    },
    async () => {
      throw Error("must never run");
    },
  );
});
test("runner failure is retained and is never a completed UI result", async () => {
  await setup(
    async (jobs) => {
      const id = randomUUID();
      await jobs.start({ id, scenario: "bad", consent: true });
      const j = await terminal(jobs, id);
      assert.equal(j.status, "FAILED");
      assert.match(j.error!, /network/);
    },
    async () => {
      throw Error("network unavailable");
    },
  );
});
for (const mismatch of ["run", "evidence", "receipt", "effect"])
  test("reject mismatched " + mismatch + " result", async () => {
    await setup(
      async (jobs) => {
        const id = randomUUID();
        await jobs.start({ id, scenario: "bad", consent: true });
        assert.equal((await terminal(jobs, id)).status, "FAILED");
      },
      async (o) => {
        const r = await fixture(o);
        if (mismatch === "run") r.runId = "another";
        if (mismatch === "evidence") r.evidenceId = "wrong";
        if (mismatch === "receipt" && r.verification.verified)
          r.verification.evidenceId = "wrong";
        if (mismatch === "effect") r.requestCountAfterAttempt = 4;
        return r;
      },
    );
  });
test("job IDs cannot traverse private files", async () => {
  await setup(async (jobs) => {
    await assert.rejects(jobs.get("../signer"), /Invalid/);
  });
});

test("progress persistence failure stops runner without an unhandled background rejection", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let afterProgress = false;
  await setup(
    async (jobs, dir) => {
      const id = randomUUID();
      await jobs.start({ id, scenario: "bad", consent: true });
      await rm(dir, { recursive: true, force: true });
      await writeFile(dir, "storage unavailable");
      release();
      const j = await terminal(jobs, id);
      assert.equal(j.status, "FAILED");
      assert.equal(afterProgress, false);
      assert.match(j.error!, /persisted/);
    },
    async (o) => {
      await gate;
      await o.onProgress?.("DEPLOY_SUBMITTING", {});
      afterProgress = true;
      return fixture(o);
    },
  );
});
