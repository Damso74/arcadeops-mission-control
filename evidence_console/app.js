import {
  REQUIRED_CHECKS,
  validateAuthorityTrial,
  validateReceipt,
  validateReceiptReport,
} from './receipt-validator.mjs';

const RECEIPT_URL = '../evidence/submission-evidence-receipt.json';
const TRIAL_URL = '../evidence/go-pivot-evidence-receipt.json';
const CLI_COMMAND = 'node bin/arcadeops.mjs verify evidence/submission-evidence-receipt.json';

const root = document.querySelector('#console-root');
const state = document.querySelector('#evidence-state');
let sealedReceipt;

const byId = id => document.getElementById(id);
const setText = (id, value) => {
  const element = byId(id);
  if (element) element.textContent = String(value);
};
const formatTime = value => new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
  hour12: false,
}).format(new Date(value));
const shortId = value => `${String(value).slice(0, 8)}…${String(value).slice(-5)}`;
const clone = value => structuredClone(value);

const checkGroups = Object.freeze({
  Authority: [
    'native_approval_pause_for_write',
    'human_allow_for_write',
    'write_response_after_human_allow',
    'authorized_rollback_executed_once',
  ],
  Execution: [
    'daytona_provider_ready',
    'daytona_sandbox_created',
    'sandbox_exec_observed',
    'sandbox_generated_code_uses_mcp_bridge',
    'sandbox_validator_read_only',
    'sandbox_validation_pass_observed',
    'sandbox_validation_before_write',
  ],
  Verification: [
    'exactly_one_verifier',
    'verifier_used_real_mcp',
    'verifier_never_attempted_write',
    'precondition_inspection_observed',
    'precondition_before_write',
  ],
  Recovery: [
    'postcondition_inspection_observed',
    'postcondition_after_write',
    'service_recovered_on_target_version',
    'submission_agent_resolved',
    'all_turns_terminal',
    'model_identity_resolved',
  ],
});

const humanize = value => value
  .replaceAll('_', ' ')
  .replace(/^./, character => character.toUpperCase());

function setEvidenceState(status, label) {
  root.dataset.evidenceStatus = status;
  state.dataset.status = status;
  state.lastElementChild.textContent = label;
}

function renderFailure(error) {
  console.error(error);
  setEvidenceState('fail', 'Receipt rejected');
  setText('record-summary', 'The public Receipt did not pass the fail-closed validator. No operational result is displayed.');
}

function switchTab(name, focus = false) {
  document.querySelectorAll('[data-tab]').forEach(button => {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
}

function installTabs() {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs.at(-1)
          : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      switchTab(next.dataset.tab, true);
    });
  });
  byId('open-challenge').addEventListener('click', () => {
    switchTab('challenge');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    byId('workbench').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  });
}

function buildEvents(receipt, evidence) {
  const pre = receipt.precondition_inspections[0];
  const verifier = receipt.subagent_events[0];
  const verifierCalls = receipt.verifier_tool_calls;
  const prepared = verifierCalls.find(call => call.tool === 'prepare_rollback');
  const sandbox = receipt.sandbox_exec_calls.find(call => call.validation_pass_observed);
  const approval = receipt.approval_requests[0];
  const decision = receipt.human_decisions[0];
  const write = receipt.executed_writes[0];
  const post = receipt.postcondition_inspections.at(-1);
  const callId = write.tool_call_id;

  if (!prepared?.responded_at) {
    throw new Error('Persisted Verifier prepare_rollback evidence is missing');
  }

  const events = [
    {
      kicker: 'Incident observed',
      title: 'Production state inspected',
      time: pre.responded_at,
      provenance: 'PERSISTED',
      state: 'READ ONLY',
      description: 'The parent agent inspected the fictional incident before preparing any change.',
      comparisons: [
        ['Service state', 'degraded', pre.response.service.status],
        ['Error rate', '> 2.0%', `${pre.response.service.error_rate_percent}%`],
        ['Rollback target', receipt.target_version, pre.response.incident.rollback_target],
      ],
      summary: '1 inspection · 1 mission · 0 writes',
      records: ['incident', 'service', 'mission'],
      raw: pre,
    },
    {
      kicker: 'Read-only preparation',
      title: 'Rollback plan constrained',
      time: prepared.responded_at,
      provenance: 'PERSISTED',
      state: 'SCOPED',
      description: 'The Verifier prepared a state-bound rollback after the parent inspection. This read-only call did not execute the change.',
      comparisons: [
        ['Observed version', write.response.before.deployed_version, pre.response.service.deployed_version],
        ['Stable version', receipt.target_version, pre.response.service.stable_version],
        ['Mission', receipt.mission_id, pre.mission_id],
      ],
      summary: '4 scope fields · 1 target · 0 ambiguity',
      records: ['pre-state', 'target', 'mission'],
      raw: prepared,
    },
    {
      kicker: 'Independent verification',
      title: 'Verifier challenged the proposal',
      time: evidence.verifierRespondedAt,
      provenance: 'PERSISTED',
      state: 'VERIFIED',
      description: 'A dynamic child agent made exactly two read-only MCP calls and never attempted the governed write.',
      comparisons: [
        ['Child identity', verifier.thread_id, verifierCalls[0].thread_id],
        ['Required tools', 'inspect + prepare', verifierCalls.map(call => call.tool.replace('_rollback', '')).join(' + ')],
        ['Write attempts', '0', String(verifierCalls.filter(call => call.tool === 'execute_rollback').length)],
      ],
      summary: '2 calls · 1 child identity · 0 writes',
      records: ['subagent', 'inspect call', 'prepare call'],
      raw: { subagent: verifier, tool_calls: verifierCalls },
    },
    {
      kicker: 'Isolated execution',
      title: 'Daytona validator passed',
      time: sandbox.responded_at,
      provenance: 'PERSISTED',
      state: 'SANDBOXED',
      description: 'Generated code ran inside Daytona and used the read-only MCP bridge to re-check the incident and rollback preparation.',
      comparisons: [
        ['Provider', 'daytona', receipt.sandbox_provider],
        ['Direct calls', '2 read-only', `${sandbox.sandbox_command_evidence.direct_call_count} read-only`],
        ['Validation', 'pass', sandbox.validation_pass_observed ? 'pass' : 'fail'],
      ],
      summary: '1 sandbox hash · 2 MCP reads · 0 write attempts',
      records: ['sandbox', 'command hash', 'validation'],
      raw: { reference: receipt.sandbox_references[0], execution: sandbox },
    },
    {
      kicker: 'Native checkpoint',
      title: 'Write paused for approval',
      time: approval.requested_at,
      provenance: 'PERSISTED',
      state: 'WAITING',
      description: 'TrueForge emitted a persisted approval-required event before returning any write response.',
      comparisons: [
        ['Tool', 'execute_rollback', approval.tool],
        ['Transport', 'governed MCP', `${approval.server} MCP`],
        ['Call identity', shortId(callId), shortId(approval.tool_call_id)],
      ],
      summary: '1 approval event · 1 call identity · 0 response yet',
      records: ['write attempt', 'approval event', 'call identity'],
      raw: { write_attempt: receipt.write_calls[0], approval_request: approval },
    },
    {
      kicker: 'Authority boundary',
      title: 'Human Allow released one action',
      time: decision.decided_at,
      provenance: 'PERSISTED',
      state: 'AUTHORIZED',
      description: 'A persisted approval input received through the local TrueForge UI and the governed write share one action identity. The Receipt does not independently identify the approver.',
      comparisons: [
        ['Decision actor', 'human via TrueForge UI', decision.actor.replaceAll('_', ' ')],
        ['Decision', 'allow', decision.decision],
        ['Call identity', shortId(callId), shortId(decision.tool_call_id)],
      ],
      summary: '4 records · 1 identity · 0 unmatched',
      records: ['approval event', 'human decision', 'write call', 'write response'],
      raw: { approval_request: approval, human_decision: decision, correlated_write: receipt.approval_correlated_writes[0] },
    },
    {
      kicker: 'Governed execution',
      title: 'Exactly one rollback executed',
      time: write.responded_at,
      provenance: 'PERSISTED',
      state: '1 / 1 WRITE',
      description: 'The authorized MCP action moved the fictional service from the degraded version to the pre-approved stable target.',
      comparisons: [
        ['Write budget', '1 maximum', `${receipt.executed_writes.length} executed`],
        ['Target version', receipt.target_version, write.response.after.deployed_version],
        ['Action applied', 'true', String(write.response.applied)],
      ],
      summary: '1 action id · 1 state change · budget exhausted',
      records: ['authorization', 'MCP write', 'action result'],
      raw: write,
    },
    {
      kicker: 'Fresh recovery proof',
      title: 'Postcondition independently observed',
      time: post.responded_at,
      provenance: 'PERSISTED',
      state: 'RECOVERED',
      description: 'A fresh inspection after the write confirmed the correlated action, target version, healthy state, and reduced error rate.',
      comparisons: [
        ['Deployed version', receipt.target_version, post.response.service.deployed_version],
        ['Service state', 'healthy', post.response.service.status],
        ['Error rate', '≤ 2.0%', `${post.response.service.error_rate_percent}%`],
      ],
      summary: '1 action id · 1 postcondition · 22/22 checks',
      records: ['write response', 'postcondition', 'receipt checks'],
      raw: { write_response: write.response, postcondition: post, verification_results: receipt.verification_results },
    },
  ];

  for (let index = 1; index < events.length; index += 1) {
    if (Date.parse(events[index - 1].time) > Date.parse(events[index].time)) {
      throw new Error(`Persisted event order is not monotonic at event ${index + 1}`);
    }
  }
  return events;
}

function renderComparisons(rows) {
  const container = byId('inspector-comparison');
  container.replaceChildren();
  rows.forEach(([label, expected, observed]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const expectedValue = document.createElement('dd');
    const observedValue = document.createElement('dd');
    const verdict = document.createElement('b');
    dt.textContent = label;
    const expectedLabel = document.createElement('small');
    expectedLabel.textContent = 'Expected';
    expectedValue.className = 'expected';
    expectedValue.append(expectedLabel);
    expectedValue.append(document.createTextNode(` ${expected}`));
    const observedLabel = document.createElement('small');
    observedLabel.textContent = 'Observed';
    observedValue.className = 'observed';
    observedValue.append(observedLabel);
    observedValue.append(document.createTextNode(` ${observed}`));
    verdict.textContent = 'MATCH';
    row.append(dt, expectedValue, observedValue, verdict);
    container.append(row);
  });
}

function selectEvent(events, index) {
  const event = events[index];
  document.querySelectorAll('.event-item').forEach((row, rowIndex) => {
    row.dataset.selected = String(rowIndex === index);
    row.setAttribute('aria-current', rowIndex === index ? 'step' : 'false');
  });
  setText('inspector-index', String(index + 1).padStart(2, '0'));
  setText('inspector-kicker', event.kicker);
  setText('inspector-title', event.title);
  setText('inspector-verdict', 'MATCH');
  setText('inspector-description', event.description);
  setText('correlation-summary', event.summary);
  renderComparisons(event.comparisons);
  const records = byId('correlation-records');
  records.replaceChildren(...event.records.map(label => {
    const span = document.createElement('span');
    span.textContent = label;
    return span;
  }));
  setText('raw-proof-json', JSON.stringify(event.raw, null, 2));
}

function renderEvents(events) {
  const ledger = byId('event-ledger');
  ledger.replaceChildren();
  events.forEach((event, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-item';
    button.setAttribute('aria-label', `${String(index + 1).padStart(2, '0')}. ${event.title}. ${event.state}`);
    const number = document.createElement('span');
    const copy = document.createElement('span');
    const kicker = document.createElement('small');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    const status = document.createElement('b');
    number.className = 'event-index';
    number.textContent = String(index + 1).padStart(2, '0');
    copy.className = 'event-copy';
    kicker.textContent = event.kicker;
    title.textContent = event.title;
    meta.className = 'event-time';
    meta.append(document.createTextNode(`${formatTime(event.time)} UTC · ${event.provenance}`));
    status.className = `event-state${event.state === 'AUTHORIZED' || event.state === 'WAITING' ? ' authority' : ''}`;
    status.textContent = event.state;
    copy.append(kicker, title);
    meta.append(status);
    button.append(number, copy, meta);
    button.addEventListener('click', () => selectEvent(events, index));
    ledger.append(button);
  });
  selectEvent(events, 5);
}

function renderChecks(checks) {
  setText('receipt-check-count', Object.values(checks).filter(Boolean).length);
  setText('receipt-check-total', REQUIRED_CHECKS.length);
  setText('ledger-verdict-detail', `${REQUIRED_CHECKS.length} correlated checks`);
  const container = byId('check-groups');
  container.replaceChildren();
  Object.entries(checkGroups).forEach(([group, names]) => {
    const section = document.createElement('details');
    const summary = document.createElement('summary');
    const total = document.createElement('span');
    const list = document.createElement('ul');
    section.className = 'check-group';
    section.open = true;
    summary.append(document.createTextNode(group));
    total.textContent = `${names.filter(name => checks[name] === true).length}/${names.length}`;
    summary.append(total);
    section.append(summary);
    names.forEach(name => {
      const item = document.createElement('li');
      item.textContent = humanize(name);
      list.append(item);
    });
    section.append(list);
    container.append(section);
  });
}

function renderSummary(receipt, evidence) {
  const before = evidence.write.response.before;
  const after = evidence.write.response.after;
  setText('record-summary', `One persisted TrueForge mission correlates a Verifier, Daytona validation, a native approval request and Allow input, one governed write, and fresh recovery evidence.`);
  setText('summary-service', receipt.service_id);
  setText('summary-version-before', before.deployed_version);
  setText('summary-version-after', after.deployed_version);
  setText('summary-rate-before', `${before.error_rate_percent}%`);
  setText('summary-rate-after', `${after.error_rate_percent}%`);
  setText('incident-id', receipt.incident_id);
  setText('mission-id', receipt.mission_id);
}

const mutations = Object.freeze({
  'remove-approval': receipt => { receipt.human_decisions = []; },
  'duplicate-write': receipt => { receipt.executed_writes.push(clone(receipt.executed_writes[0])); },
  'change-target': receipt => { receipt.target_version = 'v40'; },
  'replace-sandbox': receipt => { receipt.sandbox_provider = 'local'; },
  'reorder-events': receipt => {
    const validator = receipt.sandbox_exec_calls.find(call => call.validation_pass_observed);
    validator.responded_at = new Date(Date.parse(receipt.executed_writes[0].responded_at) + 1000).toISOString();
  },
  'break-identity': receipt => { receipt.human_decisions[0].tool_call_id = 'tampered-call-id'; },
});

function resetChallenge() {
  document.querySelectorAll('[data-mutation]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  byId('challenge-result').dataset.result = 'ready';
  setText('challenge-label', 'VERSIONED RECEIPT READY');
  setText('challenge-code', 'Select an attack');
  setText('challenge-message', `The canonical Receipt currently verifies all ${REQUIRED_CHECKS.length} invariants.`);
  setText('challenge-claims', `${REQUIRED_CHECKS.length} verified`);
  setText('challenge-writes', '1 / 1');
  byId('restore-receipt').disabled = true;
}

function installChallenge() {
  document.querySelectorAll('[data-mutation]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const candidate = clone(sealedReceipt);
      mutations[button.dataset.mutation](candidate);
      const report = validateReceiptReport(candidate);
      document.querySelectorAll('[data-mutation]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      byId('challenge-result').dataset.result = report.valid ? 'warning' : 'rejected';
      setText('challenge-label', report.valid ? 'MUTATION WAS NOT REJECTED' : 'MODIFIED RECEIPT REJECTED');
      setText('challenge-code', report.code);
      setText('challenge-message', report.message);
      setText('challenge-claims', report.valid ? 'review required' : '0 displayed');
      setText('challenge-writes', report.valid ? 'not trusted' : '0 authorized');
      byId('restore-receipt').disabled = false;
      byId('challenge-result').focus({ preventScroll: true });
    });
  });
  byId('restore-receipt').addEventListener('click', resetChallenge);
}

async function loadTrial() {
  const historicalCards = [...document.querySelectorAll('.trial-card')].slice(1);
  historicalCards.forEach(card => { card.hidden = true; });
  try {
    const response = await fetch(TRIAL_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Trial HTTP ${response.status}`);
    const trial = await response.json();
    const evidence = validateAuthorityTrial(trial);
    historicalCards.forEach(card => { card.hidden = false; });
    setText('trial-disclosure', `Verified historical TrueForge acceptance session ${shortId(trial.session_id)}: ${evidence.humanBlock.state_changed ? 'unexpected write' : 'Human Deny preserved state'}; AuthorityContract refusal preserved state. This earlier trial did not use Daytona or a subagent.`);
  } catch (error) {
    console.error(error);
    setText('trial-disclosure', 'Historical negative trials were not displayed because their receipt could not be independently validated.');
  }
}

function installCopy() {
  byId('copy-command').addEventListener('click', async event => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(CLI_COMMAND);
      button.textContent = 'Copied';
      button.setAttribute('aria-label', 'Command copied');
    } catch {
      button.textContent = 'Select command';
      button.setAttribute('aria-label', 'Select command manually');
    }
    window.setTimeout(() => {
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy verification command');
    }, 1600);
  });
}

async function start() {
  installTabs();
  installChallenge();
  installCopy();
  try {
    const response = await fetch(RECEIPT_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Receipt HTTP ${response.status}`);
    const receipt = await response.json();
    const evidence = validateReceipt(receipt);
    sealedReceipt = receipt;
    renderSummary(receipt, evidence);
    renderEvents(buildEvents(receipt, evidence));
    renderChecks(evidence.checks);
    setEvidenceState('pass', `${REQUIRED_CHECKS.length}/${REQUIRED_CHECKS.length} Receipt valid`);
    await loadTrial();
  } catch (error) {
    renderFailure(error);
  }
}

start();
