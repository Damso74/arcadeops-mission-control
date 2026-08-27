// Black-box test of the Safe Rollback MCP server over Streamable HTTP.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const serverPath = resolve(packageDirectory, 'server.mjs');
const seedPath = resolve(packageDirectory, 'data', 'records.seed.json');
const shippedAuthorityPath = resolve(packageDirectory, 'authority_contract.json');

const STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const EXPECTED_TOOLS = ['execute_rollback', 'export_evidence', 'inspect_incident', 'prepare_rollback'];
const TEST_AUTH_TOKEN = 'test-only-token-'.padEnd(64, 'x');
const TEST_AGENT_IDENTITY = 'arcadeops-mission-control';
// The shipped contract must keep a real expiry, and that expiry must stay far
// enough in the future to cover the submission review window. The bound is a
// fixed instant so the assertion never depends on when the suite is executed.
const MINIMUM_SHIPPED_EXPIRY_MS = Date.parse('2026-10-31T00:00:00Z');

async function startServer(environment) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: packageDirectory,
    env: { ...process.env, PORT: '0', MCP_AUTH_TOKEN: TEST_AUTH_TOKEN, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let output = '';
  const collect = chunk => {
    output += chunk;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  try {
    const port = await new Promise((resolvePort, rejectPort) => {
      const timer = setTimeout(
        () => finish(() => rejectPort(new Error(`server did not report a port within ${STARTUP_TIMEOUT_MS}ms:\n${output}`))),
        STARTUP_TIMEOUT_MS,
      );
      timer.unref();
      const onData = () => {
        const match = /listening on (\d+)/.exec(output);
        if (match) finish(() => resolvePort(Number.parseInt(match[1], 10)));
      };
      const onExit = code => finish(() => rejectPort(new Error(`server exited early with code ${code}:\n${output}`)));
      function finish(settle) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        child.off('exit', onExit);
        settle();
      }
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', onExit);
    });
    return { child, port };
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  child.kill();
  await exited;
  clearTimeout(timer);
}

describe('Shipped AuthorityContract', () => {
  it('keeps a bounded expiry that still covers the review window', async () => {
    const shipped = JSON.parse(await readFile(shippedAuthorityPath, 'utf8'));

    assert.ok(
      Object.hasOwn(shipped, 'expires_at'),
      'the shipped AuthorityContract must keep an expires_at bound',
    );
    assert.equal(typeof shipped.expires_at, 'string');

    const expiresAt = Date.parse(shipped.expires_at);
    assert.ok(Number.isFinite(expiresAt), `expires_at is not a parseable instant: ${shipped.expires_at}`);
    assert.ok(
      expiresAt >= MINIMUM_SHIPPED_EXPIRY_MS,
      `expires_at ${shipped.expires_at} is earlier than the required 2026-10-31T00:00:00Z bound`,
    );
  });
});

describe('Safe Rollback MCP server (black-box)', { timeout: 120_000 }, () => {
  let workspace;
  let child;
  let baseUrl;
  let client;
  let authority;
  let missionId;
  let seed;
  let preparedToken;

  before(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'trueforge-safe-rollback-'));
    const statePath = join(workspace, 'state.json');
    const authorityPath = join(workspace, 'authority_contract.json');

    seed = JSON.parse(await readFile(seedPath, 'utf8'));
    authority = JSON.parse(await readFile(shippedAuthorityPath, 'utf8'));
    missionId = authority.mission_id;
    authority = { ...authority, expires_at: new Date(Date.now() + 3_600_000).toISOString() };
    await writeFile(authorityPath, `${JSON.stringify(authority, null, 2)}\n`, 'utf8');

    const started = await startServer({ STATE_PATH: statePath, AUTHORITY_PATH: authorityPath });
    child = started.child;
    baseUrl = `http://127.0.0.1:${started.port}`;

    client = new Client({ name: 'trueforge-safe-rollback-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
          'X-Agent-Identity': TEST_AGENT_IDENTITY,
        },
      },
    }));
  });

  after(async () => {
    if (client) {
      try {
        await client.close();
      } catch {
        // The transport may already be gone.
      }
    }
    await stopServer(child);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  async function callTool(name, args) {
    const result = await client.callTool({ name, arguments: args });
    const textPart = result.content?.find(part => part.type === 'text');
    assert.ok(textPart, `tool ${name} returned no text content`);
    return { isError: result.isError === true, payload: JSON.parse(textPart.text) };
  }

  async function inspect(incidentId = 'INC-2026-042') {
    const result = await callTool('inspect_incident', { mission_id: missionId, incident_id: incidentId });
    assert.equal(result.isError, false);
    return result.payload;
  }

  async function evidence() {
    const result = await callTool('export_evidence', { mission_id: missionId });
    assert.equal(result.isError, false);
    return result.payload;
  }

  it('answers the health probe', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'safe-rollback-mcp' });
  });

  it('rejects unauthenticated and misidentified MCP requests before tool execution', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const unauthenticated = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body,
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.message, 'Unauthorized');

    const misidentified = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        'X-Agent-Identity': 'another-agent',
      },
      body,
    });
    assert.equal(misidentified.status, 401);
  });

  it('discovers exactly the four tools declared by the AuthorityContract', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name).sort();
    assert.deepEqual(names, EXPECTED_TOOLS);
    assert.deepEqual(names, [...authority.allowed_tools].sort());

    const byName = new Map(tools.map(tool => [tool.name, tool]));
    for (const readOnlyTool of ['inspect_incident', 'prepare_rollback', 'export_evidence']) {
      assert.equal(byName.get(readOnlyTool).annotations.readOnlyHint, true);
    }
    assert.equal(byName.get('execute_rollback').annotations.readOnlyHint, false);
    assert.equal(byName.get('execute_rollback').annotations.destructiveHint, true);
    assert.ok(byName.get('execute_rollback').inputSchema.properties.change_token);
  });

  it('inspects the degraded fictional checkout incident without mutation', async () => {
    const payload = await inspect();
    const expectedIncident = seed.incidents.find(item => item.id === 'INC-2026-042');
    const expectedService = seed.services.find(item => item.id === 'checkout-api');
    assert.deepEqual(payload.incident, expectedIncident);
    assert.deepEqual(payload.service, expectedService);
    assert.equal(payload.service.status, 'degraded');
    assert.equal(payload.service.error_rate_percent, 18.4);
  });

  it('rejects a rollback token forged from public mission and service inputs', async () => {
    const forgedToken = createHash('sha256')
      .update([missionId, 'INC-2026-042', 'checkout-api', 'v42', 'v41', 18.4, 'degraded'].join('\n'))
      .digest('hex');
    const result = await callTool('execute_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
      change_token: forgedToken,
    });
    assert.equal(result.isError, true);
    assert.match(result.payload.error, /^AUTHORITY_DENIED: change_token/);
  });

  it('prepares a state-bound rollback plan without changing service state', async () => {
    const result = await callTool('prepare_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
    });

    assert.equal(result.isError, false);
    assert.equal(result.payload.applied, false);
    assert.deepEqual(result.payload.rollback_plan, {
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      from_version: 'v42',
      to_version: 'v41',
      error_rate_before: 18.4,
      expected_error_rate_after: 0.7,
      healthy_threshold_percent: 2,
    });
    assert.match(result.payload.change_token, /^[0-9a-f]{64}$/);
    preparedToken = result.payload.change_token;

    const second = await callTool('prepare_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
    });
    assert.equal(second.isError, false);
    assert.notEqual(second.payload.change_token, preparedToken);

    const snapshot = await inspect();
    assert.equal(snapshot.service.deployed_version, 'v42');
    assert.equal(snapshot.incident.status, 'open');
  });

  it('rejects an invalid token and preserves the degraded state', async () => {
    const result = await callTool('execute_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
      change_token: 'f'.repeat(64),
    });

    assert.equal(result.isError, true);
    assert.match(result.payload.error, /^AUTHORITY_DENIED: change_token/);
    assert.equal((await inspect()).service.deployed_version, 'v42');
  });

  it('allows exactly one concurrent rollback and records recovery', async () => {
    const request = {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
      change_token: preparedToken,
    };
    const results = await Promise.all([callTool('execute_rollback', request), callTool('execute_rollback', request)]);
    assert.deepEqual(
      results.map(result => result.isError).sort(),
      [false, true],
    );

    const success = results.find(result => !result.isError).payload;
    assert.equal(success.applied, true);
    assert.equal(success.recovered, true);
    assert.deepEqual(success.before, { deployed_version: 'v42', error_rate_percent: 18.4, status: 'degraded' });
    assert.deepEqual(success.after, { deployed_version: 'v41', error_rate_percent: 0.7, status: 'healthy' });

    const snapshot = await inspect();
    assert.equal(snapshot.service.deployed_version, 'v41');
    assert.equal(snapshot.service.status, 'healthy');
    assert.equal(snapshot.incident.status, 'resolved');
    assert.equal(snapshot.incident.resolved_by_action_id, success.action_id);

    const executed = (await evidence()).audit_log.filter(
      event => event.tool === 'execute_rollback' && event.outcome === 'executed',
    );
    assert.equal(executed.length, 1);
    assert.equal(executed[0].details.action_id, success.action_id);
  });

  it('rejects replay after the service state changed', async () => {
    const result = await callTool('execute_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-042',
      service_id: 'checkout-api',
      target_version: 'v41',
      change_token: preparedToken,
    });

    assert.equal(result.isError, true);
    assert.match(result.payload.error, /^AUTHORITY_DENIED:/);
    assert.equal((await inspect()).service.deployed_version, 'v41');
  });

  it('blocks preparation for an out-of-scope service', async () => {
    const result = await callTool('prepare_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-077',
      service_id: 'identity-api',
      target_version: 'v11',
    });

    assert.equal(result.isError, true);
    assert.equal(result.payload.error, 'AUTHORITY_DENIED: incident INC-2026-077 is not open');
    const snapshot = await inspect('INC-2026-077');
    assert.equal(snapshot.service.deployed_version, 'v12');
  });

  it('blocks direct execution for an out-of-scope service', async () => {
    const result = await callTool('execute_rollback', {
      mission_id: missionId,
      incident_id: 'INC-2026-077',
      service_id: 'identity-api',
      target_version: 'v11',
      change_token: 'a'.repeat(64),
    });

    assert.equal(result.isError, true);
    assert.equal(result.payload.error, 'AUTHORITY_DENIED: rollback identity-api v12 -> v11 is not allowed');
    assert.equal((await inspect('INC-2026-077')).service.deployed_version, 'v12');
  });

  it('exports a complete mission-scoped evidence trail', async () => {
    const payload = await evidence();
    assert.equal(payload.authority_contract.mission_id, missionId);
    assert.deepEqual(payload.authority_contract.write_permissions[0].service_ids, ['checkout-api']);
    assert.equal(payload.services.find(item => item.id === 'checkout-api').status, 'healthy');
    assert.equal(payload.incidents.find(item => item.id === 'INC-2026-042').status, 'resolved');
    assert.ok(payload.audit_log.length > 0);
    assert.ok(payload.audit_log.every(event => event.mission_id === missionId));
    const outcomes = new Set(payload.audit_log.map(event => event.outcome));
    assert.ok(outcomes.has('allowed'));
    assert.ok(outcomes.has('executed'));
    assert.ok(outcomes.has('blocked'));
  });

  it('audits concurrent refusals and inspections without losing events', async () => {
    const countBlockedPrepares = log =>
      log.filter(
        event =>
          event.tool === 'prepare_rollback' &&
          event.outcome === 'blocked' &&
          event.details?.service_id === 'identity-api',
      ).length;
    const countAllowedInspections = log =>
      log.filter(event => event.tool === 'inspect_incident' && event.outcome === 'allowed').length;

    const before = (await evidence()).audit_log;
    const results = await Promise.all([
      callTool('prepare_rollback', {
        mission_id: missionId,
        incident_id: 'INC-2026-077',
        service_id: 'identity-api',
        target_version: 'v11',
      }),
      callTool('inspect_incident', { mission_id: missionId, incident_id: 'INC-2026-042' }),
      callTool('prepare_rollback', {
        mission_id: missionId,
        incident_id: 'INC-2026-077',
        service_id: 'identity-api',
        target_version: 'v11',
      }),
      callTool('inspect_incident', { mission_id: missionId, incident_id: 'INC-2026-077' }),
      callTool('prepare_rollback', {
        mission_id: missionId,
        incident_id: 'INC-2026-077',
        service_id: 'identity-api',
        target_version: 'v11',
      }),
      callTool('inspect_incident', { mission_id: missionId, incident_id: 'INC-2026-042' }),
    ]);
    assert.deepEqual(results.map(result => result.isError), [true, false, true, false, true, false]);

    const afterLog = (await evidence()).audit_log;
    assert.equal(countBlockedPrepares(afterLog), countBlockedPrepares(before) + 3);
    assert.equal(countAllowedInspections(afterLog), countAllowedInspections(before) + 3);
  });

  it('fails closed when AuthorityContract expires_at is malformed', async () => {
    const invalidWorkspace = await mkdtemp(join(tmpdir(), 'trueforge-invalid-authority-'));
    const invalidAuthorityPath = join(invalidWorkspace, 'authority_contract.json');
    const invalidStatePath = join(invalidWorkspace, 'records.json');
    await writeFile(
      invalidAuthorityPath,
      `${JSON.stringify({ ...authority, expires_at: 'not-a-date' }, null, 2)}\n`,
      'utf8',
    );
    const started = await startServer({ STATE_PATH: invalidStatePath, AUTHORITY_PATH: invalidAuthorityPath });
    const invalidClient = new Client({ name: 'invalid-authority-test', version: '1.0.0' });
    try {
      await invalidClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${started.port}/mcp`), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
            'X-Agent-Identity': TEST_AGENT_IDENTITY,
          },
        },
      }));
      const result = await invalidClient.callTool({
        name: 'inspect_incident',
        arguments: { mission_id: missionId, incident_id: 'INC-2026-042' },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /expires_at is invalid/);
    } finally {
      await invalidClient.close();
      await stopServer(started.child);
      await rm(invalidWorkspace, { recursive: true, force: true });
    }
  });

  it('refuses to start when the MCP bearer secret is absent', async () => {
    const missingSecretWorkspace = await mkdtemp(join(tmpdir(), 'trueforge-missing-secret-'));
    const missingSecretAuthorityPath = join(missingSecretWorkspace, 'authority_contract.json');
    const missingSecretStatePath = join(missingSecretWorkspace, 'records.json');
    await writeFile(missingSecretAuthorityPath, `${JSON.stringify(authority, null, 2)}\n`, 'utf8');
    try {
      await assert.rejects(
        startServer({
          STATE_PATH: missingSecretStatePath,
          AUTHORITY_PATH: missingSecretAuthorityPath,
          MCP_AUTH_TOKEN: '',
        }),
        /MCP_AUTH_TOKEN must be set/,
      );
    } finally {
      await rm(missingSecretWorkspace, { recursive: true, force: true });
    }
  });
});
