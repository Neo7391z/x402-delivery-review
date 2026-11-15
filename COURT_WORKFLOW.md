# Internet Court local controller adapter

Purpose: prevent an agent repeatedly consuming a supplier whose answer materially fails the agreed task. This is a custom **non-monetary x402 sandbox**, using the official x402 core client and HTTP headers. It is not ERC-20 settlement, a facilitator, or a paid production API.

Reference: https://github.com/internet-court/internet-court-skill/blob/main/integrations/genlayer-intelligent-contracts/SKILL.md

## Executable workflow

1. `ControlledClient.purchase()` synchronously switches ALLOW to HOLD before network activity. Provider receives GET and responds HTTP 402 with a signed, expiring, client-bound challenge. The official `x402HTTPClient` selects `demo-authorization` on `sandbox:court`, capped to one NO-MONEY unit.
2. Client verifies its pinned supplier public key and mandate, then signs a challenge-bound Ed25519 authorization. Second GET uses PAYMENT-SIGNATURE. Provider verifies client identity, terms binding, amount, nonce and expiry; replay is rejected.
3. HTTP 200 contains a supplier-signed receipt binding challenge, authorization, exact answer hash, action ID and timestamp. Client verifies signatures before constructing evidence.
4. The canonical GenLayer envelope contains mandate, rubric, signed action receipt, output and explicit zero financial costs. The deployed Intelligent Contract classifies semantic delivery quality. **Signature verification is performed by the local client, not by the Intelligent Contract.** GenLayer hashes the complete envelope and reviews its quoted contents. Supplier identity is a demo key, not an independently vetted merchant.
5. The owner-authorized Studionet operator submits `review(evidence)` only via the explicit CLI. A read-only verifier checks RPC chain/net, finalized tx, operator, exact calldata, deployed source, owner and stored decision. It rejects dissent even if hosted Studio finalized by majority; this conservative policy is deliberate.
6. The local controller applies ACCEPT → continue/ALLOW; REWORK → constrain/PAUSE; ESCALATE or unverified result → HOLD/human review. A repeated purchase is rejected **before fetch**. Tests check unchanged server request count. No EVM wallet permission is revoked.

## Schema and rubric

`src/sandbox.ts` exports the executable `mandate`, `Signed<Receipt>`, `reviewEvidence()` and controller. The mandate specifies objective, permitted authority, prohibited actions, evidence quality and review cadence. Rubric: relevance, independent validators, challenge escalation, honest uncertainty, complete signed evidence, zero financial spend. `evidence/*-packet.json` contains complete reproducible public examples.

Output: original verified decision/reason, exact evidence ID, source hash, contract, tx hash, consensus details, check timestamp, local state and events. We do not invent numeric scores. `warn` and permanent `revoke` are deliberately outside this three-state prototype; they are not claimed as implemented or tested.

## Trust and failure paths

Trusted components: local controller, its private state and pinned keys; read-only Studio RPC; deployed owner/operator. Browser callers cannot supply verdicts or invoke signing. The client gate is scoped to this client, not a global firewall or a hostile host. A host owner can alter code/state. State is persisted atomically by the CLI in `.local`; API sessions are in memory and clearly demo-scoped. Explicit restart creates a new demo mandate; it is not an appeal or continuation of old authority.

Missing receipt, altered body, wrong signer, replay, challenge mismatch, RPC failure, wrong relayer/operator, stale evidence, unexpected source, disagreement and nonfinality all remain HOLD. Storage failure also leaves HOLD. No automatic resubmission or retry of signed transactions.

Appeal: retain the original receipt and decision; human reviews contradictory evidence; prepare a **new** corrected delivery/case and submit it explicitly. Existing finalized contract evidence cannot be overwritten. No automatic unpause endpoint exists. A formal Court jury/dispute or EVM controller is not implemented.

## Reproduction

```
npm ci
npm run build
npm test
npm start
```

Choose **Run real HTTP sandbox** then **Attempt next request**: real 402/authorization/200 and HOLD; server count remains 2. Fresh evidence requires its own on-chain review, never the old transaction.

Recorded signed case: the UI uses public receipt data and fresh RPC verification, without private keys. Its observer controller cannot authorize a new signature. Private local signer/state are required only to continue the original CLI controller. `node --import tsx src/sandbox-run.ts verify signed-sandbox` performs fresh RPC verification and attempts the next request. Public reviewers can inspect signed receipts with `validateReceipt`, and use read-only `verifyFinalDecision` on the packet without any signer. Creating a new own sandbox needs no real funds. Deployment/submission scripts require explicit authorized flags and reject nonzero gas price/network mismatch.

Comparison baseline: AgentScore (https://github.com/Leokings/agentscore) integrates real Court case history and has a broader public deployment. This project addresses API-delivery enforcement instead. We do not claim its jury coverage, transaction count, production reach or external merchant adoption.

## Fresh full-loop entry point (v5)

`npm run demo:fresh -- --authorized-studionet-only --scenario=bad` creates its own demo signer and contract, then performs delivery, exact review and the next-request attempt in one process. See FRESH_RUN.md. The earlier original-controller restoration instructions are optional historical reproduction, not a dependency for new reviewers.

Studio compatibility: a successful leader may have its separate self-validation canceled after three independent validators agree. Only explicit CONSENSUS_VALIDATOR_QUORUM_REACHED proof is accepted; an idle vote is never counted as agreement. Captured receipt and negative regressions are included. Current-request authorization binding prevents replaying a valid older signed delivery.
