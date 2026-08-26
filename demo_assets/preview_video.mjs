import { chromium } from "file:///C:/Users/credo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fractions = [0.04, 0.15, 0.28, 0.44, 0.60, 0.75, 0.87, 0.97];
  for (let index = 0; index < fractions.length; index += 1) {
    await page.goto(`http://127.0.0.1:4173/demo_assets/video-final.html?preview=${fractions[index]}`, { waitUntil: "load" });
    await page.waitForFunction(() => !document.querySelector("#record")?.disabled);
    await page.waitForTimeout(180);
    await page.locator("#stage").screenshot({
      path: `C:/Users/credo/Documents/ChatGPT/True Forge/demo_assets/preview-${index + 1}.png`,
    });
    console.log(`PREVIEW_${index + 1}=${fractions[index].toFixed(2)}`);
  }
  console.log("PREVIEWS=8");
} finally {
  await browser.close();
}
