#!/usr/bin/env node

import process from "node:process";
import { closeDb, getDb } from "./lib/db.mjs";
import { DEFAULT_USER_DATA_DIR, launchPersistentPage } from "./douyin-browser.mjs";
import { ensureMatrixDashboardData } from "./matrix-dashboard.mjs";

const COMMENT_URL = "https://creator.douyin.com/creator-micro/interactive/comment";

function parseArgs(argv) {
  const args = {
    profileDir: DEFAULT_USER_DATA_DIR,
    headless: false,
    waitMs: 10000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
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

  return args;
}

function todayKey() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openMessagePage(page, waitMs) {
  await page.goto(COMMENT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(waitMs);
  const target = page.getByText("私信管理", { exact: true }).first();
  if (!(await target.isVisible().catch(() => false))) {
    throw new Error("未找到私信管理入口，可能页面结构变化或账号权限不足");
  }
  await target.click();
  await page.waitForTimeout(waitMs);
}

async function collectMessageText(page) {
  const snapshots = [];
  let previousText = "";

  for (let step = 0; step < 12; step += 1) {
    const text = await page.locator("body").innerText().catch(() => "");
    snapshots.push(text.split("\n").map((line) => line.trim()).filter(Boolean));

    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("*"))
        .filter((node) => {
          const style = window.getComputedStyle(node);
          return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 40;
        })
        .sort((a, b) => b.scrollHeight - a.scrollHeight);
      const target = candidates[0] || document.scrollingElement || document.documentElement;
      target.scrollTop = target.scrollTop + Math.max(360, target.clientHeight * 0.85);
    });
    await page.waitForTimeout(900);

    if (text === previousText) break;
    previousText = text;
  }

  return snapshots;
}

function parseConversationCount(snapshots) {
  const conversations = [];
  for (const lines of snapshots) {
    conversations.push(...parseConversationSnapshot(lines));
  }
  const unique = new Map();
  for (const item of conversations) {
    unique.set(`${item.name}|${item.time}`, item);
  }
  return Array.from(unique.values());
}

function parseConversationSnapshot(lines) {
  const start = lines.findIndex((line) => line === "全部");
  const scoped = start >= 0 ? lines.slice(start + 1) : lines;
  const timePattern = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const excludedNames = new Set(["置顶", "全选", "朋友私信", "陌生人私信", "群消息"]);
  const conversations = [];

  for (let index = 0; index < scoped.length; index += 1) {
    if (!timePattern.test(scoped[index])) continue;
    let name = "";
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = scoped[cursor];
      if (!candidate || excludedNames.has(candidate) || timePattern.test(candidate)) continue;
      name = candidate;
      break;
    }
    const message = scoped[index + 1] || "";
    if (name) conversations.push({ name, time: scoped[index], message });
  }

  return conversations;
}

function saveTodayMessages(count, sample) {
  ensureMatrixDashboardData();
  const db = getDb();
  const date = todayKey();
  const current =
    db
      .prepare(
        "SELECT wechat, effective_leads, notes FROM matrix_daily_inputs WHERE date = ?"
      )
      .get(date) || {};
  const updatedAt = new Date().toISOString();
  const notes = current.notes || "私信数由抖音私信管理页只读统计";

  db.prepare(
    `
    INSERT INTO matrix_daily_inputs (date, messages, wechat, effective_leads, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      messages = excluded.messages,
      wechat = excluded.wechat,
      effective_leads = excluded.effective_leads,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `
  ).run(date, count, Number(current.wechat || 0), Number(current.effective_leads || 0), notes, updatedAt);

  db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
    .run(updatedAt, `抖音私信只读统计：${date} 新增私信 ${count} 条`);

  return { date, count, updatedAt, sample };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await launchPersistentPage({
    userDataDir: args.profileDir,
    headless: args.headless,
    alwaysNewPage: true
  });

  try {
    await openMessagePage(page, args.waitMs);
    const lines = await collectMessageText(page);
    const conversations = parseConversationCount(lines);
    const result = saveTodayMessages(conversations.length, conversations.slice(0, 8));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
    closeDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
