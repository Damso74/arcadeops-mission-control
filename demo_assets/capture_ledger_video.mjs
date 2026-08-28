import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const assetDirectory = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const consoleUrl = `${baseUrl}/evidence_console/`;
const outputs = {
  mission: path.join(assetDirectory, '05-authority-ledger.png'),
  challenge: path.join(assetDirectory, '06-challenge-rejected.png'),
  evidence: path.join(assetDirectory, '07-portable-evidence.png'),
};

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(consoleUrl, { waitUntil: 'networkidle' });
  await page.locator('#console-root[data-evidence-status="pass"]').waitFor();
  await page.locator('#workbench').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: outputs.mission });

  await page.getByRole('tab', { name: 'Challenge' }).click();
  await page.locator('[data-mutation="duplicate-write"]').click();
  await page.screenshot({ path: outputs.challenge });

  await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.screenshot({ path: outputs.evidence });
  console.log(JSON.stringify(outputs, null, 2));
} finally {
  await browser.close();
}
