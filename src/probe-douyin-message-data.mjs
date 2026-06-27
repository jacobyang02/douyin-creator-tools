#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DEFAULT_USER_DATA_DIR, launchPersistentPage } from "./douyin-browser.mjs";

const DEFAULT_URLS = [
  "https://creator.douyin.com/creator-micro/interactive/message",
  "https://creator.douyin.com/creator-micro/interactive/im",
  "https://creator.douyin.com/creator-micro/interactive/private-message",
  "https://creator.douyin.com/creator-micro/interactive/comment"
];

function parseArgs(argv) {
  const args = {
    urls: [],
    outputPath: path.resolve("comments-output/message-probe.json"),
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
        args.outputPath = path.resolve(argv[index + 1] || args.outputPath);
        index += 1;
        break;
      case "--profile":
        args.profileDir = argv[index + 1] || args.profileDir;
        index += 1;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--wait":
        args.waitMs = Number(argv[index + 1] || args.waitMs);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.urls.length === 0) args.urls = DEFAULT_URLS;
  return args;
}

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function hasMessageSignal(value) {
  const text = stringify(value).slice(0, 500000);
  return /conversation|conversation_id|conversationId|chat|message|msg|im_|unread|私信|会话|粉丝|用户|nickname|avatar|create_time|server_message/i.test(
    text
  );
}

function pickPreview(value, depth = 0) {
  if (depth > 7 || value == null) return null;
  if (Array.isArray(value)) {
    const picked = value
      .map((item) => pickPreview(item, depth + 1))
      .filter(Boolean)
      .slice(0, 5);
    return picked.length ? picked : null;
  }
  if (typeof value !== "object") return null;

  const direct = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (
      /conversation|chat|message|msg|im_|unread|user|nickname|avatar|content|text|time|create|server|cursor|has_more|count|total/i.test(
        key
      )
    ) {
      direct[key] =
        typeof fieldValue === "object" && fieldValue !== null
          ? pickPreview(fieldValue, depth + 1) ?? "[object]"
          : fieldValue;
    }
  }
  if (Object.keys(direct).length > 0) return direct;

  for (const fieldValue of Object.values(value)) {
    const nested = pickPreview(fieldValue, depth + 1);
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
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("json") && !url.includes("/api/") && !url.includes("/im/")) return;

    try {
      const body = await response.json();
      if (!hasMessageSignal(body)) return;
      hits.push({
        url,
        method: response.request().method(),
        status: response.status(),
        postData: response.request().postData() || "",
        preview: pickPreview(body)
      });
    } catch {
      // Ignore non-JSON or encrypted/streaming responses.
    }
  });

  const pages = [];
  try {
    for (const url of args.urls) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(args.waitMs);
      if (url.includes("/interactive/comment")) {
        const links = await page
          .locator("a, button, [role='menuitem'], [class*='menu'], [class*='nav']")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => ({
                text: (node.innerText || node.textContent || "").trim(),
                href: node.getAttribute?.("href") || "",
                role: node.getAttribute?.("role") || "",
                className: node.getAttribute?.("class") || ""
              }))
              .filter((item) => item.text || item.href)
              .slice(0, 200)
          )
          .catch(() => []);

        const privateMessageTarget = page
          .getByText("私信管理", { exact: true })
          .first();
        if (await privateMessageTarget.isVisible().catch(() => false)) {
          await privateMessageTarget.click().catch(() => {});
          await page.waitForTimeout(args.waitMs);
        }

        pages.push({
          url: `${url}#navigation-links`,
          title: "导航候选",
          location: page.url(),
          text: JSON.stringify(links).slice(0, 5000)
        });
      }
      pages.push({
        url,
        title: await page.title().catch(() => ""),
        location: page.url(),
        text: (await page.locator("body").innerText().catch(() => "")).slice(0, 3000)
      });
    }
  } finally {
    await fs.promises.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.promises.writeFile(
      args.outputPath,
      JSON.stringify({ capturedAt: new Date().toISOString(), pages, hitCount: hits.length, hits }, null, 2)
    );
    console.log(`Wrote probe result to ${args.outputPath}`);
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
