"use server";

import { err, type Envelope, type PublishStatus, type VersionSummary } from "@plinth/schema/api";
import { api } from "@/lib/api-client";

/**
 * Thin relays to the api's publish module (ADR-0003): the api owns auth
 * (requireSession), validation, and the envelope — these actions only carry
 * the result across the Server Action transport and turn transport failures
 * into the same envelope shape, so the PublishBar handles every failure
 * identically (the saveDraft convention: actions never throw).
 */

export type PublishResult = { outcome: "created" | "reused"; version: VersionSummary };

export async function publishDraft(): Promise<Envelope<PublishResult>> {
  try {
    const response = await api.publish.$post({});
    return (await response.json()) as Envelope<PublishResult>;
  } catch (error) {
    console.error("[publishDraft] transport failure:", error);
    return err("internal", "Could not reach the publish service — try again.");
  }
}

export async function getPublishStatus(): Promise<Envelope<PublishStatus>> {
  try {
    const response = await api.publish.status.$get();
    return (await response.json()) as Envelope<PublishStatus>;
  } catch (error) {
    console.error("[getPublishStatus] transport failure:", error);
    return err("internal", "Could not reach the publish service.");
  }
}

export async function retryBuild(
  versionId: string,
): Promise<Envelope<{ version: VersionSummary }>> {
  try {
    const response = await api.publish.retry.$post({ json: { versionId } });
    return (await response.json()) as Envelope<{ version: VersionSummary }>;
  } catch (error) {
    console.error("[retryBuild] transport failure:", error);
    return err("internal", "Could not reach the publish service — try again.");
  }
}
