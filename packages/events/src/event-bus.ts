import type {
  CardinalEventMap,
  CardinalEventName,
  CardinalEventPayload,
} from "./event-types";

// Type for an event callback function
export type EventListener<T extends CardinalEventName> = (
  payload: CardinalEventPayload<T>,
) => void;

// Record structure stored in the event history
export interface EventRecord<T extends CardinalEventName = CardinalEventName> {
  name: T;
  payload: CardinalEventPayload<T>;
  timestamp: number;
}

// Options for configuring an EventBus instance
export interface EventBusOptions {
  maxHistory?: number;
}

// In-memory typed event bus for cross-package communication
export class EventBus {
  private listeners = new Map<CardinalEventName, Set<EventListener<any>>>();
  private history: EventRecord<any>[] = [];
  private maxHistory: number;

  constructor(options?: EventBusOptions) {
    this.maxHistory = options?.maxHistory ?? 1000;
  }

  // Subscribes a listener to an event and returns an unsubscribe function
  on<T extends CardinalEventName>(
    event: T,
    listener: EventListener<T>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  // Subscribes a listener that will run at most once
  once<T extends CardinalEventName>(
    event: T,
    listener: EventListener<T>,
  ): () => void {
    let unsubscribed = false;
    let unsub: (() => void) | undefined;

    const wrapped: EventListener<T> = (payload) => {
      if (!unsubscribed) {
        unsubscribed = true;
        unsub?.();
        listener(payload);
      }
    };

    unsub = this.on(event, wrapped);
    return () => {
      unsubscribed = true;
      unsub?.();
    };
  }

  // Emits an event with a typed payload to all active listeners
  emit<T extends CardinalEventName>(
    event: T,
    payload: CardinalEventPayload<T>,
  ): void {
    // Save to event history
    this.history.push({
      name: event,
      payload,
      timestamp: Date.now(),
    });

    // Enforce history size limit
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Call registered listeners with error isolation
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(payload);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      }
    }
  }

  // Removes listeners for a specific event or clears all listeners
  off(event?: CardinalEventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  // Returns the number of registered listeners for an event
  listenerCount(event: CardinalEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  // Returns past recorded events optionally filtered by event name
  getHistory<T extends CardinalEventName>(event?: T): EventRecord<T>[] {
    if (event) {
      return this.history.filter((record) => record.name === event) as EventRecord<T>[];
    }
    return [...this.history];
  }

  // Clears all recorded events from history
  clearHistory(): void {
    this.history = [];
  }

  // Creates an async generator to stream events as they arrive
  async *stream<T extends CardinalEventName>(
    event: T,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<CardinalEventPayload<T>> {
    const queue: CardinalEventPayload<T>[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const unsub = this.on(event, (payload) => {
      queue.push(payload);
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    const onAbort = () => {
      done = true;
      unsub();
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    if (options?.signal?.aborted) {
      unsub();
      return;
    }

    options?.signal?.addEventListener("abort", onAbort);

    try {
      while (!done) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      unsub();
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }
}

