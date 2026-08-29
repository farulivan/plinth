"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Two contexts, not one: the page registering actions must only subscribe to
// the setter (stable), never to the registered node. A single {actions,
// setActions} value is rebuilt on every registration, and a consumer of it
// that re-registers in an effect loops — setState → new value → re-render →
// effect → setState.
const ShellActionsSetterContext = createContext<((actions: ReactNode) => void) | null>(null);
const ShellActionsStateContext = createContext<ReactNode>(null);

/**
 * A slot in the shell header for page-level actions. The header lives in the
 * layout but what goes on its right side belongs to the page — the studio's
 * publish controls, for instance. Pages register their node with
 * `useSetShellActions`; the header renders whatever is registered, nothing
 * when nothing is.
 */
export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <ShellActionsSetterContext.Provider value={setActions}>
      <ShellActionsStateContext.Provider value={actions}>
        {children}
      </ShellActionsStateContext.Provider>
    </ShellActionsSetterContext.Provider>
  );
}

export function ShellActionsSlot() {
  return useContext(ShellActionsStateContext);
}

/**
 * Registers `node` into the header slot for as long as the caller is mounted.
 * Runs every render on purpose: the element is rebuilt each render (same type,
 * same position — React keeps the child's state), and because the caller
 * subscribes only to the stable setter, the re-registration never loops.
 */
export function useSetShellActions(node: ReactNode) {
  const setActions = useContext(ShellActionsSetterContext);
  if (!setActions) throw new Error("useSetShellActions must be used within ShellActionsProvider.");
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
  });
}
