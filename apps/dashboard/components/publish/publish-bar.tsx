"use client";

import type { PublishStatus, VersionSummary } from "@plinth/schema/api";
import { Button } from "@plinth/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { getPublishStatus, publishDraft, retryBuild } from "@/server/actions/publish";

const POLL_INTERVAL_MS = 2_000;

/**
 * Publish button + build status (ADR-0003's "Publishing…" surface). The
 * publish request returns as soon as the snapshot exists; from there this
 * polls /publish/status until the build settles — closing the tab loses
 * nothing, the next visit picks the state back up from the server.
 */
export function PublishBar({ initial }: { initial: PublishStatus }) {
  const [latest, setLatest] = useState<VersionSummary | null>(initial.latest);
  const [currentVersionId, setCurrentVersionId] = useState(initial.currentVersionId);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollBusy = useRef(false);

  const inFlight = latest?.status === "queued" || latest?.status === "building";

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
    if (result.data.outcome === "reused" && result.data.version.status === "built") {
      // Same content already live — nothing to poll.
      setCurrentVersionId(result.data.version.id);
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

  return (
    <div className="flex items-center justify-end gap-3">
      {error ? (
        <span className="text-destructive max-w-xl truncate text-sm" role="status" title={error}>
          {error}
        </span>
      ) : (
        <StatusChip latest={latest} currentVersionId={currentVersionId} />
      )}
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

function StatusChip({
  latest,
  currentVersionId,
}: {
  latest: VersionSummary | null;
  currentVersionId: string | null;
}) {
  if (!latest) {
    return <span className="text-muted-foreground text-sm">Never published</span>;
  }
  const text =
    latest.status === "queued"
      ? `v${latest.versionNumber} queued…`
      : latest.status === "building"
        ? `v${latest.versionNumber} building…`
        : latest.status === "failed"
          ? `v${latest.versionNumber} build failed`
          : latest.id === currentVersionId
            ? `Live · v${latest.versionNumber}`
            : `v${latest.versionNumber} built`;
  return (
    <span
      className={
        latest.status === "failed" ? "text-destructive text-sm" : "text-muted-foreground text-sm"
      }
      role="status"
    >
      {text}
    </span>
  );
}
