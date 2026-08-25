// Black-box test of the governed operations MCP server.
// The server is started as a real child process on an ephemeral port, against a throwaway
// state file and a throwaway copy of the shipped AuthorityContract, and is only ever driven
// through the MCP Streamable HTTP endpoint.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
const EXPECTED_TOOLS = ['apply_status_change', 'export_evidence', 'inspect_records', 'prepare_status_change'];

async function startServer(environment) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: packageDirectory,
    env: { ...process.env, PORT: '0', ...environment },
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
    return { child, port, output: () => output };
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

describe('governed operations MCP server (black-box)', { timeout: 120_000 }, () => {
  let workspace;
  let child;
  let baseUrl;
  let client;
  let authority;
  let missionId;
  let seed;
  let preparedToken;

  before(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'trueforge-mcp-'));
    const statePath = join(workspace, 'records.json');
    const authorityPath = join(workspace, 'authority_contract.json');

    seed = JSON.parse(await readFile(seedPath, 'utf8'));
    authority = JSON.parse(await readFile(shippedAuthorityPath, 'utf8'));
    missionId = authority.mission_id;
    // Every shipped authority rule is kept; only the validity window is pushed forward so the
    // test stays reproducible once the demo contract has expired.
    authority = { ...authority, expires_at: new Date(Date.now() + 3_600_000).toISOString() };
    await writeFile(authorityPath, `${JSON.stringify(authority, null, 2)}\n`, 'utf8');

    const started = await startServer({ STATE_PATH: statePath, AUTHORITY_PATH: authorityPath });
    child = started.child;
    baseUrl = `http://127.0.0.1:${started.port}`;

    client = new Client({ name: 'trueforge-blackbox-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  });

  after(async () => {
    if (client) {
      try {
        await client.close();
      } catch {
        // the transport may already be gone; shutting the server down is what matters
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

  async function readRecords() {
    const { isError, payload } = await callTool('inspect_records', { mission_id: missionId });
    assert.equal(isError, false);
    return new Map(payload.records.map(record => [record.id, record]));
  }

  async function readAuditLog() {
    const { isError, payload } = await callTool('export_evidence', { mission_id: missionId });
    assert.equal(isError, false);
    return payload.audit_log;
  }

  function seedRecord(recordId) {
    return seed.records.find(record => record.id === recordId);
  }

  it('answers the health probe', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'governed-operations-mcp' });
  });

  it('discovers exactly the four governed tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name).sort();
    assert.deepEqual(names, EXPECTED_TOOLS);
    assert.deepEqual(names, [...authority.allowed_tools].sort(), 'advertised tools must match the AuthorityContract');

    const byName = new Map(tools.map(tool => [tool.name, tool]));
    for (const readOnlyTool of ['inspect_records', 'prepare_status_change', 'export_evidence']) {
      assert.equal(byName.get(readOnlyTool).annotations.readOnlyHint, true, `${readOnlyTool} must be advertised read-only`);
    }
    assert.equal(byName.get('apply_status_change').annotations.readOnlyHint, false);
    assert.ok(byName.get('apply_status_change').inputSchema.properties.change_token, 'the write tool must require a change_token');
  });

  it('inspects the seeded fictional records', async () => {
    const records = await readRecords();
    assert.equal(records.size, seed.records.length);
    for (const record of seed.records) {
      assert.deepEqual(records.get(record.id), record);
    }
    assert.equal(records.get('case-101').status, 'pending_review');
    assert.equal(records.get('case-102').status, 'verified');
  });

  it('prepares an authorized change on case-101 without mutating state', async () => {
    const { isError, payload } = await callTool('prepare_status_change', {
      mission_id: missionId,
      record_id: 'case-101',
      new_status: 'approved',
    });

    assert.equal(isError, false);
    assert.equal(payload.applied, false);
    assert.deepEqual(payload.diff, { record_id: 'case-101', field: 'status', before: 'pending_review', after: 'approved' });
    assert.match(payload.change_token, /^[0-9a-f]{64}$/);
    preparedToken = payload.change_token;

    assert.equal((await readRecords()).get('case-101').status, 'pending_review', 'prepare must not write');
  });

  it('applies the prepared change on case-101 and records before/after evidence', async () => {
    const { isError, payload } = await callTool('apply_status_change', {
      mission_id: missionId,
      record_id: 'case-101',
      new_status: 'approved',
      change_token: preparedToken,
    });

    assert.equal(isError, false);
    assert.equal(payload.applied, true);
    assert.equal(payload.before, 'pending_review');
    assert.equal(payload.after, 'approved');
    assert.ok(payload.action_id);

    assert.equal((await readRecords()).get('case-101').status, 'approved');

    const executed = (await readAuditLog()).filter(event => event.tool === 'apply_status_change' && event.outcome === 'executed');
    assert.equal(executed.length, 1);
    assert.deepEqual(executed[0].details, {
      record_id: 'case-101',
      before: 'pending_review',
      after: 'approved',
      action_id: payload.action_id,
    });
  });

  it('blocks a replayed change_token and leaves case-101 as applied', async () => {
    const { isError, payload } = await callTool('apply_status_change', {
      mission_id: missionId,
      record_id: 'case-101',
      new_status: 'approved',
      change_token: preparedToken,
    });

    assert.equal(isError, true);
    assert.match(payload.error, /^AUTHORITY_DENIED: change_token/);
    assert.equal((await readRecords()).get('case-101').status, 'approved');
  });

  it('blocks prepare_status_change on case-102 and audits it as blocked', async () => {
    const { isError, payload } = await callTool('prepare_status_change', {
      mission_id: missionId,
      record_id: 'case-102',
      new_status: 'approved',
    });

    assert.equal(isError, true);
    assert.equal(payload.error, 'AUTHORITY_DENIED: status write is not allowed for case-102');

    const entries = (await readAuditLog()).filter(
      event => event.tool === 'prepare_status_change' && event.details?.record_id === 'case-102',
    );
    assert.equal(entries.length, 1, 'the refusal must leave exactly one audit entry');
    const [entry] = entries;
    assert.equal(entry.outcome, 'blocked');
    assert.equal(entry.mission_id, missionId);
    assert.deepEqual(entry.details, { record_id: 'case-102', new_status: 'approved' });
    assert.ok(entry.event_id);
    assert.ok(Number.isFinite(Date.parse(entry.occurred_at)));
  });

  it('blocks apply_status_change on case-102 and audits it as blocked', async () => {
    const { isError, payload } = await callTool('apply_status_change', {
      mission_id: missionId,
      record_id: 'case-102',
      new_status: 'approved',
      change_token: 'f'.repeat(64),
    });

    assert.equal(isError, true);
    assert.equal(payload.error, 'AUTHORITY_DENIED: status write is not allowed for case-102');

    const entries = (await readAuditLog()).filter(
      event => event.tool === 'apply_status_change' && event.details?.record_id === 'case-102',
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, 'blocked');
  });

  it('leaves case-102 unchanged and exports a complete mission trail', async () => {
    assert.deepEqual((await readRecords()).get('case-102'), seedRecord('case-102'));

    const { isError, payload } = await callTool('export_evidence', { mission_id: missionId });
    assert.equal(isError, false);
    assert.equal(payload.authority_contract.mission_id, missionId);
    assert.deepEqual(payload.authority_contract.write_permissions[0].record_ids, ['case-101']);
    assert.ok(payload.audit_log.length > 0);
    assert.ok(
      payload.audit_log.every(event => event.mission_id === missionId),
      'evidence must only contain events of the current mission',
    );
    const outcomes = new Set(payload.audit_log.map(event => event.outcome));
    assert.ok(outcomes.has('allowed'));
    assert.ok(outcomes.has('executed'));
    assert.ok(outcomes.has('blocked'));
  });

  it('audits every concurrent attempt, refusals included', async () => {
    const countBlockedPrepares = log =>
      log.filter(event => event.tool === 'prepare_status_change' && event.outcome === 'blocked' && event.details?.record_id === 'case-102')
        .length;
    const countAllowedInspections = log => log.filter(event => event.tool === 'inspect_records' && event.outcome === 'allowed').length;

    const logBefore = await readAuditLog();

    const results = await Promise.all([
      callTool('prepare_status_change', { mission_id: missionId, record_id: 'case-102', new_status: 'approved' }),
      callTool('inspect_records', { mission_id: missionId }),
      callTool('prepare_status_change', { mission_id: missionId, record_id: 'case-102', new_status: 'needs_followup' }),
      callTool('inspect_records', { mission_id: missionId }),
      callTool('prepare_status_change', { mission_id: missionId, record_id: 'case-102', new_status: 'approved' }),
      callTool('inspect_records', { mission_id: missionId }),
    ]);
    assert.deepEqual(
      results.map(result => result.isError),
      [true, false, true, false, true, false],
    );

    const logAfter = await readAuditLog();
    assert.equal(countBlockedPrepares(logAfter), countBlockedPrepares(logBefore) + 3, 'no refusal may be lost under concurrency');
    assert.equal(countAllowedInspections(logAfter), countAllowedInspections(logBefore) + 3);
    assert.deepEqual((await readRecords()).get('case-102'), seedRecord('case-102'));
  });
});
