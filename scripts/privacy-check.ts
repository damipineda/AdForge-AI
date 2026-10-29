import assert from "node:assert/strict";
import { redactSensitiveText, redactSensitiveValues } from "../src/lib/pipeline/privacy";

const samples = ["chapa AASA 772", "patente: ABC1D23", "matrícula número ABC123"];
for (const sample of samples) {
  const redacted = redactSensitiveText(sample);
  assert.ok(!/AASA 772|ABC1D23|ABC123/.test(redacted), "el texto no debe reproducir la matrícula");
}
assert.equal(redactSensitiveText("Envase de 328 g y hasta 50 lavados"), "Envase de 328 g y hasta 50 lavados");
const nested = redactSensitiveValues({ nested: ["placa: ABC123", 328] });
assert.ok(!String(nested.nested[0]).includes("ABC123"));
assert.equal(nested.nested[1], 328);
console.log("OK · ocultación heurística de matrículas en texto");
