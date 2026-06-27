import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";

const app = new Koa();
const router = new Router();

function findChallenge(input: any): any {
  if (!input) return undefined;
  return (
    input.challenge ??
    input.echostr ??
    input.verify_token ??
    input.token ??
    input.content?.challenge ??
    input.data?.challenge ??
    input.payload?.challenge
  );
}

router.get("/", (ctx) => {
  ctx.body = {
    ok: true,
    service: "OM-Media Data Platform",
    message: "Douyin Cloud callback bridge is running"
  };
});

router.all("/api/douyin/oauth/callback", (ctx) => {
  ctx.set("Cache-Control", "no-store, max-age=0");

  const body = ((ctx.request as any).body ?? {}) as any;

  const challenge =
    findChallenge(body) ??
    findChallenge(ctx.query);

  console.log(
    "VERIFY_LOG=" +
      JSON.stringify({
        method: ctx.method,
        path: ctx.path,
        query: ctx.query,
        body
      })
  );

  if (challenge !== undefined && challenge !== null && challenge !== "") {
    ctx.status = 200;
    ctx.type = "application/json";
    ctx.body = { challenge };
    return;
  }

  ctx.status = 200;
  ctx.type = "application/json";
  ctx.body = {
    ok: true,
    service: "OM-Media Data Platform",
    callback: "/api/douyin/oauth/callback",
    method: ctx.method,
    query: ctx.query,
    body,
    message: "callback endpoint is ready"
  };
});

app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => {
  console.log(`OM-Media Douyin Cloud callback bridge running on port ${PORT}`);
});
