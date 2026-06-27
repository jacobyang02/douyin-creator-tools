import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";

const app = new Koa();
const router = new Router();

function callbackPayload(ctx: Koa.Context) {
  return {
    ok: true,
    service: "OM-Media Data Platform",
    callback: "/api/douyin/oauth/callback",
    method: ctx.method,
    query: ctx.query,
    message: "callback endpoint is ready"
  };
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

  const body = ctx.request.body as any;

 const challenge =

  ctx.query.challenge ||

  ctx.query.echostr ||

  ctx.query.verify_token ||

  ctx.query.token ||

  body?.challenge ||

  body?.echostr ||

  body?.verify_token ||

  body?.token ||

  body?.content?.challenge;

  console.log("douyin callback verify", {

    method: ctx.method,

    path: ctx.path,

    query: ctx.query,

    body

  });

  if (challenge) {
  ctx.type = "application/json";
  ctx.body = {
    challenge: String(challenge)
  };
  return;
}

  ctx.body = callbackPayload(ctx);

});



app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => {
  console.log(`OM-Media Douyin Cloud callback bridge running on port ${PORT}`);
});
