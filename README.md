# Delivery Review — signed x402 sandbox

Internet Court Partner Demo Lab · Neo7391z · GenLayer profile Max Mara.

A working local agent controller: HTTP 402 → official x402 client authorization → signed provider delivery → GenLayer semantic review → allow or block the next request. **Custom non-monetary sandbox scheme; no ERC-20 payment or production merchant integration.** GenLayer executes on the public hosted Studionet simulator, not mainnet.

## Fresh reproduction (release v5)

Use Node.js 22+ (validated on Node 24). No old author key, controller file or deployed address is needed:

```sh
npm ci
npm run demo:fresh
# Plan only above; the explicit command below deploys public synthetic test data:
npm run demo:fresh -- --authorized-studionet-only --scenario=bad
```

The fresh run checks both network identifiers and zero gas price, creates an isolated disposable signer, deploys the pinned contract, verifies successful finalized deployment/source/owner, performs a real signed HTTP delivery, submits that exact evidence, verifies the finalized GenLayer decision and attempts the next request through the same controller. `--scenario=good` exercises continuation instead. No money, wallet import or production signature is requested. Runs are retained under `.local/fresh-runs/<run-id>/`; only their sanitized public evidence may be shared. See [FRESH_RUN.md](FRESH_RUN.md) for outcomes, timing and failure recovery.

The existing UI remains a no-signing option: a fresh HTTP delivery ends in HOLD, while the recorded-case button performs fresh read-only RPC verification. Neither is silently substituted for the full fresh CLI run. See [MISSION_FIT.md](MISSION_FIT.md) for requirement-by-requirement scope and eligibility.

## Evidence versioning (v4 baseline)

The v4 baseline corrected metadata and formatted TypeScript; the v3 browser-workflow video and deployed contract are unchanged. Browser QA screenshots were refreshed. Current video: **40 seconds, 1280×1000, actual browser captures**. All three current video reports bind to the same SHA-256. See [evidence/README.md](evidence/README.md) and [EVIDENCE_INDEX.json](evidence/EVIDENCE_INDEX.json) before interpreting older receipts/logs; historical reports are explicitly superseded.

## Fresh v5 result (2026-11-15)

A complete fresh run finished with **FINALIZED REWORK → PAUSE**, and the attempted next request left the real provider counter **2 → 2**. New contract: `0x12daD2fB0C1e4469E0Bd99AfA6721c403cc52c95`; review: `0xdb604b2cba0d9f5b5d13b59bdf4c6ebc5a7a3724391679d3a04285d807351890`. See `evidence/v5/fresh-success/` for the exact signed packet, deployment and full result. Two earlier attempts exposed a read timeout and a leader self-validation cancellation compatibility issue; their original HOLD results are retained in `evidence/v5/fresh-attempt-*/`. They are not counted as original successful end-to-end runs.

## Verified results

Contract `0x7e4b6EdbEC697a28Fce4F1D6a7e30Ed47B8164E6`, chain 61999. Source SHA-256 `c7acf29cd223bf3235bebf8e5434b87e6e44940d8d4a3c3c20f073a8970f747d`.

| Signed case | Transaction | Verified effect |
|---|---|---|
| Deficient delivery | `0xde31d898fe9d24374073b69ad3f8a70287d4428d6a0aa2a8ad700c81c75ca5e5` | FINALIZED REWORK → PAUSE; next fetch blocked |
| Correct delivery | `0x6d8abf7999553ea192da9fe2d08faeeb066b57ff55c7522c8c0ac8e5587075dd` | FINALIZED ACCEPT → ALLOW; next delivery completed, then HOLD for its review |
| Validator dissent | `0x8338eecf0300dacf2590679d675fe1a3860ac626ade503e82874c6d0d71f7c37` | Studio finalized by majority; stricter client rejected dissent and retained HOLD |

Public receipts, signed evidence and local effect logs are in `evidence/signed-*-*.json`. Initial unsigned synthetic review is retained as historical evidence, not substituted for signed cases. No user wallet or real funds used; observed gas price and value zero.

## Run

```sh
npm ci
npm run build
npm test
npm start
```

Open http://127.0.0.1:4173. **Run real HTTP sandbox** performs actual 402/authorization/200 with signed evidence. **Attempt next request** is blocked until that exact evidence gets a verified review. Server counters prove no fetch occurred. Alternatively, in a fresh server session, **Verify signed Studio case** validates the public signed receipt and freshly queries the finalized deficient case; no private key needed. Then attempt a request to observe PAUSE. These are separate demo mandates; the UI will not replace an active mandate.

Read-only public reproduction:

```sh
npm run verify:live -- 0x7e4b6EdbEC697a28Fce4F1D6a7e30Ed47B8164E6 0x0898cA82CDA5C0008383706230A7b6fF0b0c2618 0xde31d898fe9d24374073b69ad3f8a70287d4428d6a0aa2a8ad700c81c75ca5e5 evidence/signed-rework-packet.json
```

`COURT_WORKFLOW.md` specifies mandate, rubric, signed schema, decision mapping, executable local effect path, failures and manual appeal. `src/sandbox.ts` implements the protocol and controller. `src/verify.ts` and `studio-consensus.ts` verify exact network, source, owner/operator, finalized calldata and decision. `src/studio-submit.ts` is an explicit opt-in CLI with zero-price/network guards and persistent duplicate protection; the web server has no transaction-signing endpoint. Private disposable keys and controller files under `.local/` are excluded from distribution.

## Validation

66 Node tests passed, including actual HTTP transport, signatures, tampering, replay, concurrent request blocking, restart state, storage failure, wrong relayer/operator, RPC outage and decision binding. Strict TypeScript build and pinned Prettier formatting check passed. Run `npm run format:check` to reproduce the formatting check. Five direct GenVM tests and official lint passed for the unchanged deployed source; VM LLM outputs are mocked, while the signed hosted cases above and the fresh-run evidence are real semantic executions.

Browser QA passed in isolated official Chrome headless shell 157: both fresh sandbox and public recorded-case/fresh-RPC flows; logos loaded; no JavaScript errors; no horizontal overflow at 390px. See `evidence/ui-qa-sandbox.json` and `ui-qa-recorded.json`, plus desktop/mobile PNGs. `video/browser-qa.mjs` and `record-workflow.mjs` reproduce checks/captures (set CHROME_PATH for your headless browser).

Python checks:

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
.venv/bin/genvm-lint check contracts/delivery_review.py --json
.venv/bin/pytest tests/test_contract.py -q
```

Known tooling issue: genlayer-test 0.29.2 requests the renamed v0.3.0-rc7 `genvm-universal.tar.xz` asset and gets 404. The official linter supports its replacement. After lint downloads it, use the identical cached release:

```sh
mkdir -p ~/.cache/gltest-direct
cp ~/.cache/genvm-linter/genvm-universal-v0.3.0-rc7.tar.xz ~/.cache/gltest-direct/genvm-universal-v0.3.0-rc7.tar.xz
```

## Scope

Supplier signatures prove possession of the demo key, not independent vendor identity. The client verifies signatures; the contract reviews the complete evidence semantically but does not cryptographically verify Ed25519. The local host/controller and Studio RPC are trusted. API sessions are in memory; the CLI persists controller state atomically. This is not wallet-wide revocation, a refund engine, a jury case, or an ERC-7710 bridge. `warn` and permanent `revoke` are outside this prototype. Prompt-injection robustness is not comprehensively proven. Hosted Studio may reset; fresh verification then fails closed.

Public repository and video availability were verified on 2026-11-15 at commit `1631ce77e4ce329156c97224707ad7b2fb5c1bdd`. This v5 source tree adds fresh reproduction and authorization-binding safeguards. The mission requires the `builder-wg` Discord role; personal eligibility must be confirmed in the portal. Mission submission is not performed by this update. Reward and acceptance are not guaranteed.

## Download

Source, tests and evidence are browsable in this repository. Clone it and follow the Run instructions above. The original complete review snapshot is also available in [published baseline snapshot](https://github.com/Neo7391z/x402-delivery-review/blob/1631ce77e4ce329156c97224707ad7b2fb5c1bdd/delivery-review-source.zip). Watch the [40-second demo](video/delivery-review-demo.mp4). Private signing material, account handoff notes, dependencies and build caches are excluded.
