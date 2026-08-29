"use client";

import { Button } from "@plinth/ui/components/button";
import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";

export interface PendingUpload {
  id: string;
  name: string;
  status: "uploading" | "done" | "failed";
  /** Why the api refused the file, when it did. */
  message?: string;
}

/**
 * Library-page uploader: a drop target and picker accepting any number of
 * files at once. Each file posts to the signed multipart forwarder on its
 * own request and reports through the parent's queue, which renders the
 * pending tiles in the grid. A single router.refresh() once the queue
 * settles re-reads the library — one revalidation per batch, not per file.
 */
export function MediaUpload({
  uploads,
  setUploads,
}: {
  uploads: PendingUpload[];
  setUploads: Dispatch<SetStateAction<PendingUpload[]>>;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = uploads.some((upload) => upload.status === "uploading");

  function patch(id: string, patch: Partial<PendingUpload>) {
    setUploads((queue) =>
      queue.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    );
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((queue) => [...queue, { id, name: file.name, status: "uploading" }]);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const envelope = (await response.json()) as
        | { ok: true; data: { outcome: "created" | "reused" | "refreshed" } }
        | { ok: false; error: { message: string } };
      if (!envelope.ok) {
        patch(id, { status: "failed", message: envelope.error.message });
        return false;
      }
      patch(id, {
        status: "done",
        message:
          envelope.data.outcome === "reused"
            ? "Already in the library — that exact image was uploaded before."
            : undefined,
      });
      return true;
    } catch {
      patch(id, { status: "failed", message: "Upload failed — check your connection." });
      return false;
    }
  }

  async function uploadAll(files: File[]) {
    if (files.length === 0) return;
    const results = await Promise.all(files.map(uploadOne));
    if (results.some(Boolean)) router.refresh();
    // Done tiles linger so a "already in the library" note is readable, then
    // clear; failures stay until the next batch so the message isn't lost
    // mid-read.
    setTimeout(() => {
      setUploads((queue) => queue.filter((upload) => upload.status !== "done"));
    }, 4_000);
  }

  return (
    <div
      className={`rounded-lg border border-dashed p-6 text-center text-sm transition-colors ${
        dragging ? "bg-muted border-solid" : "text-muted-foreground"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void uploadAll([...(event.dataTransfer.files ?? [])]);
      }}
    >
      <p className="flex items-center justify-center gap-2">
        <ImagePlus className="size-4" />
        Drop images here, or
      </p>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          void uploadAll([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {busy ? "Uploading…" : "Choose files"}
      </Button>
      <p className="text-muted-foreground mt-2 text-xs">JPEG, PNG, WebP, or AVIF — up to 20 MB.</p>
    </div>
  );
}
