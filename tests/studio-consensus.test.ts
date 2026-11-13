import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStudioConsensus } from "../src/studio-consensus.js";
const captured = () =>
  JSON.parse(
    readFileSync(
      new URL("../evidence/studio-deploy-receipt.json", import.meta.url),
      "utf8",
    ),
  );
test("captured finalized Studio deployment: 3 agree, 2 quorum-cancelled idle", () => {
  const q = validateStudioConsensus(captured());
  assert.equal(q.agree, 3);
  assert.equal(q.independentAgree, 2);
  assert.equal(q.idle, 2);
});
test("idle errors other than documented quorum cancellation remain HOLD", () => {
  const t = captured();
  t.consensus_data.validators.find(
    (v: any) => v.vote === "idle",
  ).genvm_result.error_code = "TIMEOUT";
  assert.throws(() => validateStudioConsensus(t), /unexplained failure/);
});
test("forged duplicate validator identity is rejected", () => {
  const t = captured();
  t.consensus_data.validators[1].node_config.address =
    t.consensus_data.validators[0].node_config.address;
  assert.throws(() => validateStudioConsensus(t), /identity/);
});
test("too few independent successful votes are rejected", () => {
  const t = captured();
  const v = t.consensus_data.validators.find((v: any) => v.vote === "agree");
  v.vote = "idle";
  v.execution_result = "ERROR";
  v.genvm_result = { error_code: "CONSENSUS_VALIDATOR_QUORUM_REACHED" };
  t.consensus_data.votes[v.node_config.address] = "idle";
  assert.throws(() => validateStudioConsensus(t), /quorum/);
});
