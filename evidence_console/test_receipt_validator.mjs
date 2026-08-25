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
    'precondition_inspections',
    'postcondition_inspections',
  ]) {
    rejects(receipt => { receipt[field] = []; });
  }
});

test('rejects uncorrelated approval and write identifiers', () => {
  rejects(receipt => { receipt.human_decisions[0].tool_call_id = 'different-call'; }, /not correlated/);
  rejects(receipt => { receipt.approval_correlated_writes[0].mission_id = 'different-mission'; }, /mission_id/);
});

test('rejects mismatched incident, service, version, action, and metrics', () => {
  rejects(receipt => { receipt.incident_id = 'different-incident'; }, /incident_id/);
  rejects(receipt => { receipt.service_id = 'different-service'; }, /service_id/);
  rejects(receipt => { receipt.target_version = 'v999'; }, /target version|rollback target/);
  rejects(receipt => { receipt.postcondition_inspections[0].response.incident.resolved_by_action_id = 'different-action'; }, /correlated recovery/);
  rejects(receipt => { receipt.postcondition_inspections[0].response.service.error_rate_percent = 99; }, /correlated recovery/);
});
