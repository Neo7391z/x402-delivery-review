/** Strict compatibility with the observed hosted Studio five-validator receipt shape. */
type Obj = Record<string, unknown>;
function obj(v: unknown): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Malformed consensus object");
  return v as Obj;
}
function addr(v: unknown): string {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v))
    throw Error("Missing validator identity");
  return v.toLowerCase();
}
export function validateStudioConsensus(tx: Obj) {
  if (
    tx.status !== "FINALIZED" ||
    tx.result_name !== "MAJORITY_AGREE" ||
    tx.result !== 6
  )
    throw Error("Final majority agreement is missing");
  if (tx.leader_only !== false || tx.execution_mode !== "NORMAL")
    throw Error("Leader-only or unsupported execution mode");
  if (tx.num_of_initial_validators !== 5)
    throw Error("Unsupported validator configuration");
  const c = obj(tx.consensus_data),
    votes = obj(c.votes);
  const normalized = new Map<string, unknown>();
  for (const [key, vote] of Object.entries(votes)) {
    const a = addr(key);
    if (normalized.has(a)) throw Error("Duplicate voting identity");
    normalized.set(a, vote);
  }
  if (normalized.size !== 5) throw Error("Unexpected voting set size");
  if (!Array.isArray(c.leader_receipt)) throw Error("Missing leader receipt");
  const receipts = c.leader_receipt.map(obj),
    leaders = receipts.filter((r) => r.mode === "leader");
  if (leaders.length !== 1 || receipts.length > 2)
    throw Error("Ambiguous leader receipts");
  const leader = leaders[0],
    leaderAddress = addr(obj(leader.node_config).address);
  const leaderVote = normalized.get(leaderAddress);
  if (
    leader.execution_result !== "SUCCESS" ||
    !["agree", "idle"].includes(String(leaderVote))
  )
    throw Error("Leader execution did not succeed");
  const selfReceipts = receipts.filter((r) => r !== leader);
  // Studio may cancel the leader's *self-validation*, after three independent
  // validators agree. This is not a failed leader execution or an agree vote.
  if (leaderVote === "idle" && selfReceipts.length !== 1)
    throw Error("Missing leader self-validation cancellation proof");
  for (const r of selfReceipts) {
    if (
      r.mode !== "validator" ||
      addr(obj(r.node_config).address) !== leaderAddress ||
      r.vote !== leaderVote
    )
      throw Error("Invalid leader self-validation receipt");
    if (r.vote === "agree" && r.execution_result === "SUCCESS") continue;
    if (
      r.vote === "idle" &&
      r.execution_result === "ERROR" &&
      obj(r.genvm_result).error_code === "CONSENSUS_VALIDATOR_QUORUM_REACHED"
    )
      continue;
    throw Error("Invalid leader self-validation receipt");
  }
  if (!Array.isArray(c.validators) || c.validators.length !== 4)
    throw Error("Missing independent validator receipts");
  const seen = new Set([leaderAddress]);
  let agree = leaderVote === "agree" ? 1 : 0,
    idle = leaderVote === "idle" ? 1 : 0;
  for (const raw of c.validators) {
    const v = obj(raw),
      a = addr(obj(v.node_config).address);
    if (
      seen.has(a) ||
      !normalized.has(a) ||
      v.mode !== "validator" ||
      normalized.get(a) !== v.vote
    )
      throw Error("Validator identity or vote mismatch");
    seen.add(a);
    if (v.vote === "agree" && v.execution_result === "SUCCESS") {
      agree++;
      continue;
    }
    if (
      v.vote === "idle" &&
      v.execution_result === "ERROR" &&
      obj(v.genvm_result).error_code === "CONSENSUS_VALIDATOR_QUORUM_REACHED"
    ) {
      idle++;
      continue;
    }
    throw Error("Validator disagreement or unexplained failure");
  }
  if (agree < 3 || seen.size !== 5)
    throw Error("Insufficient independent quorum");
  return {
    agree,
    idle,
    total: 5,
    independentAgree: agree - (leaderVote === "agree" ? 1 : 0),
    leaderAddress,
  };
}
