"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignResult, Locale, Placement, StageEvent } from "@/lib/schema/campaign";
import type { Provider } from "@/lib/pipeline";
import { streamCampaign } from "@/lib/sse-client";
import { assetMeta, store, type Asset, type CampaignSummary, type Learning, type Project, type SkillRule } from "@/lib/store/client";
import { ComposerBar } from "./ComposerBar";
import { AgentFeed } from "./AgentFeed";
import { reduceStages, type StageTracker } from "./ProgressBar";
import { ResultsTabs } from "./ResultsTabs";
import { TopBar } from "./TopBar";
import { ProjectsPanel } from "./ide/ProjectsPanel";
import { AssetsPanel } from "./ide/AssetsPanel";
import type { MerchantInput } from "./ComposerBar";

const IDLE_TRACKER: StageTracker = {
  sam: "idle",
  museImage: "idle",
  museSpark: "idle",
  review: "idle",
  ms: { sam: 0, museImage: 0, museSpark: 0, review: 0 },
};

const ACTIVE_KEY = "adforge.activeProjectId";
const MAX_FILES = 4;

export function Dashboard({ provider }: { provider: Provider }) {
  // Lienzo / pipeline
  const [files, setFiles] = useState<File[]>([]);
  const [locale, setLocale] = useState<Locale>("es");
  const [placements, setPlacements] = useState<Placement[]>(["feed", "story"]);
  const [merchant, setMerchant] = useState<MerchantInput>({ price: "" });
  const [groupMode, setGroupMode] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [tracker, setTracker] = useState<StageTracker>(IDLE_TRACKER);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persistencia / IDE
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [restoredSources, setRestoredSources] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Skill aprendido: reglas + conteo de piezas analizadas del proyecto.
  const [skills, setSkills] = useState<SkillRule[]>([]);
  const [skillThreshold, setSkillThreshold] = useState(3);
  const [learningsTotal, setLearningsTotal] = useState(0);

  const refreshSkill = useCallback(async (projectId: string | null) => {
    try {
      const [{ rules, threshold }, { learnings }] = await Promise.all([
        store.listSkills(),
        projectId ? store.listLearnings(projectId) : Promise.resolve({ learnings: [] as Learning[] }),
      ]);
      setSkills(rules);
      setSkillThreshold(threshold);
      setLearningsTotal(learnings.length);
    } catch {
      /* el skill es progresivo: si falla, la app sigue generando igual */
    }
  }, []);

  /** File (por identidad) → Asset id en el servidor, para enlazar al guardar. */
  const sourceMapRef = useRef(new Map<File, string>());
  const bootRef = useRef(false);

  const objectUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [objectUrls]);
  const activePreviewUrls = files.length > 0 ? objectUrls : restoredSources;

  const refreshProjects = useCallback(async () => {
    const { projects: list } = await store.listProjects();
    setProjects(list);
    return list;
  }, []);

  const loadProjectData = useCallback(async (projectId: string) => {
    const [{ campaigns: list }, { assets: all }] = await Promise.all([
      store.listCampaigns(projectId),
      store.listAssets(projectId),
    ]);
    setCampaigns(list);
    setAssets(all);
  }, []);

  const ensureProject = useCallback(async (): Promise<string | null> => {
    if (activeProjectId) return activeProjectId;
    try {
      const { project } = await store.createProject("Mi proyecto");
      await refreshProjects();
      setActiveProjectId(project.id);
      localStorage.setItem(ACTIVE_KEY, project.id);
      return project.id;
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "No se pudo crear el proyecto.");
      return null;
    }
  }, [activeProjectId, refreshProjects]);

  // Arranque: proyectos, proyecto activo y sus datos.
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        let list = await refreshProjects();
        if (list.length === 0) {
          const { project } = await store.createProject("Mi proyecto");
          list = await refreshProjects();
          setActiveProjectId(project.id);
          localStorage.setItem(ACTIVE_KEY, project.id);
          setCampaigns([]);
          setAssets([]);
        } else {
          const saved = localStorage.getItem(ACTIVE_KEY);
          const id = list.some((p) => p.id === saved) ? (saved as string) : list[0].id;
          setActiveProjectId(id);
          localStorage.setItem(ACTIVE_KEY, id);
          await loadProjectData(id);
          await refreshSkill(id);
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo cargar la biblioteca.");
      } finally {
        setStoreReady(true);
      }
    })();
  }, [refreshProjects, loadProjectData, refreshSkill]);

  const uploadNewFiles = useCallback(
    async (projectId: string, candidates: File[]) => {
      const fresh = candidates.filter((f) => !sourceMapRef.current.has(f));
      if (fresh.length === 0) return;
      try {
        const { assets: saved } = await store.uploadSources(projectId, fresh);
        // Empareja por nombre en orden de subida.
        fresh.forEach((file, i) => {
          const match = saved.find((a) => (assetMeta(a).filename ?? "") === file.name) ?? saved[i];
          if (match) sourceMapRef.current.set(file, match.id);
        });
        setAssets((prev) => [...saved, ...prev]);
        void refreshProjects();
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudieron subir las fuentes.");
      }
    },
    [refreshProjects],
  );

  const handleFilesChange = useCallback(
    (next: File[]) => {
      const removed = files.filter((f) => !next.includes(f));
      removed.forEach((f) => sourceMapRef.current.delete(f));
      setFiles(next);
      setError(null);
      setResult(null);
      setRestoredSources([]);
      setActiveCampaignId(null);
      setTracker(IDLE_TRACKER);
      if (next.length > 0 && activeProjectId && storeReady) {
        void uploadNewFiles(activeProjectId, next);
      }
    },
    [files, activeProjectId, storeReady, uploadNewFiles],
  );

  const startNewSession = useCallback(() => {
    abortRef.current?.abort();
    setFiles([]);
    sourceMapRef.current.clear();
    setResult(null);
    setRestoredSources([]);
    setActiveCampaignId(null);
    setError(null);
    setIsRunning(false);
    setTracker(IDLE_TRACKER);
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setTracker(IDLE_TRACKER);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0 || isRunning) return;
    const projectId = await ensureProject();
    if (!projectId) return;
    // Garantiza que las fuentes estén subidas antes de generar.
    await uploadNewFiles(projectId, files);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setActiveCampaignId(null);
    setTracker(IDLE_TRACKER);

    let finalResult: CampaignResult | null = null;
    let failure: string | null = null;
    try {
      for await (const event of streamCampaign(files, locale, placements, merchant, { groupMode }, controller.signal)) {
        if (event.kind === "stage") {
          setTracker((prev) => reduceStages(prev, event.payload as StageEvent));
        } else if (event.kind === "result") {
          finalResult = event.payload;
          setResult(event.payload);
        } else if (event.kind === "error") {
          failure = event.payload.message;
          setError(event.payload.message);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      failure = err instanceof Error ? err.message : "Fallo inesperado en el pipeline.";
      setError(failure);
    } finally {
      setIsRunning(false);
    }

    // Persistencia: guarda la campaña (éxito o error) con sus assets.
    try {
      setSaving(true);
      const sourceAssetIds = files
        .map((f) => sourceMapRef.current.get(f))
        .filter((id): id is string => !!id);
      const prompt = finalResult
        ? `${finalResult.listing.standardizedTitle} · ${placements.join("+")} · ${locale}${merchant.price.trim() ? ` · ${merchant.price.trim()}` : ""}`
        : `${files.length} foto(s) · ${placements.join("+")} · ${locale}`;
      const saved = await store.saveCampaign({
        projectId,
        prompt,
        status: finalResult ? "done" : "error",
        result: finalResult,
        sourceAssetIds,
      });
      if (saved.campaign.resultJson) {
        setResult(JSON.parse(saved.campaign.resultJson) as CampaignResult);
      }
      setActiveCampaignId(saved.campaign.id);
      setAssets((prev) => {
        const fresh = saved.assets.filter((a) => !prev.some((p) => p.id === a.id));
        return [...fresh, ...prev];
      });
      await Promise.all([loadProjectData(projectId), refreshProjects(), refreshSkill(projectId)]);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "No se pudo guardar la campaña.");
    } finally {
      setSaving(false);
    }
  }, [files, isRunning, ensureProject, uploadNewFiles, locale, placements, merchant, groupMode, loadProjectData, refreshProjects, refreshSkill]);

  const handleSelectProject = useCallback(
    async (id: string) => {
      if (id === activeProjectId) return;
      startNewSession();
      setActiveProjectId(id);
      localStorage.setItem(ACTIVE_KEY, id);
      try {
        await loadProjectData(id);
        await refreshSkill(id);
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo cargar el proyecto.");
      }
    },
    [activeProjectId, startNewSession, loadProjectData, refreshSkill],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        const { project } = await store.createProject(name);
        await refreshProjects();
        startNewSession();
        setActiveProjectId(project.id);
        localStorage.setItem(ACTIVE_KEY, project.id);
        setCampaigns([]);
        setAssets([]);
        setSkills([]);
        setLearningsTotal(0);
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo crear el proyecto.");
      }
    },
    [refreshProjects, startNewSession],
  );

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      try {
        await store.renameProject(id, name);
        await refreshProjects();
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo renombrar.");
      }
    },
    [refreshProjects],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      try {
        await store.deleteProject(id);
        const list = await refreshProjects();
        if (id === activeProjectId) {
          startNewSession();
          const next = list[0]?.id ?? null;
          setActiveProjectId(next);
          if (next) {
            localStorage.setItem(ACTIVE_KEY, next);
            await loadProjectData(next);
            await refreshSkill(next);
          } else {
            localStorage.removeItem(ACTIVE_KEY);
            setCampaigns([]);
            setAssets([]);
            setSkills([]);
            setLearningsTotal(0);
          }
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo eliminar el proyecto.");
      }
    },
    [activeProjectId, refreshProjects, startNewSession, loadProjectData, refreshSkill],
  );

  const handleSelectCampaign = useCallback(async (id: string) => {
    abortRef.current?.abort();
    try {
      const { campaign, assets: linked } = await store.getCampaign(id);
      setActiveCampaignId(id);
      setError(null);
      if (campaign.resultJson) {
        setResult(JSON.parse(campaign.resultJson) as CampaignResult);
        setRestoredSources(
          linked.filter((a) => a.type === "source").map((a) => a.url),
        );
      } else {
        setResult(null);
        setRestoredSources([]);
      }
      setFiles([]);
      sourceMapRef.current.clear();
      setTracker(IDLE_TRACKER);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "No se pudo abrir la sesión.");
    }
  }, []);

  const handleDeleteCampaign = useCallback(
    async (id: string) => {
      try {
        await store.deleteCampaign(id);
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        if (id === activeCampaignId) startNewSession();
        if (activeProjectId) {
          const { assets: all } = await store.listAssets(activeProjectId);
          setAssets(all);
          await refreshProjects();
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo eliminar la sesión.");
      }
    },
    [activeCampaignId, activeProjectId, startNewSession, refreshProjects],
  );

  const handleReuseSource = useCallback(
    async (asset: Asset) => {
      if (files.length >= MAX_FILES) {
        setError(`Máximo ${MAX_FILES} fotos por campaña.`);
        return;
      }
      try {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error("No se pudo leer la fuente.");
        const blob = await response.blob();
        const meta = assetMeta(asset);
        const file = new File([blob], meta.filename ?? `fuente-${asset.id.slice(0, 8)}.png`, {
          type: meta.mime ?? blob.type ?? "image/png",
        });
        sourceMapRef.current.set(file, asset.id);
        setFiles((prev) => [...prev, file].slice(0, MAX_FILES));
        setResult(null);
        setRestoredSources([]);
        setActiveCampaignId(null);
        setError(null);
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : "No se pudo reutilizar la fuente.");
      }
    },
    [files.length],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Señal humana de éxito: cada descarga de flyer marca los learnings de la
  // sesión activa como exportados (peso real frente a la auto-evaluación).
  useEffect(() => {
    const onExport = () => {
      if (activeCampaignId) {
        store.logExport(activeCampaignId).catch(() => {});
      }
    };
    window.addEventListener("adforge:export", onExport);
    return () => window.removeEventListener("adforge:export", onExport);
  }, [activeCampaignId]);

  const sources = useMemo(() => assets.filter((a) => a.type === "source"), [assets]);
  const flyers = useMemo(() => assets.filter((a) => a.type !== "source"), [assets]);
  return (
    <div className="flex h-screen flex-col overflow-hidden night-glow">
      <TopBar provider={provider} />
      {storeError && (
        <p role="alert" className="border-b border-danger-dark/40 bg-danger/10 px-4 py-1.5 font-mono text-[11px] text-danger">
          Biblioteca: {storeError}{" "}
          <button type="button" onClick={() => setStoreError(null)} className="underline">
            ocultar
          </button>
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <ProjectsPanel
          projects={projects}
          activeProjectId={activeProjectId}
          campaigns={campaigns}
          activeCampaignId={activeCampaignId}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onSelectCampaign={handleSelectCampaign}
          onDeleteCampaign={handleDeleteCampaign}
          onNewSession={startNewSession}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col gap-4 p-4 sm:p-5">
            <CenterState
              result={result}
              isRunning={isRunning}
              tracker={tracker}
              previewUrls={activePreviewUrls}
            />
            <div className="mt-auto">
              <ComposerBar
                files={files}
                previewUrls={activePreviewUrls}
                locale={locale}
                placements={placements}
                merchant={merchant}
                groupMode={groupMode}
                isRunning={isRunning || !storeReady}
                error={error}
                onFilesChange={handleFilesChange}
                onLocaleChange={setLocale}
                onPlacementsChange={setPlacements}
                onMerchantChange={setMerchant}
                onGroupModeChange={setGroupMode}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
              />
            </div>
          </div>
        </main>
        <AssetsPanel
          sources={sources}
          flyers={flyers}
          collapsed={rightCollapsed}
          saving={saving}
          onToggleCollapse={() => setRightCollapsed((v) => !v)}
          onReuseSource={handleReuseSource}
          skills={skills}
          skillThreshold={skillThreshold}
          learningsTotal={learningsTotal}
        />
      </div>
      <footer className="border-t border-night-rule/60 bg-night px-6 py-2">
        <p className="mx-auto max-w-[1400px] font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          AdForge AI · Cerebral Valley Hackathon · SQLite local
          {result && (
            <>
              {" "}
              · SKU {result.skuId} · {result.timings.total} ms
              {result.productCount > 1 ? ` · ${result.productCount} productos` : ""}
            </>
          )}
          {activeCampaignId && " · sesión guardada"}
        </p>
      </footer>
    </div>
  );
}

function CenterState({
  result,
  isRunning,
  tracker,
  previewUrls,
}: {
  result: CampaignResult | null;
  isRunning: boolean;
  tracker: StageTracker;
  previewUrls: string[];
}) {
  const trackerActive = (Object.keys(tracker) as Array<"sam" | "museImage" | "museSpark" | "review">).some(
    (k) => tracker[k] !== "idle",
  );

  if (isRunning || (trackerActive && !result)) {
    return <AgentFeed tracker={tracker} isRunning={isRunning} total={result?.timings.total} />;
  }

  if (result) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <AgentFeed tracker={tracker} isRunning={false} total={result.timings.total} compact />
        <ResultsTabs result={result} previewUrls={previewUrls} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="w-full max-w-md rounded-2xl border border-night-rule bg-night-panel p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-soft font-mono text-2xl text-mint">
          ✦
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold tracking-tight text-paper">
          Convertí fotos en campaña
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-paper-muted">
          Adjuntá hasta 4 fotos del producto en la barra inferior y 4 agentes
          generarán el flyer: visión, copy AIDA, render y auditoría visual.
        </p>
        <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left font-mono text-[11px] text-paper-dim">
          <li><span className="text-mint">›</span> + para adjuntar · ⏎ para generar</li>
          <li><span className="text-mint">›</span> ⚙ ajusta mercado, piezas y precio</li>
          <li><span className="text-mint">›</span> Todo se guarda en la biblioteca →</li>
        </ul>
      </div>
    </div>
  );
}
