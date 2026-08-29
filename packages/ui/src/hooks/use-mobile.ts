import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile() {
  // The registry version sets state synchronously in an effect, which the
  // react-hooks lint gate rejects — subscribe to the media query instead.
  // Server snapshot is desktop: the sidebar renders expanded during SSR and
  // collapses after hydration on a small viewport, never the reverse.
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
