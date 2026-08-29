"use client";

import type { EntryInstance, LooseContentDocumentV2 } from "@plinth/schema";
import { Button } from "@plinth/ui/components/button";
import { Switch } from "@plinth/ui/components/switch";
import { cn } from "@plinth/ui/lib/utils";
import { FileText, FolderOpen, Plus, Settings2 } from "lucide-react";
import type { Selection } from "./route-settings";

type Page = LooseContentDocumentV2["pages"][number];

export const SITE_SETTINGS_ID = "site-settings";

export function sectionAnchorId(type: string): string {
  return `section-${type}`;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function singular(collection: string): string {
  return collection.replace(/s$/, "");
}

/**
 * The studio's left rail: the site's outline. Site settings, pages, and
 * collection entries select what the center column edits; per-route switches
 * publish or hide it; the section list of the open page scrolls the form to
 * the section rather than moving anything — order is edited on the cards.
 */
export function OutlineRail({
  pages,
  collections,
  selection,
  activeSections,
  onSelect,
  onToggle,
  onAddPage,
  onAddEntry,
}: {
  pages: Page[];
  collections: Record<string, { pathTemplate: string; entries: EntryInstance[] }>;
  selection: Selection;
  /** Sections of the currently open page, in document order. */
  activeSections: { type: string; label: string; enabled: boolean }[];
  onSelect: (selection: Selection) => void;
  onToggle: (selection: Selection, enabled: boolean) => void;
  onAddPage: () => void;
  onAddEntry: (collection: string) => void;
}) {
  const isActive = (candidate: Selection) =>
    candidate.kind === selection.kind &&
    candidate.id === selection.id &&
    (candidate.kind === "page" ||
      (selection.kind === "entry" && candidate.collection === selection.collection));

  return (
    <nav className="flex flex-col gap-4 text-sm" aria-label="Content outline">
      <button
        type="button"
        onClick={() => scrollToId(SITE_SETTINGS_ID)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
      >
        <Settings2 className="size-4" />
        Site settings
      </button>

      <div>
        <div className="flex items-center justify-between px-2">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Pages
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onAddPage}
            aria-label="Add page"
          >
            <Plus />
          </Button>
        </div>
        <ul className="mt-1 flex flex-col gap-0.5">
          {pages.map((page) => {
            const item: Selection = { kind: "page", id: page.id };
            return (
              <OutlineRow
                key={page.id}
                icon={<FileText className="size-4" />}
                label={page.navLabel ?? page.path}
                active={isActive(item)}
                muted={!page.enabled}
                onClick={() => onSelect(item)}
                toggle={
                  <Switch
                    checked={page.enabled}
                    onCheckedChange={(enabled) => onToggle(item, enabled)}
                    aria-label={`Publish ${page.navLabel ?? page.path}`}
                    className="scale-75"
                  />
                }
              />
            );
          })}
        </ul>
      </div>

      {Object.entries(collections).map(([name, collection]) => (
        <div key={name}>
          <div className="flex items-center justify-between px-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => onAddEntry(name)}
              aria-label={`Add ${singular(name)}`}
            >
              <Plus />
            </Button>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {collection.entries.length === 0 ? (
              <li className="text-muted-foreground px-2 py-1.5 text-xs">
                No {name} yet — the + above creates the first.
              </li>
            ) : (
              collection.entries.map((entry) => {
                const item: Selection = { kind: "entry", collection: name, id: entry.id };
                return (
                  <OutlineRow
                    key={entry.id}
                    icon={<FolderOpen className="size-4" />}
                    label={entry.slug}
                    active={isActive(item)}
                    muted={!entry.enabled}
                    onClick={() => onSelect(item)}
                    toggle={
                      <Switch
                        checked={entry.enabled}
                        onCheckedChange={(enabled) => onToggle(item, enabled)}
                        aria-label={`Publish ${entry.slug}`}
                        className="scale-75"
                      />
                    }
                  />
                );
              })
            )}
          </ul>
        </div>
      ))}

      {activeSections.length > 0 ? (
        <div>
          <div className="px-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Sections
            </span>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {activeSections.map((section) => (
              <li key={section.type}>
                <button
                  type="button"
                  onClick={() => scrollToId(sectionAnchorId(section.type))}
                  className={cn(
                    "hover:bg-accent hover:text-accent-foreground w-full rounded-md px-2 py-1.5 text-left transition-colors",
                    section.enabled ? "" : "text-muted-foreground line-through",
                  )}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

function OutlineRow({
  icon,
  label,
  active,
  muted,
  onClick,
  toggle,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  muted: boolean;
  onClick: () => void;
  toggle: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left",
          muted && !active ? "text-muted-foreground" : "",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
      {toggle}
    </li>
  );
}
