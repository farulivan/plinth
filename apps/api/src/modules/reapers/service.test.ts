import type { Db } from "@plinth/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adapter from "./adapter";
import * as dbFns from "./db";
import { backupDatabase, isoWeek, reapOldVersions, reapOrphanedMedia } from "./service";

vi.mock("./adapter", () => ({
  deleteMediaPrefix: vi.fn(),
  deleteSitePrefix: vi.fn(),
  dumpDatabaseToR2: vi.fn(),
}));
vi.mock("./db", () => ({
  listWorkspaceIds: vi.fn(),
  deleteExpiredSessions: vi.fn(),
  findMediaRows: vi.fn(),
  deleteMediaRows: vi.fn(),
  getReferenceSources: vi.fn(),
  findAllVersions: vi.fn(),
  deleteVersionRows: vi.fn(),
  getCurrentVersionId: vi.fn(),
}));

const db = {} as Db;
const WORKSPACE = "ws-1";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(dbFns.listWorkspaceIds).mockResolvedValue([WORKSPACE]);
});

describe("reapOrphanedMedia", () => {
  const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const RECENT = new Date();

  it("deletes an old, unreferenced media row and its R2 variants", async () => {
    vi.mocked(dbFns.findMediaRows).mockResolvedValue([
      { id: "media-orphan", contentHash: "hash-orphan", createdAt: OLD },
    ]);
    vi.mocked(dbFns.getReferenceSources).mockResolvedValue([]);

    const result = await reapOrphanedMedia(db);

    expect(result).toEqual({ deleted: 1 });
    expect(adapter.deleteMediaPrefix).toHaveBeenCalledWith("tenants/ws-1/hash-orphan/");
    expect(dbFns.deleteMediaRows).toHaveBeenCalledWith(db, WORKSPACE, ["media-orphan"]);
  });

  it("spares a media row still referenced by a draft or version snapshot", async () => {
    const REFERENCED_ID = "00000000-0000-0000-0000-000000000001";
    vi.mocked(dbFns.findMediaRows).mockResolvedValue([
      { id: REFERENCED_ID, contentHash: "hash-referenced", createdAt: OLD },
    ]);
    vi.mocked(dbFns.getReferenceSources).mockResolvedValue([
      { sections: [{ fields: { photo: { mediaId: REFERENCED_ID } } }] },
    ]);

    const result = await reapOrphanedMedia(db);

    expect(result).toEqual({ deleted: 0 });
    expect(dbFns.deleteMediaRows).not.toHaveBeenCalled();
  });

  // The scan stringifies and regexes for "mediaId", so it is depth-independent
  // by construction — but a v2 document nests references two levels deeper
  // than v1 (page → section → field, collection → entry → field), and getting
  // this wrong deletes live images and their R2 variants after seven days,
  // with nothing to indicate why.
  it("finds references nested inside v2 pages and collection entries", async () => {
    const IN_PAGE = "00000000-0000-0000-0000-000000000001";
    const IN_ENTRY = "00000000-0000-0000-0000-000000000002";
    vi.mocked(dbFns.findMediaRows).mockResolvedValue([
      { id: IN_PAGE, contentHash: "hash-page", createdAt: OLD },
      { id: IN_ENTRY, contentHash: "hash-entry", createdAt: OLD },
    ]);
    vi.mocked(dbFns.getReferenceSources).mockResolvedValue([
      {
        schemaVersion: 2,
        pages: [
          {
            path: "/",
            sections: [{ fields: { items: [{ image: { mediaId: IN_PAGE } }] } }],
          },
        ],
        collections: {
          projects: {
            entries: [
              { slug: "salt-house", fields: { gallery: [{ image: { mediaId: IN_ENTRY } }] } },
            ],
          },
        },
      },
    ]);

    expect(await reapOrphanedMedia(db)).toEqual({ deleted: 0 });
    expect(dbFns.deleteMediaRows).not.toHaveBeenCalled();
  });

  it("spares an unreferenced row that's still inside the 7-day grace window", async () => {
    vi.mocked(dbFns.findMediaRows).mockResolvedValue([
      { id: "media-fresh", contentHash: "hash-fresh", createdAt: RECENT },
    ]);
    vi.mocked(dbFns.getReferenceSources).mockResolvedValue([]);

    const result = await reapOrphanedMedia(db);

    expect(result).toEqual({ deleted: 0 });
  });
});

describe("reapOldVersions", () => {
  const versions = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `v${count - i}`, versionNumber: count - i }));

  it("keeps only the 10 most recent versions", async () => {
    vi.mocked(dbFns.findAllVersions).mockResolvedValue(versions(12));
    vi.mocked(dbFns.getCurrentVersionId).mockResolvedValue(null);

    const result = await reapOldVersions(db);

    expect(result).toEqual({ deleted: 2 });
    expect(dbFns.deleteVersionRows).toHaveBeenCalledWith(db, WORKSPACE, ["v2", "v1"]);
  });

  it("never deletes the currently-live version, even outside the top 10", async () => {
    const all = versions(12);
    // Point current at the oldest version — v1, which would otherwise be cut.
    vi.mocked(dbFns.findAllVersions).mockResolvedValue(all);
    vi.mocked(dbFns.getCurrentVersionId).mockResolvedValue("v1");

    await reapOldVersions(db);

    expect(dbFns.deleteVersionRows).toHaveBeenCalledWith(db, WORKSPACE, ["v2"]);
  });

  it("does nothing when a workspace has 10 or fewer versions", async () => {
    vi.mocked(dbFns.findAllVersions).mockResolvedValue(versions(5));
    vi.mocked(dbFns.getCurrentVersionId).mockResolvedValue(null);

    const result = await reapOldVersions(db);

    expect(result).toEqual({ deleted: 0 });
    expect(dbFns.deleteVersionRows).not.toHaveBeenCalled();
  });
});

describe("isoWeek", () => {
  it("formats an ISO 8601 week number", () => {
    // 2026-07-20 is a Monday in ISO week 30 of 2026.
    expect(isoWeek(new Date("2026-07-20T00:00:00Z"))).toBe("2026-W30");
  });

  it("handles the year-boundary edge case", () => {
    // 2025-12-29 (Monday) is ISO week 1 of 2026, not week 53 of 2025.
    expect(isoWeek(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
  });
});

describe("backupDatabase", () => {
  it("delegates to the adapter with the current ISO week", async () => {
    vi.mocked(adapter.dumpDatabaseToR2).mockResolvedValue({ bytes: 1024, key: "postgres/x.dump" });

    const result = await backupDatabase();

    expect(result).toEqual({ bytes: 1024, key: "postgres/x.dump" });
    expect(adapter.dumpDatabaseToR2).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-W\d{2}$/));
  });
});
