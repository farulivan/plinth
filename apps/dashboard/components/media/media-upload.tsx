"use client";

import { Button } from "@plinth/ui/components/button";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Library-page uploader: file picker + drop target posting to the signed
 * multipart forwarder, then a server-refresh so the grid re-reads the api.
 */
export function MediaUpload() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const envelope = (await response.json()) as
        | { ok: true; data: { outcome: "created" | "reused" } }
        | { ok: false; error: { message: string } };
      if (!envelope.ok) {
        setMessage(envelope.error.message);
        return;
      }
      if (envelope.data.outcome === "reused") {
        setMessage("Already in the library — that exact image was uploaded before.");
      }
      router.refresh();
    } catch {
      setMessage("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border border-dashed p-6 text-center text-sm ${
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
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <p>Drop an image here, or</p>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
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
          {busy ? "Uploading…" : "Choose a file"}
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          JPEG, PNG, WebP, or AVIF — up to 20 MB.
        </p>
      </div>
      {message ? (
        <p className="text-destructive text-sm" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
