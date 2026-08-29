"use client";

import type { PublishStatus, VersionSummary } from "@plinth/schema/api";
import { Badge } from "@plinth/ui/components/badge";
import { Button } from "@plinth/ui/components/button";
import { Separator } from "@plinth/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@plinth/ui/components/sheet";
import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getPublishStatus,
  getVersionHistory,
  publishDraft,
  retryBuild,
  rollbackTo,
} from "@/server/actions/publish";

const POLL_INTERVAL_MS = 2_000;

/**
 * Publish button + build status + version history (ADR-0003). The publish
 * request returns as soon as the snapshot exists; from there this polls
 * /publish/status until the build settles. `draftHash` (fed by the editor's
 * saves) against the live version's hash is the "unpublished changes" cue;
 * rollback is one click on a built version — the pointer swap plus KV sync,
 * no rebuild.
 */
export function PublishBar({
  initial,
  draftHash,
}: {
  initial: PublishStatus;
  draftHash: string | null;
}) {
  const [latest, setLatest] = useState<VersionSummary | null>(initial.latest);
  const [currentVersionId, setCurrentVersionId] = useState(initial.currentVersionId);
  const [liveVersionNumber, setLiveVersionNumber] = useState<number | null>(
    initial.latest && initial.latest.id === initial.currentVersionId
      ? initial.latest.versionNumber
      : null,
  );
  const [history, setHistory] = useState<VersionSummary[] | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollBusy = useRef(false);

  const inFlight = latest?.status === "queued" || latest?.status === "building";
  const liveHash =
    latest && latest.id === currentVersionId && latest.status === "built"
      ? latest.contentHash
      : null;
  const hasUnpublished =
    !inFlight && draftHash !== null && liveHash !== null && draftHash !== liveHash;

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => {
      if (pollBusy.current) return; // don't stack polls behind a slow answer
      pollBusy.current = true;
      void getPublishStatus()
        .then((result) => {
          if (!result.ok) return;
          setLatest(result.data.latest);
          setCurrentVersionId(result.data.currentVersionId);
          if (result.data.latest && result.data.latest.id === result.data.currentVersionId) {
            setLiveVersionNumber(result.data.latest.versionNumber);
          }
        })
        .finally(() => {
          pollBusy.current = false;
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inFlight]);

  async function onPublish() {
    setRequesting(true);
    setError(null);
    const result = await publishDraft();
    setRequesting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setLatest(result.data.version);
    setHistory(null); // stale
    if (result.data.outcome === "reused" && result.data.version.status === "built") {
      // Same content already built — make it live again if it isn't.
      setCurrentVersionId(result.data.version.id);
      setLiveVersionNumber(result.data.version.versionNumber);
    }
  }

  async function onRetry() {
    if (!latest) return;
    setError(null);
    const result = await retryBuild(latest.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setLatest(result.data.version);
  }

  async function onHistoryOpen(open: boolean) {
    if (!open) return;
    const result = await getVersionHistory();
    if (result.ok) {
      setHistory(result.data.versions);
      setCurrentVersionId(result.data.currentVersionId);
    } else {
      setError(result.error.message);
    }
  }

  async function onRollback(version: VersionSummary) {
    setError(null);
    const result = await rollbackTo(version.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCurrentVersionId(result.data.version.id);
    setLiveVersionNumber(result.data.version.versionNumber);
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-destructive max-w-xs truncate text-sm" role="status" title={error}>
          {error}
        </span>
      ) : (
        <span className="text-muted-foreground hidden text-sm md:inline" role="status">
          <StatusText
            latest={latest}
            currentVersionId={currentVersionId}
            liveVersionNumber={liveVersionNumber}
          />
          {hasUnpublished ? <span className="text-foreground"> · unpublished changes</span> : null}
        </span>
      )}
      <Sheet onOpenChange={(open) => void onHistoryOpen(open)}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            <History />
            <span className="hidden sm:inline">History</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80 sm:max-w-80">
          <SheetHeader>
            <SheetTitle>Version history</SheetTitle>
            <SheetDescription>
              Every publish is a version. Select a built one to make it live — the pointer swap is
              instant, no rebuild.
            </SheetDescription>
          </SheetHeader>
          <Separator />
          <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
            {history === null ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing published yet.</p>
            ) : (
              history.map((version) => {
                const isLive = version.id === currentVersionId;
                const rollbackable = !isLive && version.status === "built";
                return (
                  <button
                    key={version.id}
                    type="button"
                    disabled={!rollbackable}
                    onClick={() => void onRollback(version)}
                    className="hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">v{version.versionNumber}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </span>
                    {isLive ? (
                      <Badge>Live</Badge>
                    ) : (
                      <Badge
                        variant={version.status === "failed" ? "destructive" : "secondary"}
                        className="capitalize"
                      >
                        {version.status}
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
      {latest?.status === "failed" ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      <Button type="button" size="sm" disabled={requesting || inFlight} onClick={onPublish}>
        {requesting || inFlight ? "Publishing…" : "Publish"}
      </Button>
    </div>
  );
}

function StatusText({
  latest,
  currentVersionId,
  liveVersionNumber,
}: {
  latest: VersionSummary | null;
  currentVersionId: string | null;
  liveVersionNumber: number | null;
}) {
  if (!latest) return <>Never published</>;
  if (latest.status === "queued") return <>v{latest.versionNumber} queued…</>;
  if (latest.status === "building") return <>v{latest.versionNumber} building…</>;
  if (latest.status === "failed") {
    return <span className="text-destructive">v{latest.versionNumber} build failed</span>;
  }
  if (latest.id === currentVersionId) return <>Live · v{latest.versionNumber}</>;
  if (liveVersionNumber !== null) {
    return (
      <>
        Live · v{liveVersionNumber} (rolled back; v{latest.versionNumber} built)
      </>
    );
  }
  return <>v{latest.versionNumber} built</>;
}
