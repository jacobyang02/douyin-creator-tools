import fs from "node:fs";
import http from "node:http";
import { URL, URLSearchParams } from "node:url";

function loadEnv() {
  if (!fs.existsSync(".env")) throw new Error("找不到 .env 文件");
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key] = rest.join("=");
  }
}

loadEnv();

const CLIENT_KEY = process.env.DOUYIN_CLIENT_KEY;
const CLIENT_SECRET = process.env.DOUYIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.DOUYIN_REDIRECT_URI;

if (!CLIENT_KEY || !CLIENT_SECRET || !REDIRECT_URI) {
  throw new Error("请先在 .env 填好 DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI");
}

const scope = "user_info";

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    response_type: "code",
    scope,
    redirect_uri: REDIRECT_URI,
    state: "om-data-platform"
  });

  return `https://open.douyin.com/platform/oauth/connect/?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const res = await fetch("https://open.douyin.com/oauth/access_token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code"
    })
  });

  return await res.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);

  if (url.pathname !== "/api/douyin/callback") {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("没有收到 code");
    return;
  }

  console.log("收到 code：", code);

  const token = await exchangeCodeForToken(code);
  fs.writeFileSync("data/douyin-openapi-token.json", JSON.stringify(token, null, 2));

  console.log("Token 已保存到 data/douyin-openapi-token.json");
  console.log(JSON.stringify(token, null, 2));

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("授权成功，Token 已保存。可以回到终端查看。");
});

server.listen(8765, "127.0.0.1", () => {
  console.log("本地回调服务已启动：http://127.0.0.1:8765/api/douyin/callback");
  console.log("\n请复制下面授权链接到浏览器打开：\n");
  console.log(buildAuthUrl());
});
