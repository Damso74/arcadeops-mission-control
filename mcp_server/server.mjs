import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const authorityPath = resolve(process.env.AUTHORITY_PATH ?? resolve(moduleDirectory, 'authority_contract.json'));
const seedPath = resolve(moduleDirectory, 'data', 'records.seed.json');
const statePath = resolve(process.env.STATE_PATH ?? resolve(moduleDirectory, 'data', 'records.json'));
const port = Number.parseInt(process.env.PORT ?? '8765', 10);
const pendingChangeTtlMs = 15 * 60 * 1000;

const authority = JSON.parse(await readFile(authorityPath, 'utf8'));
const mcpAuthToken = process.env.MCP_AUTH_TOKEN;
if (typeof mcpAuthToken !== 'string' || mcpAuthToken.length < 32) {
  throw new Error('MCP_AUTH_TOKEN must be set to at least 32 characters');
}
if (typeof authority.agent_identity !== 'string' || authority.agent_identity.length === 0) {
  throw new Error('AuthorityContract agent_identity must be a non-empty string');
}

function textResult(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function assertContractActive(missionId) {
  if (missionId !== authority.mission_id) {
    throw new Error('AUTHORITY_DENIED: mission_id does not match the active AuthorityContract');
  }
  const expiresAt = Date.parse(authority.expires_at);
  if (!Number.isFinite(expiresAt)) {
    throw new Error('AUTHORITY_DENIED: AuthorityContract expires_at is invalid');
  }
  if (Date.now() >= expiresAt) {
    throw new Error('AUTHORITY_DENIED: AuthorityContract has expired');
  }
}

function assertToolAllowed(toolName) {
  if (!authority.allowed_tools.includes(toolName)) {
    throw new Error(`AUTHORITY_DENIED: tool ${toolName} is not allowed`);
  }
}

function assertReadableResources() {
  for (const resource of ['incidents:demo', 'services:demo']) {
    if (!authority.readable_resources.includes(resource)) {
      throw new Error(`AUTHORITY_DENIED: ${resource} is not readable`);
    }
  }
}

function rollbackPermission(incidentId, serviceId, fromVersion, targetVersion) {
  return authority.write_permissions.find(
    item =>
      item.resource === 'services:demo' &&
      item.operation === 'rollback' &&
      item.incident_ids.includes(incidentId) &&
      item.service_ids.includes(serviceId) &&
      item.from_versions.includes(fromVersion) &&
      item.to_versions.includes(targetVersion),
  );
}

function assertRollbackAllowed(incidentId, serviceId, fromVersion, targetVersion) {
  const permission = rollbackPermission(incidentId, serviceId, fromVersion, targetVersion);
  if (!permission) {
    throw new Error(`AUTHORITY_DENIED: rollback ${serviceId} ${fromVersion} -> ${targetVersion} is not allowed`);
  }
  return permission;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function secureEquals(left, right) {
  return timingSafeEqual(Buffer.from(digest(left), 'hex'), Buffer.from(digest(right), 'hex'));
}

async function ensureState() {
  await mkdir(dirname(statePath), { recursive: true });
  try {
    await readFile(statePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(statePath, await readFile(seedPath, 'utf8'), { encoding: 'utf8', flag: 'wx' });
  }
}

async function readState() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (state.schema_version !== 2) {
    throw new Error('STATE_SCHEMA_MISMATCH: Safe Rollback requires schema_version 2');
  }
  if (!Array.isArray(state.incidents) || !Array.isArray(state.services) || !Array.isArray(state.audit_log)) {
    throw new Error('STATE_INVALID: incidents, services, and audit_log must be arrays');
  }
  if (state.pending_changes === undefined) {
    state.pending_changes = [];
  } else if (!Array.isArray(state.pending_changes)) {
    throw new Error('STATE_INVALID: pending_changes must be an array');
  }
  return state;
}

async function writeState(state) {
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
}

let stateQueue = Promise.resolve();

function withStateLock(mutation) {
  const run = stateQueue.then(() => mutation());
  stateQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function recordAttempt(tool, missionId, details, outcome) {
  await withStateLock(async () => {
    const state = await readState();
    state.audit_log.push({
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      tool,
      mission_id: missionId,
      details,
      outcome,
    });
    await writeState(state);
  });
}

async function recordAttemptBestEffort(tool, missionId, details, outcome) {
  try {
    await recordAttempt(tool, missionId, details, outcome);
  } catch (error) {
    console.error(
      `Failed to append ${outcome} audit event for ${tool}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function runGoverned(toolName, missionId, details, operation) {
  try {
    assertContractActive(missionId);
    assertToolAllowed(toolName);
    const payload = await operation();
    await recordAttempt(toolName, missionId, details, 'allowed');
    return textResult(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = message.startsWith('AUTHORITY_DENIED') ? 'blocked' : 'error';
    await recordAttemptBestEffort(toolName, missionId, details, outcome);
    return textResult({ error: message }, true);
  }
}

function incidentSnapshot(state, incidentId) {
  const incident = state.incidents.find(item => item.id === incidentId);
  if (!incident) throw new Error(`INCIDENT_NOT_FOUND: ${incidentId}`);
  const service = state.services.find(item => item.id === incident.service_id);
  if (!service) throw new Error(`SERVICE_NOT_FOUND: ${incident.service_id}`);
  return { incident, service };
}

function buildServer() {
  const server = new McpServer(
    { name: 'arcadeops-safe-rollback', version: '0.2.0' },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'inspect_incident',
    {
      title: 'Inspect a fictional service incident',
      description: 'Read the incident and current service health covered by the active AuthorityContract.',
      inputSchema: { mission_id: z.string(), incident_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id, incident_id }) =>
      runGoverned('inspect_incident', mission_id, { incident_id }, async () => {
        assertReadableResources();
        const state = await readState();
        const { incident, service } = incidentSnapshot(state, incident_id);
        return { mission_id, incident, service };
      }),
  );

  server.registerTool(
    'prepare_rollback',
    {
      title: 'Prepare a governed service rollback',
      description: 'Validate authority and return a state-bound rollback plan without changing service state.',
      inputSchema: {
        mission_id: z.string(),
        incident_id: z.string(),
        service_id: z.string(),
        target_version: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id, incident_id, service_id, target_version }) =>
      runGoverned('prepare_rollback', mission_id, { incident_id, service_id, target_version }, async () => {
        assertReadableResources();
        return withStateLock(async () => {
          const state = await readState();
          const { incident, service } = incidentSnapshot(state, incident_id);
          if (incident.service_id !== service_id) {
            throw new Error('AUTHORITY_DENIED: incident and service do not match');
          }
          if (incident.status !== 'open') {
            throw new Error(`AUTHORITY_DENIED: incident ${incident_id} is not open`);
          }
          assertRollbackAllowed(incident_id, service_id, service.deployed_version, target_version);
          const changeToken = randomBytes(32).toString('hex');
          const issuedAt = Date.now();
          state.pending_changes.push({
            mission_id,
            incident_id,
            service_id,
            from_version: service.deployed_version,
            target_version,
            token_digest: digest(changeToken),
            issued_at: new Date(issuedAt).toISOString(),
            expires_at: new Date(issuedAt + pendingChangeTtlMs).toISOString(),
          });
          await writeState(state);
          return {
            mission_id,
            rollback_plan: {
              incident_id,
              service_id,
              from_version: service.deployed_version,
              to_version: target_version,
              error_rate_before: service.error_rate_percent,
              expected_error_rate_after: service.stable_error_rate_percent,
              healthy_threshold_percent: service.healthy_threshold_percent,
            },
            change_token: changeToken,
            applied: false,
          };
        });
      }),
  );

  server.registerTool(
    'execute_rollback',
    {
      title: 'Execute an approval-gated service rollback',
      description: 'Execute the prepared rollback. TrueForge must obtain human approval before invoking this write tool.',
      inputSchema: {
        mission_id: z.string(),
        incident_id: z.string(),
        service_id: z.string(),
        target_version: z.string(),
        change_token: z.string().length(64),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ mission_id, incident_id, service_id, target_version, change_token }) =>
      runGoverned('execute_rollback', mission_id, { incident_id, service_id, target_version }, async () =>
        withStateLock(async () => {
          const state = await readState();
          const { incident, service } = incidentSnapshot(state, incident_id);
          if (incident.service_id !== service_id) {
            throw new Error('AUTHORITY_DENIED: incident and service do not match');
          }
          const permission = assertRollbackAllowed(incident_id, service_id, service.deployed_version, target_version);
          if (incident.status !== 'open') {
            throw new Error(`AUTHORITY_DENIED: incident ${incident_id} is not open`);
          }
          const executedCount = state.audit_log.filter(
            event =>
              event.mission_id === mission_id &&
              event.tool === 'execute_rollback' &&
              event.outcome === 'executed',
          ).length;
          if (executedCount >= permission.max_writes) {
            throw new Error(`AUTHORITY_DENIED: maximum write count ${permission.max_writes} reached`);
          }
          const pending = state.pending_changes.find(
            item => item.mission_id === mission_id
              && item.incident_id === incident_id
              && item.service_id === service_id
              && item.from_version === service.deployed_version
              && item.target_version === target_version
              && secureEquals(item.token_digest, digest(change_token)),
          );
          if (!pending) {
            throw new Error('AUTHORITY_DENIED: change_token was not issued for the current service state and rollback plan');
          }
          const tokenExpiresAt = Date.parse(pending.expires_at);
          if (!Number.isFinite(tokenExpiresAt) || Date.now() >= tokenExpiresAt) {
            throw new Error('AUTHORITY_DENIED: change_token is invalid or expired');
          }
          state.pending_changes = state.pending_changes.filter(
            item => item.mission_id !== mission_id
              || item.incident_id !== incident_id
              || item.service_id !== service_id,
          );

          const before = {
            deployed_version: service.deployed_version,
            error_rate_percent: service.error_rate_percent,
            status: service.status,
          };
          service.deployed_version = target_version;
          service.error_rate_percent = service.stable_error_rate_percent;
          service.status = service.error_rate_percent <= service.healthy_threshold_percent ? 'healthy' : 'degraded';

          const actionId = randomUUID();
          incident.status = 'resolved';
          incident.resolved_by_action_id = actionId;
          const after = {
            deployed_version: service.deployed_version,
            error_rate_percent: service.error_rate_percent,
            status: service.status,
          };
          state.audit_log.push({
            event_id: randomUUID(),
            occurred_at: new Date().toISOString(),
            tool: 'execute_rollback',
            mission_id,
            details: { incident_id, service_id, before, after, action_id: actionId },
            outcome: 'executed',
          });
          await writeState(state);
          return {
            mission_id,
            action_id: actionId,
            incident_id,
            service_id,
            before,
            after,
            recovered: after.status === 'healthy',
            applied: true,
          };
        }),
      ),
  );

  server.registerTool(
    'export_evidence',
    {
      title: 'Export Safe Rollback evidence',
      description: 'Return fictional service state, incidents, the AuthorityContract, and append-only audit events.',
      inputSchema: { mission_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id }) =>
      runGoverned('export_evidence', mission_id, {}, async () => {
        assertReadableResources();
        const state = await readState();
        return {
          mission_id,
          authority_contract: authority,
          services: state.services,
          incidents: state.incidents,
          audit_log: state.audit_log.filter(event => event.mission_id === mission_id),
        };
      }),
  );

  return server;
}

await ensureState();

const app = createMcpExpressApp({ host: '0.0.0.0' });
app.get('/healthz', (_request, response) => response.json({ status: 'ok', service: 'safe-rollback-mcp' }));
app.post('/mcp', async (request, response) => {
  const authorization = request.get('authorization') ?? '';
  const claimedIdentity = request.get('x-agent-identity') ?? '';
  if (!secureEquals(authorization, `Bearer ${mcpAuthToken}`) || claimedIdentity !== authority.agent_identity) {
    await recordAttemptBestEffort(
      'mcp_authenticate',
      authority.mission_id,
      { claimed_identity: claimedIdentity || null },
      'blocked',
    );
    response
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
    return;
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error('MCP request failed', error instanceof Error ? error.message : String(error));
    if (!response.headersSent) {
      response.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});
app.get('/mcp', (_request, response) => response.status(405).set('Allow', 'POST').send('Method Not Allowed'));
app.delete('/mcp', (_request, response) => response.status(405).set('Allow', 'POST').send('Method Not Allowed'));

const httpServer = app.listen(port, '0.0.0.0');
httpServer.on('error', error => {
  console.error('Failed to start Safe Rollback MCP server', error);
  process.exit(1);
});
httpServer.on('listening', () => {
  const address = httpServer.address();
  console.log(`Safe Rollback MCP server listening on ${typeof address === 'object' && address ? address.port : port}`);
});
