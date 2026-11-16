# Delivery Review — browser-driven GenLayer supervision

Neo7391z / Max Mara · ordinary GenLayer Projects (type 41).

A browser-driven app for a concrete trust problem: an API can deliver an answer that contradicts its promise. The local client binds the offer, authorization and supplier-signed response, submits the exact evidence to a real GenLayer Intelligent Contract, then allows or blocks the next request according to the finalized judgment.

**Custom non-monetary x402 sandbox. Zero-fee hosted Studionet. Trusted local backend/controller and RPC. No real payment, Court jury, refund or wallet-wide revocation.**

## Use the actual UI

```sh
npm ci
npm run build
npm start
```

Use Node 22+ (validated on Node 24). Open **http://127.0.0.1:4173**.

1. Choose the deficient or complete answer scenario.
2. Read and explicitly check the consent box. Nothing creates a demo signer or submits synthetic on-chain data before this opt-in.
3. Click **Deploy & review fresh delivery**. The browser starts a new backend job: free-network check → new disposable signer → deployment → finalized source/owner check → actual HTTP 402/authorization/signed delivery → `review(evidence)` transaction → final read-back → next-request attempt.
4. Follow the live stage list and new contract/deployment/review hashes. Reloading observes the same durable job rather than submitting again.
5. Expected deficient case: **FINALIZED REWORK → PAUSE**, provider request counter **2 → 2**, next fetch blocked. Complete answers may be ACCEPT/ALLOW: a second delivery occurs, then HOLD pending its review. Models/service availability are not guaranteed; disagreement or invalid proof remains HOLD.

The browser now genuinely creates a fresh deployment and calls its contract through a same-origin local API. It does not merely launch a CLI or load an unrelated historical receipt. Browser and CLI share the typed `src/fresh-flow.ts` orchestration service. Signing stays in the local backend; private material is never returned to the browser.

## Verified browser run

On 2026-11-16 the actual browser opt-in created job `da3e83f0-8aba-4e8f-858e-3ee4c50f13a9`:

- Contract: `0xaE71448aa013374735eF738Ec650B6b3229d405A`
- Deploy: `0x8750a170de6068a9b1933369451eef4200114341b291169386ac098d9b212a84`
- Review: `0x3d60bae258389bb8015cb3fd37ab796fee2e51a39797956e7bdbb72613302728`
- Result: verified FINALIZED REWORK → PAUSE; request count 2 → 2.

`evidence/v6/browser-live-qa.json` and `evidence/v6/run/` contain the actual UI observations and signed packet. The same-job duplicate POST and page reload were tested during the live run. A later server restart/read-only recheck is recorded separately; it never replays the controller action. The current [40-second video](video/delivery-review-demo.mp4) shows this actual browser lifecycle, with waiting periods explicitly edited. Earlier video and CLI proofs are labeled historical.

## Failure and recovery

See [UI_LIFECYCLE.md](UI_LIFECYCLE.md). Duplicate clicks reuse one UUID; different simultaneous launches are rejected. API requests require a localhost Host, same-origin checks, a session CSRF token, bounded JSON and explicit consent. No caller can choose an arbitrary RPC, signer, contract or transaction for a new job. A server interruption yields INTERRUPTED; the recheck action reads the exact saved transaction and reports whether it verified, without creating a key, sending a transaction or claiming the old controller effect was replayed. A new run always requires new explicit consent.

## Verification and source

```sh
npm test
npm run format:check
```

80 Node tests cover protocol signatures, current-request binding, network/finality/consensus checks, wrong evidence/source/operator, duplicate/concurrent jobs, storage failure, interruption and API consent/origin/CSRF guards. Strict build and formatting pass. Five direct GenVM tests and official lint validate the unchanged contract; LLM outputs in direct tests are mocked. The browser run above uses real hosted execution.

The CLI remains available as `npm run demo:fresh` (plan only) or explicit `--authorized-studionet-only`; it is an alternative, not the browser's implementation. See FRESH_RUN.md. Optional contract checks:

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
.venv/bin/genvm-lint check contracts/delivery_review.py --json
mkdir -p ~/.cache/gltest-direct
cp ~/.cache/genvm-linter/genvm-universal-v0.3.0-rc7.tar.xz ~/.cache/gltest-direct/genvm-universal-v0.3.0-rc7.tar.xz
.venv/bin/pytest tests/test_contract.py -q
```

The cache copy works around genlayer-test 0.29.2 requesting the renamed old release asset; it reuses the same official runner downloaded by the linter.

## Hosting and submission scope

**The v6 interactive app is localhost-only; it is not publicly hosted.** The server binds 127.0.0.1 and rejects public Host/Origin values. Do not expose it through an unauthenticated proxy: it controls disposable signing keys and a shared local job store. A public interactive deployment needs a separate authenticated, quota-limited, per-user-isolated backend (or a separately designed browser-wallet architecture). This package does not claim that a static video/read-only showcase satisfies the Projects website field.

Public baseline `e7fc02ca6bfde8634dbde57da4bc9f626227f747` was verified; v5 implementation was published in `96c43c7b52d9132f3da8d757a23fa2e43e936062`. This source tree contains the v6 browser lifecycle, tests, video and public evidence. See PROJECTS_FIT.md. No portal form has been submitted. Ordinary Projects is the target; mission-101 builder-wg eligibility is not imposed on it.

## Public project website

[Delivery Review showcase](https://delivery-review-neo7391z.compassionateibex.chatgpt.site) hosts the recorded v6 browser demo, verification evidence and reproduction instructions. It is a read-only project website, not a hosted transaction-signing service. Run the interactive application locally using the instructions above.
