import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { runPipeline } from "../src/lib/pipeline";
import { refinePiece } from "../src/lib/pipeline/refine-piece";
import { referenceSheet } from "../src/lib/pipeline/reference-sheet";
import type { VisualReview } from "../src/lib/schema/campaign";

async function main() {
  process.env.AI_PROVIDER = "demo";
  process.env.ADFORGE_DATA_DIR = await mkdtemp(path.join(tmpdir(),"adforge-refinement-test-"));
  const red = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#FF0000" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#0000FF" } }).png().toBuffer();
  const sources = [red,blue].map(bytes=>({mimeType:"image/png",base64:bytes.toString("base64")}));
  const sheet = await referenceSheet(sources);
  const raw = await sharp(Buffer.from(sheet.base64,"base64")).removeAlpha().raw().toBuffer();
  const pixel = (x:number,y:number) => [...raw.subarray((y*1600+x)*3,(y*1600+x)*3+3)];
  assert.deepEqual(pixel(400,300),[255,0,0]); assert.deepEqual(pixel(1200,300),[0,0,255]);
  const result = await runPipeline({ images:[{ filename:"fixture.png",bytes:new Uint8Array(red).buffer,mimeType:"image/png" }],locale:"es",placements:["feed","story"],merchant:{price:null,link:null} },{onStage(){}});
  assert.ok(result.feedVariants.every(v=>!v.layoutLayers));
  const before = JSON.stringify(result);
  const bytes = await sharp({ create:{ width:1080,height:1350,channels:3,background:"#C9B69A" } }).png().toBuffer();
  const image = { mimeType:"image/png",base64:bytes.toString("base64") };
  const plan = { concept:"Concepto refinado",artDirection:"Dirección editorial completa",hook:"Nuevo titular",body:"Apoyo coherente",cta:"Consultar",featurePills:["Dato verificado"],captionInstagram:"Copy de acompañamiento",captionFacebook:"Descripción de acompañamiento" };
  const review: VisualReview = {status:"reviewed",summary:"Auditoría simulada",issues:[],checks:[],retryCount:0,retryReason:null};
  let generations=0, audits=0;
  const client = {
    plan: async()=>plan,
    generate:async(prompt:string)=>{ generations++; assert.ok(prompt.includes("COPY EXACTO") && prompt.includes("Nuevo titular")); assert.ok(prompt.includes("PASTILLAS DE BENEFICIOS INTEGRADAS")); return image; },
    audit:async()=>{ audits++; return review; },
  };
  const refined = await refinePiece(result,"feed-1","Cambiar el titular",sources,image,client);
  assert.equal(generations,1); assert.equal(audits,1);
  assert.equal(refined.plan.hook,"Nuevo titular"); assert.equal(refined.dims.width,1080);
  assert.equal(JSON.stringify(result),before,"Refining never mutates the saved input before persistence");
  await assert.rejects(refinePiece(result,"feed-1","Cambiar el titular",sources,image,{...client,generate:async()=>sources[0]}),/proporción nativa/);
  await assert.rejects(refinePiece(result,"feed-1","Cambiar el titular",sources,image,{...client,audit:async()=>({...review,status:"unavailable"})}),/auditoría/);
  let retryRenders = 0, retryAudits = 0;
  const rejected: VisualReview = {...review,status:"needs_review",issues:[{category:"product",severity:"critical",description:"El empaque perdió su etiqueta",suggestion:"Conservar la etiqueta original",affectedIndices:[]}]};
  const corrected = await refinePiece(result,"feed-1","Mover el logo abajo a la izquierda",sources,image,{
    ...client,
    generate:async(prompt, reference)=>{
      retryRenders++;
      if (retryRenders === 2) {
        assert.ok(prompt.includes("Conservar la etiqueta original"));
        assert.ok(prompt.includes("Mover el logo abajo a la izquierda"));
      }
      assert.deepEqual(reference, await referenceSheet(sources,image),"Both attempts use saved art and original sources");
      return image;
    },
    audit:async()=>{ retryAudits++; return retryAudits === 1 ? rejected : review; },
  });
  assert.equal(retryRenders,2); assert.equal(retryAudits,2);
  assert.equal(corrected.review.retryCount,1);
  assert.match(corrected.review.retryReason!,/etiqueta/);
  retryRenders = 0;
  await assert.rejects(refinePiece(result,"feed-1","Cambiar el titular",sources,image,{
    ...client, generate:async()=>{ retryRenders++; return image; }, audit:async()=>rejected,
  }),/después de 2 intentos[\s\S]*etiqueta/);
  assert.equal(retryRenders,2,"Never loop indefinitely or accept a rejected edit");
  await assert.rejects(refinePiece(result,"feed-1","Cambiar el titular",sources,image,{
    ...client,audit:async()=>({...review,status:"needs_review",issues:[{category:"privacy",severity:"critical",description:"PRIVATE_FIXTURE_123",suggestion:"Ocultar PRIVATE_FIXTURE_123",affectedIndices:[]}]})
  }),error=>error instanceof Error && error.message.includes("Privacidad") && !error.message.includes("PRIVATE_FIXTURE_123"));
  let unavailableRenders = 0;
  await assert.rejects(refinePiece(result,"feed-1","Cambiar el titular",sources,image,{
    ...client,generate:async()=>{ unavailableRenders++; return image; },audit:async()=>({...review,status:"unavailable"}),
  }),/auditoría/);
  assert.equal(unavailableRenders,1,"An unavailable reviewer must not trigger a blind regeneration");
  let freshRenders=0;
  const fresh = await refinePiece(result,"feed-1","Regenerar con los hallazgos",sources,image,{
    ...client,
    plan:async(prompt)=>{assert.ok(prompt.includes("REGENERAR DESDE CERO"));return plan;},
    generate:async(prompt,reference)=>{
      freshRenders++;
      assert.ok(prompt.includes("COMPOSICIÓN NUEVA"));
      assert.ok(!prompt.includes("izquierda = arte anterior"));
      assert.deepEqual(reference,await referenceSheet(sources),"regeneration must not copy the old failed composition");
      return image;
    },
    audit:async()=>rejected,
  },"regenerate");
  assert.equal(freshRenders,2);
  assert.ok(fresh.notice,"a generated draft with outstanding issues must be explicitly identified");
  assert.equal(fresh.review.status,"needs_review");
  assert.equal(fresh.review.correctionReport?.outcome,"unresolved");
  assert.ok(fresh.review.correctionReport?.pending.includes("El empaque perdió su etiqueta"));
  await assert.rejects(refinePiece(result,"feed-1","Regenerar",sources,image,{
    ...client,audit:async()=>({...review,issues:[{category:"privacy",severity:"critical",description:"Dato sensible",suggestion:"Ocultar",affectedIndices:[]}]}),
  },"regenerate"),/Privacidad/);
  assert.equal(JSON.stringify(result),before);
  console.log("OK · referencias multiproducto, corrección auditada, límite de intentos, privacidad y conservación ante fallos");
}
void main();
