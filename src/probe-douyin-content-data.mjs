#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DEFAULT_USER_DATA_DIR, launchPersistentPage } from "./douyin-browser.mjs";

const DEFAULT_URLS = [
  "https://creator.douyin.com/creator-micro/content/manage",
  "https://creator.douyin.com/creator-micro/content/manage/video",
  "https://creator.douyin.com/creator-micro/content/publish"
];

function parseArgs(argv) {
  const args = {
    urls: [],
    outputPath: path.resolve("comments-output/content-probe.json"),
    profileDir: DEFAULT_USER_DATA_DIR,
    headless: false,
    waitMs: 12000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--url":
        args.urls.push(argv[index + 1]);
        index += 1;
        break;
      case "--out":
        args.outputPath = path.resolve(argv[index + 1]);
        index += 1;
        break;
      case "--profile":
        args.profileDir = argv[index + 1];
        index += 1;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--wait":
        args.waitMs = Number(argv[index + 1]);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.urls.length === 0) args.urls = DEFAULT_URLS;
  return args;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function containsWorkSignal(value) {
  const text = safeStringify(value).slice(0, 200000);
  return /aweme|item_id|itemId|video_id|videoId|cover|播放|play|digg|like|comment|share|publish|create_time|createTime/i.test(
    text
  );
}

function pickInterestingFields(value, depth = 0) {
  if (depth > 6 || value == null) return null;

  if (Array.isArray(value)) {
    const interesting = value
      .map((item) => pickInterestingFields(item, depth + 1))
      .filter(Boolean)
      .slice(0, 5);
    return interesting.length ? interesting : null;
  }

  if (typeof value !== "object") return null;

  const direct = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (
      /title|desc|name|aweme|item|video|cover|url|play|播放|digg|like|comment|share|publish|create|time|stat/i.test(
        key
      )
    ) {
      direct[key] =
        typeof fieldValue === "object" && fieldValue !== null
          ? pickInterestingFields(fieldValue, depth + 1) ?? "[object]"
          : fieldValue;
    }
  }

  if (Object.keys(direct).length > 0) return direct;

  for (const fieldValue of Object.values(value)) {
    const nested = pickInterestingFields(fieldValue, depth + 1);
    if (nested) return nested;
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await launchPersistentPage({
    userDataDir: args.profileDir,
    headless: args.headless,
    alwaysNewPage: true
  });

  const hits = [];

  page.on("response", async (response) => {
    const request = response.request();
    const contentType = response.headers()["content-type"] || "";
    const url = response.url();
    if (!contentType.includes("json") && !url.includes("/api/")) return;

    try {
      const body = await response.json();
      if (!containsWorkSignal(body)) return;

      hits.push({
        url,
        method: request.method(),
        status: response.status(),
        postData: request.postData() || "",
        preview: pickInterestingFields(body)
      });
    } catch {
      // Some endpoints advertise JSON but stream or encrypt the body. Ignore them.
    }
  });

  const pages = [];
  try {
    for (const url of args.urls) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(args.waitMs);
      pages.push({
        url,
        title: await page.title().catch(() => ""),
        location: page.url(),
        text: (await page.locator("body").innerText().catch(() => "")).slice(0, 2000)
      });
    }
  } finally {
    await fs.promises.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.promises.writeFile(
      args.outputPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          pages,
          hitCount: hits.length,
          hits
        },
        null,
        2
      )
    );
    console.log(`Wrote probe result to ${args.outputPath}`);
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
