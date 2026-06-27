#!/usr/bin/env node

import process from "node:process";
import { DEFAULT_COMMENT_PAGE_URL, gotoPage, launchPersistentPage } from "./douyin-browser.mjs";
import { ensureCommentPageReady } from "./lib/comment-page.mjs";
import { findTargetWorkWithRetry } from "./lib/works-panel.mjs";

const workTitle = process.argv.slice(2).join(" ");
if (!workTitle) {
  throw new Error("Usage: node src/study-visible-replies.mjs <work title>");
}

const { context, page } = await launchPersistentPage({
  headless: false,
  alwaysNewPage: true
});

try {
  await ensureCommentPageReady(page, DEFAULT_COMMENT_PAGE_URL, {
    navigationTimeoutMs: 60000,
    uiTimeoutMs: 30000
  });

  await findTargetWorkWithRetry(page, {
    workTitle,
    selectWhenMatched: true,
    timeoutMs: 45000,
    idleMs: 5000,
    uiTimeoutMs: 30000
  });

  await page.waitForTimeout(2500);

  for (let pass = 0; pass < 3; pass += 1) {
    await page.evaluate(() => {
      const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
      const buttons = Array.from(document.querySelectorAll("button, div, span")).filter((node) => {
        const text = normalize(node.textContent || "");
        return /展开\d*条回复|条回复/.test(text) && text.length <= 20;
      });
      for (const button of buttons.slice(0, 20)) {
        if (button instanceof HTMLElement) button.click();
      }
    });
    await page.waitForTimeout(1200);
  }

  const data = await page.evaluate(() => {
    const normalize = (value = "") => value.replace(/\s+/g, " ").trim();
    const root = document.querySelector('[data-codex-comment-scroll="true"]') || document.body;
    const blocks = Array.from(root.querySelectorAll("[comment-item], div"))
      .map((node) => normalize(node.innerText || ""))
      .filter((text) => text.includes("作者") && text.includes("回复"))
      .map((text) => text.slice(0, 800));
    const unique = Array.from(new Set(blocks)).slice(0, 30);
    return {
      url: location.href,
      samples: unique
    };
  });

  console.log(JSON.stringify(data, null, 2));
} finally {
  await context.close();
}
