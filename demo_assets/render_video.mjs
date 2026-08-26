import { chromium } from "file:///C:/Users/credo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const pageUrl = "http://127.0.0.1:4173/demo_assets/video-final.html";
const outputPath = "C:/Users/credo/Documents/ChatGPT/True Forge/demo_assets/arcadeops-trueforge-demo-cinematic.webm";

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
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
