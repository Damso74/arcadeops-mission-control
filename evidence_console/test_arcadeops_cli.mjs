import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/arcadeops.mjs', import.meta.url));
const source = fileURLToPath(new URL('../evidence/submission-evidence-receipt.json', import.meta.url));

test('CLI verifies the canonical receipt as JSON', async () => {
  const { stdout } = await execFileAsync(process.execPath, [cli, 'verify', source, '--json']);
  const result = JSON.parse(stdout);
  assert.equal(result.valid, true);
  assert.equal(result.code, 'RECEIPT_VERIFIED');
  assert.equal(result.checks, 22);
});

test('CLI exits non-zero for a duplicated write', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'arcadeops-cli-'));
  try {
    const receipt = JSON.parse(await readFile(source, 'utf8'));
    receipt.executed_writes.push(structuredClone(receipt.executed_writes[0]));
    const tampered = join(workspace, 'tampered.json');
    await writeFile(tampered, JSON.stringify(receipt), 'utf8');

    await assert.rejects(
      execFileAsync(process.execPath, [cli, 'verify', tampered, '--json']),
      error => {
        const result = JSON.parse(error.stdout);
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WRITE_BUDGET_INVALID');
        return true;
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
