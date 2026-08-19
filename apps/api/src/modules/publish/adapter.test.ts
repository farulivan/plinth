import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("../../lib/s3", () => ({ s3: { send: (...args: unknown[]) => send(...args) } }));
// The adapter reaches the env contract twice over — directly for the bucket
// name, and through the Inngest client — and that contract parses at import.
// Stubbing both keeps this test about the upload loop rather than about
// whichever variables the api happens to require this week.
vi.mock("../../lib/env", () => ({ env: { R2_BUCKET_SITES: "plinth-sites" } }));
vi.mock("../../inngest/client", () => ({ inngest: { send: vi.fn() } }));

const { uploadSiteDir } = await import("./adapter");

let dir: string;

beforeEach(async () => {
  send.mockReset();
  dir = await mkdtemp(join(tmpdir(), "plinth-upload-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Write `count` files, plus one nested a directory deep. */
async function seedFiles(count: number): Promise<void> {
  await mkdir(join(dir, "projects"), { recursive: true });
  await writeFile(join(dir, "projects", "index.html"), "<!doctype html>");
  for (let i = 0; i < count - 1; i += 1) {
    await writeFile(join(dir, `file-${i}.html`), `<!doctype html><!-- ${i} -->`);
  }
}

function keysSent(): string[] {
  return send.mock.calls.map((call) => (call[0] as { input: { Key: string } }).input.Key).sort();
}

describe("uploadSiteDir", () => {
  it("uploads every file exactly once, under a per-version prefix", async () => {
    await seedFiles(5);
    send.mockResolvedValue({});

    const result = await uploadSiteDir({ workspaceId: "ws-1", versionNumber: 7, dir });

    expect(result).toEqual({ files: 5 });
    expect(send).toHaveBeenCalledTimes(5);
    expect(keysSent()).toContain("tenants/ws-1/v7/projects/index.html");
    expect(new Set(keysSent()).size).toBe(5);
  });

  /**
   * The reason this function is not a `for` loop. Without a bound it would
   * open one request per file — fine at 40, an unpleasant surprise on a site
   * with a few hundred pages, on a machine that has just run `astro build`.
   */
  it("keeps at most eight requests in flight", async () => {
    await seedFiles(40);
    let inFlight = 0;
    let peak = 0;
    send.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return {};
    });

    await uploadSiteDir({ workspaceId: "ws-1", versionNumber: 1, dir });

    expect(send).toHaveBeenCalledTimes(40);
    expect(peak).toBe(8);
  });

  it("does not spawn more workers than there are files", async () => {
    await seedFiles(2);
    let peak = 0;
    let inFlight = 0;
    send.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return {};
    });

    await uploadSiteDir({ workspaceId: "ws-1", versionNumber: 1, dir });

    expect(peak).toBe(2);
  });

  /**
   * A partial upload must surface as a failed step. The paths are
   * per-version, so the retry overwrites rather than merges — but a promote
   * on top of a half-uploaded prefix would serve a site missing pages with
   * every step green.
   */
  it("propagates a failure and stops drawing new work", async () => {
    await seedFiles(60);
    send.mockRejectedValueOnce(new Error("R2 said no")).mockResolvedValue({});

    await expect(uploadSiteDir({ workspaceId: "ws-1", versionNumber: 1, dir })).rejects.toThrow(
      "R2 said no",
    );

    // The seven siblings already in flight may finish; the remaining ~50 must
    // never start.
    expect(send.mock.calls.length).toBeLessThan(20);
  });
});
