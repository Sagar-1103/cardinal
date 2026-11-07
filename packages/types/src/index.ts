// Roles supported in conversation history
export type MessageRole = "system" | "user" | "assistant" | "tool";

// Single conversational message
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  createdAt: Date;
}

// Tool invocation requested by the model
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Execution output returned from a tool
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

// Session metadata stored in database
export interface Session {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// Token usage reported by LLM providers
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// High-level lifecycle state for the agent runtime
export type AgentState =
  "idle" | "thinking" | "executing" | "streaming" | "error";
