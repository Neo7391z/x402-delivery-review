# Live signed delivery results

See README and evidence/signed-{sandbox,rework,accept}-verified.json for the current results. All three signed deliveries use actual localhost HTTP and official x402 core. Two finalized reviews verified successfully (REWORK/PAUSE and ACCEPT/ALLOW). The first signed case had a dissenting validator; it deliberately remains HOLD despite Studio majority finality.

The original unsigned case remains historical evidence only. Deployed source is unchanged. Public review source and calldata can be rechecked without signing. The recorded UI is an observer controller using a public key, so it cannot create a new client signature. Private operator/client keys are excluded from artifacts.

Browser QA is now passed; old environment-blocker notes and the old video/render.mjs script are superseded by video/browser-qa.mjs. See COURT_WORKFLOW.md for the precise scope and manual appeal path.

Latest v5: see FRESH_RUN.md and MISSION_FIT.md. Fresh reviewers can create their own disposable signer/deployment and complete the same-delivery review/effect flow; the public baseline remains available.
