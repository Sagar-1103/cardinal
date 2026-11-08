import { describe, it, expect } from "bun:test";
import { getEventBus, resetEventBus } from "@cardinal/events";
import type { ProviderConfig } from "@cardinal/config";
import {
  ProviderRegistry,
  ProviderOrchestrator,
  createDefaultRegistry,
  anthropicProvider,
  openaiProvider,
  googleProvider,
  ollamaProvider,
  openrouterProvider,
  convertMessages,
  convertTools,
  transformStream,
  type LLMProvider,
  type StreamParams,
  type StreamPart,
  type StreamResult,
} from "../index";

describe("ProviderRegistry", () => {
  it("should register and retrieve a provider", () => {
    const registry = new ProviderRegistry();
    registry.register(anthropicProvider);

    const provider = registry.get("anthropic");
    expect(provider).toBeDefined();
    expect(provider?.info.name).toBe("Anthropic");
  });

  it("should list all registered providers", () => {
    const registry = new ProviderRegistry();
    registry.register(anthropicProvider);
    registry.register(openaiProvider);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id)).toEqual(["anthropic", "openai"]);
  });

  it("should throw a helpful error for unknown providers", () => {
    const registry = new ProviderRegistry();
    registry.register(anthropicProvider);

    expect(() => registry.getOrThrow("unknown")).toThrow(
      'Unknown provider "unknown". Available: anthropic',
    );
  });

  it("should pre-populate all five providers in default registry", () => {
    const registry = createDefaultRegistry();
    const list = registry.list();

    expect(list).toHaveLength(5);
    const ids = list.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
    expect(ids).toContain("ollama");
    expect(ids).toContain("openrouter");
  });

  it("should have valid models configured for each provider", () => {
    expect(anthropicProvider.info.models.length).toBeGreaterThan(0);
    expect(openaiProvider.info.models.length).toBeGreaterThan(0);
    expect(googleProvider.info.models.length).toBeGreaterThan(0);
    expect(ollamaProvider.info.models.length).toBeGreaterThan(0);
    expect(openrouterProvider.info.models.length).toBeGreaterThan(0);
  });
});

describe("Conversion Helpers", () => {
  it("should convert StreamMessages to CoreMessages", () => {
    const messages = convertMessages([
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "tool", content: "File contents", toolCallId: "call_123" },
    ]);

    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2].role).toBe("assistant");
    expect(messages[3].role).toBe("tool");
  });

  it("should convert ToolDefinitions to AI SDK tools format", () => {
    const tools = convertTools([
      {
        name: "read_file",
        description: "Reads a file from disk",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
    ]);

    expect(tools).toBeDefined();
    expect(tools?.read_file).toBeDefined();
    expect(tools?.read_file.description).toBe("Reads a file from disk");
  });

  it("should return undefined when no tools are provided", () => {
    expect(convertTools(undefined)).toBeUndefined();
    expect(convertTools([])).toBeUndefined();
  });

  it("should transform stream parts correctly", async () => {
    async function* mockFullStream() {
      yield { type: "text-delta", textDelta: "Hello" };
      yield {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "test_tool",
        args: { a: 1 },
      };
      yield {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    }

    const parts: StreamPart[] = [];
    for await (const part of transformStream(mockFullStream())) {
      parts.push(part);
    }

    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ type: "text", text: "Hello" });
    expect(parts[1]).toEqual({
      type: "tool-call",
      toolCall: { id: "call_1", name: "test_tool", arguments: { a: 1 } },
    });
    expect(parts[2]).toEqual({
      type: "usage",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    expect(parts[3]).toEqual({ type: "finish", reason: "stop" });
  });
});

describe("ProviderOrchestrator", () => {
  const dummyConfig: ProviderConfig = {
    name: "anthropic",
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    temperature: 0.7,
  };

  it("should stream parts and emit lifecycle events", async () => {
    resetEventBus();
    const bus = getEventBus();
    const eventsReceived: string[] = [];

    bus.on("provider:request", () => eventsReceived.push("request"));
    bus.on("provider:stream-start", () => eventsReceived.push("start"));
    bus.on("provider:stream-chunk", () => eventsReceived.push("chunk"));
    bus.on("provider:complete", () => eventsReceived.push("complete"));
    bus.on("provider:stream-end", () => eventsReceived.push("end"));

    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        const stream = (async function* () {
          yield { type: "text" as const, text: "Hi" };
          yield {
            type: "usage" as const,
            usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
          };
          yield { type: "finish" as const, reason: "stop" };
        })();
        return { stream, abort: () => {} };
      },
    };

    const registry = new ProviderRegistry();
    registry.register(mockProvider);

    const orchestrator = new ProviderOrchestrator(registry);
    const result = orchestrator.stream("session_1", { messages: [] }, dummyConfig);

    const receivedParts: StreamPart[] = [];
    for await (const part of result.stream) {
      receivedParts.push(part);
    }

    expect(receivedParts).toHaveLength(3);
    expect(eventsReceived).toEqual(["request", "start", "chunk", "complete", "end"]);
  });

  it("should retry on error and succeed when second attempt works", async () => {
    resetEventBus();
    const bus = getEventBus();
    let errorEvents = 0;
    bus.on("provider:error", () => {
      errorEvents++;
    });

    let attempt = 0;
    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        attempt++;
        const currentAttempt = attempt;
        const stream = (async function* () {
          if (currentAttempt === 1) {
            throw new Error("Temporary network glitch");
          }
          yield { type: "text" as const, text: "Recovered" };
        })();
        return { stream, abort: () => {} };
      },
    };

    const registry = new ProviderRegistry();
    registry.register(mockProvider);

    const orchestrator = new ProviderOrchestrator(registry, {
      maxRetries: 2,
      retryDelayMs: 10,
    });

    const result = orchestrator.stream("session_retry", { messages: [] }, dummyConfig);
    const parts: StreamPart[] = [];
    for await (const part of result.stream) {
      parts.push(part);
    }

    expect(attempt).toBe(2);
    expect(errorEvents).toBe(1);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "text", text: "Recovered" });
  });

  it("should emit error and finish parts when max retries are exceeded", async () => {
    resetEventBus();
    let attempt = 0;

    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        attempt++;
        const stream = (async function* () {
          throw new Error("Persistent API failure");
        })();
        return { stream, abort: () => {} };
      },
    };

    const registry = new ProviderRegistry();
    registry.register(mockProvider);

    const orchestrator = new ProviderOrchestrator(registry, {
      maxRetries: 2,
      retryDelayMs: 10,
    });

    const result = orchestrator.stream("session_fail", { messages: [] }, dummyConfig);
    const parts: StreamPart[] = [];
    for await (const part of result.stream) {
      parts.push(part);
    }

    expect(attempt).toBe(3); // 1 initial + 2 retries
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe("error");
    expect(parts[1].type).toBe("finish");
  });
});

