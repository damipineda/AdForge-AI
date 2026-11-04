import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type ProjectRow = { id: string; name: string; createdAt: number };
export type ProjectWithCounts = ProjectRow & { campaigns: number; assets: number };
export type CampaignRow = {
  id: string;
  projectId: string;
  prompt: string;
  status: string;
  createdAt: number;
  resultJson: string | null;
  brief: string;
  focus: string;
};
export type AssetRow = {
  id: string;
  campaignId: string | null;
  projectId: string;
  type: string;
  url: string;
  metadataJson: string;
  createdAt: number;
};
export type LearningRow = {
  id: string;
  campaignId: string;
  projectId: string;
  category: string;
  placement: string;
  surface: string | null;
  lighting: string | null;
  passedAll: number;
  checksJson: string;
  retried: number;
  retryReason: string | null;
  exported: number;
  createdAt: number;
};
export type SkillRuleRow = {
  id: string;
  category: string;
  rule: string;
  evidenceCount: number;
  status: string;
  promotedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type BrandKitRow = {
  id: string;
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoAssetId: string | null;
  logoPosition: string;
  createdAt: number;
  updatedAt: number;
};

let db: DatabaseSync | null = null;

function dataDir(): string {
  const dir = process.env.ADFORGE_DATA_DIR ? path.resolve(process.env.ADFORGE_DATA_DIR) : path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Singleton perezoso: abre (y migra) `data/adforge.db` en el runtime Node. */
export function getDb(): DatabaseSync {
  if (db) return db;
  const database = new DatabaseSync(path.join(dataDir(), "adforge.db"));
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS Project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Campaign (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'done',
      createdAt INTEGER NOT NULL,
      resultJson TEXT,
      brief TEXT NOT NULL DEFAULT '',
      focus TEXT NOT NULL DEFAULT 'product'
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_project ON Campaign(projectId, createdAt DESC);
    CREATE TABLE IF NOT EXISTS Asset (
      id TEXT PRIMARY KEY,
      campaignId TEXT REFERENCES Campaign(id) ON DELETE CASCADE,
      projectId TEXT NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      metadataJson TEXT NOT NULL DEFAULT '{}',
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_asset_project ON Asset(projectId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_campaign ON Asset(campaignId);
    CREATE TABLE IF NOT EXISTS Learning (
      id TEXT PRIMARY KEY,
      campaignId TEXT NOT NULL REFERENCES Campaign(id) ON DELETE CASCADE,
      projectId TEXT NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'general',
      placement TEXT NOT NULL,
      surface TEXT,
      lighting TEXT,
      passedAll INTEGER NOT NULL DEFAULT 0,
      checksJson TEXT NOT NULL DEFAULT '[]',
      retried INTEGER NOT NULL DEFAULT 0,
      retryReason TEXT,
      exported INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_category ON Learning(category, createdAt DESC);
    CREATE TABLE IF NOT EXISTS SkillRule (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      rule TEXT NOT NULL,
      evidenceCount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'candidate',
      promotedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skill_category ON SkillRule(category, status);
    CREATE TABLE IF NOT EXISTS BrandKit (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL UNIQUE REFERENCES Project(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      primaryColor TEXT NOT NULL DEFAULT '#8D7B6A',
      secondaryColor TEXT NOT NULL DEFAULT '#2A2421',
      accentColor TEXT NOT NULL DEFAULT '#8D7B6A',
      logoAssetId TEXT REFERENCES Asset(id) ON DELETE SET NULL,
      logoPosition TEXT NOT NULL DEFAULT 'auto',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS AppSetting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  // Migración ligera: columnas de brief/enfoque en DBs creadas antes.
  for (const column of ["brief TEXT NOT NULL DEFAULT ''", "focus TEXT NOT NULL DEFAULT 'product'"]) {
    try {
      database.exec(`ALTER TABLE Campaign ADD COLUMN ${column}`);
    } catch {
      // La columna ya existe.
    }
  }
  // Migración ligera: posición del logo en DBs creadas antes.
  try {
    database.exec(`ALTER TABLE BrandKit ADD COLUMN logoPosition TEXT NOT NULL DEFAULT 'auto'`);
  } catch {
    // La columna ya existe.
  }
  db = database;
  return database;
}

export function newId(): string {
  return randomUUID();
}

export function listProjects(): ProjectWithCounts[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT p.id, p.name, p.createdAt,
        (SELECT COUNT(*) FROM Campaign c WHERE c.projectId = p.id) AS campaigns,
        (SELECT COUNT(*) FROM Asset a WHERE a.projectId = p.id) AS assets
       FROM Project p ORDER BY p.createdAt DESC`,
    )
    .all() as ProjectWithCounts[];
}

export function createProject(name: string): ProjectRow {
  const row: ProjectRow = { id: newId(), name: name.trim().slice(0, 80) || "Proyecto sin título", createdAt: Date.now() };
  getDb().prepare("INSERT INTO Project (id, name, createdAt) VALUES (?, ?, ?)").run(row.id, row.name, row.createdAt);
  return row;
}

export function renameProject(id: string, name: string): boolean {
  const clean = name.trim().slice(0, 80);
  if (!clean) return false;
  return getDb().prepare("UPDATE Project SET name = ? WHERE id = ?").run(clean, id).changes > 0;
}

export function deleteProject(id: string): boolean {
  return getDb().prepare("DELETE FROM Project WHERE id = ?").run(id).changes > 0;
}

export function projectExists(id: string): boolean {
  const row = getDb().prepare("SELECT 1 AS ok FROM Project WHERE id = ?").get(id) as { ok: number } | undefined;
  return !!row;
}

export function listCampaigns(projectId: string): CampaignRow[] {
  return getDb()
    .prepare("SELECT id, projectId, prompt, status, createdAt, resultJson, brief, focus FROM Campaign WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as CampaignRow[];
}

export function getCampaign(id: string): CampaignRow | null {
  const row = getDb()
    .prepare("SELECT id, projectId, prompt, status, createdAt, resultJson, brief, focus FROM Campaign WHERE id = ?")
    .get(id) as CampaignRow | undefined;
  return row ?? null;
}

export function updateCampaignResult(id: string, resultJson: string): boolean {
  return getDb().prepare("UPDATE Campaign SET resultJson = ? WHERE id = ?").run(resultJson, id).changes > 0;
}

export function createCampaign(input: { projectId: string; prompt: string; status: string; resultJson: string | null; brief?: string; focus?: string }): CampaignRow {
  const row: CampaignRow = {
    id: newId(),
    projectId: input.projectId,
    prompt: input.prompt.slice(0, 500),
    status: input.status,
    createdAt: Date.now(),
    resultJson: input.resultJson,
    brief: (input.brief ?? "").slice(0, 280),
    focus: input.focus ?? "product",
  };
  getDb()
    .prepare("INSERT INTO Campaign (id, projectId, prompt, status, createdAt, resultJson, brief, focus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.projectId, row.prompt, row.status, row.createdAt, row.resultJson, row.brief, row.focus);
  return row;
}

export function deleteCampaign(id: string): boolean {
  return getDb().prepare("DELETE FROM Campaign WHERE id = ?").run(id).changes > 0;
}

export function listAssets(projectId: string): AssetRow[] {
  return getDb()
    .prepare("SELECT id, campaignId, projectId, type, url, metadataJson, createdAt FROM Asset WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as AssetRow[];
}

export function listCampaignAssets(campaignId: string): AssetRow[] {
  return getDb()
    .prepare("SELECT id, campaignId, projectId, type, url, metadataJson, createdAt FROM Asset WHERE campaignId = ? ORDER BY createdAt ASC")
    .all(campaignId) as AssetRow[];
}

export function createAsset(input: { campaignId: string | null; projectId: string; type: string; url: string; metadataJson: string }): AssetRow {
  const row: AssetRow = {
    id: newId(),
    campaignId: input.campaignId,
    projectId: input.projectId,
    type: input.type,
    url: input.url,
    metadataJson: input.metadataJson,
    createdAt: Date.now(),
  };
  getDb()
    .prepare("INSERT INTO Asset (id, campaignId, projectId, type, url, metadataJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.campaignId, row.projectId, row.type, row.url, row.metadataJson, row.createdAt);
  return row;
}

/** Enlaza fuentes del proyecto a una campaña. Si la fuente ya había quedado
 * asociada a un intento fallido (o a una corrida previa que se reintentó con
 * las mismas fotos), la reasigna o duplica el vínculo para que la nueva campaña
 * siempre conserve sus fotos originales. */
export function linkAssetsToCampaign(projectId: string, assetIds: string[], campaignId: string): number {
  if (assetIds.length === 0) return 0;
  const database = getDb();
  let linked = 0;
  for (const assetId of assetIds) {
    const existing = database
      .prepare("SELECT id, campaignId, projectId, type, url, metadataJson FROM Asset WHERE id = ? AND projectId = ? AND type = 'source'")
      .get(assetId, projectId) as AssetRow | undefined;
    if (!existing) continue;
    if (!existing.campaignId || existing.campaignId === campaignId) {
      database.prepare("UPDATE Asset SET campaignId = ? WHERE id = ?").run(campaignId, existing.id);
      linked++;
    } else {
      // Si la campaña anterior falló, movemos el asset a la nueva; si era una campaña válida, creamos una copia del vínculo
      const prevCampaign = getCampaign(existing.campaignId);
      if (!prevCampaign || prevCampaign.status === "error") {
        database.prepare("UPDATE Asset SET campaignId = ? WHERE id = ?").run(campaignId, existing.id);
      } else {
        createAsset({
          campaignId,
          projectId,
          type: "source",
          url: existing.url,
          metadataJson: existing.metadataJson,
        });
      }
      linked++;
    }
  }
  return linked;
}

export function insertLearnings(
  rows: Array<Omit<LearningRow, "id" | "createdAt">>,
): LearningRow[] {
  const database = getDb();
  const now = Date.now();
  return rows.map((input) => {
    const row: LearningRow = { ...input, id: newId(), createdAt: now };
    database
      .prepare(
        "INSERT INTO Learning (id, campaignId, projectId, category, placement, surface, lighting, passedAll, checksJson, retried, retryReason, exported, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id, row.campaignId, row.projectId, row.category, row.placement, row.surface,
        row.lighting, row.passedAll, row.checksJson, row.retried, row.retryReason, row.exported, row.createdAt,
      );
    return row;
  });
}

export function listLearnings(projectId: string, limit = 100): LearningRow[] {
  return getDb()
    .prepare("SELECT * FROM Learning WHERE projectId = ? ORDER BY createdAt DESC LIMIT ?")
    .all(projectId, limit) as LearningRow[];
}

export function allLearnings(limit = 2000): LearningRow[] {
  return getDb()
    .prepare("SELECT * FROM Learning ORDER BY createdAt DESC LIMIT ?")
    .all(limit) as LearningRow[];
}

export function markLearningsExported(campaignId: string): number {
  const result = getDb()
    .prepare("UPDATE Learning SET exported = 1 WHERE campaignId = ?")
    .run(campaignId);
  return Number(result.changes);
}

export function listSkillRules(category?: string): SkillRuleRow[] {
  const database = getDb();
  if (category) {
    return database
      .prepare("SELECT * FROM SkillRule WHERE category = ? ORDER BY evidenceCount DESC")
      .all(category) as SkillRuleRow[];
  }
  return database
    .prepare("SELECT * FROM SkillRule ORDER BY category ASC, evidenceCount DESC")
    .all() as SkillRuleRow[];
}

export function getActiveRuleTexts(category: string, limit = 5): string[] {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT rule FROM SkillRule WHERE status = 'active' AND (category = ? OR category = 'general') ORDER BY evidenceCount DESC LIMIT ?",
    )
    .all(category, limit) as Array<{ rule: string }>;
  const seen = new Set<string>();
  return rows.map((r) => r.rule).filter((rule) => {
    if (seen.has(rule)) return false;
    seen.add(rule);
    return true;
  });
}

export function upsertSkillRule(category: string, rule: string, evidenceCount: number, threshold: number): SkillRuleRow {
  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM SkillRule WHERE category = ? AND rule = ?")
    .get(category, rule) as SkillRuleRow | undefined;
  const now = Date.now();
  const status = evidenceCount >= threshold ? "active" : "candidate";
  if (existing) {
    database
      .prepare("UPDATE SkillRule SET evidenceCount = ?, status = ?, updatedAt = ?, promotedAt = COALESCE(promotedAt, ?) WHERE id = ?")
      .run(evidenceCount, status, now, status === "active" ? now : null, existing.id);
    return { ...existing, evidenceCount, status, updatedAt: now, promotedAt: existing.promotedAt ?? (status === "active" ? now : null) };
  }
  const row: SkillRuleRow = {
    id: newId(), category, rule, evidenceCount, status,
    promotedAt: status === "active" ? now : null, createdAt: now, updatedAt: now,
  };
  database
    .prepare("INSERT INTO SkillRule (id, category, rule, evidenceCount, status, promotedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.category, row.rule, row.evidenceCount, row.status, row.promotedAt, row.createdAt, row.updatedAt);
  return row;
}

export function getBrandKit(projectId: string): BrandKitRow | null {
  const row = getDb()
    .prepare("SELECT * FROM BrandKit WHERE projectId = ?")
    .get(projectId) as (BrandKitRow & { logoPosition?: string | null }) | undefined;
  if (!row) return null;
  if (!row.logoPosition) return { ...row, logoPosition: "auto" };
  return row as BrandKitRow;
}

export function upsertBrandKit(input: {
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoAssetId: string | null;
  logoPosition?: string | null;
}): BrandKitRow {
  const database = getDb();
  const now = Date.now();
  const logoPosition = input.logoPosition === "left" || input.logoPosition === "right" ? input.logoPosition : "auto";
  const existing = getBrandKit(input.projectId);
  if (existing) {
    database
      .prepare("UPDATE BrandKit SET name = ?, primaryColor = ?, secondaryColor = ?, accentColor = ?, logoAssetId = ?, logoPosition = ?, updatedAt = ? WHERE id = ?")
      .run(input.name, input.primaryColor, input.secondaryColor, input.accentColor, input.logoAssetId, logoPosition, now, existing.id);
    return { ...existing, ...input, logoPosition, updatedAt: now };
  }
  const row: BrandKitRow = { id: newId(), ...input, logoPosition, createdAt: now, updatedAt: now };
  database
    .prepare("INSERT INTO BrandKit (id, projectId, name, primaryColor, secondaryColor, accentColor, logoAssetId, logoPosition, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.projectId, row.name, row.primaryColor, row.secondaryColor, row.accentColor, row.logoAssetId, row.logoPosition, row.createdAt, row.updatedAt);
  return row;
}

export function getAsset(id: string): { id: string; projectId: string; url: string } | null {
  const row = getDb()
    .prepare("SELECT id, projectId, url FROM Asset WHERE id = ?")
    .get(id) as { id: string; projectId: string; url: string } | undefined;
  return row ?? null;
}

export function getSetting(key: string): string | null {
  try {
    const row = getDb()
      .prepare("SELECT value FROM AppSetting WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: string): void {
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO AppSetting (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt",
    )
    .run(key, value, now);
}

export function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM AppSetting WHERE key = ?").run(key);
}
