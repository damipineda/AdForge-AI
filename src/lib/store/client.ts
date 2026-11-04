"use client";

import type { BriefFocus, CampaignResult } from "@/lib/schema/campaign";
import type { PiecePlacement } from "@/lib/pipeline/refine-piece";

export type Project = { id: string; name: string; createdAt: number; campaigns: number; assets: number };
export type CampaignSummary = { id: string; projectId: string; prompt: string; status: string; createdAt: number; brief: string; focus: string };
export type Asset = {
  id: string;
  campaignId: string | null;
  projectId: string;
  type: string;
  url: string;
  metadataJson: string;
  createdAt: number;
};
export type SavedCampaign = {
  campaign: CampaignSummary & { resultJson: string | null };
  assets: Asset[];
};
export type Learning = {
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
export type SkillRule = {
  id: string;
  category: string;
  rule: string;
  evidenceCount: number;
  status: string;
  promotedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type BrandKit = {
  id: string;
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoAssetId: string | null;
  logoPosition: "auto" | "left" | "right";
  createdAt: number;
  updatedAt: number;
};

export type ApiKeySettings = {
  configured: boolean;
  maskedKey: string | null;
  source: "ui" | "env" | "none";
  provider: "demo" | "meta";
  verified?: boolean;
};

export function assetMeta(asset: Asset): { filename?: string; mime?: string; slot?: string } {
  try {
    return JSON.parse(asset.metadataJson) as { filename?: string; mime?: string; slot?: string };
  } catch {
    return {};
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${response.status}`);
  }
  return json;
}

export const store = {
  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  createProject: (name: string) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  renameProject: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),

  listCampaigns: (projectId: string) =>
    request<{ campaigns: CampaignSummary[] }>(`/api/projects/${projectId}/campaigns`),
  getCampaign: (id: string) => request<SavedCampaign>(`/api/campaigns/${id}`),
  deleteCampaign: (id: string) => request<{ ok: boolean }>(`/api/campaigns/${id}`, { method: "DELETE" }),
  refinePiece: (id: string, placement: PiecePlacement, instruction: string, mode?: "refine" | "regenerate") =>
    request<{ result: CampaignResult; assets: Asset[]; notice?: string }>(`/api/campaigns/${id}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement, instruction, mode }) }),
  logExport: (campaignId: string) =>
    request<{ marked: number }>(`/api/campaigns/${campaignId}`, { method: "POST" }),

  listLearnings: (projectId: string) =>
    request<{ learnings: Learning[] }>(`/api/learnings?projectId=${encodeURIComponent(projectId)}`),
  listSkills: (category?: string) =>
    request<{ rules: SkillRule[]; threshold: number }>(
      category ? `/api/skills?category=${encodeURIComponent(category)}` : "/api/skills",
    ),
  exportSkill: (category: string) =>
    request<{ category: string; label: string; filename: string; threshold: number; markdown: string }>(
      `/api/skills/export?category=${encodeURIComponent(category)}`,
    ),

  listAssets: (projectId: string) => request<{ assets: Asset[] }>(`/api/projects/${projectId}/assets`),
  uploadSources: (projectId: string, files: File[], type: "source" | "logo" = "source") => {
    const form = new FormData();
    form.append("type", type);
    files.forEach((f) => form.append("file", f, f.name));
    return request<{ assets: Asset[] }>(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
  },

  getBrandKit: (projectId: string) =>
    request<{ kit: BrandKit | null; logo: Asset | null }>(`/api/projects/${projectId}/brand-kit`),
  saveBrandKit: (projectId: string, kit: Omit<BrandKit, "id" | "projectId" | "createdAt" | "updatedAt">) =>
    request<{ kit: BrandKit }>(`/api/projects/${projectId}/brand-kit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kit),
    }),

  getSettings: () => request<ApiKeySettings>("/api/settings"),
  saveApiKey: (apiKey: string) =>
    request<ApiKeySettings>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }),
  clearApiKey: () => request<ApiKeySettings>("/api/settings", { method: "DELETE" }),

  saveCampaign: (input: {
    projectId: string;
    prompt: string;
    status: "done" | "error";
    result: CampaignResult | null;
    sourceAssetIds: string[];
    brief?: string;
    focus?: BriefFocus | null;
  }) => {
    const flyers: Array<{ slot: string; type: "feed" | "story" | "carousel"; dataUrl: string; filename: string }> = [];
    const result = input.result;
    if (result) {
      result.feedImages.forEach((img, i) => {
        if (typeof img === "string" && img.startsWith("data:")) {
          flyers.push({ slot: `feed-${i}`, type: "feed", dataUrl: img, filename: `${result.skuId}-feed-V${i + 1}.png` });
        }
      });
      if (typeof result.storyImage === "string" && result.storyImage.startsWith("data:")) {
        flyers.push({ slot: "story", type: "story", dataUrl: result.storyImage, filename: `${result.skuId}-story.png` });
      }
      (result.carouselImages ?? []).forEach((img, i) => {
        if (typeof img === "string" && img.startsWith("data:")) {
          flyers.push({ slot: `carousel-${i}`, type: "carousel", dataUrl: img, filename: `${result.skuId}-carousel-${i + 1}.png` });
        }
      });
    }
    return request<SavedCampaign>("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        prompt: input.prompt,
        status: input.status,
        resultJson: result ? JSON.stringify(result) : null,
        sourceAssetIds: input.sourceAssetIds,
        brief: input.brief ?? "",
        focus: input.focus ?? undefined,
        flyers,
      }),
    });
  },
};
