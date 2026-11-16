/* Only the same-origin local backend can sign. The browser never receives a private key. */
(() => {
  const $ = (id) => document.getElementById(id),
    key = "delivery-review-ui-job-v6";
  let csrf = "",
    job = null,
    pendingId = localStorage.getItem(key),
    timer,
    busy = false;
  const scenarioKey = "delivery-review-ui-scenario-v6";
  $("fresh-scenario").value = localStorage.getItem(scenarioKey) || "bad";
  const phases = {
    QUEUED: "Request recorded",
    CHECKING_NETWORK: "Checking chain and zero gas price",
    DEPLOY_SUBMITTING: "Creating demo signer and submitting deployment",
    DEPLOY_PENDING: "Waiting for deployment FINALIZED",
    CONTRACT_READY: "Contract source and owner verified",
    DELIVERING: "Performing signed HTTP delivery",
    EVIDENCE_READY: "Signed evidence bound to this run",
    REVIEW_SUBMITTING: "Submitting review(evidence)",
    REVIEW_PENDING: "Waiting for review FINALIZED",
    VERIFYING: "Verifying source, operator, calldata and final decision",
    CHECKING_EFFECT: "Attempting next request through controller",
  };
  async function call(path, body) {
    const res = await fetch(
      "/api/ui/" + path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Delivery-CSRF": csrf,
            },
            body: JSON.stringify(body),
          },
    );
    const value = await res.json();
    if (!res.ok) throw Error(value.error || "Request failed");
    return value;
  }
  function controls() {
    const active = job?.status === "RUNNING";
    $("fresh-start").disabled =
      busy || active || !!job || !csrf || !$("fresh-consent").checked;
    $("fresh-scenario").disabled = busy || !!job || !!pendingId;
    $("fresh-recheck").hidden = !job || active;
    $("fresh-recheck").disabled = busy;
    $("fresh-new").hidden = !job || active;
    $("fresh-new").disabled = busy;
  }
  function render(value) {
    job = value;
    pendingId = value.id;
    localStorage.setItem(key, value.id);
    localStorage.setItem(scenarioKey, value.scenario);
    $("fresh-scenario").value = value.scenario;
    const v = value.result?.verification;
    $("fresh-status").textContent =
      value.status === "RUNNING"
        ? phases[value.phase] || value.phase
        : value.status === "COMPLETED"
          ? `FINALIZED ${v.decision} → ${v.effect}. Controller ${value.result.controllerState}.`
          : value.status === "VERIFIED_READ_ONLY"
            ? `Read-only recovery: ${value.recheck.decision}. Controller action was NOT replayed.`
            : `${value.status} — ${value.error || v?.error || "Access remains HOLD"}`;
    if (value.recoveryError)
      $("fresh-status").textContent =
        value.recoveryError + ". No transaction or effect was replayed.";
    else if (value.recheck)
      $("fresh-status").textContent = value.recheck.verified
        ? "Read-only recheck verified " +
          value.recheck.decision +
          ". Original controller action was not replayed."
        : "Read-only recheck HOLD — " +
          value.recheck.error +
          ". Any earlier completed effect is historical.";
    $("fresh-events").replaceChildren(
      ...value.events.map((e) => {
        const li = document.createElement("li");
        li.textContent = phases[e.phase] || e.phase;
        return li;
      }),
    );
    const proof = $("fresh-proof");
    proof.replaceChildren();
    for (const [label, data] of Object.entries({
      Run: value.id,
      Contract: value.details.contractAddress,
      "Deploy transaction": value.details.deploymentHash,
      "Review transaction": value.details.reviewTransactionHash,
      "Evidence SHA-256": value.details.evidenceId,
    })) {
      if (!data) continue;
      const p = document.createElement("p");
      p.textContent = label + ": " + data;
      proof.append(p);
    }
    if (value.result) {
      const r = value.result,
        p = document.createElement("p");
      p.textContent = `Provider requests: ${r.requestCountBeforeAttempt} → ${r.requestCountAfterAttempt}. ${r.nextRequestBlockedBeforeFetch ? "Next request blocked before fetch." : r.nextDeliveryCompleted ? "Next delivery completed; new delivery now awaits review." : "No completed effect claimed."}`;
      proof.append(p);
    }
    $("fresh-result").hidden = !value.result && !value.recheck;
    if (!$("fresh-result").hidden)
      $("fresh-result").textContent = JSON.stringify(
        value.result || value.recheck,
        null,
        2,
      );
    controls();
    clearTimeout(timer);
    if (value.status === "RUNNING") timer = setTimeout(poll, 2500);
  }
  async function poll() {
    try {
      render(await call("jobs/" + pendingId));
    } catch (e) {
      $("fresh-status").textContent =
        "Status unavailable — " + e.message + ". No new submission sent.";
      timer = setTimeout(poll, 5000);
    }
  }
  $("fresh-consent").onchange = controls;
  $("fresh-start").onclick = async () => {
    if (busy || job || !$("fresh-consent").checked) return;
    busy = true;
    pendingId = pendingId || crypto.randomUUID();
    localStorage.setItem(key, pendingId);
    localStorage.setItem(scenarioKey, $("fresh-scenario").value);
    controls();
    try {
      render(
        await call("jobs", {
          id: pendingId,
          scenario: $("fresh-scenario").value,
          consent: true,
        }),
      );
    } catch (e) {
      $("fresh-status").textContent =
        "Start uncertain: " + e.message + ". Retry uses the SAME request ID.";
    } finally {
      busy = false;
      controls();
    }
  };
  $("fresh-recheck").onclick = async () => {
    if (busy || !job) return;
    busy = true;
    controls();
    $("fresh-status").textContent =
      "Read-only recheck; no signing or resubmission…";
    try {
      render(await call("jobs/" + job.id + "/recheck", {}));
    } catch (e) {
      $("fresh-status").textContent = e.message;
    } finally {
      busy = false;
      controls();
    }
  };
  $("fresh-new").onclick = () => {
    if (busy || job?.status === "RUNNING") return;
    clearTimeout(timer);
    job = null;
    pendingId = null;
    localStorage.removeItem(key);
    localStorage.removeItem(scenarioKey);
    $("fresh-consent").checked = false;
    $("fresh-events").replaceChildren();
    $("fresh-proof").replaceChildren();
    $("fresh-result").hidden = true;
    $("fresh-status").textContent =
      "New run needs a new explicit opt-in. Previous transactions are retained.";
    controls();
  };
  (async () => {
    try {
      const config = await call("config");
      csrf = config.csrfToken;
      if (pendingId) {
        try {
          render(await call("jobs/" + pendingId));
        } catch {
          $("fresh-status").textContent =
            "Saved request ID has no confirmed job. An explicit retry uses the same ID.";
        }
      } else if (config.latestJob) render(config.latestJob);
      controls();
      $("fresh-ui").dataset.ready = "true";
    } catch (e) {
      $("fresh-status").textContent = "Local backend unavailable: " + e.message;
    }
  })();
})();
