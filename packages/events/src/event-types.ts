import type {
  Message,
  ToolCall,
  ToolResult,
  TokenUsage,
  AgentState,
} from "@cardinal/types";

// Map of all system events and their payload types
export interface CardinalEventMap {
  // Session lifecycle events
  "session:created": { sessionId: string; title: string };
  "session:resumed": { sessionId: string };
  "session:deleted": { sessionId: string };
  "session:message": { sessionId: string; message: Message };

  // Agent loop state events
  "agent:state-changed": {
    sessionId: string;
    from: AgentState;
    to: AgentState;
  };
  "agent:thinking": { sessionId: string };
  "agent:idle": { sessionId: string };
  "agent:error": { sessionId: string; error: string };
  "agent:max-steps": { sessionId: string; steps: number };

  // Model and provider streaming events
  "provider:request": { sessionId: string; provider: string; model: string };
  "provider:stream-start": { sessionId: string };
  "provider:stream-chunk": { sessionId: string; chunk: string };
  "provider:stream-end": { sessionId: string };
  "provider:complete": { sessionId: string; usage: TokenUsage };
  "provider:error": { sessionId: string; error: string; retryCount: number };

  // Tool execution events
  "tool:executing": { sessionId: string; toolCall: ToolCall };
  "tool:completed": {
    sessionId: string;
    toolCallId: string;
    result: ToolResult;
    durationMs: number;
  };
  "tool:error": { sessionId: string; toolCallId: string; error: string };

  // Permission and safety gate events
  "permission:requested": { sessionId: string; toolCall: ToolCall };
  "permission:approved": { sessionId: string; toolCallId: string };
  "permission:denied": {
    sessionId: string;
    toolCallId: string;
    reason: string;
  };
  "permission:auto-approved": { sessionId: string; toolCallId: string };

  // External MCP server connection events
  "mcp:connected": { serverId: string; toolCount: number };
  "mcp:disconnected": { serverId: string; reason: string };
  "mcp:reconnecting": { serverId: string; attempt: number };

  // Token window and context management events
  "context:pruned": {
    sessionId: string;
    removedMessages: number;
    tokensSaved: number;
  };
  "context:usage": { sessionId: string; used: number; total: number };
}

// Union of all supported event names
export type CardinalEventName = keyof CardinalEventMap;

// Extract payload type for a specific event
export type CardinalEventPayload<T extends CardinalEventName> =
  CardinalEventMap[T];

