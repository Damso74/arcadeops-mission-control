import path from "node:path";
import { chromium } from "playwright";

const fileName = process.argv[2] || "arcadeops-trueforge-demo-final.webm";
if (path.basename(fileName) !== fileName) {
  throw new Error("Video input must be a filename inside demo_assets");
}
const baseUrl = (process.env.DEMO_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const targetUrl = `${baseUrl}/demo_assets/${encodeURIComponent(fileName)}`;
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
  if (before.duration < 105 || before.duration > 130) {
    throw new Error(`Duration check failed: expected 105-130 seconds, received ${before.duration}`);
  }
  if (before.width !== 1280 || before.height !== 720) {
    throw new Error(`Resolution check failed: expected 1280x720, received ${before.width}x${before.height}`);
  }
  if (before.audioTracks < 1) {
    throw new Error("Audio check failed: no audio track is present");
  }

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
      // Hash only presentation content. The renderer's animated progress bar
      // occupies the bottom eight pixels and must not satisfy progression.
      const contentHeight = Math.max(1, video.videoHeight - 16);
      context.drawImage(
        video,
        0,
        0,
        video.videoWidth,
        contentHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
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

  await page.waitForFunction(
    () => document.querySelector("video").ended,
    undefined,
    { timeout: 30_000 },
  );

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
  if (!after.ended || after.currentTime < before.duration - 0.25) {
    throw new Error(`Playback completion check failed at ${after.currentTime}/${before.duration}`);
  }
  if (!(after.decodedAudioBytes > 0)) {
    throw new Error("Audio decode check failed: no decoded audio bytes");
  }
  if (!(after.decodedVideoBytes > 0)) {
    throw new Error("Video decode check failed: no decoded video bytes");
  }
  console.log(JSON.stringify({ before, frameSignatures, uniqueFrameCount, after }, null, 2));
} finally {
  await browser.close();
}
