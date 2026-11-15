/** Non-monetary x402 custom scheme. Never represents ERC-20 settlement. */
import {
  generateKeyPairSync,
  sign,
  verify,
  randomUUID,
  type KeyObject,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
} from "@x402/core/http";
import {
  sha256,
  verifyFinalDecision,
  type VerifyInput,
  type Verification,
} from "./verify.js";
import { terms, samples } from "./core.js";
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export const hash = (v: unknown) => sha256(canonical(v));
export function identity() {
  const k = generateKeyPairSync("ed25519");
  return {
    privateKey: k.privateKey,
    publicKey: k.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
export type Signed<T> = { data: T; signature: string };
export function seal<T>(data: T, key: KeyObject): Signed<T> {
  return {
    data,
    signature: sign(null, Buffer.from(canonical(data)), key).toString("base64"),
  };
}
export function authentic<T>(s: Signed<T>, key: string) {
  try {
    return verify(
      null,
      Buffer.from(canonical(s.data)),
      key,
      Buffer.from(s.signature, "base64"),
    );
  } catch {
    return false;
  }
}
export const mandate = {
  mandateId: "consensus-explainer-v2",
  objective: terms,
  authoritySummary:
    "One non-monetary sandbox delivery per review; local client controller only",
  prohibitedActions: [
    "Real payments",
    "Unsigned delivery",
    "Retry before finalized review",
    "Ignore provider identity",
  ],
  rubric: [
    "Relevance to optimistic consensus",
    "Independent validators",
    "Challenge escalation",
    "Honest uncertainty",
    "Complete signed evidence",
    "Zero financial spend",
  ],
  fallback: "HOLD pending human review",
  reviewCadence: "Every delivery",
};
type Challenge = {
  nonce: string;
  expires: number;
  mandateHash: string;
  resource: string;
  terms: string;
  client: string;
};
type Auth = { challengeHash: string; nonce: string; mandateHash: string };
export type Receipt = {
  actionId: string;
  challenge: Signed<Challenge>;
  authorization: Signed<Auth>;
  body: string;
  bodyHash: string;
  provider: string;
  cost: string;
  issuedAt: string;
};
export class SandboxProvider {
  readonly keys = identity();
  readonly challenges = new Map<string, Signed<Challenge>>();
  readonly used = new Set<string>();
  requests = 0;
  deliveries = 0;
  readonly server: Server;
  constructor(
    readonly clientKey: string,
    readonly body = samples.bad,
  ) {
    this.server = createServer((req, res) => {
      this.requests++;
      res.setHeader("Content-Type", "application/json");
      try {
        if (req.url !== "/resource" || req.method !== "GET") {
          res.writeHead(404).end();
          return;
        }
        const header = req.headers["payment-signature"];
        if (!header) {
          const challenge = seal(
            {
              nonce: randomUUID(),
              expires: Date.now() + 60000,
              mandateHash: hash(mandate),
              resource: "sandbox://consensus-explainer",
              terms,
              client: clientKey,
            },
            this.keys.privateKey,
          );
          this.challenges.set(challenge.data.nonce, challenge);
          const offer = {
            x402Version: 2,
            resource: {
              url: challenge.data.resource,
              description: terms,
              mimeType: "text/plain",
            },
            accepts: [
              {
                scheme: "demo-authorization",
                network: "sandbox:court" as const,
                amount: "1",
                asset: "NO-MONEY",
                payTo: hash(this.keys.publicKey),
                maxTimeoutSeconds: 60,
                extra: { challenge },
              },
            ],
          };
          res
            .writeHead(402, {
              "PAYMENT-REQUIRED": encodePaymentRequiredHeader(offer),
            })
            .end(JSON.stringify(offer));
          return;
        }
        if (typeof header !== "string" || header.length > 16384)
          throw Error("Invalid authorization");
        const p = decodePaymentSignatureHeader(header);
        const a = p.payload as unknown as Signed<Auth>;
        const c = this.challenges.get(a.data?.nonce);
        if (
          p.x402Version !== 2 ||
          p.accepted.scheme !== "demo-authorization" ||
          p.accepted.network !== "sandbox:court" ||
          p.accepted.amount !== "1" ||
          p.accepted.asset !== "NO-MONEY" ||
          p.accepted.payTo !== hash(this.keys.publicKey) ||
          !c ||
          c.data.expires < Date.now() ||
          this.used.has(c.data.nonce) ||
          !authentic(a, this.clientKey) ||
          a.data.challengeHash !== hash(c) ||
          a.data.mandateHash !== hash(mandate)
        )
          throw Error("Rejected or replayed authorization");
        this.used.add(c.data.nonce);
        this.deliveries++;
        const data: Receipt = {
          actionId: randomUUID(),
          challenge: c,
          authorization: a,
          body: this.body,
          bodyHash: sha256(this.body),
          provider: this.keys.publicKey,
          cost: "0 real currency; 1 sandbox authorization",
          issuedAt: new Date().toISOString(),
        };
        res.end(JSON.stringify(seal(data, this.keys.privateKey)));
      } catch {
        res
          .writeHead(403)
          .end(JSON.stringify({ error: "Authorization rejected" }));
      }
    });
  }
  async listen() {
    await new Promise<void>((resolve) =>
      this.server.listen(0, "127.0.0.1", resolve),
    );
    return `http://127.0.0.1:${(this.server.address() as { port: number }).port}/resource`;
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
export function validateReceipt(
  r: Signed<Receipt>,
  provider: string,
  client: string,
) {
  const d = r?.data,
    c = d?.challenge,
    a = d?.authorization;
  if (
    !d ||
    !authentic(r, provider) ||
    d.provider !== provider ||
    !authentic(c, provider) ||
    c.data.client !== client ||
    c.data.mandateHash !== hash(mandate) ||
    c.data.terms !== terms ||
    c.data.resource !== "sandbox://consensus-explainer" ||
    !authentic(a, client) ||
    a.data.challengeHash !== hash(c) ||
    a.data.nonce !== c.data.nonce ||
    a.data.mandateHash !== hash(mandate) ||
    d.bodyHash !== sha256(d.body)
  )
    throw Error("Missing or invalid signed evidence");
}
export function reviewEvidence(receipt: Signed<Receipt>) {
  return canonical({
    version: 1,
    resource: receipt.data.challenge.data.resource,
    terms,
    network: "sandbox:court",
    amount: "1",
    asset: "NO-MONEY",
    payTo: hash(receipt.data.provider),
    body: receipt.data.body,
    mandate,
    actionReceipts: [receipt],
    outputs: [
      { artifactId: receipt.data.bodyHash, summary: "Delivered explanation" },
    ],
    costs: { txCount: 0, nativeGasSpent: "0", tokenSpent: "0" },
    priorDecisions: [],
  });
}
export class ControlledClient {
  readonly keys;
  state: "ALLOW" | "HOLD" | "PAUSE";
  receipt?: Signed<Receipt>;
  events: string[] = [];
  evidence?: string;
  constructor(
    readonly persist: (state: unknown) => Promise<void> = async () => {},
    initial?: {
      state: "ALLOW" | "HOLD" | "PAUSE";
      receipt?: Signed<Receipt>;
      evidence?: string;
      events: string[];
    },
    keys = identity(),
  ) {
    this.keys = keys;
    this.state = initial?.state ?? "ALLOW";
    if (initial) {
      this.receipt = initial.receipt;
      this.evidence = initial.evidence;
      this.events = initial.events;
    }
  }
  async save() {
    await this.persist({
      state: this.state,
      receipt: this.receipt,
      evidence: this.evidence,
      events: this.events,
    });
  }
  async purchase(url: string, provider: string) {
    if (this.state !== "ALLOW") {
      this.events.push("BLOCKED before fetch: " + this.state);
      await this.save();
      throw Error("Controller " + this.state);
    }
    this.state = "HOLD";
    await this.save();
    try {
      const first = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      this.events.push("GET → " + first.status);
      if (first.status !== 402) throw Error("Expected 402");
      const scheme = {
        scheme: "demo-authorization",
        createPaymentPayload: async (version: number, r: any) => {
          const c = r.extra?.challenge as Signed<Challenge>;
          if (
            !c ||
            !authentic(c, provider) ||
            c.data.expires < Date.now() ||
            c.data.client !== this.keys.publicKey ||
            c.data.mandateHash !== hash(mandate) ||
            c.data.terms !== terms ||
            c.data.resource !== "sandbox://consensus-explainer" ||
            r.amount !== "1" ||
            r.asset !== "NO-MONEY" ||
            r.payTo !== hash(provider)
          )
            throw Error("Untrusted challenge");
          return {
            x402Version: version,
            payload: seal(
              {
                challengeHash: hash(c),
                nonce: c.data.nonce,
                mandateHash: hash(mandate),
              },
              this.keys.privateKey,
            ) as unknown as Record<string, unknown>,
          };
        },
      };
      const http = new x402HTTPClient(
        x402Client.fromConfig({
          schemes: [{ network: "sandbox:court", client: scheme }],
          spendControls: {
            allowedAssets: [
              {
                network: "sandbox:court",
                asset: "NO-MONEY",
                maxAmountPerPayment: "1",
              },
            ],
          },
        }),
      );
      const required = http.getPaymentRequiredResponse(
        (n) => first.headers.get(n),
        await first.json(),
      );
      const payload = await http.createPaymentPayload(required);
      this.events.push("Official x402 SDK → signed sandbox authorization");
      const second = await fetch(url, {
        headers: http.encodePaymentSignatureHeader(payload),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (second.status !== 200) throw Error("Delivery rejected");
      const receipt = (await second.json()) as Signed<Receipt>;
      validateReceipt(receipt, provider, this.keys.publicKey);
      if (hash(receipt.data.authorization) !== hash(payload.payload))
        throw Error("Delivery is not bound to this request authorization");
      this.receipt = receipt;
      this.evidence = reviewEvidence(receipt);
      this.events.push("200 → provider signature verified → HOLD for Court");
      await this.save();
      return receipt;
    } catch (e) {
      this.events.push("Failure → HOLD");
      await this.save();
      throw e;
    }
  }
  async review(
    input: Omit<VerifyInput, "evidence">,
    verifier: (
      input: VerifyInput,
    ) => Promise<Verification> = verifyFinalDecision,
  ) {
    this.state = "HOLD";
    await this.save();
    if (!this.receipt || !this.evidence) throw Error("Missing evidence");
    validateReceipt(
      this.receipt,
      this.receipt.data.provider,
      this.keys.publicKey,
    );
    if (reviewEvidence(this.receipt) !== this.evidence)
      throw Error("Receipt/evidence mismatch");
    let result: Verification;
    try {
      result = await verifier({ ...input, evidence: this.evidence });
    } catch {
      this.events.push("RPC failure → HOLD");
      await this.save();
      throw Error("Review unavailable; HOLD");
    }
    if (
      result.verified &&
      result.evidenceId === sha256(this.evidence) &&
      result.effect ===
        (result.decision === "ACCEPT"
          ? "ALLOW"
          : result.decision === "REWORK"
            ? "PAUSE"
            : "HOLD")
    ) {
      this.state = result.effect;
      this.events.push("Court " + result.decision + " → " + result.effect);
    } else this.events.push("Unverified decision → HOLD");
    try {
      await this.save();
    } catch {
      this.state = "HOLD";
      throw Error("Controller persistence failed; HOLD");
    }
    return result;
  }
}
