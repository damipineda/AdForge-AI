"use client";

import { useState } from "react";
import { Check, ChevronDown, FolderGit2, MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import type { CampaignSummary, Project } from "@/lib/store/client";

type ProjectsPanelProps = {
  projects: Project[];
  activeProjectId: string | null;
  campaigns: CampaignSummary[];
  activeCampaignId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onSelectCampaign: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  onNewSession: () => void;
};

export function ProjectsPanel(props: ProjectsPanelProps) {
  const { collapsed, onToggleCollapse } = props;
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (collapsed) {
    return (
      <div className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-night-rule bg-night-panel py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label="Expandir panel de proyectos"
          title="Proyectos"
        >
          <FolderGit2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => { setCreating(true); onToggleCollapse(); }}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label="Nuevo proyecto"
          title="Nuevo proyecto"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const active = props.projects.find((p) => p.id === props.activeProjectId);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-night-rule bg-night-panel">
      <div className="flex items-center justify-between gap-2 border-b border-night-rule px-3 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          Proyectos
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded-md p-1.5 text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label="Nuevo proyecto"
            title="Nuevo proyecto"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 font-mono text-xs text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label="Colapsar panel"
            title="Colapsar"
          >
            «
          </button>
        </div>
      </div>

      {creating && (
        <form
          className="flex items-center gap-1.5 border-b border-night-rule px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) props.onCreateProject(draft.trim());
            setDraft("");
            setCreating(false);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nombre del proyecto…"
            maxLength={80}
            className="min-w-0 flex-1 rounded-md border border-night-rule-strong bg-night px-2 py-1.5 text-sm text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
          />
          <button type="submit" className="rounded-md p-1.5 text-mint hover:bg-night" aria-label="Crear">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-md p-1.5 text-paper-muted hover:bg-night" aria-label="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {props.projects.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-paper-muted">
            Sin proyectos. Creá uno para empezar a guardar campañas.
          </p>
        )}
        <ul className="space-y-1">
          {props.projects.map((project) => {
            const isActive = project.id === props.activeProjectId;
            const isEditing = editingId === project.id;
            return (
              <li key={project.id} className="min-w-0">
                <div
                  className={clsx(
                    "group flex items-center gap-1.5 rounded-md px-2 py-1.5",
                    isActive ? "bg-mint-soft" : "hover:bg-night",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => props.onSelectProject(project.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderGit2 className={clsx("h-3.5 w-3.5 shrink-0", isActive ? "text-mint" : "text-paper-muted")} />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingName.trim()) props.onRenameProject(project.id, editingName.trim());
                            setEditingId(null);
                          } else if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => {
                          if (editingName.trim() && editingName.trim() !== project.name) {
                            props.onRenameProject(project.id, editingName.trim());
                          }
                          setEditingId(null);
                        }}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded border border-mint bg-night px-1 py-0.5 text-sm text-paper focus:outline-none"
                      />
                    ) : (
                      <span className={clsx("min-w-0 flex-1 truncate text-sm", isActive ? "text-paper" : "text-paper-dim")}>
                        {project.name}
                      </span>
                    )}
                  </button>
                  {!isEditing && (
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { setEditingId(project.id); setEditingName(project.name); }}
                        className="rounded p-1 text-paper-muted hover:text-paper"
                        aria-label={`Renombrar ${project.name}`}
                        title="Renombrar"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDeleteProject(project.id)}
                        className="rounded p-1 text-paper-muted hover:text-danger"
                        aria-label={`Eliminar ${project.name}`}
                        title="Eliminar proyecto y sus campañas"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>

                {isActive && (
                  <div className="ml-4 mt-1 border-l border-night-rule-strong pl-2">
                    <div className="flex items-center justify-between px-1 py-1">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-paper-muted">
                        Sesiones · {props.campaigns.length}
                      </span>
                      <button
                        type="button"
                        onClick={props.onNewSession}
                        className="font-mono text-[10px] uppercase tracking-widest text-mint hover:underline"
                      >
                        + Nueva
                      </button>
                    </div>
                    {props.campaigns.length === 0 && (
                      <p className="px-1 pb-2 text-[11px] text-paper-muted">Aún sin campañas generadas.</p>
                    )}
                    <ul className="space-y-0.5 pb-2">
                      {props.campaigns.map((campaign) => {
                        const isCurrent = campaign.id === props.activeCampaignId;
                        return (
                          <li key={campaign.id} className="group/c min-w-0">
                            <div
                              className={clsx(
                                "flex items-center gap-1.5 rounded-md px-1.5 py-1.5",
                                isCurrent ? "bg-night-rule/60" : "hover:bg-night",
                              )}
                            >
                              <span
                                className={clsx(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  campaign.status === "done" ? "bg-mint" : "bg-danger",
                                )}
                              />
                              <button
                                type="button"
                                onClick={() => props.onSelectCampaign(campaign.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="flex items-center gap-1.5">
                                  <MessageSquareText className="h-3 w-3 shrink-0 text-paper-muted" />
                                  <span className="min-w-0 flex-1 truncate text-xs text-paper-dim">
                                    {campaign.prompt || "Campaña sin título"}
                                  </span>
                                </span>
                                <span className="mt-0.5 block font-mono text-[10px] text-paper-muted">
                                  {new Date(campaign.createdAt).toLocaleString()}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => props.onDeleteCampaign(campaign.id)}
                                className="shrink-0 rounded p-1 text-paper-muted opacity-0 transition-opacity hover:text-danger group-hover/c:opacity-100"
                                aria-label="Eliminar sesión"
                                title="Eliminar sesión"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {active && (
        <div className="border-t border-night-rule px-3 py-2">
          <p className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-paper-muted">
            <span className="flex items-center gap-1">
              Activo <ChevronDown className="h-3 w-3" />
            </span>
            <span>{active.campaigns} sesiones · {active.assets} assets</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-paper-dim">{active.name}</p>
        </div>
      )}
    </aside>
  );
}
