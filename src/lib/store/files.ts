import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function filesRoot(): string {
  const dir = path.join(process.cwd(), "data", "files");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "archivo";
}

/** Guarda un buffer y devuelve la URL pública (`/api/files/...`). */
export function saveBuffer(campaignId: string, filename: string, mime: string, bytes: Buffer): string {
  const dir = path.join(filesRoot(), campaignId);
  mkdirSync(dir, { recursive: true });
  const ext = MIME_EXT[mime] ?? "png";
  const base = safeName(filename.replace(/\.[a-zA-Z0-9]+$/, ""));
  const stored = `${Date.now()}-${base}.${ext}`;
  writeFileSync(path.join(dir, stored), bytes);
  return `/api/files/${campaignId}/${stored}`;
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Guarda un data URL de imagen; devuelve la URL pública o null si es inválido. */
export function saveDataUrl(campaignId: string, filename: string, dataUrl: string): string | null {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;
  return saveBuffer(campaignId, filename, match[1], Buffer.from(match[2], "base64"));
}

/** Resuelve una ruta de `/api/files/...` al archivo en disco (o null si escapa). */
export function resolveStoredFile(segments: string[]): string | null {
  const root = filesRoot();
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}
