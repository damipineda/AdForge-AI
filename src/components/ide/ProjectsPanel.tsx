"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FolderGit2, MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import type { CampaignSummary, Project } from "@/lib/store/client";
import { useI18n } from "@/lib/i18n";

const INITIAL_SESSIONS_VISIBLE = 6;

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
  const { t } = useI18n();
  const { collapsed, onToggleCollapse } = props;
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [showAllSessions, setShowAllSessions] = useState(false);

  if (collapsed) {
    return (
      <div
        data-tour="projects-panel"
        className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-night-rule bg-night-panel py-3"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label={t.projectsPanel.expandAria}
          title={t.projectsPanel.title}
        >
          <FolderGit2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => { setCreating(true); onToggleCollapse(); }}
          className="rounded-md p-2 text-paper-muted transition-colors hover:bg-night hover:text-paper"
          aria-label={t.projectsPanel.newProject}
          title={t.projectsPanel.newProject}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const active = props.projects.find((p) => p.id === props.activeProjectId);

  return (
    <aside
      data-tour="projects-panel"
      className="flex h-full w-64 shrink-0 flex-col border-r border-night-rule bg-night-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-night-rule px-3 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-paper-muted">
          {t.projectsPanel.title}
        </span>
        <div className="flex items-center gap-1">
          {active && (
            <button
              type="button"
              onClick={() => setSessionsOpen((v) => !v)}
              className="rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-paper-muted transition-colors hover:bg-night hover:text-paper"
              aria-label={t.projectsPanel.toggleSessionsAria}
              title={sessionsOpen ? t.projectsPanel.collapseAllProjects : t.projectsPanel.expandActiveProject}
            >
              {sessionsOpen ? "▾" : "▸"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded-md p-1.5 text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label={t.projectsPanel.newProject}
            title={t.projectsPanel.newProject}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 font-mono text-xs text-paper-muted transition-colors hover:bg-night hover:text-paper"
            aria-label={t.projectsPanel.collapseAria}
            title={t.projectsPanel.collapseTitle}
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
            placeholder={t.projectsPanel.namePlaceholder}
            maxLength={80}
            className="min-w-0 flex-1 rounded-md border border-night-rule-strong bg-night px-2 py-1.5 text-sm text-paper placeholder:text-paper-muted focus:border-mint focus:outline-none"
          />
          <button type="submit" className="rounded-md p-1.5 text-mint hover:bg-night" aria-label={t.projectsPanel.createAria}>
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-md p-1.5 text-paper-muted hover:bg-night" aria-label={t.projectsPanel.cancelAria}>
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {props.projects.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-paper-muted">
            {t.projectsPanel.emptyProjects}
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
                    onClick={() => {
                      if (isActive) {
                        setSessionsOpen((v) => !v);
                      } else {
                        setSessionsOpen(true);
                        setShowAllSessions(false);
                        props.onSelectProject(project.id);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    aria-expanded={isActive ? sessionsOpen : false}
                  >
                    {isActive ? (
                      sessionsOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-mint" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mint" />
                      )
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper-muted/60" />
                    )}
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
                    {!isEditing && (
                      <span className="shrink-0 rounded-full bg-night px-1.5 py-0.5 font-mono text-[10px] text-paper-muted">
                        {isActive ? props.campaigns.length : project.campaigns}
                      </span>
                    )}
                  </button>
                  {!isEditing && (
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { setEditingId(project.id); setEditingName(project.name); }}
                        className="rounded p-1 text-paper-muted hover:text-paper"
                        aria-label={`${t.projectsPanel.renameTitle} ${project.name}`}
                        title={t.projectsPanel.renameTitle}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDeleteProject(project.id)}
                        className="rounded p-1 text-paper-muted hover:text-danger"
                        aria-label={`${t.projectsPanel.deleteTitle} ${project.name}`}
                        title={t.projectsPanel.deleteTitle}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>

                {isActive && (
                  <div className="ml-4 mt-1 border-l border-night-rule-strong pl-2">
                    <div className="flex items-center justify-between px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setSessionsOpen((v) => !v)}
                        aria-expanded={sessionsOpen}
                        aria-label={t.projectsPanel.toggleSessionsAria}
                        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-paper-muted transition-colors hover:text-paper"
                      >
                        {sessionsOpen ? (
                          <ChevronDown className="h-3 w-3 text-paper-muted" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-paper-muted" />
                        )}
                        <span>
                          {t.projectsPanel.sessionsLabel} · {props.campaigns.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={props.onNewSession}
                        className="font-mono text-[10px] uppercase tracking-widest text-mint hover:underline"
                      >
                        {t.projectsPanel.newSession}
                      </button>
                    </div>
                    {sessionsOpen && (
                      <>
                        {props.campaigns.length === 0 && (
                          <p className="px-1 pb-2 text-[11px] text-paper-muted">{t.projectsPanel.emptyCampaigns}</p>
                        )}
                        <ul className="space-y-0.5 pb-1">
                          {(showAllSessions
                            ? props.campaigns
                            : props.campaigns.slice(0, INITIAL_SESSIONS_VISIBLE)
                          ).map((campaign) => {
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
                                        {campaign.prompt || t.projectsPanel.untitledCampaign}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 block font-mono text-[10px] text-paper-muted">
                                      {new Date(campaign.createdAt).toLocaleString()}
                                    </span>
                                    {campaign.brief ? (
                                      <span className="mt-0.5 block truncate text-[11px] italic text-paper-muted">
                                        “{campaign.brief}”
                                      </span>
                                    ) : null}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => props.onDeleteCampaign(campaign.id)}
                                    className="shrink-0 rounded p-1 text-paper-muted opacity-0 transition-opacity hover:text-danger group-hover/c:opacity-100"
                                    aria-label={t.projectsPanel.deleteSessionTitle}
                                    title={t.projectsPanel.deleteSessionTitle}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {props.campaigns.length > INITIAL_SESSIONS_VISIBLE && (
                          <button
                            type="button"
                            onClick={() => setShowAllSessions((v) => !v)}
                            className="mb-2 mt-0.5 flex w-full items-center justify-center gap-1 rounded-md border border-night-rule bg-night px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-mint transition-colors hover:border-mint/50 hover:bg-mint-soft"
                          >
                            {showAllSessions ? (
                              <>
                                <ChevronDown className="h-3 w-3 rotate-180" />
                                {t.projectsPanel.showFewerSessions}
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                {t.projectsPanel.showAllSessions(props.campaigns.length)}
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}
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
              {t.projectsPanel.activeFooter} <ChevronDown className="h-3 w-3" />
            </span>
            <span>{t.projectsPanel.sessionsCount(active.campaigns, active.assets)}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-paper-dim">{active.name}</p>
        </div>
      )}
    </aside>
  );
}
