import { describe, it, expect, beforeEach } from "bun:test";
import { EventBus, getEventBus, resetEventBus } from "../index";

describe("EventBus", () => {
  beforeEach(() => {
    resetEventBus();
  });

  describe("Event Delivery", () => {
    it("should deliver events to registered listeners", () => {
      const bus = new EventBus();
      const received: Array<{ sessionId: string; title: string }> = [];

      bus.on("session:created", (payload) => {
        received.push(payload);
      });

      bus.emit("session:created", { sessionId: "s1", title: "First Session" });
      bus.emit("session:created", { sessionId: "s2", title: "Second Session" });

      expect(received).toHaveLength(2);
      expect(received[0].title).toBe("First Session");
      expect(received[1].title).toBe("Second Session");
    });

    it("should allow unsubscribing from events", () => {
      const bus = new EventBus();
      let callCount = 0;

      const unsub = bus.on("agent:idle", () => {
        callCount++;
      });

      bus.emit("agent:idle", { sessionId: "s1" });
      expect(callCount).toBe(1);

      unsub();
      bus.emit("agent:idle", { sessionId: "s1" });
      expect(callCount).toBe(1);
    });

    it("should fire once listener only one time", () => {
      const bus = new EventBus();
      let callCount = 0;

      bus.once("agent:thinking", () => {
        callCount++;
      });

      bus.emit("agent:thinking", { sessionId: "s1" });
      bus.emit("agent:thinking", { sessionId: "s1" });
      bus.emit("agent:thinking", { sessionId: "s1" });

      expect(callCount).toBe(1);
    });

    it("should report correct listener counts", () => {
      const bus = new EventBus();
      expect(bus.listenerCount("agent:idle")).toBe(0);

      const unsub1 = bus.on("agent:idle", () => {});
      const unsub2 = bus.on("agent:idle", () => {});
      expect(bus.listenerCount("agent:idle")).toBe(2);

      unsub1();
      expect(bus.listenerCount("agent:idle")).toBe(1);

      unsub2();
      expect(bus.listenerCount("agent:idle")).toBe(0);
    });
  });

  describe("Error Isolation", () => {
    it("should catch listener errors without crashing emit or blocking other listeners", () => {
      const bus = new EventBus();
      let secondListenerCalled = false;

      bus.on("agent:idle", () => {
        throw new Error("Broken listener");
      });

      bus.on("agent:idle", () => {
        secondListenerCalled = true;
      });

      expect(() => {
        bus.emit("agent:idle", { sessionId: "s1" });
      }).not.toThrow();

      expect(secondListenerCalled).toBe(true);
    });
  });

  describe("History Tracking", () => {
    it("should record emitted events and allow filtering", () => {
      const bus = new EventBus();

      bus.emit("session:created", { sessionId: "s1", title: "Session 1" });
      bus.emit("agent:idle", { sessionId: "s1" });
      bus.emit("session:created", { sessionId: "s2", title: "Session 2" });

      const allHistory = bus.getHistory();
      expect(allHistory).toHaveLength(3);

      const sessionCreatedHistory = bus.getHistory("session:created");
      expect(sessionCreatedHistory).toHaveLength(2);
      expect(sessionCreatedHistory[0].payload.sessionId).toBe("s1");
      expect(sessionCreatedHistory[1].payload.sessionId).toBe("s2");
    });

    it("should respect maxHistory limits", () => {
      const bus = new EventBus({ maxHistory: 3 });

      bus.emit("agent:idle", { sessionId: "1" });
      bus.emit("agent:idle", { sessionId: "2" });
      bus.emit("agent:idle", { sessionId: "3" });
      bus.emit("agent:idle", { sessionId: "4" });

      const history = bus.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].payload.sessionId).toBe("2");
      expect(history[2].payload.sessionId).toBe("4");
    });

    it("should clear history when requested", () => {
      const bus = new EventBus();
      bus.emit("agent:idle", { sessionId: "1" });
      expect(bus.getHistory()).toHaveLength(1);

      bus.clearHistory();
      expect(bus.getHistory()).toHaveLength(0);
    });
  });

  describe("Async Streaming", () => {
    it("should yield event payloads through async iterator", async () => {
      const bus = new EventBus();
      const controller = new AbortController();
      const chunks: string[] = [];

      const streamTask = (async () => {
        for await (const payload of bus.stream("provider:stream-chunk", {
          signal: controller.signal,
        })) {
          chunks.push(payload.chunk);
          if (chunks.length >= 3) {
            controller.abort();
          }
        }
      })();

      bus.emit("provider:stream-chunk", { sessionId: "s1", chunk: "Hello" });
      bus.emit("provider:stream-chunk", { sessionId: "s1", chunk: " " });
      bus.emit("provider:stream-chunk", { sessionId: "s1", chunk: "World" });

      await streamTask;
      expect(chunks).toEqual(["Hello", " ", "World"]);
    });

    it("should exit immediately if signal is already aborted", async () => {
      const bus = new EventBus();
      const controller = new AbortController();
      controller.abort();

      const items: string[] = [];
      for await (const payload of bus.stream("provider:stream-chunk", {
        signal: controller.signal,
      })) {
        items.push(payload.chunk);
      }

      expect(items).toHaveLength(0);
    });
  });

  describe("Removal and Reset", () => {
    it("should remove listeners for specific event or all events with off()", () => {
      const bus = new EventBus();
      let count1 = 0;
      let count2 = 0;

      bus.on("agent:idle", () => {
        count1++;
      });
      bus.on("agent:thinking", () => {
        count2++;
      });

      bus.off("agent:idle");
      bus.emit("agent:idle", { sessionId: "s1" });
      bus.emit("agent:thinking", { sessionId: "s1" });

      expect(count1).toBe(0);
      expect(count2).toBe(1);

      bus.off();
      bus.emit("agent:thinking", { sessionId: "s1" });
      expect(count2).toBe(1);
    });

    it("should provide a shared singleton and support reset", () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);

      resetEventBus();
      const bus3 = getEventBus();
      expect(bus3).not.toBe(bus1);
    });
  });
});

