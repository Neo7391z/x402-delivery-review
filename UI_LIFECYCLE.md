# Browser lifecycle and local trust boundary

`public/ui.js` calls the local API directly. `src/ui-jobs.ts` owns a durable job per UUID. `src/fresh-flow.ts` owns the actual deployment/delivery/review/controller lifecycle; the CLI is a separate adapter to that service. `studio-submit.ts` remains the narrow guarded transaction-signing helper.

| Stage | Observable fact / effect |
|---|---|
| Awaiting opt-in | No demo signing key or transaction. Server only creates a random CSRF token. |
| CHECKING_NETWORK | Both chain identifiers must be Studionet 61999 and gas price exactly zero. |
| DEPLOY_SUBMITTING / PENDING | A new isolated demo account signs value=0/gasPrice=0; intent is persisted before broadcast. Hash shown when returned. |
| CONTRACT_READY | Deployment finalized successfully; exact source hash and owner read-back match. |
| DELIVERING / EVIDENCE_READY | Actual local 402, official x402 client authorization, 200 supplier-signed delivery. Receipt must match the current authorization and mandate. |
| REVIEW_SUBMITTING / PENDING | `review(evidence)` is sent to this job's new contract; exact evidence ID and review hash displayed. |
| VERIFYING | Chain, successful consensus, source, operator, calldata, evidence and latest-final state are checked. No lifecycle status alone proves success. |
| CHECKING_EFFECT / COMPLETED | Same controller attempts a next request; its actual provider counter and block/continuation are shown. |
| HOLD / FAILED | No verified completed effect is invented. Error and known hashes remain available. |
| INTERRUPTED / VERIFIED_READ_ONLY | After server restart unfinished jobs are not executed again. Recheck reads only exact stored proof. It never recreates a signer, resubmits or replays the controller action. |

The browser saves the request UUID before sending POST. Same UUID+scenario returns the same job even after completion/interruption; changing scenario with that ID is rejected. A distinct concurrent job is rejected. Terminal runs can be followed by a separate run only via another explicit opt-in. Closing/reloading the tab does not cancel an already-authorized backend job. Restarting the backend does not cancel already-broadcast chain transactions either; it stops automatic continuation. There is no rollback/cancel claim.

Jobs are atomically persisted under `.local/ui-jobs/`; each execution is under `.local/fresh-runs/ui-<uuid>/`. Progress persistence is awaited before subsequent work. Storage failures fail safely and do not cause unhandled background rejections. Each transaction helper persists its intent before broadcast and refuses a duplicate local submission. An uncertain broadcast is never retried automatically. Recovery requires enough bound proof to exist; missing/tampered proof yields an explicit read-only recovery error, not success.

The backend listens only on 127.0.0.1:4173. The signing API permits only localhost Hosts, rejects mismatched Origins, requires a per-process CSRF token and JSON for POST, caps request size and accepts only ID/scenario/consent. Keys and signed raw transaction material remain under private `.local` subtrees. The UI receives only public hashes, stages, signed public evidence and results. The local OS/controller and Studio RPC are trusted. This is not malicious-host resistance, a shared public service, an ERC-7710 caveat or wallet-global enforcement.

Automated live browser QA requires an additional explicit CLI flag because it clicks the consent box and creates public synthetic test data:

```sh
CHROME_PATH=/path/to/chrome-headless-shell node --import tsx video/ui-live-qa.mjs --authorized-studionet-only
```

This live QA creates a distinct real run; `npm test` uses isolated mocked orchestration for job/API tests and does not submit transactions. `video/ui-recovery-qa.mjs` only rechecks an existing local UI job. Browser tests require an installed Playwright-compatible browser and ffmpeg. Do not run multiple live tests concurrently.
