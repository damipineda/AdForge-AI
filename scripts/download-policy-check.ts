import assert from "node:assert/strict";
import type { VisualReview } from "../src/lib/schema/campaign";
import { automaticCorrectionInstruction, requiresImageCorrection } from "../src/lib/pipeline/review-policy";

const clean: VisualReview = {
  status:"reviewed",summary:"Revisado",issues:[],retryCount:0,retryReason:null,
  checks:[{id:"dimensions",passed:true,detail:"4:5"},{id:"safe_zones",passed:true,detail:"Con aire"},{id:"fidelity",passed:true,detail:"Fiel"},{id:"coherence",passed:true,detail:"Coherente"}],
};
const styleOnly: VisualReview = {...clean,status:"needs_review",issues:[{category:"diversity",severity:"critical",description:"CTA similar en las tres piezas",suggestion:"Variar las pastillas",affectedIndices:[1,2,3]}]};
assert.equal(requiresImageCorrection(styleOnly),false,"campañas anteriores con 4/4 y CTA compartido deben poder descargarse");
assert.equal(automaticCorrectionInstruction(styleOnly),null,"no debe pedir reparación obligatoria por una sugerencia estética");
const story: VisualReview = {...clean,status:"needs_review",checks:clean.checks.map(c=>c.id === "safe_zones" ? {...c,passed:false,detail:"CTA debajo del 87%"} : c),issues:[{category:"typography",severity:"critical",description:"CTA demasiado bajo",suggestion:"Subir CTA por encima del 87%",affectedIndices:[]}]};
assert.equal(requiresImageCorrection(story),true);
const instruction=automaticCorrectionInstruction(story)!;
assert.ok(instruction.includes("Subir CTA") && instruction.includes("safe_zones"));
assert.ok(instruction.length<=800);
assert.equal(requiresImageCorrection({...clean,issues:[{...styleOnly.issues[0],category:"copy",description:"DESCRIPCIÓN: genérica"}]}),false,"una descripción no bloquea los píxeles del arte");
assert.equal(requiresImageCorrection({...clean,issues:[{...story.issues[0],severity:"warning"}]}),false);
const privacy: VisualReview={...clean,issues:[{category:"privacy",severity:"warning",description:"PRIVATE_DATA_123",suggestion:"Ocultar PRIVATE_DATA_123",affectedIndices:[]}]};
assert.equal(requiresImageCorrection(privacy),true);
assert.ok(!automaticCorrectionInstruction(privacy)!.includes("PRIVATE_DATA_123"));
assert.equal(requiresImageCorrection({...clean,issues:[{...story.issues[0],category:"product",description:"Producto reemplazado"}]}),true,"4/4 no anula un hallazgo crítico real");
console.log("OK · descargas independientes, recomendaciones opcionales y corrección automática con hallazgos");
