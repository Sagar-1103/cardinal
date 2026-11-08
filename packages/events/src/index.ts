import { EventBus } from "./event-bus";

// Exports for the event system
export {
  EventBus,
  type EventBusOptions,
  type EventListener,
  type EventRecord,
} from "./event-bus";

export type {
  CardinalEventMap,
  CardinalEventName,
  CardinalEventPayload,
} from "./event-types";

// Default singleton instance shared across packages
let defaultBus: EventBus | null = null;

// Returns the shared global event bus instance
export function getEventBus(): EventBus {
  if (!defaultBus) {
    defaultBus = new EventBus();
  }
  return defaultBus;
}

// Resets the shared event bus for test isolation
export function resetEventBus(): void {
  defaultBus?.off();
  defaultBus = null;
}
