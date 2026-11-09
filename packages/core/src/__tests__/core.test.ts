import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import { getEventBus, resetEventBus } from "@cardinal/events";
import type { CardinalConfig } from "@cardinal/config";
import {
  ProviderRegistry,
  ProviderOrchestrator,
  type LLMProvider,
  type StreamPart,
} from "@cardinal/providers";
import {
  ToolRegistry,
  ToolExecutor,
  createDefaultToolRegistry,
} from "@cardinal/tools";
import { PermissionChecker } from "@cardinal/permissions";
import {
  Agent,
  AgentStateMachine,
  SessionManager,
  parseStream,
  buildSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  InMemorySessionStore,
  InMemoryMessageStore,
} from "../index";

describe("AgentStateMachine", () => {
  beforeEach(() => {
    resetEventBus();
  });

  it("should initialize in idle state", () => {
    const sm = new AgentStateMachine("s1");
    expect(sm.state).toBe("idle");
  });

  it("should transition states and emit events", () => {
    const bus = getEventBus();
    const transitions: Array<{ from: string; to: string }> = [];
    let thinkingCount = 0;
    let idleCount = 0;

    bus.on("agent:state-changed", (payload) => {
      transitions.push({ from: payload.from, to: payload.to });
    });
    bus.on("agent:thinking", () => {
      thinkingCount++;
    });
    bus.on("agent:idle", () => {
      idleCount++;
    });

    const sm = new AgentStateMachine("s1");
    sm.transition("thinking");
    sm.transition("streaming");
    sm.transition("idle");

    expect(sm.state).toBe("idle");
    expect(transitions).toHaveLength(3);
    expect(transitions[0]).toEqual({ from: "idle", to: "thinking" });
    expect(transitions[1]).toEqual({ from: "thinking", to: "streaming" });
    expect(transitions[2]).toEqual({ from: "streaming", to: "idle" });
    expect(thinkingCount).toBe(1);
    expect(idleCount).toBe(1);
  });

  it("should ignore transitions to the same state", () => {
    const sm = new AgentStateMachine("s1");
    sm.transition("thinking");
    sm.transition("thinking");
    expect(sm.state).toBe("thinking");
  });
});

describe("parseStream", () => {
  it("should parse text, tool calls, and usage from stream", async () => {
    const chunks: string[] = [];
    async function* mockStream(): AsyncIterable<StreamPart> {
      yield { type: "text", text: "Hello " };
      yield { type: "text", text: "world" };
      yield {
        type: "tool-call",
        toolCall: { id: "c1", name: "read_file", arguments: { path: "a.txt" } },
      };
      yield {
        type: "usage",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
      yield { type: "finish", reason: "tool-calls" };
    }

    const parsed = await parseStream(mockStream(), (c) => chunks.push(c));

    expect(parsed.text).toBe("Hello world");
    expect(chunks).toEqual(["Hello ", "world"]);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].name).toBe("read_file");
    expect(parsed.usage?.totalTokens).toBe(15);
    expect(parsed.finishReason).toBe("tool-calls");
  });

  it("should throw when an error stream part is received", async () => {
    async function* errorStream(): AsyncIterable<StreamPart> {
      yield { type: "error", error: "API connection dropped" };
    }

    expect(async () => {
      await parseStream(errorStream());
    }).toThrow("Provider error: API connection dropped");
  });
});

describe("InMemory Stores", () => {
  it("should create, list, and touch sessions", () => {
    const store = new InMemorySessionStore();
    const session = store.create({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      title: "My Session",
    });

    expect(session.id).toBeDefined();
    expect(session.title).toBe("My Session");

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(session.id);

    const initialUpdated = session.updatedAt;
    store.touch(session.id);
    const retrieved = store.get(session.id);
    expect(retrieved?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      initialUpdated.getTime(),
    );
  });

  it("should create and retrieve messages by session ID", () => {
    const store = new InMemoryMessageStore();
    store.create({
      sessionId: "s1",
      role: "user",
      content: "Hello",
    });
    store.create({
      sessionId: "s1",
      role: "assistant",
      content: "Hi!",
    });
    store.create({
      sessionId: "s2",
      role: "user",
      content: "Other session",
    });

    const s1Messages = store.getBySessionId("s1");
    expect(s1Messages).toHaveLength(2);
    expect(s1Messages[0].content).toBe("Hello");
    expect(s1Messages[1].content).toBe("Hi!");

    const s2Messages = store.getBySessionId("s2");
    expect(s2Messages).toHaveLength(1);
  });
});

describe("System Prompt", () => {
  it("should return the default prompt when no custom instructions given", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("should append custom project instructions when provided", () => {
    const prompt = buildSystemPrompt("Always use TypeScript strict mode.");
    expect(prompt).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(prompt).toContain("Project Instructions:");
    expect(prompt).toContain("Always use TypeScript strict mode.");
  });
});

describe("Agent Loop", () => {
  const dummyConfig: CardinalConfig = {
    provider: {
      name: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.7,
    },
    permissions: {
      requireApproval: "never",
      blockedCommands: ["rm -rf /"],
      maxExecutionTimeMs: 30000,
    },
    session: {
      maxHistory: 100,
      persistSessions: true,
      dbPath: ".cardinal/cardinal.db",
    },
    log: {
      level: "info",
      filePath: ".cardinal/logs/cardinal.log",
      enableFile: true,
      enableStderr: false,
    },
    beacons: {},
  };

  beforeEach(() => {
    resetEventBus();
  });

  it("should handle a single-turn conversational exchange without tools", async () => {
    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        const stream = (async function* (): AsyncIterable<StreamPart> {
          yield { type: "text", text: "I can help you with code." };
          yield { type: "finish", reason: "stop" };
        })();
        return { stream, abort: () => {} };
      },
    };

    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const orchestrator = new ProviderOrchestrator(providerRegistry);

    const toolRegistry = new ToolRegistry();
    const toolExecutor = new ToolExecutor(toolRegistry);
    const permissionChecker = new PermissionChecker(dummyConfig.permissions);
    const sessionStore = new InMemorySessionStore();
    const messageStore = new InMemoryMessageStore();

    sessionStore.create({
      provider: "anthropic",
      model: "mock",
    });

    const agent = new Agent("test_session", {
      config: dummyConfig,
      providerOrchestrator: orchestrator,
      toolRegistry,
      toolExecutor,
      permissionChecker,
      sessionStore,
      messageStore,
    });

    const result = await agent.run("What can you do?");

    expect(result.response).toBe("I can help you with code.");
    expect(result.steps).toBe(1);
    expect(result.toolCallCount).toBe(0);

    const history = messageStore.getBySessionId("test_session");
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
  });

  it("should execute multi-step loops when model calls a tool", async () => {
    let turn = 0;
    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        turn++;
        const currentTurn = turn;
        const stream = (async function* (): AsyncIterable<StreamPart> {
          if (currentTurn === 1) {
            yield {
              type: "tool-call",
              toolCall: {
                id: "c1",
                name: "mock_echo",
                arguments: { message: "test-tool" },
              },
            };
            yield { type: "finish", reason: "tool-calls" };
          } else {
            yield { type: "text", text: "Tool executed successfully." };
            yield { type: "finish", reason: "stop" };
          }
        })();
        return { stream, abort: () => {} };
      },
    };

    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const orchestrator = new ProviderOrchestrator(providerRegistry);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "mock_echo",
      description: "Echoes a message",
      parameters: z.object({ message: z.string() }),
      permissionLevel: "read",
      execute: async (args: any) => ({
        content: `echo: ${args.message}`,
        isError: false,
      }),
    });

    const toolExecutor = new ToolExecutor(toolRegistry);
    const permissionChecker = new PermissionChecker(dummyConfig.permissions);
    const sessionStore = new InMemorySessionStore();
    const messageStore = new InMemoryMessageStore();

    const agent = new Agent("multi_turn_session", {
      config: dummyConfig,
      providerOrchestrator: orchestrator,
      toolRegistry,
      toolExecutor,
      permissionChecker,
      sessionStore,
      messageStore,
    });

    const result = await agent.run("Please run the mock tool");

    expect(result.response).toBe("Tool executed successfully.");
    expect(result.steps).toBe(2);
    expect(result.toolCallCount).toBe(1);

    const history = messageStore.getBySessionId("multi_turn_session");
    expect(history).toHaveLength(4);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
    expect(history[2].role).toBe("tool");
    expect(history[2].content).toBe("echo: test-tool");
    expect(history[3].role).toBe("assistant");
  });

  it("should record denied tool results when permission is rejected", async () => {
    let turn = 0;
    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        turn++;
        const currentTurn = turn;
        const stream = (async function* (): AsyncIterable<StreamPart> {
          if (currentTurn === 1) {
            yield {
              type: "tool-call",
              toolCall: {
                id: "c2",
                name: "delete_everything",
                arguments: {},
              },
            };
            yield { type: "finish", reason: "tool-calls" };
          } else {
            yield {
              type: "text",
              text: "Understood, I will not perform that action.",
            };
            yield { type: "finish", reason: "stop" };
          }
        })();
        return { stream, abort: () => {} };
      },
    };

    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const orchestrator = new ProviderOrchestrator(providerRegistry);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "delete_everything",
      description: "Destructive tool",
      parameters: z.object({}),
      permissionLevel: "write",
      execute: async () => ({ content: "deleted", isError: false }),
    });

    const toolExecutor = new ToolExecutor(toolRegistry);
    const permissionChecker = new PermissionChecker({
      ...dummyConfig.permissions,
      requireApproval: "always",
    });
    // Deny user confirmation
    permissionChecker.setApprovalCallback(async () => false);

    const sessionStore = new InMemorySessionStore();
    const messageStore = new InMemoryMessageStore();

    const agent = new Agent("denied_session", {
      config: dummyConfig,
      providerOrchestrator: orchestrator,
      toolRegistry,
      toolExecutor,
      permissionChecker,
      sessionStore,
      messageStore,
    });

    const result = await agent.run("Delete everything");

    expect(result.response).toBe("Understood, I will not perform that action.");
    expect(result.steps).toBe(2);

    const history = messageStore.getBySessionId("denied_session");
    const toolMsg = history.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("Permission denied: User denied the action");
  });

  it("should stop when maxSteps is reached", async () => {
    const mockProvider: LLMProvider = {
      info: { id: "anthropic", name: "Mock", models: ["mock"] },
      stream: () => {
        const stream = (async function* (): AsyncIterable<StreamPart> {
          yield {
            type: "tool-call",
            toolCall: { id: "loop", name: "ping", arguments: {} },
          };
          yield { type: "finish", reason: "tool-calls" };
        })();
        return { stream, abort: () => {} };
      },
    };

    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const orchestrator = new ProviderOrchestrator(providerRegistry);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "ping",
      description: "Ping",
      parameters: z.object({}),
      permissionLevel: "read",
      execute: async () => ({ content: "pong", isError: false }),
    });

    const toolExecutor = new ToolExecutor(toolRegistry);
    const permissionChecker = new PermissionChecker(dummyConfig.permissions);
    const sessionStore = new InMemorySessionStore();
    const messageStore = new InMemoryMessageStore();

    const agent = new Agent("max_steps_session", {
      config: dummyConfig,
      providerOrchestrator: orchestrator,
      toolRegistry,
      toolExecutor,
      permissionChecker,
      sessionStore,
      messageStore,
      maxSteps: 2,
    });

    const result = await agent.run("Run forever");

    expect(result.steps).toBe(2);
    expect(result.response).toContain("Reached maximum number of steps");
  });
});

describe("SessionManager", () => {
  const dummyConfig: CardinalConfig = {
    provider: {
      name: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.7,
    },
    permissions: {
      requireApproval: "write-only",
      blockedCommands: ["rm -rf /"],
      maxExecutionTimeMs: 30000,
    },
    session: {
      maxHistory: 100,
      persistSessions: true,
      dbPath: ".cardinal/cardinal.db",
    },
    log: {
      level: "info",
      filePath: ".cardinal/logs/cardinal.log",
      enableFile: true,
      enableStderr: false,
    },
    beacons: {},
  };

  it("should create sessions, retrieve cached agents, and list sessions", () => {
    const manager = new SessionManager(dummyConfig);

    const session = manager.createSession("Project Alpha");
    expect(session.id).toBeDefined();
    expect(session.title).toBe("Project Alpha");

    const agent1 = manager.getAgent(session.id);
    const agent2 = manager.getAgent(session.id);
    expect(agent1).toBe(agent2);

    const sessions = manager.listSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.map((s) => s.id)).toContain(session.id);
  });
});
