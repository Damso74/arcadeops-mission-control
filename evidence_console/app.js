import { validateReceipt } from './receipt-validator.mjs';

const receiptUrl = '../evidence/submission-evidence-receipt.json';

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) element.textContent = String(value);
};

function evidenceCount(checks) {
  return Object.keys(checks).length;
}

function humanizeCheck(name) {
  return name
    .replaceAll('_', ' ')
    .replace(/^./, character => character.toUpperCase());
}

function renderReceipt(receipt) {
  const evidence = validateReceipt(receipt);
  const serviceBefore = evidence.precondition.service;
  const service = evidence.postcondition.service;
  const write = evidence.write;
  const checkCount = evidenceCount(evidence.checks);

  setText('service-name', receipt.service_id);
  setText('incident-name', receipt.incident_id);
  setText('from-version', serviceBefore.deployed_version);
  setText('to-version', service.deployed_version);
  setText('before-rate', `${serviceBefore.error_rate_percent}%`);
  setText('after-rate', `${service.error_rate_percent}%`);
  setText('check-count', checkCount);
  setText('approval-count', '1');
  setText('write-count', '1');
  setText('model-name', `${receipt.model_provider}/${receipt.model_name}`);
  setText('verifier-name', '1 independent child agent');
  setText('sandbox-name', `${receipt.sandbox_provider} · isolated`);
  setText('authority-name', `${receipt.service_id} · ${serviceBefore.deployed_version} to ${receipt.target_version} · max 1 write`);
  setText('decision-time', `Human Allow · ${evidence.decision.decided_at.slice(11, 19)}`);
  setText('receipt-date', `Sealed ${receipt.generated_at.slice(0, 10)}`);
  setText('proof-summary', `${checkCount}/${checkCount} checks passed`);
  setText('headline-primary', 'Checkout recovered.');
  setText('headline-secondary', 'Every step proved.');
  setText('hero-eyebrow', 'Mission complete · human approved');
  setText('hero-lede', 'An AI operator rolled back one fictional service. It could inspect and prepare freely, but only a human could authorize the final write.');

  const sessionLink = document.getElementById('session-link');
  sessionLink.href = `http://127.0.0.1:8791/sessions/${encodeURIComponent(receipt.session_id)}`;

  const checkList = document.getElementById('check-list');
  checkList.replaceChildren();
  Object.keys(evidence.checks).forEach(name => {
    const item = document.createElement('li');
    item.textContent = humanizeCheck(name);
    checkList.append(item);
  });

  const state = document.getElementById('evidence-state');
  state.dataset.status = 'pass';
  state.lastElementChild.textContent = 'Evidence verified';
  document.getElementById('console-root').dataset.evidenceStatus = 'pass';
}

function renderFailure() {
  const root = document.getElementById('console-root');
  root.dataset.evidenceStatus = 'fail';
  const state = document.getElementById('evidence-state');
  state.dataset.status = 'fail';
  state.lastElementChild.textContent = 'Evidence unavailable';
  setText('hero-eyebrow', 'Mission evidence unavailable');
  setText('headline-primary', 'Evidence unavailable.');
  setText('headline-secondary', 'No success claimed.');
  setText('hero-lede', 'The receipt could not prove the full authority chain. This console fails closed and hides every recovery claim.');
}

fetch(receiptUrl, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Receipt request failed with ${response.status}`);
    return response.json();
  })
  .then(renderReceipt)
  .catch(renderFailure);
