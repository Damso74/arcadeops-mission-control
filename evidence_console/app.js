import { validateReceipt } from './receipt-validator.mjs';

const receiptUrl = '../evidence/submission-evidence-receipt.json';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  return name.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
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

const replaySteps = [
  {
    node: 0,
    state: 'incident',
    title: 'Incident detected',
    detail: 'Validated incident context loaded from the receipt.',
    status: 'Incident observed',
  },
  {
    node: 0,
    state: 'prepared',
    title: 'Rollback prepared',
    detail: 'The agent proposes a scoped recovery plan using read-only MCP calls.',
    status: 'Agent prepared change',
  },
  {
    node: 1,
    state: 'validated',
    title: 'Sandbox validation passed',
    detail: 'Daytona runs the generated checks in isolation before authority is requested.',
    status: 'Daytona validation passed',
  },
  {
    node: 2,
    state: 'waiting',
    title: 'Waiting for human approval',
    detail: 'The validated write is paused at the authority boundary.',
    status: 'Approval required',
    delay: 1850,
  },
  {
    node: 2,
    state: 'approved',
    title: 'Human Allow recorded',
    detail: 'The operator unlocks one exact rollback. No broader permission is granted.',
    status: 'Human authorized one write',
  },
  {
    node: 3,
    state: 'executed',
    title: 'One authorized write executed',
    detail: 'The governed MCP operation runs once, inside the approved scope.',
    status: 'Write executed 1 / 1',
  },
  {
    node: 4,
    state: 'sealed',
    title: 'Recovery proven and receipt sealed',
    detail: 'The service is healthy and every link in the authority chain is verifiable.',
    status: 'Mission verified',
  },
];

let currentStep = -1;
let replayTimer;
let isPlaying = false;

function setReplayButton(label) {
  const button = document.getElementById('replay-control');
  button.querySelector('span').textContent = label;
}

function updateProgress(node, isComplete = false) {
  const percent = isComplete ? 100 : Math.max(0, (node / 4) * 100);
  const progress = document.getElementById('path-progress');
  progress.style.width = `${percent}%`;
  progress.style.height = `${percent}%`;
}

function renderReadyState() {
  currentStep = -1;
  document.querySelector('.mission-canvas').dataset.replayState = 'ready';
  document.querySelectorAll('.path-node').forEach(node => {
    node.classList.remove('is-active', 'is-complete');
    node.removeAttribute('aria-current');
  });
  document.getElementById('incident-card').classList.remove('is-visible');
  document.getElementById('gate-card').classList.remove('is-active', 'is-approved');
  document.getElementById('outcome-strip').classList.remove('is-visible');
  setText('human-node-state', 'Required');
  setText('gate-label', 'Human approval gate');
  setText('gate-title', 'Write permission locked');
  setText('gate-detail', 'No agent can cross this boundary alone.');
  setText('step-index', '00');
  setText('step-title', 'Evidence verified');
  setText('step-detail', 'Replay the persisted mission to inspect each control.');
  setText('replay-status-text', 'Ready to replay');
  document.getElementById('replay-status').dataset.state = 'ready';
  document.getElementById('step-control').disabled = false;
  setReplayButton('Replay verified mission');
  updateProgress(0);
}

function renderReplayStep(index) {
  currentStep = Math.max(0, Math.min(index, replaySteps.length - 1));
  const step = replaySteps[currentStep];
  const nodes = [...document.querySelectorAll('.path-node')];
  const isSealed = step.state === 'sealed';

  document.querySelector('.mission-canvas').dataset.replayState = step.state;
  document.getElementById('incident-card').classList.add('is-visible');

  nodes.forEach((node, nodeIndex) => {
    const complete = nodeIndex < step.node || (isSealed && nodeIndex === step.node) || (step.state === 'executed' && nodeIndex === 2);
    const active = nodeIndex === step.node && !isSealed;
    node.classList.toggle('is-complete', complete);
    node.classList.toggle('is-active', active);
    if (active) node.setAttribute('aria-current', 'step');
    else node.removeAttribute('aria-current');
  });

  const gate = document.getElementById('gate-card');
  const approved = ['approved', 'executed', 'sealed'].includes(step.state);
  gate.classList.toggle('is-active', step.state === 'waiting');
  gate.classList.toggle('is-approved', approved);
  document.getElementById('outcome-strip').classList.toggle('is-visible', isSealed);

  if (step.state === 'waiting') {
    setText('human-node-state', 'Waiting');
    setText('gate-label', 'Human approval required');
    setText('gate-title', 'Execution paused');
    setText('gate-detail', 'The sandbox passed. The agent still has no write authority.');
  } else if (approved) {
    setText('human-node-state', 'Allowed');
    setText('gate-label', 'Human approval recorded');
    setText('gate-title', 'Exactly one write unlocked');
    setText('gate-detail', 'The decision and write share one correlated identity.');
  } else {
    setText('human-node-state', 'Required');
    setText('gate-label', 'Human approval gate');
    setText('gate-title', 'Write permission locked');
    setText('gate-detail', 'No agent can cross this boundary alone.');
  }

  setText('step-index', String(currentStep + 1).padStart(2, '0'));
  setText('step-title', step.title);
  setText('step-detail', step.detail);
  setText('replay-status-text', step.status);
  updateProgress(step.node, isSealed);

  const stepButton = document.getElementById('step-control');
  stepButton.disabled = isSealed;
  stepButton.firstChild.textContent = isSealed ? 'Replay complete ' : 'Next step ';

  if (isSealed) {
    isPlaying = false;
    document.getElementById('replay-status').dataset.state = 'complete';
    setReplayButton('Replay again');
  } else {
    document.getElementById('replay-status').dataset.state = isPlaying ? 'running' : 'paused';
  }
}

function stopReplay() {
  window.clearTimeout(replayTimer);
  isPlaying = false;
  if (currentStep >= 0 && currentStep < replaySteps.length - 1) {
    document.getElementById('replay-status').dataset.state = 'paused';
    setText('replay-status-text', 'Replay paused');
    setReplayButton('Continue replay');
  }
}

function scheduleNextStep() {
  if (!isPlaying) return;
  const nextIndex = currentStep + 1;
  if (nextIndex >= replaySteps.length) {
    stopReplay();
    return;
  }
  renderReplayStep(nextIndex);
  if (nextIndex < replaySteps.length - 1) {
    const stepDelay = reducedMotion.matches ? 320 : (replaySteps[nextIndex].delay || 1150);
    replayTimer = window.setTimeout(scheduleNextStep, stepDelay);
  }
}

function playReplay() {
  if (isPlaying) {
    stopReplay();
    return;
  }
  if (currentStep >= replaySteps.length - 1) renderReadyState();
  isPlaying = true;
  setReplayButton('Pause replay');
  document.getElementById('replay-status').dataset.state = 'running';
  document.getElementById('mission-replay').scrollIntoView({
    behavior: reducedMotion.matches ? 'auto' : 'smooth',
    block: 'start',
  });
  replayTimer = window.setTimeout(scheduleNextStep, reducedMotion.matches ? 50 : 520);
}

function bindReplayControls() {
  document.getElementById('replay-control').addEventListener('click', playReplay);
  document.getElementById('step-control').addEventListener('click', () => {
    stopReplay();
    if (currentStep >= replaySteps.length - 1) renderReadyState();
    else renderReplayStep(currentStep + 1);
  });
  document.getElementById('restart-control').addEventListener('click', () => {
    stopReplay();
    renderReadyState();
  });
  renderReadyState();
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
  const sandboxCalls = Array.isArray(receipt.sandbox_exec_calls) ? receipt.sandbox_exec_calls : [receipt.sandbox_exec_calls];
  const sandboxValidation = sandboxCalls.find(item => item.validation_pass_observed);
  const decision = first(receipt.human_decisions);

  replaySteps[0].detail = `${receipt.service_id} is degraded on ${serviceBefore.deployed_version} at ${serviceBefore.error_rate_percent}% errors.`;
  replaySteps[1].detail = `The agent proposes a scoped rollback to ${receipt.target_version} using read-only MCP calls.`;

  setText('page-title', 'Agents can prepare. Humans authorize.');
  setText('record-summary', `ArcadeOps validated a rollback for ${receipt.service_id} in Daytona, paused at human approval, executed exactly once, and sealed ${checkCount} verification checks.`);
  setText('service-name', receipt.service_id);
  setText('incident-name', receipt.incident_id);
  setText('mission-id', receipt.mission_id);
  setText('incident-service', `${receipt.service_id} degraded`);
  setText('outcome-service', `${receipt.service_id} healthy`);
  setText('incident-rate', `${serviceBefore.error_rate_percent}%`);
  setText('from-version', serviceBefore.deployed_version);
  setText('to-version', service.deployed_version);
  setText('before-rate', `${serviceBefore.error_rate_percent}%`);
  setText('after-rate', `${service.error_rate_percent}%`);
  setText('authority-change', `${serviceBefore.deployed_version} → ${receipt.target_version}`);
  setText('incident-time', `${formatTime(parentInspection?.responded_at)} UTC`);
  setText('verifier-time', formatTime(evidence.verifierRespondedAt));
  setText('sandbox-time', formatTime(sandboxValidation?.responded_at));
  setText('approval-time', formatTime(decision?.decided_at));
  setText('receipt-check-count', checkCount);
  setText('receipt-check-total', checkCount);
  setText('node-check-count', `${checkCount} / ${checkCount}`);
  setText('proof-summary', `${checkCount}/${checkCount}`);
  setText('receipt-date', receipt.generated_at.slice(0, 10));
  setText('model-name', `${receipt.model_provider}/${receipt.model_name}`);
  setText('sandbox-name', `${receipt.sandbox_provider} / isolated`);
  setText('decision-time', `Human Allow / ${formatTime(decision?.decided_at)} UTC`);

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
  state.lastElementChild.textContent = 'Receipt verified';
  document.getElementById('console-root').dataset.evidenceStatus = 'pass';
  bindReplayControls();
}

function renderFailure() {
  stopReplay();
  const root = document.getElementById('console-root');
  root.dataset.evidenceStatus = 'fail';
  const state = document.getElementById('evidence-state');
  state.dataset.status = 'fail';
  state.lastElementChild.textContent = 'Receipt unavailable';
  document.querySelector('.eyebrow').lastChild.textContent = ' Evidence unavailable';
  setText('page-title', 'No result displayed');
  setText('record-summary', 'The receipt could not prove the complete authority chain. ArcadeOps fails closed and hides every operational success claim.');
}

fetch(receiptUrl, { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`Receipt request failed with ${response.status}`);
    return response.json();
  })
  .then(renderReceipt)
  .catch(renderFailure);
