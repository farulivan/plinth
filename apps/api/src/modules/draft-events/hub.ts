/**
 * In-process pub/sub for preview reload events (ADR-0007, ADR-0012). One
 * channel per draft; each channel keeps a ring buffer of the last 20 events so
 * an EventSource reconnect can replay what it missed via Last-Event-ID.
 *
 * In-memory is deliberate: the api runs as a single instance in v1, so every
 * publisher and subscriber shares this hub. Horizontal scaling swaps the
 * internals for Redis pub/sub without changing this surface. Channels are
 * never dropped — the buffer must survive the subscriber-less window while a
 * preview iframe reloads — and are bounded at 20 tiny events per draft.
 */

export interface DraftEvent {
  id: number;
  draftId: string;
  hash: string;
}

type Listener = (event: DraftEvent) => void;

const RING_BUFFER_SIZE = 20;

interface Channel {
  nextId: number;
  buffer: DraftEvent[];
  listeners: Set<Listener>;
}

export class DraftEventHub {
  private readonly channels = new Map<string, Channel>();

  private channel(draftId: string): Channel {
    let channel = this.channels.get(draftId);
    if (!channel) {
      channel = { nextId: 1, buffer: [], listeners: new Set() };
      this.channels.set(draftId, channel);
    }
    return channel;
  }

  publish(draftId: string, hash: string): DraftEvent {
    const channel = this.channel(draftId);
    const event: DraftEvent = { id: channel.nextId++, draftId, hash };
    channel.buffer.push(event);
    if (channel.buffer.length > RING_BUFFER_SIZE) channel.buffer.shift();
    for (const listener of channel.listeners) listener(event);
    return event;
  }

  /**
   * The id of the most recent event still buffered, or undefined if none.
   *
   * A client with no Last-Event-ID wants to be caught up to *now*, not walked
   * through history: its only reaction is "this hash differs from what I
   * rendered, reload". Replaying the whole buffer hands it a stale hash first,
   * it reloads, the reload replays the same history, and it never settles.
   * Subscribing just after this id delivers the one event that describes the
   * current state.
   */
  latestEventId(draftId: string): number | undefined {
    return this.channels.get(draftId)?.buffer.at(-1)?.id;
  }

  /** Replays buffered events newer than `afterId` (the reconnecting client's
   * Last-Event-ID), then delivers live events. Returns the unsubscribe. */
  subscribe(draftId: string, listener: Listener, afterId?: number): () => void {
    const channel = this.channel(draftId);
    if (afterId !== undefined) {
      for (const event of channel.buffer) {
        if (event.id > afterId) listener(event);
      }
    }
    channel.listeners.add(listener);
    return () => {
      channel.listeners.delete(listener);
    };
  }
}

export const draftEventHub = new DraftEventHub();
