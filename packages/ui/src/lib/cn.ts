import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones (`twMerge` dedupes e.g. `px-2 px-4` → `px-4`). The
 * one class-composition primitive every component uses.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
