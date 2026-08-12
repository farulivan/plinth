"use client";

import type { MediaItem } from "@plinth/schema/api";
import type { MediaRef } from "@plinth/schema/content";
import { Button } from "@plinth/ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plinth/ui/components/form";
import { Input } from "@plinth/ui/components/input";
import { useRef, useState } from "react";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { listMedia } from "@/server/actions/media";

/**
 * The mediaRef picker (ADR-0006): choose from the workspace library or upload
 * a new image; picking freezes {mediaId, contentHash, width, height} into the
 * field (ADR-0014 — snapshots stay self-renderable) while alt stays a plain
 * text input beside it. Thumbnails ride the same-origin /_media proxy.
 */
export function MediaField({
  control,
  name,
  label,
}: {
  control: Control<FieldValues>;
  name: string;
  label: string;
}) {
  const { field } = useController({ control, name });
  const value = (field.value ?? null) as MediaRef | null;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function select(item: MediaItem) {
    field.onChange({
      mediaId: item.id,
      alt: value?.alt ?? "",
      contentHash: item.contentHash,
      width: item.width,
      height: item.height,
      // Frozen here alongside the hash, and for the same reason: the snapshot
      // this ends up in must render years later without consulting the media
      // table. Absent for images uploaded before widths were recorded, which
      // the renderer reads as the legacy set.
      ...(item.widths ? { widths: item.widths } : {}),
    } satisfies MediaRef);
    setOpen(false);
  }

  async function refreshList() {
    const result = await listMedia();
    if (result.ok) setItems(result.data);
    else setError(result.error.message);
  }

  async function togglePicker() {
    const next = !open;
    setOpen(next);
    setError(null);
    if (next && items === null) await refreshList();
  }

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const envelope = (await response.json()) as
        | { ok: true; data: { item: MediaItem } }
        | { ok: false; error: { message: string } };
      if (!envelope.ok) {
        setError(envelope.error.message);
        return;
      }
      select(envelope.data.item);
      setItems(null); // stale — next open refetches
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>

      <div className="flex items-center gap-3">
        {value?.contentHash ? (
          // Plain img, not next/image: the proxy already serves sized,
          // immutable variants.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/_media/${value.contentHash}/w400.webp`}
            alt=""
            className="h-20 w-28 rounded-md border object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-20 w-28 items-center justify-center rounded-md border border-dashed text-xs">
            No image
          </div>
        )}
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" onClick={togglePicker}>
            {value ? "Change image" : "Choose image"}
          </Button>
          {value ? (
            <p className="text-muted-foreground text-xs">
              {value.width}×{value.height}
            </p>
          ) : null}
        </div>
      </div>

      <FormField control={control} name={name} render={() => <FormMessage />} />

      {value ? (
        <FormField
          control={control}
          name={`${name}.alt`}
          render={({ field: altField }) => (
            <FormItem>
              <FormLabel>Alt text</FormLabel>
              <FormControl>
                <Input
                  {...altField}
                  value={typeof altField.value === "string" ? altField.value : ""}
                  placeholder="Describe the image for screen readers"
                  maxLength={300}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      {open ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Media library</p>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {busy ? "Uploading…" : "Upload new"}
              </Button>
            </div>
          </div>
          {items === null ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing here yet — upload your first image.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="focus-visible:ring-ring overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => select(item)}
                  title={`${item.width}×${item.height}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/_media/${item.contentHash}/w400.webp`}
                    alt=""
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="status">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
