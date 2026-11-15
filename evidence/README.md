# Evidence versions

`EVIDENCE_INDEX.json` classifies every evidence file. **current** means the signed sandbox release; **shared-foundation** means an earlier artifact still used by the unchanged contract/assets; **superseded-historical** is retained only for audit history and must not be presented as current status.

Current video: `video/delivery-review-demo.mp4`, 40 seconds, 1280×1000, actual browser captures plus AI-assisted title/end cards. `video-qa.json`, `video-probe.json` and `video-workflow-qa.json` bind to its identical SHA-256. Previous 1280×720 card-only video metadata is under `history/pre-signed-sandbox/`; its video binary is not the current deliverable.

Current UI passed reports: `ui-qa-sandbox.json` and `ui-qa-recorded.json`. Current Node report: `node-tests-v5.txt` (66 passed). Fresh full-loop outputs are under `v5/`; the earlier timed-out attempt and its later read-only result are retained without rewriting their outcomes. Earlier failed browser attempts and smaller test suites are historical. `live-release.json` is the older deployed-source manifest: its source hash remains valid, its 39-test summary is historical. Signed `*-packet.json` evidence strings and receipt signatures have not been modified.

Packaging generates SHA256SUMS for every included file and checks private material. Release v5 adds a reviewer-owned full fresh-run command, strict shared network/fee guards and current-authorization receipt binding. It preserves the deployed contract source and published video; refreshed UI screenshots include new reproduction instructions. The published baseline commit is documented in integration-provenance-v5.json.
