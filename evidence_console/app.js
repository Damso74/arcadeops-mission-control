import { validateReceipt } from './receipt-validator.mjs';

const receiptUrl = '../evidence/submission-evidence-receipt.json';

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) element.textContent = String(value);
};

const first = value => Array.isArray(value) ? value[0] : value;

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

function humanizeCheck(name) {
  return name
    .replaceAll('_', ' ')
    .replace(/^./, character => character.toUpperCase());
}

function checkGroup(name) {
  if (/authority|approval|mission|token|write|replay/.test(name)) return 'Authority';
  if (/sandbox|verifier|subagent|model|mcp/.test(name)) return 'Execution';
  if (/precondition|postcondition|recover|rollback|service|state/.test(name)) return 'Recovery';
  return 'Integrity';
}

function renderCheckGroups(checks) {
  const container = document.getElementById('check-groups');
  container.replaceChildren();
  const groups = new Map([
    ['Authority', []],
    ['Execution', []],
    ['Recovery', []],
    ['Integrity', []],
  ]);

  Object.keys(checks).forEach(name => groups.get(checkGroup(name)).push(name));

  groups.forEach((names, groupName) => {
    if (!names.length) return;
    const details = document.createElement('details');
    details.className = 'check-group';
    const summary = document.createElement('summary');
    const label = document.createElement('strong');
    label.textContent = groupName;
    const count = document.createElement('span');
    count.textContent = `${names.length}/${names.length}`;
    summary.append(label, count);

    const list = document.createElement('ul');
    names.forEach(name => {
      const item = document.createElement('li');
      item.textContent = humanizeCheck(name);
      list.append(item);
    });

    details.append(summary, list);
    container.append(details);
  });
}

function renderReceipt(receipt) {
  const evidence = validateReceipt(receipt);
  const serviceBefore = evidence.precondition.service;
  const service = evidence.postcondition.service;
  const write = evidence.write;
  const checks = evidence.checks;
  const checkCount = Object.keys(checks).length;
  const inspections = Array.isArray(receipt.precondition_inspections) ? receipt.precondition_inspections : [receipt.precondition_inspections];
  const parentInspection = inspections.find(item => item.thread_id === 'main') || first(receipt.precondition_inspections);
  const verifierInspection = inspections.find(item => item.thread_id !== 'main');
  const sandboxCalls = Array.isArray(receipt.sandbox_exec_calls) ? receipt.sandbox_exec_calls : [receipt.sandbox_exec_calls];
  const sandboxValidation = sandboxCalls.find(item => item.validation_pass_observed);
  const decision = first(receipt.human_decisions);
  const postcondition = first(receipt.postcondition_inspections);

  setText('record-eyebrow', `${receipt.incident_id} · ${receipt.service_id}`);
  setText('page-title', 'Rollback completed');
  setText('record-summary', `${receipt.service_id} is healthy on ${service.deployed_version}. The change ran once, after human approval.`);
  setText('service-name', receipt.service_id);
  setText('incident-name', receipt.incident_id);
  setText('mission-id', receipt.mission_id);
  setText('from-version', serviceBefore.deployed_version);
  setText('to-version', service.deployed_version);
  setText('before-rate', `${serviceBefore.error_rate_percent}%`);
  setText('after-rate', `${service.error_rate_percent}%`);
  setText('authority-change', `${serviceBefore.deployed_version} → ${receipt.target_version}`);
  setText('detected-detail', `${receipt.service_id} was degraded on ${serviceBefore.deployed_version} at ${serviceBefore.error_rate_percent}%.`);
  setText('write-detail', `One authorized ${serviceBefore.deployed_version} → ${service.deployed_version} change was applied.`);
  setText('recovery-detail', `Error rate fell to ${service.error_rate_percent}%, below the ${service.healthy_threshold_percent}% threshold.`);
  setText('detected-time', formatTime(parentInspection?.responded_at));
  setText('verifier-time', formatTime(verifierInspection?.responded_at));
  setText('sandbox-time', formatTime(sandboxValidation?.responded_at));
  setText('approval-time', formatTime(decision?.decided_at));
  setText('write-time', formatTime(write.responded_at));
  setText('recovery-time', formatTime(postcondition?.responded_at));
  setText('decision-copy', `Allow recorded at ${formatTime(decision?.decided_at)} UTC, before the only write.`);
  setText('write-count', '1');
  setText('receipt-check-count', checkCount);
  setText('receipt-check-total', checkCount);
  setText('proof-summary', `${checkCount}/${checkCount}`);
  setText('receipt-date', receipt.generated_at.slice(0, 10));
  setText('model-name', `${receipt.model_provider}/${receipt.model_name}`);
  setText('verifier-name', '1 independent verification agent');
  setText('sandbox-name', `${receipt.sandbox_provider} · isolated`);
  setText('authority-name', `${receipt.service_id} · ${serviceBefore.deployed_version} to ${receipt.target_version} · max 1 write`);
  setText('decision-time', `Human Allow · ${formatTime(decision?.decided_at)} UTC`);

  const sessionLink = document.getElementById('session-link');
  const isLocalRuntime = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  if (isLocalRuntime) {
    sessionLink.href = `http://127.0.0.1:8791/sessions/${encodeURIComponent(receipt.session_id)}`;
    sessionLink.textContent = 'Open TrueForge session';
  } else {
    sessionLink.href = 'https://github.com/Damso74/arcadeops-mission-control#evidence-status';
    sessionLink.textContent = 'Inspect public evidence';
  }

  renderCheckGroups(checks);

  const state = document.getElementById('evidence-state');
  state.dataset.status = 'pass';
  state.lastElementChild.textContent = 'Receipt valid';
  document.getElementById('console-root').dataset.evidenceStatus = 'pass';
}

function renderFailure() {
  const root = document.getElementById('console-root');
  root.dataset.evidenceStatus = 'fail';
  const state = document.getElementById('evidence-state');
  state.dataset.status = 'fail';
  state.lastElementChild.textContent = 'Receipt unavailable';
  setText('record-eyebrow', 'Evidence unavailable');
  setText('page-title', 'No result displayed');
  setText('record-summary', 'The receipt could not prove the complete authority chain. This review fails closed and hides every operational claim.');
}

fetch(receiptUrl, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Receipt request failed with ${response.status}`);
    return response.json();
  })
  .then(renderReceipt)
  .catch(renderFailure);
