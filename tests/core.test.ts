import { test } from "node:test";
import assert from "node:assert/strict";
import {
  packet,
  parseOffer,
  sampleHeader,
  samples,
  policy,
} from "../src/core.js";
test("official x402 SDK decodes v2 offer", () =>
  assert.equal(parseOffer(sampleHeader).x402Version, 2));
test("receipt hashes exact response and terms", () => {
  assert.equal(
    packet(sampleHeader, samples.bad).id,
    packet(sampleHeader, samples.bad).id,
  );
  assert.notEqual(
    packet(sampleHeader, samples.bad).id,
    packet(sampleHeader, samples.good).id,
  );
});
test("rejects malformed and oversized headers", () => {
  for (const h of ["", "oops", "x".repeat(17000)])
    assert.throws(() => parseOffer(h));
});
test("rejects missing and oversized evidence", () => {
  for (const b of ["", " ", "x".repeat(12001)])
    assert.throws(() => packet(sampleHeader, b));
});
test("verdict drives access policy", () => {
  assert.equal(policy("ACCEPT", true, true, "a", "a"), "ALLOW");
  assert.equal(policy("REWORK", true, true, "a", "a"), "PAUSE");
  assert.equal(policy("ESCALATE", true, true, "a", "a"), "HOLD");
});
test("unfinalized, failed or mismatched results fail closed", () => {
  assert.equal(policy("ACCEPT", false, true, "a", "a"), "HOLD");
  assert.equal(policy("ACCEPT", true, false, "a", "a"), "HOLD");
  assert.equal(policy("ACCEPT", true, true, "a", "b"), "HOLD");
});
