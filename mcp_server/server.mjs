import { createHash, randomUUID } from 'node:crypto';
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

const authority = JSON.parse(await readFile(authorityPath, 'utf8'));

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
  if (Date.now() >= Date.parse(authority.expires_at)) {
    throw new Error('AUTHORITY_DENIED: AuthorityContract has expired');
  }
}

function assertToolAllowed(toolName) {
  if (!authority.allowed_tools.includes(toolName)) {
    throw new Error(`AUTHORITY_DENIED: tool ${toolName} is not allowed`);
  }
}

function assertReadableResource() {
  if (!authority.readable_resources.includes('records:demo')) {
    throw new Error('AUTHORITY_DENIED: records:demo is not readable');
  }
}

function assertWriteAllowed(recordId, status) {
  const permission = authority.write_permissions.find(
    item => item.resource === 'records:demo' && item.record_ids.includes(recordId) && item.fields.includes('status'),
  );
  if (!permission || !permission.allowed_values.includes(status)) {
    throw new Error(`AUTHORITY_DENIED: status write is not allowed for ${recordId}`);
  }
}

function changeToken(missionId, recordId, fromStatus, toStatus) {
  return createHash('sha256')
    .update(`${missionId}\n${recordId}\n${fromStatus}\n${toStatus}`)
    .digest('hex');
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
  return JSON.parse(await readFile(statePath, 'utf8'));
}

async function writeState(state) {
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
}

// The whole state file is rewritten on every append, so concurrent tool calls must not
// interleave their read-modify-write cycles: a lost update would silently drop evidence.
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
    // Never let an audit failure hide the denial itself from the caller.
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

function buildServer() {
  const server = new McpServer(
    { name: 'arcadeops-governed-operations', version: '0.1.0' },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'inspect_records',
    {
      title: 'Inspect fictional records',
      description: 'Read the fictional demo records covered by the active AuthorityContract.',
      inputSchema: { mission_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id }) =>
      runGoverned('inspect_records', mission_id, {}, async () => {
        assertReadableResource();
        const state = await readState();
        return { mission_id, records: state.records };
      }),
  );

  server.registerTool(
    'prepare_status_change',
    {
      title: 'Prepare a governed status change',
      description: 'Validate authority and return a structured diff without changing state.',
      inputSchema: {
        mission_id: z.string(),
        record_id: z.string(),
        new_status: z.enum(['approved', 'needs_followup']),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id, record_id, new_status }) =>
      runGoverned('prepare_status_change', mission_id, { record_id, new_status }, async () => {
        assertReadableResource();
        assertWriteAllowed(record_id, new_status);
        const state = await readState();
        const record = state.records.find(item => item.id === record_id);
        if (!record) throw new Error(`RECORD_NOT_FOUND: ${record_id}`);
        return {
          mission_id,
          diff: { record_id, field: 'status', before: record.status, after: new_status },
          change_token: changeToken(mission_id, record_id, record.status, new_status),
          applied: false,
        };
      }),
  );

  server.registerTool(
    'apply_status_change',
    {
      title: 'Apply an approval-gated status change',
      description: 'Apply the previously prepared status diff. TrueForge must obtain human approval before calling this write tool.',
      inputSchema: {
        mission_id: z.string(),
        record_id: z.string(),
        new_status: z.enum(['approved', 'needs_followup']),
        change_token: z.string().length(64),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id, record_id, new_status, change_token }) =>
      runGoverned('apply_status_change', mission_id, { record_id, new_status }, async () => {
        assertWriteAllowed(record_id, new_status);
        return withStateLock(async () => {
          const state = await readState();
          const record = state.records.find(item => item.id === record_id);
          if (!record) throw new Error(`RECORD_NOT_FOUND: ${record_id}`);
          const expectedToken = changeToken(mission_id, record_id, record.status, new_status);
          if (change_token !== expectedToken) {
            throw new Error('AUTHORITY_DENIED: change_token does not match current state and requested change');
          }
          const before = record.status;
          record.status = new_status;
          const actionId = randomUUID();
          state.audit_log.push({
            event_id: randomUUID(),
            occurred_at: new Date().toISOString(),
            tool: 'apply_status_change',
            mission_id,
            details: { record_id, before, after: new_status, action_id: actionId },
            outcome: 'executed',
          });
          await writeState(state);
          return { mission_id, action_id: actionId, record_id, before, after: new_status, applied: true };
        });
      }),
  );

  server.registerTool(
    'export_evidence',
    {
      title: 'Export governed operation evidence',
      description: 'Return the fictional record state and append-only MCP audit events for this mission.',
      inputSchema: { mission_id: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ mission_id }) =>
      runGoverned('export_evidence', mission_id, {}, async () => {
        assertReadableResource();
        const state = await readState();
        return {
          mission_id,
          authority_contract: authority,
          records: state.records,
          audit_log: state.audit_log.filter(event => event.mission_id === mission_id),
        };
      }),
  );

  return server;
}

await ensureState();

const app = createMcpExpressApp({ host: '0.0.0.0' });
app.get('/healthz', (_request, response) => response.json({ status: 'ok', service: 'governed-operations-mcp' }));
app.post('/mcp', async (request, response) => {
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
  console.error('Failed to start governed operations MCP server', error);
  process.exit(1);
});
httpServer.on('listening', () => {
  const address = httpServer.address();
  // PORT=0 binds an ephemeral port, so report the port that was actually bound.
  console.log(`Governed operations MCP server listening on ${typeof address === 'object' && address ? address.port : port}`);
});
