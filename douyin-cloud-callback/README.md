# OM-Media Douyin Cloud Callback Bridge

这个目录是抖音云最小回调服务，用来先通过开放平台的「合法回调 URL」连接测试。

关键接口：

- `GET /api/douyin/oauth/callback`
- `POST /api/douyin/oauth/callback`
- `GET /api/*`
- `POST /api/*`

抖音云访问 `/api/douyin/oauth/callback` 时会得到 JSON：

```json
{
  "ok": true,
  "service": "OM-Media Data Platform",
  "callback": "/api/douyin/oauth/callback",
  "message": "callback endpoint is ready"
}
```

