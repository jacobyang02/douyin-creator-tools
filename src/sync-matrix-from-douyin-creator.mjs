#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { closeDb, getDb } from "./lib/db.mjs";
import { DEFAULT_USER_DATA_DIR, launchPersistentPage } from "./douyin-browser.mjs";
import { ensureMatrixDashboardData } from "./matrix-dashboard.mjs";

const MANAGE_URL = "https://creator.douyin.com/creator-micro/content/manage";
const WORK_LIST_PATH = "/janus/douyin/creator/pc/work_list";

function parseArgs(argv) {
  const args = {
    accountId: "",
    accountName: "",
    owner: "运营A",
    profileDir: DEFAULT_USER_DATA_DIR,
    headless: false,
    count: 50,
    maxPages: 20,
    status: 4
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--account-id":
        args.accountId = argv[index + 1] || args.accountId;
        index += 1;
        break;
      case "--account-name":
        args.accountName = argv[index + 1] || args.accountName;
        index += 1;
        break;
      case "--owner":
        args.owner = argv[index + 1] || args.owner;
        index += 1;
        break;
      case "--profile":
        args.profileDir = argv[index + 1] || args.profileDir;
        index += 1;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--count":
        args.count = Number(argv[index + 1] || args.count);
        index += 1;
        break;
      case "--max-pages":
        args.maxPages = Number(argv[index + 1] || args.maxPages);
        index += 1;
        break;
      case "--status":
        args.status = Number(argv[index + 1] || args.status);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function firstUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstUrl(value[0]);
  if (Array.isArray(value.url_list)) return firstUrl(value.url_list[0]);
  if (Array.isArray(value.urlList)) return firstUrl(value.urlList[0]);
  return "";
}

function getCoverUrl(work) {
  return (
    firstUrl(work?.video?.cover) ||
    firstUrl(work?.Cover) ||
    firstUrl(work?.video?.origin_cover) ||
    firstUrl(work?.video?.dynamic_cover)
  );
}

function formatPublishedAt(createTime) {
  const timestamp = Number(createTime || 0);
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
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

function inferStatusTags(work, index) {
  const stats = work.statistics || {};
  const views = Number(stats.play_count || 0);
  const comments = Number(stats.comment_count || 0);
  const tags = [];
  if (views >= 100000) tags.push("爆款");
  if (comments >= 100) tags.push("高互动");
  if (index < 6 && views >= 10000) tags.push("可二创");
  if (!tags.length && index < 10) tags.push("待观察");
  return tags.join(",");
}

function stableId(work, index) {
  const id = work.aweme_id || work.item_id || `${work.desc}|${work.create_time}|${index}`;
  return `dy_${crypto.createHash("sha1").update(String(id)).digest("hex").slice(0, 16)}`;
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha1").update(String(value || prefix)).digest("hex").slice(0, 10)}`;
}

function legacyAccountId(name) {
  if (name === "C妈说夏令营") return "cm";
  return "";
}

async function fetchCurrentAccount(page, args) {
  if (args.accountId && args.accountName) {
    return { id: args.accountId, name: args.accountName };
  }

  const account = await page.evaluate(async () => {
    const readJson = async (url) => {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    };

    const media = await readJson("/web/api/media/user/info/").catch(() => null);
    const creator = await readJson("/aweme/v1/creator/user/info/").catch(() => null);
    const user = media?.user || creator?.user_profile || creator?.douyin_user_verify_info || {};

    return {
      nickname: user.nickname || media?.user?.nickname || "",
      uid: user.uid || user.user_id || user.user_id_str || user.sec_uid || user.unique_id || "",
      secUid: user.sec_uid || user.secUid || "",
      shortId: user.short_id || user.shortId || "",
      followerCount: user.follower_count || 0
    };
  });

  const name = args.accountName || account.nickname || "未命名抖音号";
  const idSource = args.accountId || account.uid || account.secUid || account.shortId || name;
  return {
    id: args.accountId || legacyAccountId(name) || hashId("dyacct", idSource),
    name
  };
}

async function fetchCreatorWorks(page, args) {
  const works = [];
  let cursor = 0;
  let pageIndex = 0;
  let hasMore = true;

  while (hasMore && pageIndex < args.maxPages) {
    const result = await page.evaluate(
      async ({ path, status, count, cursor: maxCursor }) => {
        const params = new URLSearchParams({
          scene: "star_atlas",
          device_platform: "android",
          status: String(status),
          count: String(count),
          max_cursor: String(maxCursor),
          aid: "1128"
        });
        const response = await fetch(`${path}?${params.toString()}`, {
          credentials: "include"
        });
        const text = await response.text();
        try {
          return {
            ok: response.ok,
            statusCode: response.status,
            body: JSON.parse(text)
          };
        } catch {
          return {
            ok: response.ok,
            statusCode: response.status,
            body: { raw: text.slice(0, 500) }
          };
        }
      },
      { path: WORK_LIST_PATH, status: args.status, count: args.count, cursor }
    );

    if (!result.ok) {
      throw new Error(`work_list HTTP ${result.statusCode}: ${JSON.stringify(result.body).slice(0, 500)}`);
    }

    const body = result.body || {};
    const list = Array.isArray(body.aweme_list) ? body.aweme_list : [];
    works.push(...list);

    const nextCursor = Number(body.max_cursor ?? body.cursor ?? 0);
    hasMore = Boolean(body.has_more) && list.length > 0 && nextCursor !== cursor;
    cursor = nextCursor;
    pageIndex += 1;
  }

  return works;
}

function getCommentCountMap(db) {
  const rows = db
    .prepare("SELECT work_title, COUNT(*) AS total FROM comments GROUP BY work_title")
    .all();
  return new Map(rows.map((row) => [row.work_title, row.total]));
}

function writeMatrixData(args, account, rawWorks) {
  ensureMatrixDashboardData();
  const db = getDb();
  const commentCountMap = getCommentCountMap(db);
  const capturedAt = new Date().toISOString();

  const insertAccount = db.prepare(`
    INSERT INTO matrix_accounts (id, name, platform, owner, status, sync_status, last_sync_at)
    VALUES (?, ?, '抖音', ?, 'online', 'synced', ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      platform = excluded.platform,
      owner = excluded.owner,
      status = excluded.status,
      sync_status = excluded.sync_status,
      last_sync_at = excluded.last_sync_at
  `);
  const insertWork = db.prepare(`
    INSERT INTO matrix_works
      (id, title, account_id, ip_name, cover_tone, cover_url, cover_local_path, tags, status_tags, published_at, video_url, transcript)
    VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, '')
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      account_id = excluded.account_id,
      ip_name = excluded.ip_name,
      cover_tone = excluded.cover_tone,
      cover_url = excluded.cover_url,
      tags = excluded.tags,
      status_tags = excluded.status_tags,
      published_at = excluded.published_at,
      video_url = excluded.video_url
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO matrix_snapshots
      (work_id, captured_at, views, comments, messages, wechat, effective_leads, likes, saves, shares, avg_watch_seconds, completion_rate, click_rate)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, ?, 0, 0, 0)
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
    `);

    insertAccount.run(account.id, account.name, args.owner, capturedAt);

    rawWorks.forEach((work, index) => {
      const title = work.desc || work.item_title || "";
      const cleanTitle = titleWithoutTags(title);
      const stats = work.statistics || {};
      const workId = stableId(work, index);
      const comments =
        Number(stats.comment_count || 0) ||
        commentCountMap.get(cleanTitle) ||
        commentCountMap.get(title) ||
        0;

      insertWork.run(
        workId,
        cleanTitle,
        account.id,
        account.name,
        inferTone(index),
        getCoverUrl(work),
        extractTags(title),
        inferStatusTags(work, index),
        formatPublishedAt(work.create_time),
        work.share_url || (work.aweme_id ? `https://www.douyin.com/video/${work.aweme_id}` : "")
      );

      insertSnapshot.run(
        workId,
        capturedAt,
        Number(stats.play_count || 0),
        comments,
        Number(stats.digg_count || 0),
        Number(stats.share_count || 0)
      );
    });

    const coverCount = rawWorks.filter((work) => getCoverUrl(work)).length;
    upsertMeta.run("data_mode", "douyin_creator_real");
    upsertMeta.run(
      "data_mode_label",
      `抖音创作者中心真实同步 · 当前账号 ${rawWorks.length} 条作品 · ${coverCount} 张封面`
    );
    insertLog.run(capturedAt, "info", `抖音创作者中心同步成功：${account.name} ${rawWorks.length} 条作品`);
    insertLog.run(capturedAt, "info", `已抓取封面 URL：${coverCount} 张`);
    insertLog.run(capturedAt, "info", "私信/微信进量暂未接入，仍保持只读数据边界");
  })();

  return {
    count: rawWorks.length,
    coverCount: rawWorks.filter((work) => getCoverUrl(work)).length,
    account,
    first: rawWorks[0]
      ? {
          title: titleWithoutTags(rawWorks[0].desc || rawWorks[0].item_title || ""),
          publishedAt: formatPublishedAt(rawWorks[0].create_time),
          coverUrl: getCoverUrl(rawWorks[0]),
          statistics: rawWorks[0].statistics || {}
        }
      : null
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await launchPersistentPage({
    userDataDir: args.profileDir,
    headless: args.headless,
    alwaysNewPage: true
  });

  try {
    await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    const account = await fetchCurrentAccount(page, args);
    const works = await fetchCreatorWorks(page, args);
    const result = writeMatrixData(args, account, works);
    console.log(
      JSON.stringify(
        {
          ...result,
          dashboard: "http://127.0.0.1:8765/matrix"
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
    closeDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
