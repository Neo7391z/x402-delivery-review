/** Explicit CLI adapter; the browser uses the same typed orchestration service. */
import { randomUUID } from "node:crypto";
import { runFreshFlow } from "./fresh-flow.js";
const args = process.argv.slice(2);
if (
  args.some(
    (a) =>
      ![
        "--authorized-studionet-only",
        "--scenario=bad",
        "--scenario=good",
      ].includes(a),
  ) ||
  (args.includes("--scenario=bad") && args.includes("--scenario=good"))
)
  throw Error("Unknown or conflicting option");
const scenario = args.includes("--scenario=good") ? "good" : "bad";
if (!args.includes("--authorized-studionet-only"))
  console.log(
    JSON.stringify(
      {
        mode: "PLAN ONLY — no signing or remote writes",
        scenario,
        execute:
          "npm run demo:fresh -- --authorized-studionet-only --scenario=" +
          scenario,
        scope:
          "Public zero-fee Studionet; synthetic data; disposable local signer; no real payment",
      },
      null,
      2,
    ),
  );
else {
  const result = await runFreshFlow({
    runId:
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID().slice(0, 8),
    scenario,
    onProgress: async (phase, details) => {
      console.log(JSON.stringify({ phase, ...details }));
    },
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.verification.verified) process.exitCode = 2;
}
