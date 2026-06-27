import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getDb } from "./lib/db.mjs";

const execFileAsync = promisify(execFile);

const STATUS_ORDER = ["爆款", "询盘高", "可二创", "增长中", "待复盘", "良好", "待观察"];

function nowIso() {
  return new Date().toISOString();
}

function n(value) {
  return Number(value || 0);
}

function formatCompact(value) {
  const num = Number(value || 0);
  if (num >= 10000) {
    return `${(num / 10000).toFixed(num >= 100000 ? 1 : 2).replace(/\.0$/, "")}万`;
  }
  return String(num);
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function ensureMatrixDashboardData() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS matrix_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '抖音',
      owner TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'online',
      sync_status TEXT NOT NULL DEFAULT 'synced',
      last_sync_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS matrix_works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      account_id TEXT NOT NULL,
      ip_name TEXT NOT NULL,
      cover_tone TEXT NOT NULL DEFAULT 'blue',
      cover_url TEXT NOT NULL DEFAULT '',
      cover_local_path TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      status_tags TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES matrix_accounts(id)
    );

    CREATE TABLE IF NOT EXISTS matrix_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      messages INTEGER NOT NULL DEFAULT 0,
      wechat INTEGER NOT NULL DEFAULT 0,
      effective_leads INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      saves INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      avg_watch_seconds REAL NOT NULL DEFAULT 0,
      completion_rate REAL NOT NULL DEFAULT 0,
      click_rate REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(work_id) REFERENCES matrix_works(id)
    );

    CREATE TABLE IF NOT EXISTS matrix_keywords (
      work_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(work_id, keyword),
      FOREIGN KEY(work_id) REFERENCES matrix_works(id)
    );

    CREATE TABLE IF NOT EXISTS matrix_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_at TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matrix_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matrix_daily_inputs (
      date TEXT PRIMARY KEY,
      messages INTEGER NOT NULL DEFAULT 0,
      wechat INTEGER NOT NULL DEFAULT 0,
      effective_leads INTEGER NOT NULL DEFAULT 0,
      spend REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matrix_remix_pool (
      work_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '待二创',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(work_id) REFERENCES matrix_works(id)
    );

    CREATE TABLE IF NOT EXISTS matrix_openapi_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'formal',
      request_body TEXT NOT NULL DEFAULT '{}',
      response_body TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const migration of [
    "ALTER TABLE matrix_works ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE matrix_works ADD COLUMN cover_local_path TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE matrix_works ADD COLUMN transcript TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE matrix_daily_inputs ADD COLUMN spend REAL NOT NULL DEFAULT 0"
  ]) {
    try {
      db.exec(migration);
    } catch {
      // Column already exists.
    }
  }

  const seeded = db.prepare("SELECT COUNT(*) AS total FROM matrix_works").get().total;
  if (seeded > 0) return;

  const syncTime = new Date();
  syncTime.setHours(9, 12, 0, 0);
  const syncAt = syncTime.toISOString();

  const accounts = [
    ["cm", "C妈说夏令营", "抖音", "运营A", "online", "synced", syncAt],
    ["kk", "KK老师", "抖音", "运营B", "offline", "cookie_needed", ""],
    ["sarah", "Sarah", "抖音", "运营B", "online", "synced", syncAt],
    ["austin", "Austin", "抖音", "运营C", "online", "synced", syncAt]
  ];

  const works = [
    [
      "w1",
      "全英学术夏校 6月报名高峰",
      "cm",
      "C妈说夏令营",
      "yellow",
      "",
      "",
      "夏令营,报名节点,课堂证据",
      "爆款,询盘高",
      "2026-06-23 18:20",
      "https://www.douyin.com/video/example-w1"
    ],
    [
      "w2",
      "上课学习 + 下午实践演练",
      "sarah",
      "Sarah",
      "teal",
      "",
      "",
      "课堂实拍,教学过程",
      "可二创",
      "2026-06-23 15:10",
      "https://www.douyin.com/video/example-w2"
    ],
    [
      "w3",
      "北京 广州 香港 杭州 全英夏令营",
      "austin",
      "Austin",
      "blue",
      "",
      "",
      "城市矩阵,项目介绍",
      "增长中",
      "2026-06-22 20:30",
      "https://www.douyin.com/video/example-w3"
    ],
    [
      "w4",
      "全英外教授课 锻炼英语能力",
      "cm",
      "C妈说夏令营",
      "green",
      "",
      "",
      "外教背书,能力提升",
      "待复盘",
      "2026-06-22 12:05",
      "https://www.douyin.com/video/example-w4"
    ],
    [
      "w5",
      "国内全英夏校 7月8月五城开营",
      "sarah",
      "Sarah",
      "purple",
      "",
      "",
      "项目介绍,城市矩阵",
      "良好",
      "2026-06-21 19:40",
      "https://www.douyin.com/video/example-w5"
    ],
    [
      "w6",
      "四月报名高峰 美国英国瑞士法国",
      "austin",
      "Austin",
      "orange",
      "",
      "",
      "报名节点,国际营地",
      "待观察",
      "2026-06-20 18:00",
      "https://www.douyin.com/video/example-w6"
    ]
  ];

  const snapshots = [
    ["w1", 35000, 68, 12, 5, 3, 2100, 1040, 388, 18.4, 31, 6.8],
    ["w2", 21000, 41, 9, 3, 2, 1430, 760, 210, 16.8, 28, 5.4],
    ["w3", 17000, 36, 7, 2, 1, 960, 520, 180, 15.2, 24, 4.9],
    ["w4", 6607, 18, 4, 1, 1, 430, 190, 70, 13.5, 20, 3.7],
    ["w5", 5159, 15, 3, 1, 1, 360, 150, 58, 12.9, 18, 3.2],
    ["w6", 2989, 8, 1, 0, 0, 170, 80, 24, 9.8, 14, 2.6]
  ];

  const previousSnapshots = [
    ["w1", 26800, 47, 7, 3, 2, 1600, 770, 260, 17.5, 29, 6.1],
    ["w2", 17400, 29, 6, 2, 1, 1120, 560, 160, 15.9, 26, 5.0],
    ["w3", 13200, 25, 4, 1, 1, 760, 410, 130, 14.7, 22, 4.2],
    ["w4", 5400, 12, 2, 1, 1, 330, 140, 46, 12.8, 19, 3.4],
    ["w5", 4300, 11, 2, 1, 1, 280, 120, 38, 12.1, 17, 3.1],
    ["w6", 2600, 7, 1, 0, 0, 150, 70, 20, 9.4, 13, 2.4]
  ];

  const keywords = [
    ["w1", "夏令营", 18],
    ["w1", "初二", 8],
    ["w1", "广东", 7],
    ["w1", "报名", 6],
    ["w1", "费用", 5],
    ["w2", "外教", 9],
    ["w2", "实践", 5],
    ["w3", "香港", 6],
    ["w3", "杭州", 4]
  ];

  const insertAccount = db.prepare(
    "INSERT INTO matrix_accounts (id, name, platform, owner, status, sync_status, last_sync_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertWork = db.prepare(
    "INSERT INTO matrix_works (id, title, account_id, ip_name, cover_tone, cover_url, cover_local_path, tags, status_tags, published_at, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertSnapshot = db.prepare(`
    INSERT INTO matrix_snapshots
      (work_id, captured_at, views, comments, messages, wechat, effective_leads, likes, saves, shares, avg_watch_seconds, completion_rate, click_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertKeyword = db.prepare(
    "INSERT INTO matrix_keywords (work_id, keyword, count) VALUES (?, ?, ?)"
  );
  const insertLog = db.prepare(
    "INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, ?, ?)"
  );
  const upsertMeta = db.prepare(
    "INSERT INTO matrix_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  const today = new Date(syncAt);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  db.transaction(() => {
    for (const account of accounts) insertAccount.run(...account);
    for (const work of works) insertWork.run(...work);
    for (const row of previousSnapshots) insertSnapshot.run(row[0], yesterday.toISOString(), ...row.slice(1));
    for (const row of snapshots) insertSnapshot.run(row[0], syncAt, ...row.slice(1));
    for (const keyword of keywords) insertKeyword.run(...keyword);
    upsertMeta.run("data_mode", "seed");
    upsertMeta.run("data_mode_label", "示例数据 · 待接入真实同步");
    for (const message of [
      "同步作品数据成功：6 条作品",
      "同步线索会话成功：73 条新增线索",
      "生成每日快照成功",
      "更新内容矩阵总览成功"
    ]) {
      insertLog.run(nowIso(), "info", message);
    }
  })();
}

function latestSnapshotCte() {
  return `
    WITH latest AS (
      SELECT s.*
      FROM matrix_snapshots s
      INNER JOIN (
        SELECT work_id, MAX(captured_at) AS captured_at
        FROM matrix_snapshots
        GROUP BY work_id
      ) x ON x.work_id = s.work_id AND x.captured_at = s.captured_at
    ),
    previous AS (
      SELECT s.*
      FROM matrix_snapshots s
      INNER JOIN (
        SELECT s2.work_id, MAX(s2.captured_at) AS captured_at
        FROM matrix_snapshots s2
        INNER JOIN latest l ON l.work_id = s2.work_id
        WHERE s2.captured_at < l.captured_at
        GROUP BY s2.work_id
      ) x ON x.work_id = s.work_id AND x.captured_at = s.captured_at
    )
  `;
}

function todayKey() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgoKey(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKeyFromDate(date) {
  return String(date || "").slice(0, 7);
}

function weekKeyFromDate(date) {
  const current = new Date(`${date}T00:00:00`);
  const day = current.getDay() || 7;
  current.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const week = Math.ceil(((current - yearStart) / 86400000 + 1) / 7);
  return `${current.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getManualInput(db, date = todayKey()) {
  return (
    db
      .prepare(
        "SELECT date, messages, wechat, effective_leads, notes, updated_at FROM matrix_daily_inputs WHERE date = ?"
      )
      .get(date) || {
      date,
      messages: 0,
      wechat: 0,
      effective_leads: 0,
      spend: 0,
      notes: "",
      updated_at: ""
    }
  );
}

function sumManualInputs(db, startDate = "0000-00-00", endDate = todayKey()) {
  return db
    .prepare(
      `
      SELECT
        COALESCE(SUM(messages), 0) AS messages,
        COALESCE(SUM(wechat), 0) AS wechat,
        COALESCE(SUM(effective_leads), 0) AS effective_leads,
        COALESCE(SUM(spend), 0) AS spend
      FROM matrix_daily_inputs
      WHERE date >= ? AND date <= ?
    `
    )
    .get(startDate, endDate);
}

function getSnapshotTotalsAtOrAfter(db, startDate) {
  return db
    .prepare(
      `
      WITH ranked AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (PARTITION BY s.work_id ORDER BY s.captured_at ASC) AS rn
        FROM matrix_snapshots s
        WHERE substr(s.captured_at, 1, 10) >= ?
      )
      SELECT
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(comments), 0) AS comments,
        COALESCE(SUM(likes), 0) AS likes,
        COALESCE(SUM(shares), 0) AS shares
      FROM ranked
      WHERE rn = 1
    `
    )
    .get(startDate);
}

function getDailyPlatformSnapshots(db, startDate, endDate) {
  return db
    .prepare(
      `
      WITH ranked AS (
        SELECT
          substr(captured_at, 1, 10) AS date,
          work_id,
          views,
          comments,
          ROW_NUMBER() OVER (
            PARTITION BY substr(captured_at, 1, 10), work_id
            ORDER BY captured_at DESC
          ) AS rn
        FROM matrix_snapshots
        WHERE substr(captured_at, 1, 10) >= ? AND substr(captured_at, 1, 10) <= ?
      )
      SELECT
        date,
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(comments), 0) AS comments
      FROM ranked
      WHERE rn = 1
      GROUP BY date
      ORDER BY date
    `
    )
    .all(startDate, endDate);
}

function getManualInputsMap(db, startDate, endDate) {
  return new Map(
    db
      .prepare(
        `
        SELECT date, messages, wechat, effective_leads, spend
        FROM matrix_daily_inputs
        WHERE date >= ? AND date <= ?
        ORDER BY date
      `
      )
      .all(startDate, endDate)
      .map((row) => [row.date, row])
  );
}

function buildDailyFunnels(db, currentTotals, startDate, endDate) {
  const manualMap = getManualInputsMap(db, startDate, endDate);
  const previousRangeStart = daysAgoKey(7);
  const snapshots = getDailyPlatformSnapshots(db, previousRangeStart, endDate);
  const snapshotMap = new Map(snapshots.map((row) => [row.date, row]));
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = daysAgoKey(offset);
    const label = offset === 0 ? "今天" : date.slice(5).replace("-", "/");
    const current = snapshotMap.get(date);
    const previous = snapshotMap.get(daysAgoKey(offset + 1));
    const manual = manualMap.get(date) || {};
    const views = current && previous ? Math.max(0, n(current.views) - n(previous.views)) : 0;
    const comments =
      current && previous ? Math.max(0, n(current.comments) - n(previous.comments)) : 0;
    const leads = n(manual.messages);
    const wechat = n(manual.wechat);
    const effectiveLeads = n(manual.effective_leads);
    const spend = n(manual.spend);
    days.push({
      date,
      label,
      views,
      comments,
      leads,
      wechat,
      effectiveLeads,
      spend,
      commentRate: views ? (comments / views) * 100 : 0,
      leadRate: views ? (leads / views) * 100 : 0,
      wechatRate: leads ? (wechat / leads) * 100 : 0,
      costPerLead: leads ? spend / leads : 0,
      costPerWechat: wechat ? spend / wechat : 0
    });
  }

  return days;
}

function summarizeFunnelRows(rows, label) {
  const summary = rows.reduce(
    (acc, row) => {
      acc.views += n(row.views);
      acc.comments += n(row.comments);
      acc.leads += n(row.leads);
      acc.wechat += n(row.wechat);
      acc.spend += n(row.spend);
      return acc;
    },
    { label, views: 0, comments: 0, leads: 0, wechat: 0, spend: 0 }
  );
  return {
    ...summary,
    leadRate: summary.views ? (summary.leads / summary.views) * 100 : 0,
    wechatRate: summary.leads ? (summary.wechat / summary.leads) * 100 : 0,
    costPerLead: summary.leads ? summary.spend / summary.leads : 0,
    costPerWechat: summary.wechat ? summary.spend / summary.wechat : 0
  };
}

function groupFunnelRows(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row.date);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped.entries()].map(([label, groupRows]) => summarizeFunnelRows(groupRows, label));
}

export function getMatrixOverview() {
  ensureMatrixDashboardData();
  const db = getDb();

  const accounts = db.prepare("SELECT * FROM matrix_accounts ORDER BY name").all();
  const works = db
    .prepare(`
      ${latestSnapshotCte()}
      SELECT
        w.*,
        a.name AS account_name,
        a.status AS account_status,
        l.views, l.comments, l.messages, l.wechat, l.effective_leads,
        l.likes, l.saves, l.shares, l.avg_watch_seconds, l.completion_rate, l.click_rate,
        CASE WHEN p.work_id IS NULL THEN 0 ELSE MAX(0, l.views - p.views) END AS delta_views,
        CASE WHEN p.work_id IS NULL THEN 0 ELSE MAX(0, l.comments - p.comments) END AS delta_comments,
        CASE WHEN p.work_id IS NULL THEN 0 ELSE MAX(0, l.messages - p.messages) END AS delta_messages,
        CASE WHEN p.work_id IS NULL THEN 0 ELSE MAX(0, l.wechat - p.wechat) END AS delta_wechat
      FROM matrix_works w
      JOIN matrix_accounts a ON a.id = w.account_id
      JOIN latest l ON l.work_id = w.id
      LEFT JOIN previous p ON p.work_id = w.id
      ORDER BY w.published_at DESC, l.views DESC
    `)
    .all();

  const totals = works.reduce(
    (acc, work) => {
      acc.views += n(work.views);
      acc.interactions += n(work.comments) + n(work.saves) + n(work.shares);
      acc.comments += n(work.comments);
      acc.messages += n(work.messages);
      acc.wechat += n(work.wechat);
      acc.effectiveLeads += n(work.effective_leads);
      acc.deltaViews += n(work.delta_views);
      acc.deltaComments += n(work.delta_comments);
      acc.deltaMessages += n(work.delta_messages);
      acc.deltaWechat += n(work.delta_wechat);
      if (String(work.status_tags).includes("可二创") || String(work.status_tags).includes("爆款")) {
        acc.remix += 1;
      }
      return acc;
    },
    {
      views: 0,
      interactions: 0,
      comments: 0,
      messages: 0,
      wechat: 0,
      effectiveLeads: 0,
      deltaViews: 0,
      deltaComments: 0,
      deltaMessages: 0,
      deltaWechat: 0,
      remix: 0
    }
  );

  const today = todayKey();
  const weekStart = daysAgoKey(6);
  const todayManual = getManualInput(db, today);
  const weeklyManual = sumManualInputs(db, weekStart, today);
  const historyManual = sumManualInputs(db);
  const weekStartTotals = getSnapshotTotalsAtOrAfter(db, weekStart);
  const currentPlatformTotals = {
    views: totals.views,
    comments: totals.comments,
    likes: works.reduce((acc, work) => acc + n(work.likes), 0),
    shares: works.reduce((acc, work) => acc + n(work.shares), 0)
  };
  const todayStats = {
    date: today,
    views: totals.deltaViews,
    comments: totals.deltaComments,
    messages: n(todayManual.messages),
    wechat: n(todayManual.wechat),
    effectiveLeads: n(todayManual.effective_leads),
    spend: n(todayManual.spend)
  };
  const weekStats = {
    startDate: weekStart,
    endDate: today,
    views: Math.max(0, currentPlatformTotals.views - n(weekStartTotals.views)),
    comments: Math.max(0, currentPlatformTotals.comments - n(weekStartTotals.comments)),
    messages: n(weeklyManual.messages),
    wechat: n(weeklyManual.wechat),
    effectiveLeads: n(weeklyManual.effective_leads),
    spend: n(weeklyManual.spend)
  };
  const historyStats = {
    views: totals.views,
    comments: totals.comments,
    messages: n(historyManual.messages),
    wechat: n(historyManual.wechat),
    effectiveLeads: n(historyManual.effective_leads),
    spend: n(historyManual.spend)
  };
  const dailyFunnels = buildDailyFunnels(db, totals, weekStart, today);
  const yesterday = daysAgoKey(1);
  const entryDate = yesterday;
  const entryManual = getManualInput(db, entryDate);
  const entryFunnel = dailyFunnels.find((row) => row.date === entryDate) || {
    date: entryDate,
    label: entryDate.slice(5).replace("-", "/"),
    views: 0,
    comments: 0,
    leads: n(entryManual.messages),
    wechat: n(entryManual.wechat),
    spend: n(entryManual.spend),
    leadRate: 0,
    wechatRate: 0,
    costPerLead: 0,
    costPerWechat: 0
  };
  const todayFunnel = dailyFunnels.at(-1);
  if (todayFunnel) {
    todayStats.views = todayFunnel.views;
    todayStats.comments = todayFunnel.comments;
  }
  weekStats.views = dailyFunnels.reduce((acc, row) => acc + n(row.views), 0);
  weekStats.comments = dailyFunnels.reduce((acc, row) => acc + n(row.comments), 0);

  const selected = works[0];
  const keywords = selected
    ? db
        .prepare("SELECT keyword, count FROM matrix_keywords WHERE work_id = ? ORDER BY count DESC")
        .all(selected.id)
    : [];
  const logs = db
    .prepare("SELECT * FROM matrix_sync_logs ORDER BY id DESC LIMIT 8")
    .all()
    .reverse();
  const metaMap = Object.fromEntries(
    db.prepare("SELECT key, value FROM matrix_meta").all().map((row) => [row.key, row.value])
  );
  const remixPool = db.prepare("SELECT * FROM matrix_remix_pool ORDER BY updated_at DESC").all();

  const trend = dailyFunnels.map((row) => ({
    date: row.label,
    views: row.views,
    messages: row.leads,
    wechat: row.wechat
  }));

  const funnelAnalysis = {
    daily: dailyFunnels,
    weekly: groupFunnelRows(dailyFunnels, weekKeyFromDate),
    monthly: groupFunnelRows(dailyFunnels, monthKeyFromDate),
    entryDate,
    entryManual,
    entryFunnel,
    totals: {
      views: weekStats.views,
      comments: weekStats.comments,
      leads: weekStats.messages,
      wechat: weekStats.wechat,
      effectiveLeads: weekStats.effectiveLeads,
      spend: weekStats.spend,
      leadRate: weekStats.views ? (weekStats.messages / weekStats.views) * 100 : 0,
      wechatRate: weekStats.messages ? (weekStats.wechat / weekStats.messages) * 100 : 0,
      costPerLead: weekStats.messages ? weekStats.spend / weekStats.messages : 0,
      costPerWechat: weekStats.wechat ? weekStats.spend / weekStats.wechat : 0
    },
    history: {
      views: historyStats.views,
      comments: historyStats.comments,
      leads: historyStats.messages,
      wechat: historyStats.wechat,
      effectiveLeads: historyStats.effectiveLeads,
      spend: historyStats.spend,
      leadRate: historyStats.views ? (historyStats.messages / historyStats.views) * 100 : 0,
      wechatRate: historyStats.messages ? (historyStats.wechat / historyStats.messages) * 100 : 0,
      costPerLead: historyStats.messages ? historyStats.spend / historyStats.messages : 0,
      costPerWechat: historyStats.wechat ? historyStats.spend / historyStats.wechat : 0
    }
  };

  return {
    meta: {
      lastSyncAt: accounts.map((a) => a.last_sync_at).filter(Boolean).sort().at(-1) || "",
      onlineAccounts: accounts.filter((a) => a.status === "online").length,
      totalAccounts: accounts.length,
      readOnly: true,
      dataMode: metaMap.data_mode || "seed",
      dataModeLabel:
        metaMap.data_mode === "douyin_creator_real"
          ? `抖音创作者中心真实同步 · ${works.length} 条作品 · ${
              works.filter((work) => work.cover_local_path || work.cover_url).length
            } 张封面`
          : metaMap.data_mode_label || "示例数据 · 待接入真实同步"
    },
    totals,
    todayStats,
    weekStats,
    historyStats,
    dailyFunnels,
    funnelAnalysis,
    todayManual,
    entryManual,
    accounts,
    works,
    selectedWork: selected,
    selectedKeywords: keywords,
    remixPool,
    logs,
    trend,
    display: {
      views: formatCompact(totals.views),
      interactions: formatCompact(totals.interactions),
      comments: formatCompact(totals.comments),
      messages: formatCompact(totals.messages),
      wechat: formatCompact(totals.wechat),
      effectiveLeads: formatCompact(totals.effectiveLeads),
      deltaViews: formatCompact(totals.deltaViews),
      deltaComments: formatCompact(totals.deltaComments),
      deltaMessages: formatCompact(totals.deltaMessages),
      deltaWechat: formatCompact(totals.deltaWechat)
    }
  };
}

function statusRank(tag) {
  const index = STATUS_ORDER.indexOf(tag);
  return index === -1 ? 99 : index;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function runSyncScript(scriptName, args = [], options = {}) {
  const scriptPath = path.resolve(process.cwd(), "src", scriptName);
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    timeout: options.timeoutMs || 180000,
    maxBuffer: 1024 * 1024 * 4
  });
  return { script: scriptName, stdout, stderr };
}

function shortErrorMessage(error) {
  const message = String(error?.message || error || "未知错误");
  const privateMessageMatch = message.match(/未找到私信管理入口[^\\n]*/);
  if (privateMessageMatch) return privateMessageMatch[0];
  const firstLine = message.split("\n").find(Boolean) || message;
  return firstLine.slice(0, 180);
}

async function runMatrixSyncNow() {
  ensureMatrixDashboardData();
  const startedAt = nowIso();
  const db = getDb();
  db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
    .run(startedAt, "开始手动同步：作品数据 + 私信线索");

  const results = [];
  results.push(await runSyncScript("sync-matrix-from-douyin-creator.mjs"));
  const warnings = [];
  try {
    results.push(await runSyncScript("sync-matrix-from-douyin-messages.mjs", ["--wait", "8000"]));
  } catch (error) {
    const message = shortErrorMessage(error);
    warnings.push(`线索同步暂未完成：${message}`);
    db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'warn', ?)")
      .run(nowIso(), `线索同步暂未完成：${message}`);
  }

  const finishedAt = nowIso();
  db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
    .run(
      finishedAt,
      warnings.length
        ? "手动同步完成：已刷新作品、封面、播放评论；线索保持上次统计"
        : "手动同步完成：已刷新作品、封面、播放评论和总体线索"
    );

  return { ok: true, startedAt, finishedAt, warnings, results };
}

function findWorkComments(db, workTitle) {
  return db
    .prepare(
      `
      SELECT username, comment_text, reply_message, comment_time, reply_count
      FROM comments
      WHERE work_title = ? OR work_title LIKE ?
      ORDER BY id DESC
      LIMIT 80
    `
    )
    .all(workTitle, `%${workTitle.slice(0, 18)}%`);
}

async function syncCommentsForWork(work) {
  const outputPath = path.resolve("comments-output", `matrix-comments-${work.id}.json`);
  return runSyncScript(
    "export-all-douyin-comments.mjs",
    ["--limit", "300", "--out", outputPath, work.title],
    { timeoutMs: 420000 }
  );
}

function getOpenApiBaseUrl(environment = "formal") {
  return environment === "sandbox" ? "https://open-sandbox.douyin.com" : "https://open.douyin.com";
}

function normalizeOpenApiPath(endpoint = "") {
  const value = String(endpoint || "").trim();
  if (!value) return "/api/match/v2/taskbox/query_agency_video_sum_data/";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

async function callDouyinOpenApi({ endpoint, environment, token, body }) {
  const normalizedEndpoint = normalizeOpenApiPath(endpoint);
  const url = normalizedEndpoint.startsWith("http")
    ? normalizedEndpoint
    : `${getOpenApiBaseUrl(environment)}${normalizedEndpoint}`;
  const headers = { "content-type": "application/json" };
  if (token) {
    headers["access-token"] = token;
    headers.access_token = token;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  return { url, status: response.status, payload };
}

export function getMatrixHtml() {
  const seed = getMatrixOverview();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OM-Media Data Platform</title>
<style>
  :root {
    --bg: #070a12;
    --panel: #0e1422;
    --panel-2: #121b2e;
    --line: rgba(142, 167, 217, .18);
    --text: #eef4ff;
    --muted: #8da0bf;
    --blue: #4d8dff;
    --cyan: #39d7ff;
    --green: #41d98e;
    --red: #ff6370;
    --yellow: #ffd44d;
    --orange: #ff9f43;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at 18% 0%, rgba(77,141,255,.18), transparent 32%),
      radial-gradient(circle at 78% 10%, rgba(57,215,255,.10), transparent 30%),
      var(--bg);
  }
  button, input, select { font: inherit; }
  .app { padding: 22px; max-width: 1920px; margin: 0 auto; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 46px; height: 46px; border-radius: 12px;
    background: linear-gradient(135deg, #1f6bff, #42e4ff);
    display: grid; place-items: center; font-weight: 900; letter-spacing: -1px;
    box-shadow: 0 16px 42px rgba(60,126,255,.28);
  }
  h1 { margin: 0; font-size: 24px; letter-spacing: .02em; }
  .subtitle { color: var(--muted); margin-top: 4px; font-size: 13px; }
  .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .pill, .sync-btn {
    border: 1px solid var(--line); color: var(--text); background: rgba(18,27,46,.82);
    border-radius: 999px; padding: 9px 12px; font-size: 13px;
  }
  .pill.good { border-color: rgba(65,217,142,.34); color: #b8ffd9; background: rgba(65,217,142,.08); }
  .pill.warn { border-color: rgba(255,212,77,.36); color: #fff0b0; background: rgba(255,212,77,.08); }
  .sync-btn { border-radius: 10px; background: linear-gradient(135deg, #2b6fff, #22c7f2); border: 0; cursor: pointer; font-weight: 700; }
  .nav-btn {
    display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
    border: 1px solid rgba(57,215,255,.34); color: #d9fbff; background: rgba(57,215,255,.08);
    border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 800;
  }
  .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
  .ops-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1.15fr; gap: 12px; margin-bottom: 14px; }
  .period-card { padding: 14px; min-height: 138px; }
  .period-card h3 { margin: 0 0 10px; font-size: 14px; }
  .period-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .period-item { border: 1px solid var(--line); border-radius: 9px; padding: 8px; background: rgba(255,255,255,.035); }
  .period-item b { display: block; font-size: 16px; margin-bottom: 2px; }
  .period-item span { color: var(--muted); font-size: 11px; }
  .input-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .input-field label { display: block; color: var(--muted); font-size: 11px; margin-bottom: 5px; }
  .input-field input {
    width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 9px;
    background: rgba(7,10,18,.72); color: var(--text); padding: 9px; font: inherit;
  }
  .note-input {
    width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 9px;
    background: rgba(7,10,18,.72); color: var(--text); padding: 9px; font: inherit;
    margin-top: 8px;
  }
  .manual-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
  .manual-status { color: var(--muted); font-size: 12px; }
  .card {
    background: linear-gradient(180deg, rgba(18,27,46,.95), rgba(11,16,29,.95));
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,.26);
  }
  .kpi { padding: 16px; min-height: 112px; position: relative; overflow: hidden; }
  .kpi::after {
    content: ""; position: absolute; inset: auto -40px -45px auto; width: 110px; height: 110px;
    border-radius: 50%; background: rgba(77,141,255,.12);
  }
  .kpi .label { color: var(--muted); font-size: 13px; }
  .kpi .value { font-size: 30px; font-weight: 850; margin-top: 10px; letter-spacing: -.02em; }
  .kpi .delta { font-size: 12px; color: var(--green); margin-top: 10px; }
  .grid { display: grid; grid-template-columns: 1.95fr 1fr; gap: 14px; }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px 10px; }
  .section-title h2 { margin: 0; font-size: 16px; }
  .section-title span { color: var(--muted); font-size: 12px; }
  .section-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .ghost-btn {
    border: 1px solid var(--line); background: rgba(255,255,255,.045); color: #d8e5ff;
    border-radius: 9px; padding: 7px 10px; cursor: pointer; font-size: 12px; font-weight: 700;
  }
  .ghost-btn:hover { border-color: rgba(77,141,255,.62); background: rgba(77,141,255,.14); }
  .works-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 14px 14px; }
  .work-card {
    border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: rgba(7,10,18,.64);
    cursor: pointer; transition: transform .18s ease, border-color .18s ease, background .18s ease;
  }
  .work-card:hover, .work-card.active { transform: translateY(-2px); border-color: rgba(77,141,255,.65); background: rgba(17,28,52,.86); }
  .cover {
    height: 146px; position: relative; overflow: hidden; background: #17243e;
  }
  .cover.has-image {
    background-position: center;
    background-size: cover;
  }
  .cover::before {
    content: ""; position: absolute; inset: 0;
    background:
      linear-gradient(180deg, transparent 35%, rgba(0,0,0,.7)),
      radial-gradient(circle at 24% 24%, rgba(255,255,255,.58), transparent 9%),
      radial-gradient(circle at 58% 48%, rgba(255,255,255,.20), transparent 16%),
      linear-gradient(135deg, var(--tone-a), var(--tone-b));
  }
  .cover.has-image::before {
    background: linear-gradient(180deg, rgba(0,0,0,.02) 35%, rgba(0,0,0,.74));
  }
  .cover::after {
    content: ""; position: absolute; left: 14px; right: 14px; bottom: 42px; height: 32px;
    border-radius: 10px; border: 1px solid rgba(255,255,255,.25);
    background: rgba(255,255,255,.16); box-shadow: 30px 22px 0 rgba(255,255,255,.10), 94px 20px 0 rgba(255,255,255,.08);
  }
  .tone-yellow { --tone-a: #2c3144; --tone-b: #d9a71b; }
  .tone-teal { --tone-a: #123c4a; --tone-b: #28d1c6; }
  .tone-blue { --tone-a: #142650; --tone-b: #397bff; }
  .tone-green { --tone-a: #123d2b; --tone-b: #42d98f; }
  .tone-purple { --tone-a: #221b4d; --tone-b: #916cff; }
  .tone-orange { --tone-a: #352111; --tone-b: #ff9f43; }
  .cover-stat { position: absolute; left: 10px; bottom: 10px; z-index: 2; font-weight: 800; }
  .badge-row { position: absolute; z-index: 2; top: 10px; right: 10px; display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
  .badge {
    font-size: 11px; padding: 4px 7px; border-radius: 999px; background: rgba(0,0,0,.48);
    border: 1px solid rgba(255,255,255,.22);
  }
  .badge.hot { color: #fff2b0; border-color: rgba(255,212,77,.55); }
  .badge.lead { color: #b8ffd9; border-color: rgba(65,217,142,.55); }
  .work-body { padding: 11px; }
  .work-title { font-weight: 800; line-height: 1.35; min-height: 38px; }
  .publish-time { color: #b8c7e6; font-size: 12px; margin-top: 7px; display: flex; align-items: center; gap: 6px; }
  .publish-time::before { content: "◷"; color: var(--cyan); }
  .meta { color: var(--muted); font-size: 12px; margin-top: 7px; display: flex; gap: 6px; flex-wrap: wrap; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; }
  .metric { background: rgba(255,255,255,.035); border-radius: 8px; padding: 7px 5px; text-align: center; }
  .metric b { display: block; font-size: 13px; }
  .metric span { color: var(--muted); font-size: 11px; }
  .side { display: grid; gap: 14px; }
  .panel-body { padding: 0 16px 16px; }
  .account-row, .todo-row, .log-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid var(--line);
  }
  .account-row:last-child, .todo-row:last-child, .log-row:last-child { border-bottom: 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block; margin-right: 8px; }
  .dot.off { background: var(--red); }
  .small { color: var(--muted); font-size: 12px; margin-top: 3px; }
  .status { padding: 5px 8px; border-radius: 999px; font-size: 12px; background: rgba(65,217,142,.10); color: #b8ffd9; }
  .status.warn { background: rgba(255,99,112,.10); color: #ffc5cb; }
  .scope { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
  .scope span { border: 1px solid var(--line); border-radius: 999px; padding: 6px 8px; color: #c9d8f4; font-size: 12px; }
  .safety span { border-color: rgba(65,217,142,.3); color: #b8ffd9; background: rgba(65,217,142,.06); }
  .lower { display: grid; grid-template-columns: 1.2fr .9fr .8fr; gap: 14px; margin-top: 14px; }
  .detail-head { display: flex; gap: 12px; align-items: center; }
  .mini-cover {
    width: 168px; height: 106px; border-radius: 10px; background: linear-gradient(135deg, #283b66, #ffcc35);
    flex: 0 0 auto; background-position: center; background-size: cover; position: relative; overflow: hidden;
  }
  .mini-cover::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.42));
  }
  .play-btn {
    position: absolute; inset: 0; z-index: 2; margin: auto; width: 48px; height: 48px;
    border-radius: 999px; border: 1px solid rgba(255,255,255,.52);
    background: rgba(8,12,22,.58); color: #fff; cursor: pointer;
    display: grid; place-items: center; box-shadow: 0 14px 32px rgba(0,0,0,.36);
  }
  .play-btn::before {
    content: ""; width: 0; height: 0; margin-left: 4px;
    border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 15px solid #fff;
  }
  .play-btn:hover { transform: scale(1.04); background: rgba(43,111,255,.72); }
  .delta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .delta-box { background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
  .delta-box b { display: block; color: #b8ffd9; margin-top: 4px; }
  .keywords { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
  .keywords span { border-radius: 999px; padding: 6px 8px; background: rgba(77,141,255,.12); color: #cfe0ff; font-size: 12px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .actions button { border: 1px solid var(--line); background: rgba(255,255,255,.04); color: var(--text); border-radius: 9px; padding: 8px 10px; cursor: pointer; }
  .actions button:hover { border-color: rgba(77,141,255,.62); background: rgba(77,141,255,.12); }
  .detail-result { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.035); padding: 12px; display: none; }
  .detail-result.open { display: block; }
  .detail-result h3 { margin: 0 0 8px; font-size: 14px; }
  .detail-result pre {
    white-space: pre-wrap; word-break: break-word; margin: 0; color: #dce8ff;
    font-family: inherit; line-height: 1.55; font-size: 13px;
  }
  .comment-list { display: grid; gap: 8px; margin-top: 8px; max-height: 260px; overflow: auto; }
  .comment-item { border: 1px solid var(--line); border-radius: 10px; padding: 9px; background: rgba(7,10,18,.38); }
  .comment-item b { display: block; margin-bottom: 4px; }
  .funnel { display: grid; gap: 9px; padding-top: 2px; }
  .funnel-row { display: grid; grid-template-columns: 70px 1fr 70px; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
  .bar { height: 11px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2b6fff, #34d2ff); }
  .daily-funnel { display: grid; gap: 8px; }
  .funnel-table { display: grid; gap: 6px; font-size: 12px; }
  .funnel-table-row {
    display: grid; grid-template-columns: 44px 1fr 54px 48px 48px; gap: 8px; align-items: center;
    color: #c9d8f4;
  }
  .funnel-table-row.head { color: var(--muted); font-size: 11px; }
  .mini-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden; }
  .mini-bar i { display: block; height: 100%; background: linear-gradient(90deg, #2b6fff, #39d7ff); border-radius: inherit; }
  .funnel-total { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 10px; }
  .funnel-total-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 8px; }
  .funnel-total-grid div { background: rgba(255,255,255,.035); border: 1px solid var(--line); border-radius: 9px; padding: 8px; }
  .funnel-total-grid b { display: block; color: #b8ffd9; }
  .funnel-total-grid span { color: var(--muted); font-size: 11px; }
  .todo-row button { border: 1px solid var(--line); background: transparent; color: #cfe0ff; border-radius: 8px; padding: 6px 8px; cursor: pointer; }
  .bottom { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 14px; margin-top: 14px; }
  .trend { height: 220px; position: relative; margin: 0 16px 16px; }
  .trend svg { width: 100%; height: 100%; display: block; }
  .trend-legend { display: flex; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 11px; padding: 0 16px 10px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
  .log-row { justify-content: flex-start; color: #d8e5ff; }
  .log-time { color: var(--muted); min-width: 48px; }
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center;
    padding: 24px; background: rgba(3, 7, 15, .72); backdrop-filter: blur(10px);
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    width: min(920px, 100%); max-height: min(780px, calc(100vh - 48px)); overflow: auto;
    background: linear-gradient(180deg, rgba(18,27,46,.98), rgba(9,14,25,.98));
    border: 1px solid rgba(142,167,217,.28); border-radius: 14px;
    box-shadow: 0 30px 100px rgba(0,0,0,.52);
  }
  .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 10px; }
  .modal-head h2 { margin: 0; font-size: 18px; }
  .close-btn {
    width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--line);
    background: rgba(255,255,255,.045); color: var(--text); cursor: pointer; font-size: 20px; line-height: 1;
  }
  .modal-body { padding: 0 18px 18px; }
  @media (max-width: 1200px) {
    .kpis { grid-template-columns: repeat(3, 1fr); }
    .ops-row { grid-template-columns: 1fr 1fr; }
    .grid, .lower, .bottom { grid-template-columns: 1fr; }
    .works-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 760px) {
    .app { padding: 14px; }
    .kpis, .ops-row, .works-grid, .delta-grid, .input-grid { grid-template-columns: 1fr; }
    .topbar { align-items: flex-start; flex-direction: column; }
  }
</style>
</head>
<body>
<main class="app">
  <div class="topbar">
    <div class="brand">
      <div class="logo">OM</div>
      <div>
        <h1>OM-Media Data Platform</h1>
        <div class="subtitle">每日更新数据中台 · 矩阵内容作战台 · 只读采集</div>
      </div>
    </div>
    <div class="toolbar">
      <span class="pill" id="todayDate">运营日期 --</span>
      <span class="pill" id="lastSync">最近同步 --</span>
      <span class="pill" id="onlineState">账号在线 --</span>
      <span class="pill good">只读模式已开启</span>
      <span class="pill warn" id="dataMode">示例数据</span>
      <a class="nav-btn" href="/matrix/funnel">漏斗分析</a>
      <a class="nav-btn" href="/matrix/openapi">OpenAPI</a>
      <button class="sync-btn" id="syncBtn">同步数据</button>
    </div>
  </div>

  <section class="kpis" id="kpis"></section>
  <section class="ops-row">
    <article class="card period-card" id="todaySummary"></article>
    <article class="card period-card" id="weekSummary"></article>
    <article class="card period-card" id="historySummary"></article>
    <article class="card period-card" id="funnelShortcut"></article>
  </section>

  <section class="grid">
    <div class="card">
      <div class="section-title">
        <h2>抖音作品表现墙</h2>
        <div class="section-actions">
          <span id="worksSummary">按作品母版聚合，不重复展示</span>
          <button class="ghost-btn" id="toggleWorksBtn">展开全部</button>
        </div>
      </div>
      <div class="works-grid" id="worksGrid"></div>
    </div>
    <div class="side">
      <div class="card">
        <div class="section-title"><h2>转化漏斗</h2><span>播放到线索</span></div>
        <div class="panel-body">
          <div class="funnel" id="funnel"></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title"><h2>今日待办</h2><span>运营优先级</span></div>
        <div class="panel-body" id="todos"></div>
      </div>
    </div>
  </section>

  <section class="bottom">
    <div class="card">
      <div class="section-title"><h2>近7天趋势</h2><span>播放 / 线索 / 微信</span></div>
      <div class="trend" id="trend"></div>
    </div>
    <div class="card">
      <div class="section-title"><h2>同步器状态</h2><span>只读采集</span></div>
      <div class="panel-body" id="syncState"></div>
    </div>
    <div class="card">
      <div class="section-title"><h2>数据采集日志</h2><span>最近任务</span></div>
      <div class="panel-body" id="logs"></div>
    </div>
  </section>
</main>
<div class="modal-backdrop" id="detailModal" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
    <div class="modal-head">
      <h2 id="detailTitle">选中作品详情</h2>
      <button class="close-btn" id="closeDetailBtn" aria-label="关闭">×</button>
    </div>
    <div class="modal-body" id="detail"></div>
  </div>
</div>
<script>
const initialData = ${safeJson(seed)};
let data = initialData;
let selectedId = data.selectedWork?.id;
let worksExpanded = false;
const collapsedWorksLimit = 6;

const fmt = new Intl.NumberFormat('zh-CN');
function compact(v) {
  const n = Number(v || 0);
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 1 : 2).replace(/\\.0$/, '') + '万';
  return fmt.format(n);
}
function timeLabel(value) {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
function dateTimeLabel(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
function operatingDateLabel() {
  const date = new Date();
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  const ymd = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replaceAll('/', '-');
  return \`运营日期 \${ymd} \${weekday}\`;
}
function split(value) {
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean);
}
function statusClass(tag) {
  if (tag === '爆款') return 'hot';
  if (tag === '询盘高') return 'lead';
  return '';
}
function coverStyle(work) {
  const url = work.cover_local_path || work.cover_url || '';
  if (!url) return '';
  return \` style="background-image:url('\${String(url).replace(/'/g, '%27')}')"\`;
}
function inlineBg(url) {
  if (!url) return '';
  return \`background-image:url('\${String(url).replace(/'/g, '%27')}')\`;
}
function attr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function html(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderKpis() {
  const today = data.todayStats;
  const week = data.weekStats;
  const history = data.historyStats;
  const rows = [
    ['今日新增播放', compact(today.views), '来自平台快照差值'],
    ['今日新增评论', compact(today.comments), '来自平台快照差值'],
    ['今日新增线索', compact(today.messages), '抖音私信粗略定义'],
    ['今日微信进量', compact(today.wechat), '手填'],
    ['本周微信进量', compact(week.wechat), week.startDate + ' 起'],
    ['历史总播放', compact(history.views), data.works.length + ' 条作品']
  ];
  document.getElementById('kpis').innerHTML = rows.map(([label, value, delta]) => \`
    <article class="card kpi"><div class="label">\${label}</div><div class="value">\${value}</div><div class="delta">\${delta}</div></article>
  \`).join('');
}
function periodItems(items) {
  return \`<div class="period-grid">\${items.map(([label, value]) => \`
    <div class="period-item"><b>\${compact(value)}</b><span>\${label}</span></div>
  \`).join('')}</div>\`;
}
function renderPeriodSummaries() {
  document.getElementById('todaySummary').innerHTML = \`
    <h3>今日新增</h3>
    \${periodItems([
      ['播放', data.todayStats.views],
      ['评论', data.todayStats.comments],
      ['线索', data.todayStats.messages],
      ['微信', data.todayStats.wechat]
    ])}
  \`;
  document.getElementById('weekSummary').innerHTML = \`
    <h3>本周合计</h3>
    \${periodItems([
      ['播放', data.weekStats.views],
      ['评论', data.weekStats.comments],
      ['线索', data.weekStats.messages],
      ['微信', data.weekStats.wechat]
    ])}
  \`;
  document.getElementById('historySummary').innerHTML = \`
    <h3>历史累计</h3>
    \${periodItems([
      ['播放', data.historyStats.views],
      ['评论', data.historyStats.comments],
      ['线索', data.historyStats.messages],
      ['微信', data.historyStats.wechat]
    ])}
  \`;
}
function renderManualInput() {
  const input = data.todayManual || {};
  document.getElementById('manualInput').innerHTML = \`
    <h3>今日漏斗补录</h3>
    <div class="input-grid">
      <div class="input-field"><label>新增线索</label><input id="manualMessages" type="number" min="0" value="\${input.messages || 0}"></div>
      <div class="input-field"><label>新增微信</label><input id="manualWechat" type="number" min="0" value="\${input.wechat || 0}"></div>
      <div class="input-field"><label>获客成本</label><input id="manualSpend" type="number" min="0" step="0.01" value="\${input.spend || 0}"></div>
    </div>
    <div class="input-grid" style="margin-top:8px">
      <div class="input-field"><label>有效线索</label><input id="manualLeads" type="number" min="0" value="\${input.effective_leads || 0}"></div>
      <div class="input-field"><label>微信成本</label><input disabled value="\${input.wechat ? '¥' + (Number(input.spend || 0) / Number(input.wechat || 1)).toFixed(0) : '--'}"></div>
      <div class="input-field"><label>线索成本</label><input disabled value="\${input.messages ? '¥' + (Number(input.spend || 0) / Number(input.messages || 1)).toFixed(0) : '--'}"></div>
    </div>
    <input id="manualNotes" class="note-input" placeholder="备注，例如来自云上互联/人工统计" value="\${attr(input.notes)}">
    <div class="manual-actions">
      <span class="manual-status" id="manualStatus">日期 \${input.date || data.todayStats.date}</span>
      <button class="ghost-btn" id="saveManualBtn">保存补录</button>
    </div>
  \`;
  document.getElementById('saveManualBtn').addEventListener('click', saveManualInput);
}
function renderFunnelShortcut() {
  const today = data.todayStats;
  const leadRate = today.views ? (today.messages / today.views) * 100 : 0;
  const wechatRate = today.messages ? (today.wechat / today.messages) * 100 : 0;
  const items = [
    ['今日线索率', leadRate.toFixed(2) + '%'],
    ['今日微信率', wechatRate.toFixed(2) + '%'],
    ['今日成本', data.todayStats.spend ? '¥' + compact(data.todayStats.spend) : '--'],
    ['微信成本', data.todayStats.wechat ? '¥' + compact(data.todayStats.spend / data.todayStats.wechat) : '--']
  ];
  document.getElementById('funnelShortcut').innerHTML = \`
    <h3>漏斗分析</h3>
    <div class="period-grid">\${items.map(([label, value]) => \`
      <div class="period-item"><b>\${value}</b><span>\${label}</span></div>
    \`).join('')}</div>
    <div class="manual-actions">
      <span class="manual-status">填写微信和成本在分析页</span>
      <a class="ghost-btn" style="text-decoration:none" href="/matrix/funnel">进入</a>
    </div>
  \`;
}
async function saveManualInput() {
  const button = document.getElementById('saveManualBtn');
  const status = document.getElementById('manualStatus');
  button.disabled = true;
  button.textContent = '保存中...';
  try {
    const payload = {
      date: data.todayStats.date,
      messages: Number(document.getElementById('manualMessages').value || 0),
      wechat: Number(document.getElementById('manualWechat').value || 0),
      effectiveLeads: Number(document.getElementById('manualLeads').value || 0),
      spend: Number(document.getElementById('manualSpend').value || 0),
      notes: document.getElementById('manualNotes').value || ''
    };
    await fetch('/api/matrix/daily-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => {
      if (!r.ok) throw new Error('保存失败');
      return r.json();
    });
    data = await fetch('/api/matrix/overview').then(r => r.json());
    renderAll();
  } catch (error) {
    status.textContent = error?.message || '保存失败';
  } finally {
    button.disabled = false;
    button.textContent = '保存补录';
  }
}
function renderHeader() {
  document.getElementById('todayDate').textContent = operatingDateLabel();
  document.getElementById('lastSync').textContent = '最近同步 ' + dateTimeLabel(data.meta.lastSyncAt);
  document.getElementById('onlineState').textContent = \`账号在线 \${data.meta.onlineAccounts}/\${data.meta.totalAccounts}\`;
  document.getElementById('dataMode').textContent = data.meta.dataModeLabel || '示例数据';
}
function renderWorks() {
  const visibleWorks = worksExpanded ? data.works : data.works.slice(0, collapsedWorksLimit);
  const totalWorks = data.works.length;
  document.getElementById('worksSummary').textContent =
    \`展示 \${visibleWorks.length} / 共 \${totalWorks} 条 · 按作品母版聚合\`;
  const toggleBtn = document.getElementById('toggleWorksBtn');
  toggleBtn.textContent = worksExpanded ? '收起作品墙' : \`展开全部 \${totalWorks} 条\`;
  toggleBtn.style.display = totalWorks > collapsedWorksLimit ? '' : 'none';

  document.getElementById('worksGrid').innerHTML = visibleWorks.map(work => {
    const statuses = split(work.status_tags);
    const tags = split(work.tags).slice(0, 3);
    return \`
      <article class="work-card \${work.id === selectedId ? 'active' : ''}" data-id="\${work.id}">
        <div class="cover tone-\${work.cover_tone} \${(work.cover_local_path || work.cover_url) ? 'has-image' : ''}"\${coverStyle(work)}>
          <div class="badge-row">\${statuses.map(s => \`<span class="badge \${statusClass(s)}">\${s}</span>\`).join('')}</div>
          <div class="cover-stat">▶ \${compact(work.views)}</div>
        </div>
        <div class="work-body">
          <div class="work-title">\${work.title}</div>
          <div class="publish-time">发布时间 \${work.published_at || '--'}</div>
          <div class="meta"><span>\${work.account_name}</span>\${tags.map(t => \`<span>#\${t}</span>\`).join('')}</div>
          <div class="metrics">
            <div class="metric"><b>\${compact(work.views)}</b><span>播放</span></div>
            <div class="metric"><b>\${compact(work.comments)}</b><span>评论</span></div>
            <div class="metric"><b>\${compact(work.likes)}</b><span>点赞</span></div>
            <div class="metric"><b>\${compact(work.shares)}</b><span>分享</span></div>
          </div>
        </div>
      </article>
    \`;
  }).join('');
  document.querySelectorAll('.work-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedId = card.dataset.id;
      renderWorks();
      renderDetail();
      openDetailModal();
    });
  });
}
function renderSyncState() {
  const accountRows = data.accounts.map(account => \`
    <div class="account-row">
      <div><span class="dot \${account.status === 'online' ? '' : 'off'}"></span><b>\${account.name}</b><div class="small">\${account.owner} · \${account.platform}</div></div>
      <span class="status \${account.status === 'online' ? '' : 'warn'}">\${account.status === 'online' ? '在线 已同步' : '离线 Cookie需更新'}</span>
    </div>
  \`).join('');
  document.getElementById('syncState').innerHTML = \`
    \${accountRows}
    <div class="small" style="margin-top:14px">采集范围</div>
    <div class="scope"><span>✓ 作品数据</span><span>✓ 评论数据</span><span>✓ 总体线索</span><span>✓ 账号状态</span></div>
    <div class="small" style="margin-top:14px">安全边界</div>
    <div class="scope safety"><span>只读采集</span><span>不自动回复</span><span>不主动私信</span><span>不批量操作</span></div>
  \`;
}
function selectedWork() {
  return data.works.find(w => w.id === selectedId) || data.works[0];
}
function renderDetail() {
  const work = selectedWork();
  const keywords = work.id === data.selectedWork?.id ? data.selectedKeywords : [];
  const coverUrl = work.cover_local_path || work.cover_url || '';
  const inRemixPool = data.remixPool?.some(item => item.work_id === work.id);
  document.getElementById('detail').innerHTML = \`
    <div class="detail-head">
      <div class="mini-cover" style="\${inlineBg(coverUrl)}">
        \${work.video_url ? '<button class="play-btn" id="playVideoBtn" aria-label="播放视频"></button>' : ''}
      </div>
      <div>
        <b>\${work.title}</b>
        <div class="small">\${work.account_name} · \${work.published_at}</div>
      </div>
    </div>
    <div class="delta-grid">
      <div class="delta-box"><span>播放变化</span><b>+\${compact(work.delta_views)}</b></div>
      <div class="delta-box"><span>评论变化</span><b>+\${compact(work.delta_comments)}</b></div>
      <div class="delta-box"><span>点赞</span><b>\${compact(work.likes)}</b></div>
      <div class="delta-box"><span>分享</span><b>\${compact(work.shares)}</b></div>
    </div>
    <div class="delta-grid">
      <div class="delta-box"><span>封面点击率</span><b>\${Number(work.click_rate).toFixed(1)}%</b></div>
      <div class="delta-box"><span>平均观看</span><b>\${Number(work.avg_watch_seconds).toFixed(1)}s</b></div>
      <div class="delta-box"><span>完播率</span><b>\${Number(work.completion_rate).toFixed(1)}%</b></div>
      <div class="delta-box"><span>评论率</span><b>\${((work.comments / Math.max(1, work.views)) * 100).toFixed(3)}%</b></div>
    </div>
    <div class="keywords">\${keywords.length ? keywords.map(k => \`<span>\${k.keyword}</span>\`).join('') : split(work.tags).map(k => \`<span>\${k}</span>\`).join('')}</div>
    <div class="actions">
      <button id="reviewBtn">生成复盘</button>
      <button id="remixBtn">\${inRemixPool ? '已在二创池' : '加入二创池'}</button>
      <button id="messagesBtn">查看线索</button>
      <button id="commentsBtn">查看评论</button>
    </div>
    <div class="detail-result" id="detailResult"></div>
  \`;
  const playBtn = document.getElementById('playVideoBtn');
  if (playBtn) {
    playBtn.addEventListener('click', event => {
      event.stopPropagation();
      window.open(work.video_url, '_blank', 'noopener,noreferrer');
    });
  }
  document.getElementById('reviewBtn').addEventListener('click', () => showReview(work));
  document.getElementById('remixBtn').addEventListener('click', () => addToRemixPool(work));
  document.getElementById('messagesBtn').addEventListener('click', () => showMessages(work));
  document.getElementById('commentsBtn').addEventListener('click', () => showComments(work));
}
function setDetailResult(title, bodyHtml) {
  const result = document.getElementById('detailResult');
  result.classList.add('open');
  result.innerHTML = \`<h3>\${html(title)}</h3>\${bodyHtml}\`;
}
function reviewText(work) {
  const tags = split(work.tags).map(tag => '#' + tag).join(' ');
  const commentRate = ((work.comments / Math.max(1, work.views)) * 100).toFixed(3);
  const shareRate = ((work.shares / Math.max(1, work.views)) * 100).toFixed(3);
  const transcript = String(work.transcript || '').trim();
  const transcriptSummary = transcript
    ? transcript.slice(0, 500)
    : '待接入字幕/逐字稿。后续可从剪映草稿、NAS 转写、飞书表格或本地 Whisper 写入 transcript 字段。';
  const remixReason = Number(work.views) >= 10000 || Number(work.comments) >= 100
    ? '建议进入二创：已有播放或评论验证。'
    : '建议观察：先看后续评论、分享和总体线索变化。';
  return [
    \`作品：\${work.title}\`,
    \`账号：\${work.account_name}｜发布时间：\${work.published_at || '--'}\`,
    \`标签：\${tags || '--'}\`,
    '',
    \`数据：播放 \${compact(work.views)}，评论 \${compact(work.comments)}，点赞 \${compact(work.likes)}，分享 \${compact(work.shares)}\`,
    \`效率：评论率 \${commentRate}%｜分享率 \${shareRate}%\`,
    '',
    \`字幕/逐字稿：\${transcriptSummary}\`,
    '',
    \`判断：\${remixReason}\`,
    '可复用内核：标题里的城市/时间节点/全英授课信息，可以继续拆成不同城市、不同年龄段、不同家长痛点版本。',
    '下一步：保留同类封面风格，换第一句钩子；优先追踪评论关键词、分享率和总体线索转微信。'
  ].join('\\n');
}
function showReview(work) {
  const text = reviewText(work);
  setDetailResult('复盘草稿', \`
    <pre>\${html(text)}</pre>
    <div class="actions"><button id="copyReviewBtn">复制复盘</button></div>
  \`);
  document.getElementById('copyReviewBtn').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(text).catch(() => {});
    document.getElementById('copyReviewBtn').textContent = '已复制';
  });
}
async function addToRemixPool(work) {
  const button = document.getElementById('remixBtn');
  button.disabled = true;
  button.textContent = '加入中...';
  try {
    const response = await fetch('/api/matrix/remix-pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId: work.id, note: reviewText(work).slice(0, 280) })
    });
    if (!response.ok) throw new Error('加入失败');
    data = await fetch('/api/matrix/overview').then(r => r.json());
    button.textContent = '已在二创池';
    setDetailResult('二创池', \`<pre>\${html('已加入二创池。后续可以在这里扩展：负责人、二创脚本、剪辑状态、发布时间。')}</pre>\`);
    renderTodos();
  } catch (error) {
    button.textContent = '加入二创池';
    setDetailResult('二创池', \`<pre>\${html(error?.message || '加入失败')}</pre>\`);
  } finally {
    button.disabled = false;
  }
}
function showMessages(work) {
  const text = [
    \`今日线索：\${compact(data.todayStats.messages)}\`,
    \`本周线索：\${compact(data.weekStats.messages)}\`,
    \`历史线索：\${compact(data.historyStats.messages)}\`,
    '',
    '定义：当前先把抖音总体私信会话粗略定义为线索。',
    '说明：暂不做单条作品私信归因，避免误判；后续如果能拿到会话来源视频字段，再升级到作品级归因。'
  ].join('\\n');
  setDetailResult('线索统计', \`<pre>\${html(text)}</pre>\`);
}
async function showComments(work) {
  setDetailResult('评论', '<pre>正在读取本地评论；如果本地没有，会自动从抖音后台实时抓取...</pre>');
  try {
    const response = await fetch('/api/matrix/work-comments?refresh=auto&workId=' + encodeURIComponent(work.id));
    if (!response.ok) throw new Error('评论读取失败');
    const payload = await response.json();
    if (!payload.comments.length) {
      const message = payload.refreshed
        ? '已实时检查抖音后台，当前没有抓到这条作品的评论。可能平台暂无评论，或作品标题匹配不到后台作品。'
        : '当前本地评论库里还没有匹配到这条作品的评论。';
      setDetailResult('评论', \`<pre>\${html(message)}</pre>\`);
      return;
    }
    const list = payload.comments.map(comment => \`
      <div class="comment-item">
        <b>\${html(comment.username)} <span class="small">\${html(comment.comment_time)}</span></b>
        <div>\${html(comment.comment_text)}</div>
        \${comment.reply_message ? \`<div class="small">已回复：\${html(comment.reply_message)}</div>\` : ''}
      </div>
    \`).join('');
    const source = payload.refreshed ? '实时同步后' : '本地库';
    setDetailResult(\`评论 · \${payload.total} 条 · \${source}\`, \`<div class="comment-list">\${list}</div>\`);
  } catch (error) {
    setDetailResult('评论', \`<pre>\${html(error?.message || '评论读取失败')}</pre>\`);
  }
}
function openDetailModal() {
  const modal = document.getElementById('detailModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
function renderFunnel() {
  const rows = data.dailyFunnels || [];
  const maxViews = Math.max(1, ...rows.map(row => Number(row.views || 0)));
  const table = rows.map(row => \`
    <div class="funnel-table-row">
      <span>\${row.label}</span>
      <div class="mini-bar"><i style="width:\${Math.max(3, (row.views / maxViews) * 100)}%"></i></div>
      <b>\${compact(row.views)}</b>
      <span>\${row.leadRate.toFixed(2)}%</span>
      <span>\${row.wechatRate.toFixed(0)}%</span>
    </div>
  \`).join('');
  document.getElementById('funnel').innerHTML = \`
    <div class="daily-funnel">
      <div class="funnel-table">
        <div class="funnel-table-row head"><span>日期</span><span>播放</span><span>数值</span><span>线索率</span><span>微信率</span></div>
        \${table}
      </div>
      <div class="funnel-total">
        <div class="small">全部总览合计</div>
        <div class="funnel-total-grid">
          <div><b>\${compact(data.historyStats.views)}</b><span>总播放</span></div>
          <div><b>\${compact(data.historyStats.comments)}</b><span>总评论</span></div>
          <div><b>\${compact(data.historyStats.messages)}</b><span>总线索</span></div>
          <div><b>\${compact(data.historyStats.wechat)}</b><span>总微信</span></div>
        </div>
      </div>
    </div>
  \`;
}
function renderTodos() {
  const cookieNeeded = data.accounts.filter(a => a.status !== 'online').length;
  const remixCount = data.remixPool?.length || data.totals.remix;
  const rows = [
    ['待处理线索', data.todayStats.messages],
    ['待归因线索', 8],
    ['待复盘作品', 5],
    ['Cookie需更新', cookieNeeded],
    ['待二创', remixCount]
  ];
  document.getElementById('todos').innerHTML = rows.map(([label, value]) => \`
    <div class="todo-row"><div><b>\${label}</b><div class="small">\${value} 项</div></div><button>查看</button></div>
  \`).join('');
}
function renderTrend() {
  const trend = data.trend || [];
  const maxViews = Math.max(1, ...trend.map(d => Number(d.views || 0)));
  const maxSmall = Math.max(1, ...trend.flatMap(d => [Number(d.messages || 0), Number(d.wechat || 0)]));
  const chart = { left: 42, right: 10, top: 14, bottom: 34, width: 300, height: 150 };
  const x = i => chart.left + (i * (chart.width - chart.left - chart.right)) / Math.max(1, trend.length - 1);
  const y = (value, max) => chart.top + (1 - value / max) * (chart.height - chart.top - chart.bottom);
  const line = (key, max, color) => {
    const points = trend.map((d, i) => \`\${x(i)},\${y(Number(d[key] || 0), max)}\`).join(' ');
    const dots = trend.map((d, i) => \`<circle cx="\${x(i)}" cy="\${y(Number(d[key] || 0), max)}" r="2.4" fill="\${color}"/>\`).join('');
    return \`<polyline points="\${points}" fill="none" stroke="\${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>\${dots}\`;
  };
  const yTicks = [0, .5, 1].map(ratio => {
    const yy = y(maxViews * ratio, maxViews);
    return \`
      <line x1="\${chart.left}" y1="\${yy}" x2="\${chart.width - chart.right}" y2="\${yy}" stroke="rgba(142,167,217,.14)"/>
      <text x="4" y="\${yy + 4}" fill="#8da0bf" font-size="10">\${compact(maxViews * ratio)}</text>
    \`;
  }).join('');
  const xTicks = trend.map((d, i) => \`
    <text x="\${x(i)}" y="\${chart.height - 8}" text-anchor="middle" fill="#8da0bf" font-size="10">\${d.date}</text>
  \`).join('');
  document.getElementById('trend').innerHTML = \`
    <div class="trend-legend">
      <span><i class="legend-dot" style="background:#4d8dff"></i>播放</span>
      <span><i class="legend-dot" style="background:#39d7ff"></i>线索</span>
      <span><i class="legend-dot" style="background:#41d98e"></i>微信</span>
    </div>
    <svg viewBox="0 0 \${chart.width} \${chart.height}" preserveAspectRatio="none">
      \${yTicks}
      <line x1="\${chart.left}" y1="\${chart.top}" x2="\${chart.left}" y2="\${chart.height - chart.bottom}" stroke="rgba(142,167,217,.35)"/>
      <line x1="\${chart.left}" y1="\${chart.height - chart.bottom}" x2="\${chart.width - chart.right}" y2="\${chart.height - chart.bottom}" stroke="rgba(142,167,217,.35)"/>
      \${line('views', maxViews, '#4d8dff')}
      \${line('messages', maxSmall, '#39d7ff')}
      \${line('wechat', maxSmall, '#41d98e')}
      \${xTicks}
    </svg>
  \`;
}
function renderLogs() {
  document.getElementById('logs').innerHTML = data.logs.map(log => \`
    <div class="log-row"><span class="log-time">\${timeLabel(log.logged_at)}</span><span>\${log.message}</span></div>
  \`).join('');
}
function renderAll() {
  renderHeader();
  renderKpis();
  renderPeriodSummaries();
  renderFunnelShortcut();
  renderWorks();
  renderSyncState();
  renderFunnel();
  renderTodos();
  renderTrend();
  renderLogs();
}
document.getElementById('syncBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncBtn');
  btn.textContent = '同步中...';
  btn.disabled = true;
  try {
    const response = await fetch('/api/matrix/sync-now', { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '同步失败');
    }
    data = await fetch('/api/matrix/overview').then(r => r.json());
    selectedId = data.selectedWork?.id;
    worksExpanded = false;
    renderAll();
  } catch (error) {
    alert(error?.message || '同步失败');
  } finally {
    btn.textContent = '同步数据';
    btn.disabled = false;
  }
});
document.getElementById('toggleWorksBtn').addEventListener('click', () => {
  worksExpanded = !worksExpanded;
  renderWorks();
});
document.getElementById('closeDetailBtn').addEventListener('click', closeDetailModal);
document.getElementById('detailModal').addEventListener('click', event => {
  if (event.target.id === 'detailModal') closeDetailModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeDetailModal();
});
renderAll();
</script>
</body>
</html>`;
}

export function getFunnelHtml() {
  const seed = getMatrixOverview();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>漏斗分析 · OM-Media Data Platform</title>
<style>
  :root {
    --bg: #070a12;
    --panel: #0e1422;
    --line: rgba(142, 167, 217, .18);
    --text: #eef4ff;
    --muted: #8da0bf;
    --blue: #4d8dff;
    --cyan: #39d7ff;
    --green: #41d98e;
    --yellow: #ffd44d;
    --red: #ff6370;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    background:
      radial-gradient(circle at 18% 0%, rgba(77,141,255,.18), transparent 32%),
      radial-gradient(circle at 82% 8%, rgba(65,217,142,.11), transparent 30%),
      var(--bg);
  }
  button, input { font: inherit; }
  .app { max-width: 1760px; margin: 0 auto; padding: 24px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; font-weight: 900;
    background: linear-gradient(135deg, #1f6bff, #42e4ff); box-shadow: 0 16px 42px rgba(60,126,255,.28);
  }
  h1 { margin: 0; font-size: 24px; }
  .subtitle { color: var(--muted); margin-top: 4px; font-size: 13px; }
  .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .pill, .nav-btn {
    border: 1px solid var(--line); color: var(--text); background: rgba(18,27,46,.82);
    border-radius: 999px; padding: 9px 12px; font-size: 13px;
  }
  .nav-btn {
    text-decoration: none; border-radius: 10px; font-weight: 800;
    border-color: rgba(57,215,255,.34); color: #d9fbff; background: rgba(57,215,255,.08);
  }
  .card {
    background: linear-gradient(180deg, rgba(18,27,46,.95), rgba(11,16,29,.95));
    border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.26);
  }
  .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
  .kpi { padding: 16px; min-height: 112px; position: relative; overflow: hidden; }
  .kpi::after { content: ""; position: absolute; right: -36px; bottom: -44px; width: 108px; height: 108px; border-radius: 50%; background: rgba(77,141,255,.12); }
  .kpi .label { color: var(--muted); font-size: 13px; }
  .kpi .value { font-size: 28px; font-weight: 850; margin-top: 10px; }
  .kpi .delta { color: var(--green); font-size: 12px; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: 1.35fr .95fr; gap: 14px; }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px 10px; }
  .section-title h2 { margin: 0; font-size: 16px; }
  .section-title span { color: var(--muted); font-size: 12px; }
  .panel-body { padding: 0 16px 16px; }
  .funnel-stage { display: grid; grid-template-columns: 118px 1fr 86px; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .funnel-stage:last-child { border-bottom: 0; }
  .stage-name b { display: block; }
  .stage-name span, .small { color: var(--muted); font-size: 12px; }
  .bar { height: 16px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.06); }
  .bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2b6fff, #39d7ff); }
  .value { text-align: right; font-weight: 850; }
  .table { display: grid; gap: 6px; }
  .table-row {
    display: grid; grid-template-columns: 72px repeat(8, minmax(64px, 1fr)); gap: 8px; align-items: center;
    border: 1px solid transparent; border-radius: 9px; padding: 8px; color: #dce8ff;
  }
  .table-row.head { color: var(--muted); font-size: 12px; background: rgba(255,255,255,.03); }
  .table-row:not(.head) { background: rgba(255,255,255,.025); border-color: rgba(142,167,217,.12); }
  .table-row b { color: #b8ffd9; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
  .chart { height: 260px; padding: 0 16px 16px; }
  .chart svg { display: block; width: 100%; height: 100%; }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; color: var(--muted); font-size: 12px; padding: 0 16px 10px; }
  .dot { width: 8px; height: 8px; display: inline-block; border-radius: 50%; margin-right: 5px; }
  .insights { display: grid; gap: 10px; }
  .insight { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: rgba(255,255,255,.035); }
  .insight b { display: block; margin-bottom: 5px; }
  .insight span { color: var(--muted); font-size: 13px; line-height: 1.55; }
  .input-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .input-field label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .input-field input {
    width: 100%; border: 1px solid var(--line); border-radius: 9px;
    background: rgba(7,10,18,.72); color: var(--text); padding: 10px;
  }
  .note-input {
    width: 100%; margin-top: 10px; border: 1px solid var(--line); border-radius: 9px;
    background: rgba(7,10,18,.72); color: var(--text); padding: 10px;
  }
  .form-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
  .save-btn {
    border: 0; border-radius: 10px; padding: 10px 13px; cursor: pointer; color: #fff; font-weight: 850;
    background: linear-gradient(135deg, #2b6fff, #22c7f2);
  }
  .segmented { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 10px; }
  .segmented button {
    border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.04);
    color: #dce8ff; padding: 7px 11px; cursor: pointer; font-weight: 750;
  }
  .segmented button.active { border-color: rgba(57,215,255,.42); background: rgba(57,215,255,.12); color: #d9fbff; }
  @media (max-width: 1200px) {
    .kpis { grid-template-columns: repeat(3, 1fr); }
    .grid, .charts { grid-template-columns: 1fr; }
    .table-row { grid-template-columns: 70px repeat(4, minmax(64px, 1fr)); overflow: auto; }
  }
  @media (max-width: 760px) {
    .app { padding: 14px; }
    .topbar { align-items: flex-start; flex-direction: column; }
    .kpis { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<main class="app">
  <div class="topbar">
    <div class="brand">
      <div class="logo">OM</div>
      <div>
        <h1>获客漏斗分析</h1>
        <div class="subtitle">每日播放 · 线索 · 微信 · 成本变化</div>
      </div>
    </div>
    <div class="toolbar">
      <span class="pill" id="lastSync">最近同步 --</span>
      <a class="nav-btn" href="/matrix">返回作战台</a>
    </div>
  </div>
  <section class="kpis" id="kpis"></section>
  <section class="card" style="margin-bottom:14px">
    <div class="section-title"><h2>昨日数据填写</h2><span>播放和抖音线索自动统计，只填写花费和新增微信</span></div>
    <div class="panel-body" id="dailyInput"></div>
  </section>
  <section class="grid">
    <article class="card">
      <div class="section-title"><h2>获客漏斗明细</h2><span>日 / 周 / 月</span></div>
      <div class="segmented" id="tableTabs">
        <button class="active" data-view="daily">每日</button>
        <button data-view="weekly">每周</button>
        <button data-view="monthly">每月</button>
      </div>
      <div class="panel-body">
        <div class="table" id="dailyTable"></div>
      </div>
    </article>
    <article class="card">
      <div class="section-title"><h2>漏斗模型</h2><span>本周合计</span></div>
      <div class="panel-body" id="funnelStages"></div>
    </article>
  </section>
  <section class="charts">
    <article class="card">
      <div class="section-title"><h2>获客效率变化</h2><span>线索率 / 微信率</span></div>
      <div class="legend"><span><i class="dot" style="background:#39d7ff"></i>线索率</span><span><i class="dot" style="background:#41d98e"></i>微信率</span></div>
      <div class="chart" id="rateChart"></div>
    </article>
    <article class="card">
      <div class="section-title"><h2>获客成本变化</h2><span>线索成本 / 微信成本</span></div>
      <div class="legend"><span><i class="dot" style="background:#ffd44d"></i>线索成本</span><span><i class="dot" style="background:#ff6370"></i>微信成本</span></div>
      <div class="chart" id="costChart"></div>
    </article>
  </section>
  <section class="grid" style="margin-top:14px">
    <article class="card">
      <div class="section-title"><h2>全部总览</h2><span>历史累计</span></div>
      <div class="panel-body" id="historyFunnel"></div>
    </article>
    <article class="card">
      <div class="section-title"><h2>运营判断</h2><span>自动提示</span></div>
      <div class="panel-body"><div class="insights" id="insights"></div></div>
    </article>
  </section>
</main>
<script>
const data = ${safeJson(seed)};
let tableView = 'daily';
const fmt = new Intl.NumberFormat('zh-CN');
function compact(v) {
  const n = Number(v || 0);
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 1 : 2).replace(/\\.0$/, '') + '万';
  return fmt.format(Math.round(n));
}
function money(v) {
  const n = Number(v || 0);
  if (!n) return '--';
  return '¥' + fmt.format(Math.round(n));
}
function pct(v) {
  return Number(v || 0).toFixed(2) + '%';
}
function dateTimeLabel(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function attr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function renderKpis() {
  const week = data.funnelAnalysis.totals;
  const month = (data.funnelAnalysis.monthly || []).at(-1) || {};
  const history = data.funnelAnalysis.history;
  const rows = [
    ['本周播放', compact(week.views), '7 日新增'],
    ['本周线索', compact(week.leads), '抖音私信'],
    ['本周微信', compact(week.wechat), '人工登记'],
    ['本周微信成本', money(week.costPerWechat), '成本 / 微信'],
    ['本月微信', compact(month.wechat || 0), month.label || '本月'],
    ['历史微信', compact(history.wechat), '累计进量']
  ];
  document.getElementById('kpis').innerHTML = rows.map(([label, value, delta]) => \`
    <article class="card kpi"><div class="label">\${label}</div><div class="value">\${value}</div><div class="delta">\${delta}</div></article>
  \`).join('');
}
function renderDailyInput() {
  const input = data.funnelAnalysis.entryManual || {};
  const entry = data.funnelAnalysis.entryFunnel || {};
  const date = data.funnelAnalysis.entryDate || input.date;
  const leads = Number(entry.leads || input.messages || 0);
  const views = Number(entry.views || 0);
  const comments = Number(entry.comments || 0);
  const costPerLead = leads ? Number(input.spend || 0) / leads : 0;
  const costPerWechat = Number(input.wechat || 0) ? Number(input.spend || 0) / Number(input.wechat || 1) : 0;
  document.getElementById('dailyInput').innerHTML = \`
    <div class="input-grid">
      <div class="input-field"><label>昨日播放</label><input disabled value="\${compact(views)}"></div>
      <div class="input-field"><label>昨日抖音线索</label><input disabled value="\${compact(leads)}"></div>
      <div class="input-field"><label>新增微信</label><input id="manualWechat" type="number" min="0" value="\${input.wechat || 0}"></div>
      <div class="input-field"><label>获客成本</label><input id="manualSpend" type="number" min="0" step="0.01" value="\${input.spend || 0}"></div>
    </div>
    <input id="manualNotes" class="note-input" placeholder="备注，例如投放渠道、素材批次、当天异常" value="\${attr(input.notes)}">
    <div class="form-actions">
      <span class="small">统计日期 \${date} · 评论 \${compact(comments)} · 线索成本 \${money(costPerLead)} · 微信成本 \${money(costPerWechat)}</span>
      <button class="save-btn" id="saveDailyInputBtn">保存昨日数据</button>
    </div>
  \`;
  document.getElementById('saveDailyInputBtn').addEventListener('click', saveDailyInput);
}
async function saveDailyInput() {
  const button = document.getElementById('saveDailyInputBtn');
  button.disabled = true;
  button.textContent = '保存中...';
  try {
    const payload = {
      date: data.funnelAnalysis.entryDate,
      messages: Number(data.funnelAnalysis.entryFunnel?.leads || data.funnelAnalysis.entryManual?.messages || 0),
      wechat: Number(document.getElementById('manualWechat').value || 0),
      effectiveLeads: Number(data.funnelAnalysis.entryFunnel?.leads || data.funnelAnalysis.entryManual?.messages || 0),
      spend: Number(document.getElementById('manualSpend').value || 0),
      notes: document.getElementById('manualNotes').value || ''
    };
    const response = await fetch('/api/matrix/daily-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('保存失败');
    location.reload();
  } catch (error) {
    button.disabled = false;
    button.textContent = error?.message || '保存失败';
  }
}
function renderDailyTable() {
  const rows = data.funnelAnalysis[tableView] || [];
  const labels = { daily: '日期', weekly: '周', monthly: '月份' };
  document.getElementById('dailyTable').innerHTML = \`
    <div class="table-row head"><span>\${labels[tableView]}</span><span>播放</span><span>评论</span><span>线索</span><span>微信</span><span>线索率</span><span>微信率</span><span>成本</span><span>微信成本</span></div>
    \${rows.map(row => \`
      <div class="table-row">
        <b>\${row.label}</b>
        <span>\${compact(row.views)}</span>
        <span>\${compact(row.comments)}</span>
        <span>\${compact(row.leads)}</span>
        <span>\${compact(row.wechat)}</span>
        <span>\${pct(row.leadRate)}</span>
        <span>\${pct(row.wechatRate)}</span>
        <span>\${money(row.spend)}</span>
        <span>\${money(row.costPerWechat)}</span>
      </div>
    \`).join('')}
  \`;
}
function bindTableTabs() {
  document.querySelectorAll('#tableTabs button').forEach(button => {
    button.addEventListener('click', () => {
      tableView = button.dataset.view;
      document.querySelectorAll('#tableTabs button').forEach(item => item.classList.toggle('active', item === button));
      renderDailyTable();
    });
  });
}
function stageHtml(stageRows) {
  const max = Math.max(1, ...stageRows.map(row => Number(row.value || 0)));
  return stageRows.map(row => \`
    <div class="funnel-stage">
      <div class="stage-name"><b>\${row.name}</b><span>\${row.note}</span></div>
      <div class="bar"><i style="width:\${Math.max(4, (row.value / max) * 100)}%"></i></div>
      <div class="value">\${compact(row.value)}</div>
    </div>
  \`).join('');
}
function renderFunnelStages() {
  const week = data.funnelAnalysis.totals;
  const history = data.funnelAnalysis.history;
  document.getElementById('funnelStages').innerHTML = stageHtml([
    { name: 'A1 曝光', note: '播放新增', value: week.views },
    { name: 'A2 互动', note: '评论新增', value: week.comments },
    { name: 'A3 线索', note: '抖音私信', value: week.leads },
    { name: 'A4 微信', note: '人工登记', value: week.wechat },
    { name: '成本', note: '本周投入', value: week.spend }
  ]);
  document.getElementById('historyFunnel').innerHTML = stageHtml([
    { name: '总曝光', note: '历史播放', value: history.views },
    { name: '总互动', note: '历史评论', value: history.comments },
    { name: '总线索', note: '历史私信', value: history.leads },
    { name: '总微信', note: '历史登记', value: history.wechat },
    { name: '总成本', note: '历史投入', value: history.spend }
  ]);
}
function renderLineChart(elId, series) {
  const rows = data.funnelAnalysis.daily || [];
  const max = Math.max(1, ...series.flatMap(item => rows.map(row => Number(row[item.key] || 0))));
  const chart = { left: 42, right: 10, top: 12, bottom: 34, width: 320, height: 180 };
  const x = i => chart.left + (i * (chart.width - chart.left - chart.right)) / Math.max(1, rows.length - 1);
  const y = value => chart.top + (1 - value / max) * (chart.height - chart.top - chart.bottom);
  const lines = series.map(item => {
    const points = rows.map((row, i) => \`\${x(i)},\${y(Number(row[item.key] || 0))}\`).join(' ');
    const dots = rows.map((row, i) => \`<circle cx="\${x(i)}" cy="\${y(Number(row[item.key] || 0))}" r="2.4" fill="\${item.color}"/>\`).join('');
    return \`<polyline points="\${points}" fill="none" stroke="\${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>\${dots}\`;
  }).join('');
  const yTicks = [0, .5, 1].map(ratio => {
    const yy = y(max * ratio);
    return \`<line x1="\${chart.left}" y1="\${yy}" x2="\${chart.width - chart.right}" y2="\${yy}" stroke="rgba(142,167,217,.14)"/><text x="4" y="\${yy + 4}" fill="#8da0bf" font-size="10">\${series[0].money ? money(max * ratio) : pct(max * ratio)}</text>\`;
  }).join('');
  const xTicks = rows.map((row, i) => \`<text x="\${x(i)}" y="\${chart.height - 8}" text-anchor="middle" fill="#8da0bf" font-size="10">\${row.label}</text>\`).join('');
  document.getElementById(elId).innerHTML = \`
    <svg viewBox="0 0 \${chart.width} \${chart.height}" preserveAspectRatio="none">
      \${yTicks}
      <line x1="\${chart.left}" y1="\${chart.top}" x2="\${chart.left}" y2="\${chart.height - chart.bottom}" stroke="rgba(142,167,217,.35)"/>
      <line x1="\${chart.left}" y1="\${chart.height - chart.bottom}" x2="\${chart.width - chart.right}" y2="\${chart.height - chart.bottom}" stroke="rgba(142,167,217,.35)"/>
      \${lines}
      \${xTicks}
    </svg>
  \`;
}
function renderInsights() {
  const today = (data.funnelAnalysis.daily || []).at(-1) || {};
  const week = data.funnelAnalysis.totals;
  const rows = [
    ['今日效率', \`今天播放 \${compact(today.views)}，线索 \${compact(today.leads)}，微信 \${compact(today.wechat)}，线索率 \${pct(today.leadRate)}。\`],
    ['成本判断', week.spend ? \`本周投入 \${money(week.spend)}，线索成本 \${money(week.costPerLead)}，微信成本 \${money(week.costPerWechat)}。\` : '还没有登记成本，登记后这里会自动显示 CPL 和微信成本。'],
    ['下步动作', today.leads && !today.wechat ? '今天已有线索但微信登记为 0，优先追踪私信到微信的承接。' : '继续保持每日同步和微信登记，7 天后趋势会更稳定。']
  ];
  document.getElementById('insights').innerHTML = rows.map(([title, body]) => \`<div class="insight"><b>\${title}</b><span>\${body}</span></div>\`).join('');
}
document.getElementById('lastSync').textContent = '最近同步 ' + dateTimeLabel(data.meta.lastSyncAt);
renderKpis();
renderDailyInput();
renderDailyTable();
bindTableTabs();
renderFunnelStages();
renderLineChart('rateChart', [
  { key: 'leadRate', color: '#39d7ff' },
  { key: 'wechatRate', color: '#41d98e' }
]);
renderLineChart('costChart', [
  { key: 'costPerLead', color: '#ffd44d', money: true },
  { key: 'costPerWechat', color: '#ff6370', money: true }
]);
renderInsights();
</script>
</body>
</html>`;
}

export function getOpenApiHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>抖音 OpenAPI 接入测试 · OM-Media</title>
<style>
  :root {
    --bg: #070a12;
    --panel: #0e1422;
    --line: rgba(142, 167, 217, .18);
    --text: #eef4ff;
    --muted: #8da0bf;
    --blue: #4d8dff;
    --cyan: #39d7ff;
    --green: #41d98e;
    --red: #ff6370;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    background:
      radial-gradient(circle at 18% 0%, rgba(77,141,255,.18), transparent 32%),
      radial-gradient(circle at 82% 8%, rgba(57,215,255,.10), transparent 30%),
      var(--bg);
  }
  button, input, textarea, select { font: inherit; }
  .app { max-width: 1500px; margin: 0 auto; padding: 24px; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 24px; }
  .subtitle { color: var(--muted); margin-top: 4px; font-size: 13px; }
  .nav-btn, .run-btn {
    display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
    border: 1px solid rgba(57,215,255,.34); color: #d9fbff; background: rgba(57,215,255,.08);
    border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 800; cursor: pointer;
  }
  .run-btn { border: 0; color: #fff; background: linear-gradient(135deg, #2b6fff, #22c7f2); }
  .card {
    background: linear-gradient(180deg, rgba(18,27,46,.95), rgba(11,16,29,.95));
    border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.26);
  }
  .grid { display: grid; grid-template-columns: .9fr 1.1fr; gap: 14px; }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px 10px; }
  .section-title h2 { margin: 0; font-size: 16px; }
  .section-title span { color: var(--muted); font-size: 12px; }
  .panel-body { padding: 0 16px 16px; }
  .field { margin-bottom: 11px; }
  .field label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .field input, .field textarea, .field select {
    width: 100%; border: 1px solid var(--line); border-radius: 9px;
    background: rgba(7,10,18,.72); color: var(--text); padding: 10px;
  }
  .field textarea { min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.5; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .hint { color: var(--muted); font-size: 12px; line-height: 1.55; }
  .copy-box {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    border: 1px solid var(--line); border-radius: 10px; padding: 10px;
    background: rgba(7,10,18,.48); color: #dce8ff; margin-bottom: 11px;
  }
  .copy-box code { overflow: auto; white-space: nowrap; font-size: 12px; }
  pre {
    margin: 0; min-height: 520px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    color: #dce8ff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px; line-height: 1.55; background: rgba(7,10,18,.48); border: 1px solid var(--line); border-radius: 10px; padding: 12px;
  }
  .status { color: #b8ffd9; font-size: 12px; }
  @media (max-width: 980px) { .grid, .row { grid-template-columns: 1fr; } .topbar { align-items: flex-start; flex-direction: column; } }
</style>
</head>
<body>
<main class="app">
  <div class="topbar">
    <div>
      <h1>抖音 OpenAPI 接入测试</h1>
      <div class="subtitle">先验证官方接口返回，再决定是否接入自动同步</div>
    </div>
    <a class="nav-btn" href="/matrix">返回作战台</a>
  </div>
  <section class="grid">
    <article class="card">
      <div class="section-title"><h2>请求配置</h2><span>按调试台参数填写</span></div>
      <div class="panel-body">
        <div class="field">
          <label>网站应用回调路径</label>
          <div class="copy-box"><code id="callbackPath">/api/douyin/oauth/callback</code></div>
          <div class="hint">
            开放平台“网站应用”的合法回调 URL 需要填公网 HTTPS 完整地址。后续用抖音云时填：
            <br>https://你的抖音云域名/api/douyin/oauth/callback
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>环境</label>
            <select id="environment">
              <option value="formal">正式环境 open.douyin.com</option>
              <option value="sandbox">沙盒环境 open-sandbox.douyin.com</option>
            </select>
          </div>
          <div class="field">
            <label>Token 类型</label>
            <select id="tokenType">
              <option value="user">用户授权 access_token</option>
              <option value="client">应用授权 client_token</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Access Token / Client Token</label>
          <input id="token" type="password" placeholder="从 API 调试台左侧复制 token，或后续由授权流程自动写入">
        </div>
        <div class="field">
          <label>接口路径</label>
          <input id="endpoint" value="/api/match/v2/taskbox/query_agency_video_sum_data/">
          <div class="hint">当前预填的是你截图里的“查询视频汇总数据-v2”。</div>
        </div>
        <div class="field">
          <label>请求体 JSON</label>
          <textarea id="bodyJson">{
  "video_publish_start_time": 0,
  "video_publish_end_time": 0,
  "page_size": 20,
  "page_num": 1,
  "douyin_id": "",
  "app_id": "",
  "agent_id": 0
}</textarea>
        </div>
        <button class="run-btn" id="runBtn">发起调试</button>
        <div class="hint" style="margin-top:10px">
          密钥和 token 不会写进代码。先用这里验证接口可用，再做多账号授权和自动同步。
        </div>
      </div>
    </article>
    <article class="card">
      <div class="section-title"><h2>请求结果</h2><span id="statusText">等待发起</span></div>
      <div class="panel-body">
        <pre id="result">{}</pre>
      </div>
    </article>
  </section>
</main>
<script>
function showResult(payload) {
  document.getElementById('result').textContent = JSON.stringify(payload, null, 2);
}
document.getElementById('runBtn').addEventListener('click', async () => {
  const button = document.getElementById('runBtn');
  const status = document.getElementById('statusText');
  button.disabled = true;
  button.textContent = '请求中...';
  status.textContent = '请求中';
  try {
    const bodyText = document.getElementById('bodyJson').value || '{}';
    const body = JSON.parse(bodyText);
    const response = await fetch('/api/matrix/openapi/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment: document.getElementById('environment').value,
        tokenType: document.getElementById('tokenType').value,
        token: document.getElementById('token').value,
        endpoint: document.getElementById('endpoint').value,
        body
      })
    });
    const payload = await response.json();
    status.textContent = response.ok ? '已返回' : '请求失败';
    showResult(payload);
  } catch (error) {
    status.textContent = '请求失败';
    showResult({ ok: false, error: error?.message || String(error) });
  } finally {
    button.disabled = false;
    button.textContent = '发起调试';
  }
});
</script>
</body>
</html>`;
}

export function registerMatrixDashboardRoutes(app) {
  app.get("/api/matrix/overview", (_req, res) => {
    res.json(getMatrixOverview());
  });

  app.post("/api/matrix/sync-now", async (_req, res) => {
    try {
      const result = await runMatrixSyncNow();
      res.json(result);
    } catch (error) {
      const db = getDb();
      const message = shortErrorMessage(error);
      db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'error', ?)")
        .run(nowIso(), `手动同步失败：${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/matrix/daily-input", (req, res) => {
    ensureMatrixDashboardData();
    const db = getDb();
    const body = req.body || {};
    const date = String(body.date || todayKey()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }

    const messages = Math.max(0, Number(body.messages || 0));
    const wechat = Math.max(0, Number(body.wechat || 0));
    const effectiveLeads = Math.max(0, Number(body.effectiveLeads || body.effective_leads || 0));
    const spend = Math.max(0, Number(body.spend || 0));
    const notes = String(body.notes || "").slice(0, 300);
    const updatedAt = nowIso();

    db.prepare(
      `
      INSERT INTO matrix_daily_inputs (date, messages, wechat, effective_leads, spend, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        messages = excluded.messages,
        wechat = excluded.wechat,
        effective_leads = excluded.effective_leads,
        spend = excluded.spend,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `
    ).run(date, messages, wechat, effectiveLeads, spend, notes, updatedAt);

    db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
      .run(updatedAt, `手动补录漏斗数据：${date} 线索 ${messages} / 微信 ${wechat} / 成本 ${spend}`);

    res.json({ ok: true, date, messages, wechat, effectiveLeads, spend, notes, updatedAt });
  });

  app.post("/api/matrix/openapi/call", async (req, res) => {
    ensureMatrixDashboardData();
    const db = getDb();
    const body = req.body || {};
    const endpoint = normalizeOpenApiPath(body.endpoint);
    const environment = String(body.environment || "formal") === "sandbox" ? "sandbox" : "formal";
    const token = String(body.token || "").trim();
    const requestBody = body.body && typeof body.body === "object" ? body.body : {};

    if (!token) {
      res.status(400).json({ ok: false, error: "请先填写 access_token 或 client_token" });
      return;
    }

    try {
      const result = await callDouyinOpenApi({
        endpoint,
        environment,
        token,
        body: requestBody
      });
      const createdAt = nowIso();
      db.prepare(
        `
        INSERT INTO matrix_openapi_calls (endpoint, environment, request_body, response_body, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        endpoint,
        environment,
        JSON.stringify(requestBody),
        JSON.stringify(result.payload),
        result.status,
        createdAt
      );
      res.status(result.status >= 200 && result.status < 300 ? 200 : 502).json({
        ok: result.status >= 200 && result.status < 300,
        endpoint,
        environment,
        url: result.url,
        httpStatus: result.status,
        response: result.payload
      });
    } catch (error) {
      const message = shortErrorMessage(error);
      res.status(500).json({ ok: false, endpoint, environment, error: message });
    }
  });

  app.get("/api/douyin/oauth/callback", (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const errorDescription =
      typeof req.query.error_description === "string" ? req.query.error_description : "";
    if (!code && !state && !error && !errorDescription) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.json({
        ok: true,
        service: "OM-Media Data Platform",
        callback: "/api/douyin/oauth/callback",
        message: "callback endpoint is ready"
      });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>抖音授权回调 · OM-Media</title>
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #070a12; color: #eef4ff;
  }
  .card {
    width: min(760px, calc(100vw - 32px)); border: 1px solid rgba(142,167,217,.22);
    border-radius: 14px; background: linear-gradient(180deg, rgba(18,27,46,.96), rgba(11,16,29,.96));
    padding: 22px; box-shadow: 0 18px 60px rgba(0,0,0,.35);
  }
  h1 { margin: 0 0 12px; font-size: 24px; }
  p { color: #8da0bf; line-height: 1.6; }
  pre {
    white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(142,167,217,.18);
    border-radius: 10px; padding: 12px; background: rgba(7,10,18,.7); color: #dce8ff;
  }
  a { color: #39d7ff; }
</style>
</head>
<body>
  <div class="card">
    <h1>${error ? "授权失败" : "授权回调已收到"}</h1>
    <p>${error ? "抖音返回了错误信息。" : "这一步说明回调地址可用。下一步可以用 code 换 access_token。"}</p>
    <pre>${JSON.stringify({ code, state, error, error_description: errorDescription }, null, 2)}</pre>
    <p><a href="/matrix/openapi">返回 OpenAPI 测试页</a></p>
  </div>
</body>
</html>`);
  });

  app.post("/api/matrix/remix-pool", (req, res) => {
    ensureMatrixDashboardData();
    const db = getDb();
    const workId = String(req.body?.workId || "");
    const note = String(req.body?.note || "").slice(0, 300);
    const work = db.prepare("SELECT id, title FROM matrix_works WHERE id = ?").get(workId);
    if (!work) {
      res.status(404).json({ error: "Work not found" });
      return;
    }

    const updatedAt = nowIso();
    db.prepare(
      `
      INSERT INTO matrix_remix_pool (work_id, status, note, created_at, updated_at)
      VALUES (?, '待二创', ?, ?, ?)
      ON CONFLICT(work_id) DO UPDATE SET
        note = excluded.note,
        status = '待二创',
        updated_at = excluded.updated_at
    `
    ).run(workId, note, updatedAt, updatedAt);
    db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
      .run(updatedAt, `加入二创池：${work.title}`);

    res.json({ ok: true, workId, title: work.title, status: "待二创", updatedAt });
  });

  app.get("/api/matrix/work-comments", async (req, res) => {
    ensureMatrixDashboardData();
    const db = getDb();
    const workId = String(req.query.workId || "");
    const refresh = String(req.query.refresh || "auto");
    const work = db.prepare("SELECT id, title FROM matrix_works WHERE id = ?").get(workId);
    if (!work) {
      res.status(404).json({ error: "Work not found" });
      return;
    }

    let rows = findWorkComments(db, work.title);
    let refreshed = false;
    let warning = "";

    if (rows.length === 0 && refresh === "auto") {
      refreshed = true;
      const startedAt = nowIso();
      db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
        .run(startedAt, `开始实时抓取评论：${work.title}`);
      try {
        await syncCommentsForWork(work);
        rows = findWorkComments(db, work.title);
        db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'info', ?)")
          .run(nowIso(), `实时评论抓取完成：${work.title} ${rows.length} 条`);
      } catch (error) {
        warning = shortErrorMessage(error);
        db.prepare("INSERT INTO matrix_sync_logs (logged_at, level, message) VALUES (?, 'warn', ?)")
          .run(nowIso(), `实时评论抓取失败：${work.title} · ${warning}`);
      }
    }

    res.json({
      ok: true,
      workId,
      title: work.title,
      total: rows.length,
      refreshed,
      warning,
      comments: rows
    });
  });

  app.get("/matrix", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(getMatrixHtml());
  });

  app.get("/matrix/funnel", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(getFunnelHtml());
  });

  app.get("/matrix/openapi", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(getOpenApiHtml());
  });
}

export { formatCompact, pct, splitCsv, statusRank };
