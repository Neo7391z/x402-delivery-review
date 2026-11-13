import { getAddress } from "viem";
import { test } from "node:test";
import assert from "node:assert/strict";
import { abi, createClient, decodeInputData } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  readOnlyPortFromClient,
  verifyFinalDecision,
  sha256,
  type ReadOnlyPort,
} from "../src/verify.js";
import { packet, sampleHeader, samples } from "../src/core.js";
const target = "0x" + "a".repeat(40),
  owner = "0x" + "b".repeat(40),
  hash = "0x" + "c".repeat(64),
  code = "reviewed source fixture";
const evidence = packet(sampleHeader, samples.bad).evidence;
const input = {
  contractAddress: target,
  operatorAddress: owner,
  transactionHash: hash,
  evidence,
  sourceSha256: sha256(code),
};
function fixture() {
  const validators = Array.from({ length: 4 }, (_, i) => ({
    mode: "validator",
    vote: "agree",
    execution_result: "SUCCESS",
    node_config: { address: "0x" + String(i + 2).repeat(40) },
    genvm_result: { error_code: null as string | null },
  }));
  const leader = "0x" + "1".repeat(40);
  return {
    hash,
    status: "FINALIZED",
    result: 6,
    result_name: "MAJORITY_AGREE",
    leader_only: false,
    execution_mode: "NORMAL",
    num_of_initial_validators: 5,
    to_address: target,
    from_address: owner,
    data: {
      calldata: Buffer.from(
        abi.calldata.encode({ method: "review", args: [evidence] }),
      ).toString("base64"),
    },
    consensus_data: {
      votes: Object.fromEntries([
        [leader, "agree"],
        ...validators.map((v) => [v.node_config.address, "agree"]),
      ]),
      leader_receipt: [
        {
          mode: "leader",
          execution_result: "SUCCESS",
          node_config: { address: leader },
        },
      ],
      validators,
    },
  };
}
function port(tx: unknown = fixture(), decision = "REWORK"): ReadOnlyPort {
  return {
    chainId: async () => "0xf22f",
    networkVersion: async () => "61999",
    transaction: async () => tx,
    source: async () => code,
    view: async (_, m) =>
      m === "get_owner"
        ? owner
        : JSON.stringify({ decision, reason: "Fixture quality judgment" }),
  };
}
for (const [decision, effect] of [
  ["ACCEPT", "ALLOW"],
  ["REWORK", "PAUSE"],
  ["ESCALATE", "HOLD"],
])
  test("validated fixture " + decision + " maps to " + effect, async () => {
    const r = await verifyFinalDecision(input, port(undefined, decision));
    assert.equal(r.verified, true);
    assert.equal(r.effect, effect);
  });
const cases: [
  string,
  (p: ReadOnlyPort, t: ReturnType<typeof fixture>) => void,
][] = [
  [
    "wrong chain",
    (p) => {
      p.chainId = async () => "0x107d";
    },
  ],
  [
    "numeric chain ID rejected",
    (p) => {
      p.chainId = async () => 61999;
    },
  ],
  [
    "inconsistent network ID",
    (p) => {
      p.networkVersion = async () => "1";
    },
  ],
  [
    "non-final transaction",
    (_, t) => {
      t.status = "ACCEPTED";
    },
  ],
  [
    "wrong transaction hash",
    (_, t) => {
      t.hash = "0x" + "d".repeat(64);
    },
  ],
  [
    "wrong target",
    (_, t) => {
      t.to_address = owner;
    },
  ],
  [
    "wrong sender",
    (_, t) => {
      t.from_address = target;
    },
  ],
  [
    "leader only",
    (_, t) => {
      t.leader_only = true;
    },
  ],
  [
    "malformed calldata",
    (_, t) => {
      t.data.calldata = "not base64!";
    },
  ],
  [
    "wrong method",
    (_, t) => {
      t.data.calldata = Buffer.from(
        abi.calldata.encode({ method: "get_owner", args: [evidence] }),
      ).toString("base64");
    },
  ],
  [
    "different evidence",
    (_, t) => {
      t.data.calldata = Buffer.from(
        abi.calldata.encode({ method: "review", args: [evidence + " "] }),
      ).toString("base64");
    },
  ],
  [
    "non-final consensus",
    (_, t) => {
      t.result_name = "UNDETERMINED";
    },
  ],
  [
    "failed execution",
    (_, t) => {
      t.consensus_data.leader_receipt[0].execution_result = "ERROR";
    },
  ],
  [
    "no validators",
    (_, t) => {
      t.consensus_data.validators = [];
    },
  ],
  [
    "validator disagreement",
    (_, t) => {
      t.consensus_data.validators[0].vote = "disagree";
    },
  ],
  [
    "source mismatch",
    (p) => {
      p.source = async () => "unreviewed code";
    },
  ],
  [
    "owner mismatch",
    (p) => {
      p.view = async () => target;
    },
  ],
  [
    "bad decision schema",
    (p) => {
      p.view = async (_, m) =>
        m === "get_owner" ? owner : '{"decision":"PAY","reason":"bad"}';
    },
  ],
  [
    "missing stored review",
    (p) => {
      p.view = async (_, m) =>
        m === "get_owner"
          ? owner
          : '{"decision":"ESCALATE","reason":"Not reviewed"}';
    },
  ],
  [
    "RPC failure",
    (p) => {
      p.transaction = async () => {
        throw Error("unavailable");
      };
    },
  ],
  [
    "network changes during reads",
    (p) => {
      let n = 0;
      p.chainId = async () => (++n === 1 ? "0xf22f" : "0x1");
    },
  ],
];
for (const [name, mutate] of cases)
  test(name + " fails closed", async () => {
    const t = fixture(),
      p = port(t);
    mutate(p, t);
    const r = await verifyFinalDecision(input, p);
    assert.equal(r.verified, false);
    assert.equal(r.effect, "HOLD");
  });
test("invalid caller input fails before network", async () => {
  const p = port();
  p.chainId = async () => {
    throw Error("Should not request");
  };
  const r = await verifyFinalDecision(
    { ...input, contractAddress: "invalid" },
    p,
  );
  assert.equal(r.verified, false);
  if (!r.verified) assert.equal(r.error, "Invalid address");
});
test("bounded wait fails closed", async () => {
  const p = port();
  p.transaction = () => new Promise(() => {});
  const r = await verifyFinalDecision(input, p, 10);
  assert.equal(r.verified, false);
  if (!r.verified) assert.match(r.error, /timed out/);
});

test("actual GenLayerJS transport decodes source and final-state reads using local RPC fixture", async () => {
  const calls: any[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    const q = JSON.parse(body);
    calls.push(q);
    let result: unknown;
    switch (q.method) {
      case "eth_chainId":
        result = "0xf22f";
        break;
      case "net_version":
        result = "61999";
        break;
      case "eth_getTransactionByHash":
        result = fixture();
        break;
      case "gen_getContractCode":
        result = Buffer.from(code).toString("base64");
        break;
      case "gen_call": {
        const methodIndex = calls.filter((x) => x.method === "gen_call").length;
        result = Buffer.from(
          abi.calldata.encode(
            methodIndex === 1
              ? owner
              : JSON.stringify({
                  decision: "REWORK",
                  reason: "Fixture quality judgment",
                }),
          ),
        ).toString("hex");
        break;
      }
      default:
        throw Error("Unexpected RPC method " + q.method);
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: q.id, result }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const location = server.address();
  assert(location && typeof location === "object");
  try {
    const sdk = createClient({
      chain: studionet,
      endpoint: `http://127.0.0.1:${location.port}`,
    });
    const r = await verifyFinalDecision(input, readOnlyPortFromClient(sdk));
    assert.equal(r.verified, true);
    assert.equal(r.effect, "PAUSE");
    const views = calls.filter((x) => x.method === "gen_call");
    assert.equal(views.length, 2);
    for (const v of views) {
      assert.equal(v.params[0].transaction_hash_variant, "latest-final");
      assert.equal(v.params[0].to, getAddress(target));
      assert.equal(v.params[0].type, "read");
    }
    const decodedViews = views.map((v) =>
      decodeInputData(v.params[0].data, target as `0x${string}`),
    );
    assert(
      decodedViews[0] &&
        decodedViews[1] &&
        "callData" in decodedViews[0] &&
        "callData" in decodedViews[1],
    );
    assert.equal(decodedViews[0].callData.get("method"), "get_owner");
    assert.equal(decodedViews[1].callData.get("method"), "get_decision");
    assert.deepEqual(decodedViews[1].callData.get("args"), [sha256(evidence)]);
    assert.deepEqual(
      new Set(calls.map((c) => c.method)),
      new Set([
        "eth_chainId",
        "net_version",
        "eth_getTransactionByHash",
        "gen_getContractCode",
        "gen_call",
      ]),
    );
  } finally {
    server.close();
  }
});

test("Studio RPC calls use checksum contract address; comparisons remain case insensitive", async () => {
  const p = port();
  p.source = async (a) => {
    assert.equal(a, getAddress(target));
    return code;
  };
  const view = p.view;
  p.view = async (a, m, args) => {
    assert.equal(a, getAddress(target));
    return view(a, m, args);
  };
  const r = await verifyFinalDecision(input, p);
  assert.equal(r.verified, true);
});
