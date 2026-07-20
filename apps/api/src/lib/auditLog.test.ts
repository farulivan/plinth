import type { Db } from "@plinth/db";
import { describe, expect, it, vi } from "vitest";

const insertValues = vi.fn();
const withWorkspaceMock = vi.fn(
  (_db: unknown, _workspaceId: string, run: (tx: unknown) => unknown) =>
    run({ insert: () => ({ values: insertValues }) }),
);
vi.mock("@plinth/db", () => ({ withWorkspace: withWorkspaceMock }));
vi.mock("@plinth/db/schema", () => ({ auditLogs: {} }));

const { writeAuditLog } = await import("./auditLog");

describe("writeAuditLog", () => {
  it("inserts within the workspace's RLS scope, defaulting payload to {}", async () => {
    const db = {} as Db;

    await writeAuditLog(db, {
      workspaceId: "ws-1",
      actorUserId: "user-1",
      action: "publish.requested",
    });

    expect(withWorkspaceMock).toHaveBeenCalledWith(db, "ws-1", expect.any(Function));
    expect(insertValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actorUserId: "user-1",
      action: "publish.requested",
      payload: {},
    });
  });

  it("passes a null actor through for system-initiated actions", async () => {
    await writeAuditLog({} as Db, {
      workspaceId: "ws-1",
      actorUserId: null,
      action: "media.reaped",
      payload: { count: 3 },
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null, payload: { count: 3 } }),
    );
  });
});
