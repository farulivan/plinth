import { describe, expect, it, vi } from "vitest";
import { DraftEventHub, type DraftEvent } from "./hub";

const DRAFT_A = "draft-a";
const DRAFT_B = "draft-b";

describe("DraftEventHub", () => {
  it("delivers published events to live subscribers with monotonic ids", () => {
    const hub = new DraftEventHub();
    const seen: DraftEvent[] = [];
    hub.subscribe(DRAFT_A, (event) => seen.push(event));

    hub.publish(DRAFT_A, "hash-1");
    hub.publish(DRAFT_A, "hash-2");

    expect(seen).toEqual([
      { id: 1, draftId: DRAFT_A, hash: "hash-1" },
      { id: 2, draftId: DRAFT_A, hash: "hash-2" },
    ]);
  });

  it("isolates channels by draft id", () => {
    const hub = new DraftEventHub();
    const listener = vi.fn();
    hub.subscribe(DRAFT_A, listener);

    hub.publish(DRAFT_B, "hash-b");

    expect(listener).not.toHaveBeenCalled();
  });

  it("replays only events newer than Last-Event-ID, then goes live", () => {
    const hub = new DraftEventHub();
    hub.publish(DRAFT_A, "hash-1");
    hub.publish(DRAFT_A, "hash-2");
    hub.publish(DRAFT_A, "hash-3");

    const seen: number[] = [];
    hub.subscribe(DRAFT_A, (event) => seen.push(event.id), 1);
    hub.publish(DRAFT_A, "hash-4");

    expect(seen).toEqual([2, 3, 4]);
  });

  it("caps the ring buffer at the last 20 events", () => {
    const hub = new DraftEventHub();
    for (let i = 1; i <= 25; i++) hub.publish(DRAFT_A, `hash-${i}`);

    const seen: number[] = [];
    hub.subscribe(DRAFT_A, (event) => seen.push(event.id), 0);

    expect(seen).toHaveLength(20);
    expect(seen[0]).toBe(6);
    expect(seen.at(-1)).toBe(25);
  });

  it("stops delivery after unsubscribe", () => {
    const hub = new DraftEventHub();
    const listener = vi.fn();
    const unsubscribe = hub.subscribe(DRAFT_A, listener);

    unsubscribe();
    hub.publish(DRAFT_A, "hash-1");

    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * The bound a first connection subscribes at. Replaying the whole buffer
   * instead reloaded the preview on the oldest hash, and the reload replayed
   * the same history — a preview that blinked forever, which is what it did
   * in production.
   */
  it("reports the newest buffered event, so a fresh client can catch up to now", () => {
    const hub = new DraftEventHub();
    expect(hub.latestEventId(DRAFT_A)).toBeUndefined();

    hub.publish(DRAFT_A, "hash-1");
    hub.publish(DRAFT_A, "hash-2");
    const latest = hub.latestEventId(DRAFT_A);
    expect(latest).toBe(2);

    const seen: string[] = [];
    hub.subscribe(DRAFT_A, (event) => seen.push(event.hash), latest! - 1);

    // Exactly the current state — not the history behind it.
    expect(seen).toEqual(["hash-2"]);
  });

  it("tracks the newest id as the buffer rolls", () => {
    const hub = new DraftEventHub();
    for (let i = 1; i <= 25; i++) hub.publish(DRAFT_A, `hash-${String(i)}`);
    expect(hub.latestEventId(DRAFT_A)).toBe(25);
  });
});
