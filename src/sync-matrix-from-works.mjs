#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb, closeDb } from "./lib/db.mjs";
import { ensureMatrixDashboardData } from "./matrix-dashboard.mjs";

const DEFAULT_INPUT = path.resolve("comments-output/list-works-latest.json");

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    accountId: "cm",
    accountName: "C妈说夏令营",
    owner: "运营A"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--input":
        args.input = path.resolve(argv[i + 1] || DEFAULT_INPUT);
        i += 1;
        break;
      case "--account-id":
        args.accountId = argv[i + 1] || args.accountId;
        i += 1;
        break;
      case "--account-name":
        args.accountName = argv[i + 1] || args.accountName;
        i += 1;
        break;
      case "--owner":
        args.owner = argv[i + 1] || args.owner;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parsePublishText(value = "") {
  const match = String(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const [, y, m, d, hh, mm] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${hh.padStart(2, "0")}:${mm}`;
}

function stableId(work, index) {
  return `dy_${crypto
    .createHash("sha1")
    .update(`${work.title}|${work.publishText}|${index}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function extractTags(title = "") {
  return Array.from(String(title).matchAll(/#([^#\s]+)/g))
    .map((match) => match[1])
    .slice(0, 4)
    .join(",");
}

function titleWithoutTags(title = "") {
  return String(title).replace(/#([^#\s]+)/g, "").trim() || String(title).trim();
}

function inferTone(index) {
  return ["yellow", "teal", "blue", "green", "purple", "orange"][index % 6];
}

function inferStatusTags(index) {
  return index < 5 ? "待观察" : "";
}

function getCommentCountMap(db) {
  const rows = db
    .prepare("SELECT work_title, COUNT(*) AS total FROM comments GROUP BY work_title")
    .all();
  return new Map(rows.map((row) => [row.work_title, row.total]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureMatrixDashboardData();
  const db = getDb();
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const works = Array.isArray(payload.works) ? payload.works : [];
  const commentCountMap = getCommentCountMap(db);
  const capturedAt = new Date().toISOString();

  const insertAccount = db.prepare(`
    INSERT INTO matrix_accounts (id, name, platform, owner, status, sync_status, last_sync_at)
    VALUES (?, ?, '抖音', ?, 'online', 'synced', ?)
  `);
  const insertWork = db.prepare(`
    INSERT INTO matrix_works
      (id, title, account_id, ip_name, cover_tone, cover_url, cover_local_path, tags, status_tags, published_at, video_url, transcript)
    VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, '', '')
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO matrix_snapshots
      (work_id, captured_at, views, comments, messages, wechat, effective_leads, likes, saves, shares, avg_watch_seconds, completion_rate, click_rate)
    VALUES (?, ?, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  `);
  const insertLog = db.prepare(
    "INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, ?, ?)"
  );
  const upsertMeta = db.prepare(
    "INSERT INTO matrix_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  db.transaction(() => {
    db.exec(`
      DELETE FROM matrix_keywords;
      DELETE FROM matrix_snapshots;
      DELETE FROM matrix_works;
      DELETE FROM matrix_accounts;
      DELETE FROM matrix_sync_logs;
    `);

    insertAccount.run(args.accountId, args.accountName, args.owner, capturedAt);

    works.forEach((work, index) => {
      const cleanTitle = titleWithoutTags(work.title);
      const commentCount = commentCountMap.get(cleanTitle) || commentCountMap.get(work.title) || 0;
      const workId = stableId(work, index);
      insertWork.run(
        workId,
        cleanTitle,
        args.accountId,
        args.accountName,
        inferTone(index),
        work.coverUrl || "",
        extractTags(work.title),
        inferStatusTags(index),
        parsePublishText(work.publishText)
      );
      insertSnapshot.run(workId, capturedAt, commentCount);
    });

    upsertMeta.run("data_mode", "real_works");
    upsertMeta.run("data_mode_label", "真实作品列表 · 指标/封面待接入");
    insertLog.run(capturedAt, "info", `同步真实作品列表成功：${works.length} 条`);
    insertLog.run(capturedAt, "info", "播放/私信/微信/封面字段等待真实数据源接入");
  })();

  console.log(
    JSON.stringify(
      {
        input: args.input,
        count: works.length,
        account: args.accountName,
        dashboard: "http://127.0.0.1:8765/matrix"
      },
      null,
      2
    )
  );

  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
