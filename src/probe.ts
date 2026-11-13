import { checkNetwork, studionetPort } from "./verify.js";
import { writeFile } from "node:fs/promises";
try {
  const result = {
    ...(await checkNetwork(studionetPort())),
    sdk: "genlayer-js 1.1.8",
    observedAt: new Date().toISOString(),
    scope:
      "Read-only network identity only; no deployment, source upload or verdict",
  };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(
    new URL("../evidence/studionet-network.json", import.meta.url),
    JSON.stringify(result, null, 2),
  );
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
}
