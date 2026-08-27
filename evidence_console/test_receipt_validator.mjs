import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { REQUIRED_CHECKS, validateReceipt } from './receipt-validator.mjs';

const sourceReceipt = JSON.parse(
  await readFile(new URL('../evidence/submission-evidence-receipt.json', import.meta.url), 'utf8'),
);
const copy = () => structuredClone(sourceReceipt);
const rejects = (mutate, pattern = /Receipt rejected:/) => {
  const receipt = copy();
  mutate(receipt);
  assert.throws(() => validateReceipt(receipt), pattern);
};

test('accepts the complete persisted receipt', () => {
  const evidence = validateReceipt(copy());
  assert.equal(Object.keys(evidence.checks).length, REQUIRED_CHECKS.length);
  assert.equal(evidence.write.response.recovered, true);
  assert.equal(evidence.verifierRespondedAt, '2026-08-25T09:38:04.695Z');
});

test('derives the Verifier time from its correlated calls', () => {
  const receipt = copy();
  receipt.precondition_inspections = receipt.precondition_inspections.filter(item => item.thread_id === 'main');
  const evidence = validateReceipt(receipt);
  assert.equal(evidence.verifierRespondedAt, '2026-08-25T09:38:04.695Z');
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
  rejects(receipt => { receipt.human_decisions[0].event_type = 'model.message'; }, /decision provenance/);
  rejects(receipt => { receipt.human_decisions[0].input_type = 'user.message'; }, /decision provenance/);
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
