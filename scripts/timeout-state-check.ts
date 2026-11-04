import assert from "node:assert/strict";
import { metaJson, MetaTimeoutError } from "../src/lib/pipeline/meta";
import { failRunningStages, reduceStages, type StageTracker } from "../src/components/ProgressBar";

async function main() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MUSE_IMAGE_API_KEY;
  process.env.MUSE_IMAGE_API_KEY = "isolated-test-placeholder";
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      return new Promise((_resolve,reject) => {
        const timer = setTimeout(()=>reject(new Error("fixture missed abort")),1000);
        init?.signal?.addEventListener("abort",()=>{clearTimeout(timer);reject(init.signal?.reason);},{once:true});
      });
    };
    await assert.rejects(metaJson("fixture",{timeoutMs:25}), error=>error instanceof MetaTimeoutError && error.message.includes("Podés reintentar"));
    assert.equal(calls,1,"a timeout must not start a second 150-second inference");
    calls=0;
    globalThis.fetch = async()=>{calls++;return new Response("unavailable",{status:503});};
    await assert.rejects(metaJson("fixture",{timeoutMs:25}),MetaTimeoutError);
    assert.equal(calls,1,"the retry backoff shares the budget and is abortable");
    calls=0;
    const controller=new AbortController(); controller.abort();
    await assert.rejects(metaJson("fixture",{timeoutMs:100,signal:controller.signal}));
    assert.equal(calls,0,"cancelled requests never contact the provider");
    const idle: StageTracker={sam:"idle",museSpark:"idle",museImage:"idle",review:"idle",ms:{sam:0,museSpark:0,museImage:0,review:0}};
    const completed=reduceStages(idle,{stage:"sam",status:"done",ms:100});
    const running=reduceStages(completed,{stage:"museSpark",status:"running",ms:0});
    const failed=failRunningStages(running,"Tiempo agotado; reintentar");
    assert.equal(failed.sam,"done"); assert.equal(failed.museSpark,"error"); assert.equal(failed.museImage,"idle");
    assert.equal(failed.details?.museSpark,"Tiempo agotado; reintentar");
    assert.equal(running.museSpark,"running","the reducer must not mutate prior state");
    console.log("OK · timeout total, sin reintento tras timeout, cancelación y estado de error sin spinner");
  } finally {
    globalThis.fetch=originalFetch;
    if (originalKey === undefined) delete process.env.MUSE_IMAGE_API_KEY;
    else process.env.MUSE_IMAGE_API_KEY=originalKey;
  }
}
void main();
