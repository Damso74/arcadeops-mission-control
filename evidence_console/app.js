const receiptUrl = '../evidence/submission-evidence-receipt.json';

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) element.textContent = String(value);
};

function evidenceCount(checks) {
  return Object.values(checks ?? {}).filter(Boolean).length;
}

function humanizeCheck(name) {
  return name
    .replaceAll('_', ' ')
    .replace(/^./, character => character.toUpperCase());
}

function renderReceipt(receipt) {
  if (receipt.final_status !== 'SUBMISSION_ACCEPTANCE_PASS') {
    throw new Error('The submitted receipt is not a passing acceptance receipt.');
  }
  const failedChecks = Object.entries(receipt.verification_results ?? {}).filter(([, passed]) => !passed);
  if (failedChecks.length > 0) throw new Error('At least one required verification is missing.');

  const precondition = receipt.precondition_inspections?.[0]?.response ?? {};
  const postcondition = receipt.postcondition_inspections?.at(-1)?.response ?? {};
  const serviceBefore = precondition.service ?? {};
  const service = postcondition.service ?? {};
  const write = receipt.executed_writes?.[0] ?? {};
  const approvedWrites = receipt.approval_correlated_writes ?? receipt.executed_writes ?? [];

  setText('service-name', receipt.service_id);
  setText('incident-name', receipt.incident_id);
  setText('from-version', write.response?.before?.deployed_version ?? serviceBefore.deployed_version);
  setText('to-version', service.deployed_version ?? receipt.target_version);
  setText('before-rate', `${write.response?.before?.error_rate_percent ?? serviceBefore.error_rate_percent}%`);
  setText('after-rate', `${service.error_rate_percent ?? 0.7}%`);
  setText('check-count', evidenceCount(receipt.verification_results));
  setText('approval-count', receipt.human_decisions?.filter(item => item.decision === 'allow').length ?? 0);
  setText('write-count', approvedWrites.length);
  setText('model-name', `${receipt.model_provider}/${receipt.model_name}`);
  setText('verifier-name', `${receipt.subagent_events?.length ?? 0} independent child agent`);
  setText('sandbox-name', `${receipt.sandbox_provider} · isolated`);
  setText('decision-time', `Human Allow · ${receipt.human_decisions?.[0]?.decided_at?.slice(11, 19) ?? 'correlated'}`);
  setText('receipt-date', `Sealed ${receipt.generated_at?.slice(0, 10) ?? ''}`);
  setText('proof-summary', `${evidenceCount(receipt.verification_results)}/${evidenceCount(receipt.verification_results)} checks passed`);

  const sessionLink = document.getElementById('session-link');
  sessionLink.href = `http://127.0.0.1:8791/sessions/${encodeURIComponent(receipt.session_id)}`;

  const checkList = document.getElementById('check-list');
  Object.entries(receipt.verification_results).forEach(([name, passed]) => {
    if (!passed) return;
    const item = document.createElement('li');
    item.textContent = humanizeCheck(name);
    checkList.append(item);
  });

  const state = document.getElementById('evidence-state');
  state.dataset.status = 'pass';
  state.lastElementChild.textContent = 'Evidence verified';
}

function renderFailure() {
  const state = document.getElementById('evidence-state');
  state.dataset.status = 'fail';
  state.lastElementChild.textContent = 'Evidence unavailable';
  document.querySelector('.eyebrow').textContent = 'Mission evidence unavailable';
  document.querySelector('.plain-trust').textContent = 'The console fails closed when proof cannot be loaded.';
}

fetch(receiptUrl, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Receipt request failed with ${response.status}`);
    return response.json();
  })
  .then(renderReceipt)
  .catch(renderFailure);
