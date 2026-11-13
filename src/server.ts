import { sandboxAction, closeSandbox } from "./sandbox-api.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { sha256, verifyFinalDecision } from "./verify.js";
import { packet, sampleHeader, samples, policy } from "./core.js";
export const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url?.startsWith("/api/sandbox/")) {
      res.setHeader("Content-Type", "application/json");
      try {
        res.end(
          JSON.stringify(await sandboxAction(req.url.split("/").at(-1)!)),
        );
      } catch (e) {
        res.writeHead(409);
        res.end(
          JSON.stringify({
            state: "HOLD",
            error: e instanceof Error ? e.message : "Sandbox failed",
          }),
        );
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/live/verify") {
      res.setHeader("Content-Type", "application/json");
      const contractAddress = process.env.DELIVERY_CONTRACT_ADDRESS,
        operatorAddress = process.env.DELIVERY_OPERATOR_ADDRESS;
      if (!contractAddress || !operatorAddress) {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            verified: false,
            effect: "HOLD",
            error: "Live contract and operator are not configured",
          }),
        );
        return;
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 50000) {
          res.writeHead(413);
          res.end(
            JSON.stringify({
              verified: false,
              effect: "HOLD",
              error: "Request too large",
            }),
          );
          return;
        }
      }
      try {
        const input = JSON.parse(raw);
        const p = packet(input.header, input.body);
        const source = await readFile(
          new URL("../contracts/delivery_review.py", import.meta.url),
          "utf8",
        );
        const result = await verifyFinalDecision({
          contractAddress,
          operatorAddress,
          transactionHash: input.transactionHash,
          evidence: p.evidence,
          sourceSha256: sha256(source),
        });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            verified: false,
            effect: "HOLD",
            error: "Invalid verification request",
          }),
        );
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/prepare") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 50000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      try {
        const input = JSON.parse(raw);
        const p = packet(input.header, input.body);
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ...p,
            functionName: "review",
            args: [p.evidence],
            submitted: false,
          }),
        );
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid x402 header or response" }));
      }
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Read-only demo");
      return;
    }
    if (req.url === "/api/live/recorded") {
      res.setHeader("Content-Type", "application/json");
      try {
        const result = JSON.parse(
          await readFile(
            new URL(
              "../evidence/studio-live-verification.json",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        if (result.verified !== true) throw Error("No verified snapshot");
        res.end(
          JSON.stringify({
            ...result,
            recorded: true,
            environment: "hosted Studionet simulator",
            warning: "Recorded verification, not a fresh RPC check",
          }),
        );
      } catch {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            verified: false,
            effect: "HOLD",
            error: "No verified recorded run",
          }),
        );
      }
      return;
    }
    if (req.url === "/api/demo") {
      const p = packet(sampleHeader, samples.bad);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          mode: "SIMULATION — fixture verdict; no payment or chain transaction",
          header: sampleHeader,
          ...p,
          decision: "REWORK",
          effect: policy("REWORK", true, true, p.id, p.id),
          reason:
            "The delivered answer contradicts the mandate: no independent validation, no challenge path, false certainty.",
        }),
      );
      return;
    }
    if (
      [
        "/assets/internet-court.svg",
        "/assets/genlayer.svg",
        "/assets/x402.svg",
      ].includes(req.url ?? "")
    ) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(await readFile(new URL("../public" + req.url, import.meta.url)));
      return;
    }
    if (req.url !== "/") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(await readFile(new URL("../public/index.html", import.meta.url)));
  } catch {
    res.writeHead(500);
    res.end("Demo unavailable; access remains HOLD");
  }
});
server.on("close", () => void closeSandbox());
server.listen(4173, "127.0.0.1", () =>
  console.log("Local demo: http://127.0.0.1:4173"),
);
