"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BriefFocus, CampaignResult, Locale, Placement, StageEvent } from "@/lib/schema/campaign";
import type { Provider } from "@/lib/pipeline";
import { streamCampaign } from "@/lib/sse-client";
import { assetMeta, store, type ApiKeySettings, type Asset, type BrandKit, type CampaignSummary, type Learning, type Project, type SkillRule } from "@/lib/store/client";
import { ComposerBar } from "./ComposerBar";
import { AgentFeed } from "./AgentFeed";
import { failRunningStages, reduceStages, type StageTracker } from "./ProgressBar";
import { ResultsTabs } from "./ResultsTabs";
import { TopBar } from "./TopBar";
import { PlatformTour } from "./PlatformTour";
import { ProjectsPanel } from "./ide/ProjectsPanel";
import { AssetsPanel } from "./ide/AssetsPanel";
import type { MerchantInput } from "./ComposerBar";
import type { PiecePlacement } from "@/lib/pipeline/refine-piece";
import { I18nProvider, useI18n, type UiLang } from "@/lib/i18n";

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
  const [locale, setLocale] = useState<Locale>("es");
  const handleLangChange = useCallback((lang: UiLang) => {
    setLocale((prev) => (prev === "pt" ? prev : lang));
  }, []);
  return (
    <I18nProvider onLangChange={handleLangChange}>
      <DashboardInner provider={provider} locale={locale} setLocale={setLocale} />
    </I18nProvider>
  );
}

function DashboardInner({
  provider,
  locale,
  setLocale,
}: {
  provider: Provider;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const { t } = useI18n();

  // Lienzo / pipeline
  const [files, setFiles] = useState<File[]>([]);
  const [placements, setPlacements] = useState<Placement[]>(["feed", "story"]);
  const [merchant, setMerchant] = useState<MerchantInput>({ price: "" });
  const [groupMode, setGroupMode] = useState(true);
  const [brief, setBrief] = useState("");
  const [focus, setFocus] = useState<BriefFocus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [tracker, setTracker] = useState<StageTracker>(IDLE_TRACKER);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Configuración Meta API Key
  const [apiKeySettings, setApiKeySettings] = useState<ApiKeySettings | null>(null);

  // Persistencia / IDE
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const activeCampaignRef = useRef<string | null>(null);
  useEffect(() => { activeCampaignRef.current = activeCampaignId; }, [activeCampaignId]);

  const refinePiece = useCallback(async (placement: PiecePlacement, instruction: string, mode?: "refine" | "regenerate") => {
    const id = activeCampaignId;
    if (!id) throw new Error(t.dashboard.errCampaignNotSaved);
    const saved = await store.refinePiece(id, placement, instruction, mode);
    if (activeCampaignRef.current !== id) return;
    setResult((current) => {
      if (!current) return current;
      const next = { ...current, feedVariants: [...current.feedVariants], feedImages: [...current.feedImages], feedErrors: [...current.feedErrors], feedReviews: [...current.feedReviews], artworkDims: { ...current.artworkDims, feed: [...current.artworkDims.feed] }, copyReview: saved.result.copyReview, diversityReview: saved.result.diversityReview };
      if (placement === "story") { next.story = saved.result.story; next.storyImage = saved.result.storyImage; next.storyError = saved.result.storyError; next.storyReview = saved.result.storyReview; next.artworkDims.story = saved.result.artworkDims.story; }
      else { const i = placement === "feed-1" ? 1 : 0; next.feedVariants[i] = saved.result.feedVariants[i]; next.feedImages[i] = saved.result.feedImages[i]; next.feedErrors[i] = saved.result.feedErrors[i]; next.feedReviews[i] = saved.result.feedReviews[i]; next.artworkDims.feed[i] = saved.result.artworkDims.feed[i]; }
      next.refinements = [...new Map([...current.refinements, ...saved.result.refinements].map((v) => [v.id, v])).values()].sort((a, b) => a.at - b.at).slice(-50);
      return next;
    });
    setAssets((current) => [...new Map([...current, ...saved.assets].map((v) => [v.id, v])).values()]);
    if (saved.notice) throw new Error(saved.notice);
  }, [activeCampaignId, t.dashboard.errCampaignNotSaved]);

  const [restoredSources, setRestoredSources] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const handleTourTarget = useCallback((target: string) => {
    if (target === "projects-panel") {
      setLeftCollapsed(false);
    } else if (target === "brand-kit" || target === "assets-library") {
      setRightCollapsed(false);
    }
  }, []);

  // Skill aprendido: reglas + conteo de piezas analizadas del proyecto.
  const [skills, setSkills] = useState<SkillRule[]>([]);
  const [skillThreshold, setSkillThreshold] = useState(3);
  const [learningsTotal, setLearningsTotal] = useState(0);

  // Kit de marca del proyecto activo (null = sin kit, el agente diseña libremente).
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);

  const handleSaveApiKey = useCallback(async (key: string) => {
    const updated = await store.saveApiKey(key);
    setApiKeySettings(updated);
    return updated;
  }, []);

  const handleClearApiKey = useCallback(async () => {
    const updated = await store.clearApiKey();
    setApiKeySettings(updated);
    return updated;
  }, []);

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
    const [{ campaigns: list }, { assets: all }, { kit, logo }] = await Promise.all([
      store.listCampaigns(projectId),
      store.listAssets(projectId),
      store.getBrandKit(projectId).catch(() => ({ kit: null, logo: null })),
    ]);
    setCampaigns(list);
    setAssets(all);
    setBrandKit(kit);
    setBrandLogoUrl(logo?.url ?? null);
  }, []);

  const ensureProject = useCallback(async (): Promise<string | null> => {
    if (activeProjectId) return activeProjectId;
    try {
      const { project } = await store.createProject(t.dashboard.defaultProjectName);
      await refreshProjects();
      setActiveProjectId(project.id);
      localStorage.setItem(ACTIVE_KEY, project.id);
      return project.id;
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : t.dashboard.errCreateProject);
      return null;
    }
  }, [activeProjectId, refreshProjects, t.dashboard.defaultProjectName, t.dashboard.errCreateProject]);

  // Arranque: configuración API, proyectos, proyecto activo y sus datos.
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        store.getSettings().then(setApiKeySettings).catch(() => {});
        let list = await refreshProjects();
        if (list.length === 0) {
          const { project } = await store.createProject(t.dashboard.defaultProjectName);
          list = await refreshProjects();
          setActiveProjectId(project.id);
          localStorage.setItem(ACTIVE_KEY, project.id);
          setCampaigns([]);
          setAssets([]);
          setBrandKit(null);
          setBrandLogoUrl(null);
        } else {
          const saved = localStorage.getItem(ACTIVE_KEY);
          const id = list.some((p) => p.id === saved) ? (saved as string) : list[0].id;
          setActiveProjectId(id);
          localStorage.setItem(ACTIVE_KEY, id);
          await loadProjectData(id);
          await refreshSkill(id);
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errLoadLibrary);
      } finally {
        setStoreReady(true);
      }
    })();
  }, [refreshProjects, loadProjectData, refreshSkill, t.dashboard.defaultProjectName, t.dashboard.errLoadLibrary]);

  const uploadNewFiles = useCallback(
    async (projectId: string, candidates: File[]) => {
      const fresh = candidates.filter((f) => !sourceMapRef.current.has(f));
      if (fresh.length === 0) return;
      try {
        const { assets: saved } = await store.uploadSources(projectId, fresh);
        fresh.forEach((file, i) => {
          const match = saved.find((a) => (assetMeta(a).filename ?? "") === file.name) ?? saved[i];
          if (match) sourceMapRef.current.set(file, match.id);
        });
        setAssets((prev) => [...saved, ...prev]);
        void refreshProjects();
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errUploadSources);
      }
    },
    [refreshProjects, t.dashboard.errUploadSources],
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
      for await (const event of streamCampaign(files, locale, placements, merchant, { groupMode, projectId, brief, focus: focus ?? undefined }, controller.signal)) {
        if (event.kind === "stage") {
          setTracker((prev) => reduceStages(prev, event.payload as StageEvent));
        } else if (event.kind === "result") {
          finalResult = event.payload;
          setResult(event.payload);
        } else if (event.kind === "error") {
          failure = event.payload.message;
          setError(event.payload.message);
          setTracker((prev) => failRunningStages(prev, event.payload.message));
        }
      }
      if (!finalResult && !failure && !controller.signal.aborted) {
        failure = t.dashboard.errConnectionClosed;
        setError(failure);
        const message = failure;
        setTracker((prev) => failRunningStages(prev, message));
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      failure = err instanceof Error ? err.message : t.dashboard.errPipelineUnexpected;
      setError(failure);
      const message = failure;
      setTracker((prev) => failRunningStages(prev, message));
    } finally {
      setIsRunning(false);
    }

    try {
      setSaving(true);
      const sourceAssetIds = files
        .map((f) => sourceMapRef.current.get(f))
        .filter((id): id is string => !!id);
      const prompt = brief.trim()
        ? brief.trim().slice(0, 120)
        : finalResult
          ? `${finalResult.listing.standardizedTitle} · ${placements.join("+")} · ${locale}${merchant.price.trim() ? ` · ${merchant.price.trim()}` : ""}`
          : `${t.dashboard.photosPromptFallback(files.length)} · ${placements.join("+")} · ${locale}`;
      const saved = await store.saveCampaign({
        projectId,
        prompt,
        status: finalResult ? "done" : "error",
        result: finalResult,
        sourceAssetIds,
        brief,
        focus,
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
      setStoreError(err instanceof Error ? err.message : t.dashboard.errSaveCampaign);
    } finally {
      setSaving(false);
    }
  }, [files, isRunning, ensureProject, uploadNewFiles, locale, placements, merchant, groupMode, brief, focus, loadProjectData, refreshProjects, refreshSkill, t.dashboard]);

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
        setStoreError(err instanceof Error ? err.message : t.dashboard.errLoadProject);
      }
    },
    [activeProjectId, startNewSession, loadProjectData, refreshSkill, t.dashboard.errLoadProject],
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
        setBrandKit(null);
        setBrandLogoUrl(null);
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errCreateProject);
      }
    },
    [refreshProjects, startNewSession, t.dashboard.errCreateProject],
  );

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      try {
        await store.renameProject(id, name);
        await refreshProjects();
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errRenameProject);
      }
    },
    [refreshProjects, t.dashboard.errRenameProject],
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
            setBrandKit(null);
            setBrandLogoUrl(null);
          }
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errDeleteProject);
      }
    },
    [activeProjectId, refreshProjects, startNewSession, loadProjectData, refreshSkill, t.dashboard.errDeleteProject],
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
      setStoreError(err instanceof Error ? err.message : t.dashboard.errOpenSession);
    }
  }, [t.dashboard.errOpenSession]);

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
        setStoreError(err instanceof Error ? err.message : t.dashboard.errDeleteSession);
      }
    },
    [activeCampaignId, activeProjectId, startNewSession, refreshProjects, t.dashboard.errDeleteSession],
  );

  const handleReuseSource = useCallback(
    async (asset: Asset) => {
      if (files.length >= MAX_FILES) {
        setError(t.dashboard.errMaxPhotos(MAX_FILES));
        return;
      }
      try {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(t.dashboard.errReadSource);
        const blob = await response.blob();
        const meta = assetMeta(asset);
        const file = new File([blob], meta.filename ?? `source-${asset.id.slice(0, 8)}.png`, {
          type: meta.mime ?? blob.type ?? "image/png",
        });
        sourceMapRef.current.set(file, asset.id);
        setFiles((prev) => [...prev, file].slice(0, MAX_FILES));
        setResult(null);
        setRestoredSources([]);
        setActiveCampaignId(null);
        setError(null);
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errReuseSource);
      }
    },
    [files.length, t.dashboard],
  );

  const handleSaveBrand = useCallback(
    async (kit: { name: string; primaryColor: string; secondaryColor: string; accentColor: string; logoAssetId: string | null; logoPosition: "auto" | "left" | "right" }) => {
      if (!activeProjectId) return;
      try {
        const { kit: saved } = await store.saveBrandKit(activeProjectId, kit);
        setBrandKit(saved);
        const logo = saved.logoAssetId ? assets.find((a) => a.id === saved.logoAssetId) ?? null : null;
        setBrandLogoUrl(logo?.url ?? brandLogoUrl);
        if (saved.logoAssetId && !logo) {
          const { assets: all } = await store.listAssets(activeProjectId);
          setAssets(all);
          setBrandLogoUrl(all.find((a) => a.id === saved.logoAssetId)?.url ?? null);
        }
      } catch (err) {
        setStoreError(err instanceof Error ? err.message : t.dashboard.errSaveBrand);
      }
    },
    [activeProjectId, assets, brandLogoUrl, t.dashboard.errSaveBrand],
  );

  const handleUploadLogo = useCallback(
    async (file: File) => {
      if (!activeProjectId) return null;
      const { assets: saved } = await store.uploadSources(activeProjectId, [file], "logo");
      setAssets((prev) => [...saved, ...prev]);
      return saved[0] ?? null;
    },
    [activeProjectId],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

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
  const flyers = useMemo(() => assets.filter((a) => a.type === "feed" || a.type === "story" || a.type === "carousel"), [assets]);

  return (
    <div className="flex h-screen flex-col overflow-hidden night-glow">
      <TopBar
        provider={provider}
        apiKeySettings={apiKeySettings}
        onSaveApiKey={handleSaveApiKey}
        onClearApiKey={handleClearApiKey}
        onStartTour={() => setTourOpen(true)}
      />
      <PlatformTour
        key={String(tourOpen)}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onStepTarget={handleTourTarget}
      />
      {storeError && (
        <p role="alert" className="border-b border-danger-dark/40 bg-danger/10 px-4 py-1.5 font-mono text-[11px] text-danger">
          {t.dashboard.libraryAlertPrefix} {storeError}{" "}
          <button type="button" onClick={() => setStoreError(null)} className="underline">
            {t.dashboard.hideAlert}
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
            <div data-tour="center-canvas" className="flex min-w-0 flex-1 flex-col">
              <CenterState
                result={result}
                isRunning={isRunning}
                tracker={tracker}
                previewUrls={activePreviewUrls}
                onRefinePiece={activeCampaignId ? refinePiece : undefined}
                logoUrl={brandLogoUrl}
                logoPosition={brandKit?.logoPosition ?? "auto"}
              />
            </div>
            <div data-tour="composer-bar" className="mt-auto">
              <ComposerBar
                files={files}
                previewUrls={activePreviewUrls}
                locale={locale}
                placements={placements}
                merchant={merchant}
                groupMode={groupMode}
                brief={brief}
                focus={focus}
                isRunning={isRunning || !storeReady}
                error={error}
                onFilesChange={handleFilesChange}
                onLocaleChange={setLocale}
                onPlacementsChange={setPlacements}
                onMerchantChange={setMerchant}
                onGroupModeChange={setGroupMode}
                onBriefChange={setBrief}
                onFocusChange={setFocus}
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
          brandKit={brandKit}
          brandLogoUrl={brandLogoUrl}
          onSaveBrand={handleSaveBrand}
          onUploadLogo={handleUploadLogo}
          apiKeySettings={apiKeySettings}
          onSaveApiKey={handleSaveApiKey}
          onClearApiKey={handleClearApiKey}
        />
      </div>
      <footer className="border-t border-night-rule/60 bg-night px-6 py-2">
        <p className="mx-auto max-w-[1400px] font-mono text-[10px] uppercase tracking-widest text-paper-muted">
          AdForge AI · Cerebral Valley Hackathon · {t.dashboard.footerLocalDb}
          {result && (
            <>
              {" "}
              · SKU {result.skuId} · {result.timings.total} ms
              {result.productCount > 1 ? ` · ${result.productCount} ${t.dashboard.footerProducts}` : ""}
            </>
          )}
          {activeCampaignId && ` · ${t.dashboard.footerSessionSaved}`}
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
  onRefinePiece,
  logoUrl,
  logoPosition,
}: {
  result: CampaignResult | null;
  isRunning: boolean;
  tracker: StageTracker;
  previewUrls: string[];
  onRefinePiece?: (placement: PiecePlacement, instruction: string, mode?: "refine" | "regenerate") => Promise<void>;
  logoUrl?: string | null;
  logoPosition?: "auto" | "left" | "right" | null;
}) {
  const { t } = useI18n();
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
        <ResultsTabs result={result} previewUrls={previewUrls} onRefinePiece={onRefinePiece} logoUrl={logoUrl} logoPosition={logoPosition} />
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
          {t.dashboard.emptyTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-paper-muted">
          {t.dashboard.emptyDesc}
        </p>
        <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left font-mono text-[11px] text-paper-dim">
          <li><span className="text-mint">›</span> {t.dashboard.emptyBullet1}</li>
          <li><span className="text-mint">›</span> {t.dashboard.emptyBullet2}</li>
          <li><span className="text-mint">›</span> {t.dashboard.emptyBullet3}</li>
        </ul>
      </div>
    </div>
  );
}
