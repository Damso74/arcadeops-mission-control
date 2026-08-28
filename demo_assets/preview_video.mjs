import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const assetDirectory = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.DEMO_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const narration = process.env.DEMO_NARRATION || "narration-final.wav";
if (path.basename(narration) !== narration) {
  throw new Error("DEMO_NARRATION must name a file inside demo_assets");
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fractions = [0.04, 0.15, 0.28, 0.44, 0.60, 0.75, 0.84, 0.88, 0.91, 0.97];
  for (let index = 0; index < fractions.length; index += 1) {
    const query = new URLSearchParams({ preview: String(fractions[index]), audio: narration });
    await page.goto(`${baseUrl}/demo_assets/video-final.html?${query}`, { waitUntil: "load" });
    await page.waitForFunction(() => !document.querySelector("#record")?.disabled);
    await page.waitForTimeout(180);
    await page.locator("#stage").screenshot({
      path: path.join(assetDirectory, `preview-${index + 1}.png`),
    });
    console.log(`PREVIEW_${index + 1}=${fractions[index].toFixed(2)}`);
  }
  console.log(`PREVIEWS=${fractions.length}`);
} finally {
  await browser.close();
}
