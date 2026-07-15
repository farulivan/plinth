import { z } from "zod";

/**
 * Publish surface contracts (ADR-0003), shared by the api's publish routes
 * and the dashboard's publish UI so both sides speak one shape.
 */

export const versionStatus = z.enum(["queued", "building", "built", "failed"]);
export type VersionStatus = z.infer<typeof versionStatus>;

/** One content_versions row as the UI sees it. */
export const versionSummary = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: versionStatus,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime(),
});
export type VersionSummary = z.infer<typeof versionSummary>;

/** GET /publish/status payload: the workspace's live pointer plus its most
 * recent publish attempt (null before the first publish). */
export const publishStatus = z.object({
  currentVersionId: z.uuid().nullable(),
  latest: versionSummary.nullable(),
});
export type PublishStatus = z.infer<typeof publishStatus>;
