export const REQUIRED_CHECKS = Object.freeze([
  'submission_agent_resolved',
  'all_turns_terminal',
  'exactly_one_verifier',
  'verifier_used_real_mcp',
  'verifier_never_attempted_write',
  'daytona_provider_ready',
  'daytona_sandbox_created',
  'sandbox_exec_observed',
  'sandbox_generated_code_uses_mcp_bridge',
  'sandbox_validator_read_only',
  'sandbox_validation_pass_observed',
  'sandbox_validation_before_write',
  'native_approval_pause_for_write',
  'human_allow_for_write',
  'write_response_after_human_allow',
  'authorized_rollback_executed_once',
  'precondition_inspection_observed',
  'precondition_before_write',
  'postcondition_inspection_observed',
  'postcondition_after_write',
  'service_recovered_on_target_version',
  'model_identity_resolved',
]);

const fail = message => {
  throw new Error(`Receipt rejected: ${message}`);
};

const requireThat = (condition, message) => {
  if (!condition) fail(message);
};

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const isMetric = value => typeof value === 'number' && Number.isFinite(value);

const requireExactChecks = checks => {
  requireThat(isRecord(checks), 'verification_results must be an object');
  const actual = Object.keys(checks).sort();
  const expected = [...REQUIRED_CHECKS].sort();
  requireThat(
    actual.length === expected.length && actual.every((name, index) => name === expected[index]),
    'verification_results is incomplete or contains unknown checks',
  );
  requireThat(REQUIRED_CHECKS.every(name => checks[name] === true), 'every required check must be true');
};

const requireInspection = ({ inspection, receipt, expectedVersion, incidentStatus, serviceStatus }) => {
  requireThat(isRecord(inspection), 'inspection evidence is malformed');
  requireThat(inspection.tool === 'inspect_incident', 'inspection tool is not inspect_incident');
  requireThat(inspection.mission_id === receipt.mission_id, 'inspection mission_id does not match');
  const response = inspection.response;
  const incident = response?.incident;
  const service = response?.service;
  requireThat(response?.mission_id === receipt.mission_id, 'inspection response mission_id does not match');
  requireThat(incident?.id === receipt.incident_id, 'inspection incident_id does not match');
  requireThat(incident?.service_id === receipt.service_id, 'inspection incident service_id does not match');
  requireThat(service?.id === receipt.service_id, 'inspection service_id does not match');
  requireThat(service?.deployed_version === expectedVersion, 'inspection version does not match');
  requireThat(incident?.status === incidentStatus, 'inspection incident status does not match');
  requireThat(service?.status === serviceStatus, 'inspection service status does not match');
  requireThat(isMetric(service?.error_rate_percent), 'inspection error rate is not numeric');
  requireThat(isMetric(service?.healthy_threshold_percent), 'inspection threshold is not numeric');
  return { incident, service };
};

export function validateReceipt(receipt) {
  requireThat(isRecord(receipt), 'root value must be an object');
  requireThat(receipt.schema_version === '2.0.0', 'unsupported schema_version');
  requireThat(receipt.receipt_kind === 'trueforge-safe-rollback-acceptance', 'unexpected receipt_kind');
  requireThat(receipt.final_status === 'SUBMISSION_ACCEPTANCE_PASS', 'final status is not passing');

  for (const field of [
    'mission_id',
    'incident_id',
    'service_id',
    'target_version',
    'session_id',
    'model_provider',
    'model_name',
    'sandbox_provider',
    'generated_at',
  ]) {
    requireThat(isNonEmptyString(receipt[field]), `${field} is missing`);
  }
  requireThat(receipt.sandbox_provider === 'daytona', 'sandbox provider is not Daytona');
  requireThat(Array.isArray(receipt.subagent_events) && receipt.subagent_events.length === 1, 'exactly one Verifier is required');
  requireThat(receipt.subagent_events[0]?.name === 'Verifier', 'Verifier identity is missing');
  requireThat(Array.isArray(receipt.sandbox_references) && receipt.sandbox_references.length > 0, 'sandbox evidence is missing');
  requireExactChecks(receipt.verification_results);

  requireThat(Array.isArray(receipt.executed_writes) && receipt.executed_writes.length === 1, 'exactly one executed write is required');
  requireThat(Array.isArray(receipt.approval_correlated_writes) && receipt.approval_correlated_writes.length === 1, 'exactly one approval-correlated write is required');
  requireThat(Array.isArray(receipt.write_calls) && receipt.write_calls.length === 1, 'exactly one write attempt is required');
  requireThat(Array.isArray(receipt.approval_requests) && receipt.approval_requests.length === 1, 'exactly one approval request is required');
  requireThat(Array.isArray(receipt.human_decisions) && receipt.human_decisions.length === 1, 'exactly one human decision is required');

  const write = receipt.executed_writes[0];
  const correlatedWrite = receipt.approval_correlated_writes[0];
  const writeCall = receipt.write_calls[0];
  const approval = receipt.approval_requests[0];
  const decision = receipt.human_decisions[0];
  const callId = write.tool_call_id;
  requireThat(isNonEmptyString(callId), 'write tool_call_id is missing');
  requireThat(
    [correlatedWrite.tool_call_id, writeCall.tool_call_id, approval.tool_call_id, decision.tool_call_id]
      .every(candidate => candidate === callId),
    'approval, decision, write attempt, and executed write are not correlated',
  );
  requireThat(decision.decision === 'allow' && decision.actor === 'human_via_trueforge_ui', 'human Allow evidence is missing');
  requireThat(write.tool === 'execute_rollback' && writeCall.tool === 'execute_rollback', 'write tool is not execute_rollback');
  requireThat(write.mission_id === receipt.mission_id && correlatedWrite.mission_id === receipt.mission_id, 'write mission_id does not match');

  const response = write.response;
  requireThat(response?.mission_id === receipt.mission_id, 'write response mission_id does not match');
  requireThat(response?.incident_id === receipt.incident_id, 'write response incident_id does not match');
  requireThat(response?.service_id === receipt.service_id, 'write response service_id does not match');
  requireThat(response?.applied === true && response?.recovered === true, 'write did not apply a recovery');
  requireThat(isNonEmptyString(response?.action_id), 'write action_id is missing');
  requireThat(isNonEmptyString(response?.before?.deployed_version), 'previous version is missing');
  requireThat(response.before.deployed_version !== receipt.target_version, 'rollback must change the deployed version');
  requireThat(response.before.status === 'degraded', 'write pre-state is not degraded');
  requireThat(response.after?.deployed_version === receipt.target_version, 'write target version does not match');
  requireThat(response.after?.status === 'healthy', 'write post-state is not healthy');
  requireThat(isMetric(response.before.error_rate_percent) && isMetric(response.after.error_rate_percent), 'write metrics are missing');

  requireThat(Array.isArray(receipt.precondition_inspections) && receipt.precondition_inspections.length > 0, 'precondition inspection is missing');
  const preconditions = receipt.precondition_inspections.map(inspection => requireInspection({
    inspection,
    receipt,
    expectedVersion: response.before.deployed_version,
    incidentStatus: 'open',
    serviceStatus: 'degraded',
  }));
  requireThat(preconditions.every(({ incident, service }) => (
    incident.rollback_target === receipt.target_version
    && service.stable_version === receipt.target_version
    && service.error_rate_percent === response.before.error_rate_percent
    && service.error_rate_percent > service.healthy_threshold_percent
  )), 'precondition does not establish the claimed rollback target and degraded metrics');

  requireThat(Array.isArray(receipt.postcondition_inspections) && receipt.postcondition_inspections.length > 0, 'postcondition inspection is missing');
  const postconditions = receipt.postcondition_inspections.map(inspection => requireInspection({
    inspection,
    receipt,
    expectedVersion: receipt.target_version,
    incidentStatus: 'resolved',
    serviceStatus: 'healthy',
  }));
  requireThat(postconditions.every(({ incident, service }) => (
    incident.resolved_by_action_id === response.action_id
    && service.stable_version === receipt.target_version
    && service.error_rate_percent === response.after.error_rate_percent
    && service.error_rate_percent <= service.healthy_threshold_percent
  )), 'postcondition does not establish the correlated recovery');

  const precondition = receipt.precondition_inspections[0].response;
  const postcondition = receipt.postcondition_inspections.at(-1).response;
  return {
    checks: receipt.verification_results,
    write,
    precondition,
    postcondition,
    decision,
  };
}
