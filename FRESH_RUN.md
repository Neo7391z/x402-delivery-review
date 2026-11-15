# A new delivery through a new GenLayer review

## One reviewer-owned flow

1. `npm ci` with Node 22+ (validated on Node 24).
2. `npm run demo:fresh` prints the exact plan without generating a key or submitting anything.
3. `npm run demo:fresh -- --authorized-studionet-only --scenario=bad` opts into publishing the unchanged contract source and synthetic signed evidence to hosted Studionet. Use `--scenario=good` for the positive case.

The command creates a fresh directory and **new disposable signer**. It never loads the original author wallet, old controller or published contract. It checks chain 61999 using both eth_chainId/net_version and requires gasPrice=0 before both submission phases. The signed transaction has value=0 and gasPrice=0. No faucet funding, production keys or real funds are needed. Deployment is checked for successful consensus, exact source and owner before a request is made.

The same in-memory client then performs GET → 402 → signed authorization → signed 200 delivery. The full signed packet is submitted to the new contract. After strict finality/source/operator/calldata/state verification, the controller receives the decision and a real subsequent request is attempted. REWORK means PAUSE with no additional provider requests; ACCEPT allows one more delivery and immediately returns to HOLD pending that new delivery's review. Dissent, ambiguity or unverifiable evidence remain HOLD.

## Outputs and timeouts

Allow seconds to several minutes; deployment and review each have a three-minute finality deadline, followed by a bounded 45-second read-only verification. The command prints its isolated `.local/fresh-runs/<run-id>/` path and transaction hashes. Public proof is `evidence/fresh-run-result.json` and the exact receipt/evidence is `evidence/demo-output.json` inside that run. A successful run contains `verification.verified: true`; exit code 2 means an unverified review/HOLD, not a successful semantic result. An exception produces `fresh-run-error.json`. Keep original hashes; do not treat CLI completion or FINALIZED alone as proof of successful execution.

Each submission persists intent before broadcast and refuses duplicate local submission state. A transport timeout can have an uncertain on-chain outcome: inspect the saved hash/intent rather than broadcasting again. This version does not resume a stopped controller. Late-finalizing transactions can be checked read-only using `verify:live`, with the printed contract, operator, review hash and the run's `demo-output.json`. A deliberate fresh run is a distinct case, not a retry of the old transaction. Do not poll multiple live runs aggressively; Studio is rate-limited.

The run directory is private: it includes `.local/studionet-demo-signer.json` and signed transaction material. Never upload the directory wholesale. The package builder excludes every `.local` subtree and scans recursively for generated private material. The reproducible command needs no privileged shell, account connector, user wallet or external paid API.

## Scope

This is a custom non-monetary x402 scheme implemented through the official SDK's extension API. It does not implement the standard ERC-20 `exact` payment scheme or produce a settlement transaction. Ed25519 supplier/client signatures are verified by the client. GenLayer judges semantic fulfillment. The local controller and Studio RPC remain trusted; no Court jury case, refund, ERC-7710 delegation or wallet-wide revocation is claimed.

## Observed compatibility corrections

A real run on 15 November exposed RPC reads exceeding 15 seconds; fresh-run verification now has a 45-second bound. Another finalized receipt had successful leader execution but quorum-canceled leader self-validation, with three independent agreeing validators. The verifier now recognizes only that exact cancellation proof, counts the actual independent votes and still rejects dissent/unknown failures. Original failed observations are retained alongside later read-only checks; no failure was rewritten as an original success. A valid old supplier receipt is also rejected if its authorization differs from the current request.

The corrected command completed successfully on 2026-11-15: contract `0x12daD2fB0C1e4469E0Bd99AfA6721c403cc52c95`, review `0xdb604b2cba0d9f5b5d13b59bdf4c6ebc5a7a3724391679d3a04285d807351890`, REWORK/PAUSE and provider count 2 → 2. This is a recorded observation, not a guarantee of future model/network availability.
