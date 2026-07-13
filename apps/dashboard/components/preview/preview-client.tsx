"use client";

import { useEffect } from "react";

/**
 * The preview page's client runtime (ADR-0007): the reduced-motion guard and
 * the reload half of the edit loop.
 *
 * Reduced-motion: `data-prefers-reduced-motion="reduce"` goes on `<html>`,
 * but that element belongs to the dashboard's root layout, so the server
 * can't render the attribute — and a pre-hydration inline script mutating it
 * trips React's server/client attribute check (a hydration error in the
 * iframe). Setting it in an effect is safe: this component mounts before the
 * document's sections, and any future motion runtime reads the guard when its
 * own effect initializes.
 *
 * Reload: listens to the same-origin SSE proxy and hard-reloads when a
 * draft-updated event carries a different content hash than this render, so
 * no-op saves (same hash) skip the reload. EventSource owns reconnection —
 * on a drop it reconnects with Last-Event-ID and the api replays missed
 * events from its ring buffer.
 */
export function PreviewClient({ draftId, initialHash }: { draftId: string; initialHash: string }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-prefers-reduced-motion", "reduce");
  }, []);

  useEffect(() => {
    const source = new EventSource(`/preview/${draftId}/events`);
    const onDraftUpdated = (event: MessageEvent<string>) => {
      let hash: string | undefined;
      try {
        hash = (JSON.parse(event.data) as { hash?: string }).hash;
      } catch {
        return; // malformed event — the next save sends another
      }
      if (hash && hash !== initialHash) window.location.reload();
    };
    source.addEventListener("draft-updated", onDraftUpdated);
    return () => source.close();
  }, [draftId, initialHash]);

  return null;
}
