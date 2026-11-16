/** Durable UI jobs. Reconnects read status; they never replay submissions. */
import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  runFreshFlow,
  type FreshPhase,
  type FreshProgress,
  type FreshResult,
} from "./fresh-flow.js";
import { verifyFinalDecision, sha256, type Verification } from "./verify.js";
import { validateReceipt, reviewEvidence } from "./sandbox.js";
export type JobRequest = {
  id: string;
  scenario: "bad" | "good";
  consent: true;
};
export type Job = {
  id: string;
  runId: string;
  scenario: "bad" | "good";
  status:
    | "RUNNING"
    | "COMPLETED"
    | "HOLD"
    | "FAILED"
    | "INTERRUPTED"
    | "VERIFIED_READ_ONLY";
  phase: FreshPhase | "QUEUED";
  details: FreshProgress;
  events: Array<{ phase: string; at: string }>;
  createdAt: string;
  consentAcceptedAt?: string;
  authorization?: "disposable-studionet-synthetic-zero-cost";
  result?: FreshResult;
  error?: string;
  recoveryError?: string;
  recheck?: Verification;
  effectReplayed?: false;
};
export type Runner = typeof runFreshFlow;
const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
export class UiJobs {
  private active?: string;
  private jobs = new Map<string, Job>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly runner: Runner = runFreshFlow,
  ) {}
  private async save(job: Job) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, job.id + ".json");
    await writeFile(file + ".tmp", JSON.stringify(job, null, 2), {
      mode: 0o600,
    });
    await rename(file + ".tmp", file);
    this.jobs.set(job.id, structuredClone(job));
  }
  async get(id: string): Promise<Job> {
    if (!validId(id)) throw Error("Invalid job ID");
    const existing = this.jobs.get(id);
    if (existing) return structuredClone(existing);
    const job = JSON.parse(
      await readFile(join(this.directory, id + ".json"), "utf8"),
    ) as Job;
    if (job.id !== id || job.runId !== "ui-" + id)
      throw Error("Job identity mismatch");
    if (job.status === "RUNNING") {
      job.status = "INTERRUPTED";
      job.error =
        "Server stopped before completion. No transaction is automatically replayed. Use read-only recheck; a fresh run is a separate explicit opt-in.";
      await this.save(job);
    } else this.jobs.set(id, job);
    return job;
  }
  async latest() {
    try {
      const names = (await readdir(this.directory)).filter((n) =>
        n.endsWith(".json"),
      );
      const jobs = await Promise.all(
        names.map((n) => this.get(n.slice(0, -5))),
      );
      return (
        jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  start(input: JobRequest): Promise<Job> {
    const task = this.queue.then(() => this.reserve(input));
    this.queue = task.catch(() => {});
    return task;
  }
  private async reserve(input: JobRequest) {
    if (
      !input ||
      input.consent !== true ||
      !validId(input.id) ||
      !["bad", "good"].includes(input.scenario)
    )
      throw Error("Explicit consent, valid request ID and scenario required");
    try {
      const old = await this.get(input.id);
      if (old.scenario !== input.scenario)
        throw Error("Idempotency key conflicts with original scenario");
      return old;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (this.active) throw Error("Another run is active: " + this.active);
    const job: Job = {
      id: input.id,
      runId: "ui-" + input.id,
      scenario: input.scenario,
      status: "RUNNING",
      phase: "QUEUED",
      details: {},
      events: [],
      createdAt: new Date().toISOString(),
      consentAcceptedAt: new Date().toISOString(),
      authorization: "disposable-studionet-synthetic-zero-cost",
    };
    await this.save(job);
    this.active = job.id;
    void this.execute(job).catch(() => {
      job.status = "FAILED";
      job.error =
        "Local state could not be persisted. No automatic resubmission; inspect retained transaction hashes.";
      this.jobs.set(job.id, structuredClone(job));
      this.active = undefined;
    });
    return job;
  }
  private async execute(job: Job) {
    try {
      const result = await this.runner({
        runId: job.runId,
        scenario: job.scenario,
        onProgress: async (phase, details) => {
          job.phase = phase;
          job.details = { ...job.details, ...details };
          job.events.push({ phase, at: new Date().toISOString() });
          await this.save(job);
        },
      });
      if (
        result.runId !== job.runId ||
        result.scenario !== job.scenario ||
        !result.evidenceId ||
        result.evidenceId !== job.details.evidenceId ||
        result.reviewTransactionHash !== job.details.reviewTransactionHash ||
        result.contractAddress !== job.details.contractAddress
      )
        throw Error("Runner result does not match this job evidence");
      if (
        result.verification.verified &&
        (result.verification.evidenceId !== result.evidenceId ||
          result.verification.transactionHash !==
            result.reviewTransactionHash ||
          result.verification.contractAddress !== result.contractAddress)
      )
        throw Error("Verified receipt does not match this job");
      const allows =
        result.verification.verified && result.verification.effect === "ALLOW";
      if (
        result.requestCountBeforeAttempt !== 2 ||
        result.requestCountAfterAttempt !== (allows ? 4 : 2) ||
        (allows
          ? !result.nextDeliveryCompleted
          : !result.nextRequestBlockedBeforeFetch)
      )
        throw Error("Controller effect was not demonstrated for this job");
      job.result = result;
      job.status = result.verification.verified ? "COMPLETED" : "HOLD";
    } catch (e) {
      job.status = "FAILED";
      job.error = (e instanceof Error ? e.message : "Run failed").slice(0, 500);
    } finally {
      try {
        await this.save(job);
      } finally {
        this.active = undefined;
      }
    }
  }
  recheck(id: string): Promise<Job> {
    const task = this.queue.then(() => this.recover(id));
    this.queue = task.catch(() => {});
    return task;
  }
  private async recover(id: string) {
    const job = await this.get(id);
    if (job.status === "RUNNING")
      throw Error("Run still active; status polling does not submit again");
    // Fixed local job identity determines every proof input. No caller-provided address/tx.
    const root = new URL("../", import.meta.url),
      run = new URL(".local/fresh-runs/" + job.runId + "/", root);
    try {
      const packet = JSON.parse(
        await readFile(new URL("evidence/demo-output.json", run), "utf8"),
      );
      const deployment = JSON.parse(
        await readFile(
          new URL("evidence/studio-deployment-verified.json", run),
          "utf8",
        ),
      );
      const submission = JSON.parse(
        await readFile(
          new URL("evidence/studio-review-submitted.json", run),
          "utf8",
        ),
      );
      validateReceipt(
        packet.receipt,
        packet.receipt.data.provider,
        packet.receipt.data.challenge.data.client,
      );
      if (
        reviewEvidence(packet.receipt) !== packet.evidence ||
        sha256(packet.evidence) !== job.details.evidenceId ||
        deployment.contractAddress !== job.details.contractAddress ||
        submission.transactionHash !== job.details.reviewTransactionHash
      )
        throw Error("Saved evidence does not match this UI job");
      job.recheck = await verifyFinalDecision(
        {
          contractAddress: deployment.contractAddress,
          operatorAddress: submission.operator,
          transactionHash: submission.transactionHash,
          evidence: packet.evidence,
          sourceSha256: sha256(
            await readFile(
              new URL("contracts/delivery_review.py", root),
              "utf8",
            ),
          ),
        },
        undefined,
        45000,
      );
      job.recoveryError = undefined;
      job.effectReplayed = false;
      if (job.recheck.verified && job.status !== "COMPLETED")
        job.status = "VERIFIED_READ_ONLY";
      await this.save(job);
      return job;
    } catch (e) {
      job.recoveryError =
        "Read-only recovery unavailable: " +
        (e instanceof Error ? e.message : "missing evidence");
      await this.save(job);
      return job;
    }
  }
}
