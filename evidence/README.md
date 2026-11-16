# Evidence versions

`EVIDENCE_INDEX.json` classifies every evidence file. **current** means the signed sandbox release; **shared-foundation** means an earlier artifact still used by the unchanged contract/assets; **superseded-historical** is retained only for audit history and must not be presented as current status.

Current video: `video/delivery-review-demo.mp4`, 40 seconds, 1280×1050, actual fresh browser deployment/review lifecycle plus AI-assisted title/end cards. `video-qa.json`, `video-probe.json` and `video-workflow-qa.json` bind to its identical SHA-256. Previous 1280×720 card-only video metadata is under `history/pre-signed-sandbox/`; its video binary is not the current deliverable.

Current UI passed reports are under `v6/`: browser-live-qa, browser-recovery-qa and browser-offline-qa (the latter is explicitly mocked). Current Node report: `node-tests-v6.txt` (80 passed). New browser-triggered proof is under `v6/run/`; earlier CLI and read-only UI proofs remain historical. Earlier failed browser attempts and smaller test suites are historical. `live-release.json` is the older deployed-source manifest: its source hash remains valid, its 39-test summary is historical. Signed `*-packet.json` evidence strings and receipt signatures have not been modified.

Packaging generates SHA256SUMS for every included file and checks private material. Release v6 adds a real browser-driven fresh contract lifecycle, guarded same-origin local API, durable/idempotent jobs, explicit consent, error/recovery states and a newly edited real UI video. The unchanged contract source remains pinned. Public base is e7fc02ca6bfde8634dbde57da4bc9f626227f747. This source tree includes the v6 update. No public interactive hosting or portal submission is claimed.
