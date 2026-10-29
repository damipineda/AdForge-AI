#!/usr/bin/env node
/**
 * Paso 1 del plan placements: averigua qué `size` acepta POST /v1/images/edits
 * (muse-image-1.0) y qué dimensiones reales devuelve.
 *
 * Uso:
 *   node scripts/image-size-probe.mjs [size...]
 *   node scripts/image-size-probe.mjs 1080x1920 1080x1350
 *
 * Sin args prueba: 1080x1920 (story 9:16) → 1152x2048 (9:16 2K) →
 * 1080x1350 (feed 4:5) → 1536x1920 (4:5 2K). Cada tamaño que genere imagen
 * cuesta ~$0.01 (plano). Los artefactos van a `.probe/` (gitignoreado):
 * `size-<WxH>.<ext>` + `size-probe.json` con el resumen.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = join(ROOT, ".probe");

const DEFAULT_SIZES = ["1080x1920", "1152x2048", "1080x1350", "1536x1920"];
const TIMEOUT_MS = 150_000;

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Dimensiones reales del binario (PNG IHDR, WebP VP8/VP8L/VP8X, JPEG SOF). */
function dimensions(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: "png" };
  }
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, fmt: "webp-vp8" };
    }
    if (chunk === "VP8L") {
      const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
      return { w: 1 + (((b2 & 0x3f) << 8) | b1), h: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)), fmt: "webp-vp8l" };
    }
    if (chunk === "VP8X") {
      return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)), fmt: "webp-vp8x" };
    }
  }
  for (let i = 0; i + 9 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xcf && buf[i + 1] !== 0xc4 && buf[i + 1] !== 0xc8) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), fmt: "jpeg" };
    }
  }
  return { w: 0, h: 0, fmt: "desconocido" };
}

async function trySize(size, photo, headers) {
  const started = Date.now();
  const fd = new FormData();
  fd.append("model", process.env.MUSE_IMAGE_MODEL?.trim() || "muse-image-1.0");
  fd.append("prompt", "Recreá este producto exacto en un flyer publicitario vertical con el texto PRUEBA. Conservá forma, envase, etiquetas y colores.");
  fd.append("image", new Blob([photo], { type: "image/jpeg" }), "producto.jpg");
  fd.append("size", size);
  const res = await fetch("https://api.meta.ai/v1/images/edits", {
    method: "POST", headers, body: fd, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const ms = Date.now() - started;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-JSON */ }
  if (!res.ok) {
    return { size, ok: false, http: res.status, ms, error: (json?.error?.message ?? text).slice(0, 300) };
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) return { size, ok: false, http: res.status, ms, error: "200 sin b64_json" };
  const buf = Buffer.from(b64, "base64");
  const dim = dimensions(buf);
  const ext = dim.fmt.startsWith("webp") ? "webp" : dim.fmt === "jpeg" ? "jpg" : "png";
  const file = `size-${size}.${ext}`;
  writeFileSync(join(PROBE, file), buf);
  return { size, ok: true, http: res.status, ms, bytes: buf.length, outputFormat: json?.output_format ?? null, ...dim, file: `.probe/${file}` };
}

async function main() {
  const sizes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SIZES;
  const env = loadEnv();
  if (!env.MUSE_IMAGE_API_KEY?.trim()) throw new Error("Sin MUSE_IMAGE_API_KEY en .env.local: no se puede sondear la API live.");
  const headers = { Authorization: `Bearer ${env.MUSE_IMAGE_API_KEY.trim()}` };
  const photo = readFileSync(join(PROBE, "producto.jpg"));

  // 0) Tamaño inválido a propósito: el mensaje de validación suele revelar el
  // formato esperado (y un error no genera imagen, así que no cuesta).
  console.log("Sonda 0: size inválido (para leer el mensaje de validación)…");
  const invalid = await trySize("9:16", photo, headers);
  console.log(`  -> HTTP ${invalid.http} :: ${(invalid.error ?? "ACEPTADO?!").slice(0, 200)}`);

  const results = [invalid];
  for (const size of sizes) {
    console.log(`Sonda size=${size}…`);
    const r = await trySize(size, photo, headers);
    results.push(r);
    console.log(r.ok
      ? `  -> OK ${r.w}x${r.h} (${r.fmt}, ${r.bytes} bytes, ${r.ms} ms) guardado en ${r.file}`
      : `  -> HTTP ${r.http} :: ${(r.error ?? "?").slice(0, 200)}`);
  }
  writeFileSync(join(PROBE, "size-probe.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log("\nResumen guardado en .probe/size-probe.json");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
