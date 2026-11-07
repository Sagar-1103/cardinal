// Roles for messages in a conversation
export type MessageRole = "system" | "user" | "assistant" | "tool";

// Represents a single message in the chat history
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  createdAt: Date;
}

// Tool call requested by the model
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Result returned after running a tool
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

// Conversation session metadata
export interface Session {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// Token usage reported by the provider
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Current status of the agent runtime
export type AgentState =
  | "idle"
  | "thinking"
  | "executing"
  | "streaming"
  | "error";
