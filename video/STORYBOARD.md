# Actual workflow screen recording — 40 seconds

0–4 s: AI-generated background with official Internet Court / GenLayer / x402 logos; scope.
4–20 s: Actual fresh localhost browser interaction: 402 → official client authorization → provider-signed delivery → HOLD; retry is blocked and request count remains two.
20–36 s: Actual browser interaction loading a historical signed delivery and performing a **fresh RPC verification** of its FINALIZED GenLayer review; REWORK → PAUSE; next request blocked before fetch, provider receives zero new requests.
36–40 s: Results summary, including separately evidenced real ACCEPT continuation and dissent/HOLD case.

Captures are edited for timing (raw lengths approximately 22 and 29 seconds). The remote submission/wait period is not filmed or represented as instantaneous. The fresh HTTP delivery and recorded reviewed delivery are explicitly different cases. No fabricated UI, mock verdict, payment or jury claim. Silent captions; 1280×1000, 24 fps, H.264. AI-generated background, compositing, timing and captions provide the AI-assisted edit.

Reproduce: `UI_MODE=sandbox node --import tsx video/record-workflow.mjs`, then `UI_MODE=recorded ...`; set CHROME_PATH to an installed headless shell. Each runs a separate server session. `.venv/bin/python video/edit_workflow.py` composes final MP4. See `evidence/video-workflow-qa.json` and `workflow-contact-sheet.png`. The older card-only renderer is retained as history and does not generate the current cut.
