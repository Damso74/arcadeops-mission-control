import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const assetDirectory = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.DEMO_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const pageUrl = `${baseUrl}/demo_assets/video-final.html`;
const outputPath = path.resolve(
  process.env.DEMO_OUTPUT || path.join(assetDirectory, "arcadeops-trueforge-demo-cinematic.webm"),
);
const headless = process.env.DEMO_HEADLESS === "1";

const browser = await chromium.launch({
  // Headed rendering is the safe default: Chromium can throttle MediaRecorder canvas
  // frames in headless mode. Set DEMO_HEADLESS=1 only in an environment proven safe.
  headless,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "load" });
  await page.locator("#record").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#record")?.disabled);

  const ready = await page.locator("#status").innerText();
  console.log(`RENDER_READY=${ready}`);

  const downloadPromise = page.waitForEvent("download", { timeout: 240_000 });
  await page.locator("#record").click();

  const progressTimer = setInterval(async () => {
    try {
      const progress = await page.evaluate(() => {
        const audio = document.querySelector("#narration");
        return {
          currentTime: audio?.currentTime ?? 0,
          duration: audio?.duration ?? 0,
          playbackRate: audio?.playbackRate ?? 0,
        };
      });
      console.log(
        `RENDER_PROGRESS=${progress.currentTime.toFixed(1)}/${progress.duration.toFixed(1)}@${progress.playbackRate.toFixed(2)}x`,
      );
    } catch {
      // The page may be finalizing the download.
    }
  }, 30_000);

  try {
    const download = await downloadPromise;
    await download.saveAs(outputPath);
  } finally {
    clearInterval(progressTimer);
  }

  console.log(`VIDEO_OUTPUT=${outputPath}`);
} finally {
  await browser.close();
}
