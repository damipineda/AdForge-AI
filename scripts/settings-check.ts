import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET, PUT, DELETE } from "../src/app/api/settings/route";
import { metaApiKey } from "../src/lib/pipeline/meta";

async function main() {
  process.env.ADFORGE_DATA_DIR = await mkdtemp(path.join(tmpdir(), "adforge-settings-check-"));
  process.env.MUSE_IMAGE_API_KEY = "environment-test-placeholder";
  process.env.AI_PROVIDER = "demo";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  try {
    const before = await (await GET()).json();
    assert.equal(before.source,"env");
    const response = await PUT(new Request("http://localhost/api/settings", {method:"PUT",body:JSON.stringify({apiKey:"saved-test-placeholder"})}));
    const saved = await response.json();
    assert.equal(response.status,200); assert.equal(saved.source,"ui"); assert.equal(saved.verified,true);
    assert.equal(metaApiKey(),"saved-test-placeholder");
    assert.equal(process.env.MUSE_IMAGE_API_KEY,"environment-test-placeholder","UI settings must not overwrite the environment fallback");
    assert.ok(!JSON.stringify(saved).includes("saved-test-placeholder"),"the full key must never be returned");
    const removed = await (await DELETE()).json();
    assert.equal(removed.source,"env"); assert.equal(metaApiKey(),"environment-test-placeholder");
    console.log("OK · configuración local, respuesta enmascarada y eliminación con fallback correcto");
  } finally { globalThis.fetch=originalFetch; }
}
void main();
