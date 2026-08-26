import { chromium } from "file:///C:/Users/credo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const fileName = process.argv[2] || "arcadeops-trueforge-demo-final.webm";
const targetUrl = `http://127.0.0.1:4173/demo_assets/${encodeURIComponent(fileName)}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(targetUrl, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && Number.isFinite(video.duration) && video.videoWidth > 0;
  });
  const before = await page.evaluate(() => {
    const video = document.querySelector("video");
    video.muted = false;
    video.volume = 1;
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      readyState: video.readyState,
      audioTracks: video.captureStream().getAudioTracks().length,
    };
  });

  const sampleTimes = [0.04, 0.20, 0.42, 0.62, 0.82, 0.96].map(
    (ratio) => ratio * before.duration,
  );
  const frameSignatures = [];
  await page.evaluate(() => {
    const video = document.querySelector("video");
    video.currentTime = 0;
    video.playbackRate = 8;
    return video.play();
  });
  for (const currentTime of sampleTimes) {
    await page.waitForFunction(
      (time) => document.querySelector("video").currentTime >= time,
      currentTime,
      { timeout: 30_000 },
    );
    const signature = await page.evaluate(() => {
      const video = document.querySelector("video");
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = Math.round(
          pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722,
        );
        hash ^= luminance;
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    });
    frameSignatures.push({ currentTime, signature });
  }

  const uniqueFrameCount = new Set(frameSignatures.map(({ signature }) => signature)).size;
  if (uniqueFrameCount < 5) {
    throw new Error(
      `Visual progression check failed: only ${uniqueFrameCount}/${frameSignatures.length} distinct sampled frames`,
    );
  }

  const after = await page.evaluate(() => {
    const video = document.querySelector("video");
    return {
      currentTime: video.currentTime,
      paused: video.paused,
      ended: video.ended,
      muted: video.muted,
      volume: video.volume,
      decodedAudioBytes: video.webkitAudioDecodedByteCount ?? null,
      decodedVideoBytes: video.webkitVideoDecodedByteCount ?? null,
    };
  });
  console.log(JSON.stringify({ before, frameSignatures, uniqueFrameCount, after }, null, 2));
} finally {
  await browser.close();
}
