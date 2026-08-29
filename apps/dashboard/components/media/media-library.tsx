"use client";

import type { MediaItem } from "@plinth/schema/api";
import { Badge } from "@plinth/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plinth/ui/components/select";
import { useMemo, useState } from "react";
import { MediaUpload, type PendingUpload } from "./media-upload";

type TypeFilter = "all" | "jpeg" | "png" | "webp" | "avif";
type OrientationFilter = "all" | "landscape" | "portrait" | "square";
type Sort = "newest" | "oldest" | "largest" | "smallest";

function orientationOf(item: MediaItem): OrientationFilter {
  if (item.width === item.height) return "square";
  return item.width > item.height ? "landscape" : "portrait";
}

function shortType(contentType: string): string {
  return contentType.replace("image/", "").toUpperCase();
}

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${String(Math.max(1, Math.round(kb)))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * The media library (ADR-0006): the grid, its filters, and the upload queue
 * rendered as tiles among the results. Filtering is client-side — the library
 * is one workspace's images, small enough that a round trip per filter change
 * would only add latency.
 */
export function MediaLibrary({ items }: { items: MediaItem[] }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [orientationFilter, setOrientationFilter] = useState<OrientationFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [uploads, setUploads] = useState<PendingUpload[]>([]);

  const visible = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        (typeFilter === "all" || item.contentType === `image/${typeFilter}`) &&
        (orientationFilter === "all" || orientationOf(item) === orientationFilter),
    );
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "largest":
          return b.fileSize - a.fileSize;
        case "smallest":
          return a.fileSize - b.fileSize;
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [items, typeFilter, orientationFilter, sort]);

  const filtering = typeFilter !== "all" || orientationFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
          <SelectTrigger className="w-32" aria-label="Format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All formats</SelectItem>
            <SelectItem value="jpeg">JPEG</SelectItem>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="webp">WebP</SelectItem>
            <SelectItem value="avif">AVIF</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={orientationFilter}
          onValueChange={(value) => setOrientationFilter(value as OrientationFilter)}
        >
          <SelectTrigger className="w-36" aria-label="Orientation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shapes</SelectItem>
            <SelectItem value="landscape">Landscape</SelectItem>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="square">Square</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="largest">Largest first</SelectItem>
            <SelectItem value="smallest">Smallest first</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground ml-auto text-sm" role="status">
          {filtering
            ? `${String(visible.length)} of ${String(items.length)}`
            : `${String(items.length)} ${items.length === 1 ? "image" : "images"}`}
        </span>
      </div>

      <MediaUpload uploads={uploads} setUploads={setUploads} />

      {visible.length === 0 && uploads.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {filtering ? "Nothing matches those filters." : "No media yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {uploads.map((upload) => (
            <UploadTile key={upload.id} upload={upload} />
          ))}
          {visible.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  return (
    <li className="group space-y-1.5">
      {/* Plain img: the proxy serves sized, immutable variants. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/_media/${item.contentHash}/w400.webp`}
        alt=""
        loading="lazy"
        className="aspect-square w-full rounded-lg border object-cover"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground truncate text-xs">
          {item.width}×{item.height} · {formatSize(item.fileSize)}
        </p>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {shortType(item.contentType)}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {new Date(item.createdAt).toLocaleDateString()}
      </p>
    </li>
  );
}

function UploadTile({ upload }: { upload: PendingUpload }) {
  return (
    <li className="space-y-1.5">
      <div
        className="bg-muted flex aspect-square w-full items-center justify-center rounded-lg border border-dashed"
        role="status"
        aria-label={`${upload.name}: ${upload.status}`}
      >
        <span
          className={`px-3 text-center text-xs ${upload.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {upload.message ??
            (upload.status === "failed"
              ? "Failed"
              : upload.status === "done"
                ? "Processing…"
                : "Uploading…")}
        </span>
      </div>
      <p className="text-muted-foreground truncate text-xs">{upload.name}</p>
    </li>
  );
}
