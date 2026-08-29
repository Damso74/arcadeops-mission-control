import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  REQUIRED_CHECKS,
  validateAuthorityTrial,
  validateReceipt,
  validateReceiptReport,
} from './receipt-validator.mjs';

const sourceReceipt = JSON.parse(
  await readFile(new URL('../evidence/submission-evidence-receipt.json', import.meta.url), 'utf8'),
);
const copy = () => structuredClone(sourceReceipt);
const expectedVerifierRespondedAt = new Date(Math.max(
  ...sourceReceipt.verifier_tool_calls.map(item => Date.parse(item.responded_at)),
)).toISOString();
const rejects = (mutate, pattern = /Receipt rejected:/) => {
  const receipt = copy();
  mutate(receipt);
  assert.throws(() => validateReceipt(receipt), pattern);
};

test('accepts the complete persisted receipt', () => {
  const evidence = validateReceipt(copy());
  assert.equal(Object.keys(evidence.checks).length, REQUIRED_CHECKS.length);
  assert.equal(evidence.write.response.recovered, true);
  assert.equal(evidence.verifierRespondedAt, expectedVerifierRespondedAt);
});

test('derives the Verifier time from its correlated calls', () => {
  const receipt = copy();
  receipt.precondition_inspections = receipt.precondition_inspections.filter(item => item.thread_id === 'main');
  const evidence = validateReceipt(receipt);
  assert.equal(evidence.verifierRespondedAt, expectedVerifierRespondedAt);
});

test('rejects missing, partial, false, or extra checks', () => {
  rejects(receipt => { receipt.verification_results = {}; });
  rejects(receipt => { delete receipt.verification_results.human_allow_for_write; });
  rejects(receipt => { receipt.verification_results.human_allow_for_write = false; });
  rejects(receipt => { receipt.verification_results.untrusted_extra_check = true; });
});

test('rejects missing authority-chain records', () => {
  for (const field of [
    'approval_requests',
    'human_decisions',
    'write_calls',
    'executed_writes',
    'approval_correlated_writes',
    'verifier_tool_calls',
    'sandbox_references',
    'sandbox_exec_calls',
    'precondition_inspections',
    'postcondition_inspections',
  ]) {
    rejects(receipt => { receipt[field] = []; });
  }
});

test('rejects uncorrelated approval and write identifiers', () => {
  rejects(receipt => { delete receipt.approval_requests[0].approval_event_id; }, /approval event identity/);
  rejects(receipt => { receipt.approval_requests[0].approval_event_id = receipt.executed_writes[0].tool_call_id; }, /approval event identity/);
  rejects(receipt => { receipt.approval_requests[0].event_type = 'model.message'; }, /approval request provenance/);
  rejects(receipt => { receipt.approval_requests[0].tool = 'prepare_rollback'; }, /approval request provenance/);
  rejects(receipt => { receipt.approval_requests[0].mission_id = 'different-mission'; }, /approval request provenance/);
  rejects(receipt => { receipt.human_decisions[0].event_type = 'model.message'; }, /approval input provenance/);
  rejects(receipt => { receipt.human_decisions[0].input_type = 'user.message'; }, /approval input provenance/);
  rejects(receipt => { receipt.human_decisions[0].tool_call_id = 'different-call'; }, /not correlated/);
  rejects(receipt => { receipt.approval_correlated_writes[0].mission_id = 'different-mission'; }, /mission_id/);
  rejects(receipt => { receipt.executed_writes[0].server = 'untrusted-server'; }, /governed MCP transport/);
  rejects(receipt => { receipt.write_calls[0].tool_type = 'function'; }, /governed MCP transport/);
  rejects(receipt => { receipt.approval_correlated_writes[0].response.recovered = false; }, /payload does not match/);
});

test('rejects mismatched incident, service, version, action, and metrics', () => {
  rejects(receipt => { receipt.incident_id = 'different-incident'; }, /incident_id/);
  rejects(receipt => { receipt.service_id = 'different-service'; }, /service_id/);
  rejects(receipt => { receipt.target_version = 'v999'; }, /target version|rollback target/);
  rejects(receipt => { receipt.postcondition_inspections[0].response.incident.resolved_by_action_id = 'different-action'; }, /correlated recovery/);
  rejects(receipt => { receipt.postcondition_inspections[0].response.service.error_rate_percent = 99; }, /correlated recovery/);
});

test('rejects fabricated Verifier and Daytona proof', () => {
  rejects(receipt => { receipt.verifier_tool_calls[0].thread_id = 'different-child'; }, /Verifier calls/);
  rejects(receipt => { receipt.verifier_tool_calls[1].tool = 'execute_rollback'; }, /Verifier did not/);
  rejects(receipt => { receipt.verifier_tool_calls[1].tool_call_id = receipt.verifier_tool_calls[0].tool_call_id; }, /distinct persisted identities/);
  rejects(receipt => { receipt.sandbox_references[0] = {}; }, /Daytona sandbox reference/);
  rejects(receipt => { receipt.sandbox_exec_calls[0].sandbox_id_sha256 = '0'.repeat(64); }, /uncorrelated/);
  rejects(receipt => { delete receipt.sandbox_exec_calls.at(-1).sandbox_id_sha256; }, /uncorrelated/);
  rejects(receipt => { receipt.sandbox_exec_calls[0].sandbox_command_evidence.no_write_attempt = false; }, /write-capable/);
  rejects(receipt => { receipt.sandbox_exec_calls.at(-1).validation_pass_observed = false; }, /passing read-only/);
});

test('rejects missing or reordered authority timestamps', () => {
  rejects(receipt => { delete receipt.human_decisions[0].decided_at; }, /timestamp is missing/);
  rejects(receipt => { receipt.human_decisions[0].decided_at = 'not-a-date'; }, /timestamp is invalid/);
  rejects(receipt => { receipt.human_decisions[0].decided_at = '2026-08-25T09:00:00Z'; }, /predates the approval request/);
  rejects(receipt => { receipt.postcondition_inspections[0].responded_at = '2026-08-25T09:00:00Z'; }, /postcondition does not follow/);
});

test('returns a stable adversarial-verification report', () => {
  const receipt = copy();
  receipt.executed_writes.push(structuredClone(receipt.executed_writes[0]));
  const report = validateReceiptReport(receipt);
  assert.equal(report.valid, false);
  assert.equal(report.code, 'WRITE_BUDGET_INVALID');
  assert.match(report.message, /exactly one executed write/);
});

test('returns a fail-closed report for malformed records', () => {
  const receipt = copy();
  receipt.verifier_tool_calls[0] = null;
  const report = validateReceiptReport(receipt);
  assert.deepEqual(report, {
    valid: false,
    code: 'RECEIPT_MALFORMED',
    message: 'Receipt structure is malformed and cannot establish authority.',
  });
});

test('validates the persisted Deny, Allow, and contract-refusal trial', async () => {
  const trial = JSON.parse(
    await readFile(new URL('../evidence/go-pivot-evidence-receipt.json', import.meta.url), 'utf8'),
  );
  const evidence = validateAuthorityTrial(trial);
  assert.equal(evidence.deny.decision, 'deny');
  assert.equal(evidence.allow.decision, 'allow');
  assert.equal(evidence.humanBlock.state_changed, false);
  assert.equal(evidence.contractBlock.state_changed, false);

  const fabricated = structuredClone(trial);
  fabricated.actions_blocked[0].state_changed = true;
  assert.throws(() => validateAuthorityTrial(fabricated), /no-write result/);

  const arbitraryApprovals = structuredClone(trial);
  arbitraryApprovals.approval_requests = [{}, {}];
  assert.throws(() => validateAuthorityTrial(arbitraryApprovals), /approval request provenance/);

  const uncorrelatedApproval = structuredClone(trial);
  uncorrelatedApproval.approval_requests[0].tool_call_id = 'different-call';
  assert.throws(() => validateAuthorityTrial(uncorrelatedApproval), /not correlated/);

  const duplicateApprovalEvent = structuredClone(trial);
  duplicateApprovalEvent.approval_requests[1].approval_event_id = duplicateApprovalEvent.approval_requests[0].approval_event_id;
  assert.throws(() => validateAuthorityTrial(duplicateApprovalEvent), /unique event identities/);

  const unrelatedExecution = structuredClone(trial);
  unrelatedExecution.actions_executed[0].tool = 'inspect_records';
  assert.throws(() => validateAuthorityTrial(unrelatedExecution), /governed executed write/);

  const unchangedExecution = structuredClone(trial);
  unchangedExecution.actions_executed[0].after = unchangedExecution.actions_executed[0].before;
  assert.throws(() => validateAuthorityTrial(unchangedExecution), /governed executed write/);
});

test('publishes the exact required verification checks in the JSON Schema', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../schemas/arcadeops-receipt-v2.1.0.schema.json', import.meta.url), 'utf8'),
  );
  const checks = schema.properties.verification_results;
  assert.deepEqual([...checks.required].sort(), [...REQUIRED_CHECKS].sort());
  assert.equal(checks.additionalProperties, false);
  for (const name of REQUIRED_CHECKS) assert.deepEqual(checks.properties[name], { const: true });
  for (const field of ['model_provider', 'model_name', 'sandbox_provider']) assert.ok(schema.required.includes(field));
});
