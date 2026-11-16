import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { UiJobs } from "./ui-jobs.js";
export function createUiApi(
  jobs = new UiJobs(
    fileURLToPath(new URL("../.local/ui-jobs/", import.meta.url)),
  ),
) {
  const token = randomBytes(32).toString("hex");
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    const path = req.url ?? "";
    if (!path.startsWith("/api/ui/")) return false;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const reply = (status: number, value: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
      return true;
    };
    const host = req.headers.host;
    if (!["127.0.0.1:4173", "localhost:4173"].includes(host ?? ""))
      return reply(403, { error: "Local host required" });
    // Protect the local signing capability from cross-origin requests and DNS rebinding.
    const origin = req.headers.origin;
    if (origin && origin !== "http://" + host)
      return reply(403, { error: "Same-origin request required" });
    if (req.method === "POST") {
      const supplied = req.headers["x-delivery-csrf"];
      if (
        typeof supplied !== "string" ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token)) ||
        req.headers["content-type"] !== "application/json"
      )
        return reply(403, { error: "Local session token and JSON required" });
    }
    try {
      if (path === "/api/ui/config" && req.method === "GET")
        return reply(200, {
          csrfToken: token,
          chainId: 61999,
          gasPrice: "0",
          latestJob: await jobs.latest(),
          scope:
            "Trusted local backend; public synthetic Studionet data; no real payment",
        });
      if (path === "/api/ui/jobs" && req.method === "POST") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 2048)
            return reply(413, { error: "Request too large" });
        }
        let input;
        try {
          input = JSON.parse(raw);
        } catch {
          return reply(400, { error: "Invalid JSON" });
        }
        if (
          Object.keys(input ?? {}).some(
            (k) => !["id", "scenario", "consent"].includes(k),
          )
        )
          return reply(400, { error: "Unsupported request field" });
        return reply(202, await jobs.start(input));
      }
      const match = path.match(/^\/api\/ui\/jobs\/([0-9a-f-]+)(\/recheck)?$/i);
      if (match && req.method === "GET" && !match[2])
        return reply(200, await jobs.get(match[1]));
      if (match && req.method === "POST" && match[2])
        return reply(200, await jobs.recheck(match[1]));
      return reply(404, { error: "Unknown UI operation" });
    } catch (e) {
      return reply((e as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 409, {
        error: e instanceof Error ? e.message : "Operation failed",
        state: "HOLD",
      });
    }
  };
}
