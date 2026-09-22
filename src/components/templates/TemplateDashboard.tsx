"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { api } from "../../../convex/_generated/api";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { TemplateDraftEditor } from "@/components/templates/TemplateDraftEditor";
import {
  BOT_TEMPLATES,
  TEMPLATE_FILTERS,
  templatesForFilter,
} from "@/components/templates/templateCatalog";
import { TemplateOverview } from "@/components/templates/TemplateOverview";
import { Spinner } from "@/components/ui/Spinner";
import styles from "@/components/templates/templates.module.css";

type DraftSummary = {
  _id: Id<"templateDrafts">;
  name: string;
  shortDescription: string;
  mission: string;
  outcome: string;
  category: "everyday" | "software" | "ai" | "hardware" | "custom";
  status: "draft" | "published" | "archived";
  scheduleCount: number;
  deploymentCount: number;
  updatedAt: number;
};

function DraftSection({
  title,
  description,
  drafts,
  onOpen,
}: {
  title: string;
  description: string;
  drafts: DraftSummary[];
  onOpen: (draftId: Id<"templateDrafts">) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <section className={styles.myTemplatesSection}>
      <div className={styles.myTemplatesHeading}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.draftGrid}>
        {drafts.map((draft) => (
          <button
            className={styles.draftCard}
            key={draft._id}
            onClick={() => onOpen(draft._id)}
            type="button"
          >
            <div className={styles.draftCardTop}>
              <strong>{draft.name}</strong>
              <span
                className={
                  draft.status === "published"
                    ? styles.draftBadgePublished
                    : styles.draftBadgeDraft
                }
              >
                {draft.status === "published"
                  ? `deployed ${draft.deploymentCount}x`
                  : "draft"}
              </span>
            </div>
            <p>{draft.shortDescription}</p>
            <small>
              {draft.scheduleCount === 0
                ? "On demand"
                : `${draft.scheduleCount} schedule${draft.scheduleCount === 1 ? "" : "s"}`}
              {" | "}
              {draft.category}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function TemplateDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("template");
  const draftParam = searchParams.get("draft");
  const selectedTemplate = BOT_TEMPLATES.find(
    (template) => template.id === selectedId,
  );
  const credentials = useQuery(api.credentials.getProviderCredentialStatuses, {});
  const profile = useQuery(api.userProfiles.getMyProfile, {});
  const emailIdentities = useQuery(api.bots.listEmailIdentities, {});
  const resolvedDraftId = useQuery(
    api.routeIds.resolveTemplateDraftId,
    draftParam !== null ? { id: draftParam } : "skip",
  );
  const draftDetail = useQuery(
    api.templateDrafts.getMine,
    resolvedDraftId !== null && resolvedDraftId !== undefined
      ? { draftId: resolvedDraftId }
      : "skip",
  );
  const myTemplates = useQuery(api.templateDrafts.listMine, {});
  const ensureProfile = useMutation(api.userProfiles.ensureProfile);
  const [filterId, setFilterId] = useState("all");
  const [search, setSearch] = useState("");
  const timezone = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    },
    () => "UTC",
  );

  useEffect(() => {
    void ensureProfile({});
  }, [ensureProfile]);

  if (
    credentials === undefined ||
    profile === undefined ||
    emailIdentities === undefined
  ) {
    return (
      <div className="page-loading">
        <Spinner label="Loading templates" />
      </div>
    );
  }

  if (draftParam !== null) {
    if (resolvedDraftId === undefined || draftDetail === undefined) {
      return (
        <div className="page-loading">
          <Spinner label="Loading template draft" />
        </div>
      );
    }
    if (resolvedDraftId === null || draftDetail === null) {
      return (
        <div className={styles.noResults}>
          <span>Template draft not found</span>
          <p>This draft does not exist or belongs to another account.</p>
        </div>
      );
    }
    return (
      <TemplateDraftEditor
        accountEmail={profile?.accountEmail ?? ""}
        credentialsConfigured={credentials.openai || credentials.zhipu}
        draft={draftDetail.draft}
        emailIdentities={emailIdentities}
        initialMemory={draftDetail.compiledMemory}
        onBack={() => router.replace("/templates")}
        timezone={timezone}
      />
    );
  }

  if (selectedTemplate) {
    return (
      <TemplateOverview
        accountEmail={profile?.accountEmail ?? ""}
        credentialsConfigured={credentials.openai || credentials.zhipu}
        emailIdentities={emailIdentities}
        onBack={() => router.replace("/templates")}
        template={selectedTemplate}
        timezone={timezone}
      />
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  const templates = templatesForFilter(filterId).filter((template) =>
    normalizedSearch
      ? [
          template.name,
          template.shortDescription,
          template.mission,
          template.outcome,
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      : true,
  );

  return (
    <div className={styles.catalogShell}>
      <header className={styles.catalogHero}>
        <div>
          <span className="eyebrow">Deploy proven specialists</span>
          <h1>Start with a bot that already knows the work.</h1>
          <p>
            Each template includes a mission, detailed operating memory, and
            optional first-run automation. Review every instruction before it is
            copied into your bot.
          </p>
        </div>
        <div className={styles.heroStat}>
          <strong>20</strong>
          <span>curated starting points</span>
        </div>
      </header>

      {myTemplates !== undefined ? (
        <>
          <DraftSection
            description="Finish reviewing or deploying templates your agents drafted for you."
            drafts={myTemplates.drafts}
            onOpen={(draftId) =>
              router.push(`/templates?draft=${encodeURIComponent(draftId)}`)
            }
            title="Drafts"
          />
          <DraftSection
            description="Private templates created from your drafts. Deploy them again any time."
            drafts={myTemplates.published}
            onOpen={(draftId) =>
              router.push(`/templates?draft=${encodeURIComponent(draftId)}`)
            }
            title="My templates"
          />
        </>
      ) : null}

      <section className={styles.catalogControls} aria-label="Template filters">
        <div className={styles.filterTabs} role="tablist">
          {TEMPLATE_FILTERS.map((filter) => (
            <button
              aria-selected={filterId === filter.id}
              className={filterId === filter.id ? styles.activeFilter : ""}
              key={filter.id}
              onClick={() => setFilterId(filter.id)}
              role="tab"
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className={styles.searchField}>
          <span className="sr-only">Search templates</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search outcomes, roles, or tasks"
            type="search"
            value={search}
          />
        </label>
      </section>

      {templates.length === 0 ? (
        <section className={styles.noResults}>
          <span>No matching specialist</span>
          <p>Try another category or a broader search.</p>
        </section>
      ) : (
        <section className={styles.templateGrid} aria-label="Bot templates">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              onOpen={() =>
                router.push(`/templates?template=${encodeURIComponent(template.id)}`)
              }
              template={template}
            />
          ))}
        </section>
      )}
    </div>
  );
}
