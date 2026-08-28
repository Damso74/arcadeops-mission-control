#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ReceiptValidationError,
  validateAuthorityTrial,
  validateReceiptReport,
} from '../evidence_console/receipt-validator.mjs';

const usage = () => {
  console.error('Usage: node bin/arcadeops.mjs verify <receipt.json> [--json]');
  process.exitCode = 2;
};

const [, , command, input, ...options] = process.argv;
if (command !== 'verify' || !input || options.some(option => option !== '--json')) {
  usage();
} else {
  const jsonOutput = options.includes('--json');
  try {
    const path = resolve(input);
    const receipt = JSON.parse(await readFile(path, 'utf8'));
    let result;

    if (receipt.receipt_kind === 'trueforge-go-pivot-acceptance') {
      const evidence = validateAuthorityTrial(receipt);
      result = {
        valid: true,
        code: 'AUTHORITY_TRIAL_VERIFIED',
        message: 'The persisted Deny, Allow, and contract-refusal outcomes are correlated.',
        mission_id: receipt.mission_id,
        session_id: receipt.session_id,
        writes: 1,
        human_denials: 1,
        contract_denials: 1,
        checks: Object.keys(evidence.checks).length,
      };
    } else {
      const report = validateReceiptReport(receipt);
      result = {
        valid: report.valid,
        code: report.code,
        message: report.message,
        mission_id: receipt.mission_id,
        session_id: receipt.session_id,
        writes: report.valid ? receipt.executed_writes.length : 0,
        checks: report.valid ? Object.keys(report.evidence.checks).length : 0,
      };
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
      console.log('ARCADEOPS RECEIPT VERIFIED');
      console.log(`Mission   ${result.mission_id}`);
      console.log(`Session   ${result.session_id}`);
      console.log(`Writes    ${result.writes}`);
      if (result.human_denials !== undefined) console.log(`Denied    ${result.human_denials} human / ${result.contract_denials} contract`);
      console.log(`Checks    ${result.checks}`);
      console.log(result.message);
    } else {
      console.error('ARCADEOPS RECEIPT REJECTED');
      console.error(`${result.code}: ${result.message}`);
    }

    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof ReceiptValidationError
      ? error.message
      : `Unable to verify receipt: ${error.message}`;
    if (options.includes('--json')) {
      console.log(JSON.stringify({ valid: false, code: 'RECEIPT_UNREADABLE', message }, null, 2));
    } else {
      console.error('ARCADEOPS RECEIPT REJECTED');
      console.error(message);
    }
    process.exitCode = 1;
  }
}
