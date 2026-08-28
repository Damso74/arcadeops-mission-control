import { chromium } from 'playwright';

const baseUrl = (process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const consoleUrl = `${baseUrl}/evidence_console/`;
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const mutations = [
  'remove-approval',
  'duplicate-write',
  'change-target',
  'replace-sandbox',
  'reorder-events',
  'break-identity',
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(consoleUrl, { waitUntil: 'networkidle' });
    await page.locator('#console-root[data-evidence-status="pass"]').waitFor();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(dimensions.scrollWidth === dimensions.clientWidth, `${viewport.name}: horizontal overflow`);
    assert(await page.locator('.event-item').count() === 8, `${viewport.name}: incomplete event ledger`);
    assert(await page.locator('.trial-card:visible').count() === 3, `${viewport.name}: trial evidence missing`);
    assert(errors.length === 0, `${viewport.name}: console errors: ${errors.join('; ')}`);

    if (viewport.name === 'desktop') {
      await page.getByRole('tab', { name: 'Challenge' }).click();
      for (const mutation of mutations) {
        await page.locator(`[data-mutation="${mutation}"]`).click();
        assert(await page.locator('#challenge-result').getAttribute('data-result') === 'rejected', `${mutation}: accepted`);
        assert(await page.locator('#challenge-claims').innerText() === '0 displayed', `${mutation}: claims remained visible`);
      }
      await page.getByRole('tab', { name: 'Evidence' }).click();
      assert(await page.locator('#receipt-check-count').innerText() === '22', 'receipt check count mismatch');
      assert(await page.locator('#receipt-check-total').innerText() === '22', 'receipt check total mismatch');
    }
    await page.close();
  }

  const context = await browser.newContext();
  await context.route('**/submission-evidence-receipt.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{}',
  }));
  const failClosedPage = await context.newPage();
  await failClosedPage.goto(consoleUrl, { waitUntil: 'networkidle' });
  await failClosedPage.locator('#console-root[data-evidence-status="fail"]').waitFor();
  assert(await failClosedPage.locator('.failure-state').isVisible(), 'fail-closed state is not visible');
  assert(!(await failClosedPage.locator('.ledger').isVisible()), 'ledger remained visible after invalid receipt');
  await context.close();

  console.log(JSON.stringify({
    status: 'PASS',
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    mutations,
    failClosed: true,
  }, null, 2));
} finally {
  await browser.close();
}
