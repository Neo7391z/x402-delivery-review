# Ordinary Projects (type 41), checked 2026-11-16

Current target: https://portal.genlayer.foundation/contribution-type/41 . Official API snapshot: `evidence/v6/projects-type-41.json`, fetched from https://portal-admin.genlayer.foundation/api/v1/contribution-types/41/ . This is not a second mission-101 submission.

The official definition requires a clear use case, real Intelligent Contracts and frontend/backend app logic that interacts with GenLayer. The live form's checklist additionally asks for genuine frontend interaction and transaction lifecycle handling, meaningful trust problem, authoritative data where relevant, and complete source/documentation. Form fields include logo, name, primary tag, summary, description, usage steps, expected verification result, website, GitHub evidence and CAPTCHA.

| Criterion | v6 evidence / limit |
|---|---|
| Real frontend contract interaction | Actual browser consent starts a new account/deployment and `review(evidence)` call; stages, hashes and final result are shown. Successful recorded UI run is under `evidence/v6/`. |
| Transaction lifecycle | Explicit consent, network/fee guard, pending/final states, source/owner/evidence read-back, durable UUID jobs, duplicate rejection, reload recovery, fail-closed interruptions and read-only recheck. |
| Meaningful trust problem | Signed delivery may still violate agreed terms. GenLayer judges qualitative fulfillment and its result controls the next real HTTP request. |
| Authoritative data | Exact signed synthetic supplier response is the review artifact; chain evidence comes from the specified Studio RPC. No external factual oracle or independent merchant identity is claimed. |
| Source and docs | v6 source, tests, UI, video and public proofs are included in this repository. Complete reproduction and trust boundaries documented. |
| Website field | Public project website: https://delivery-review-neo7391z.compassionateibex.chatgpt.site . It provides the v6 demo, evidence and local reproduction guide. The interactive app remains local-only; the website is not a hosted signing app. The form asks for a website link; live demos are extra credit, not an explicit mandatory-hosting condition. |
| Account/form | Type 41 public API has no required Discord roles; do not import mission-101's builder-wg condition. CAPTCHA and actual submission remain for the coordinating/user flow. |

Mainnet, real funds and Court jury are not asserted requirements. The implementation remains a custom non-monetary x402 extension with trusted local backend/RPC. Reviewers can evaluate whether that scope is sufficiently useful; acceptance is not guaranteed.

A future public interactive deployment must not expose this local signing server unchanged. It needs authenticated per-user execution, isolation, quotas and secret handling, or a separately validated browser-side signer architecture. This task does not create an unauthenticated public signing endpoint or claim production readiness.
