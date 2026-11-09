import type {
  Session,
  Message,
  MessageRole,
  ToolCall,
  ToolResult,
} from "@cardinal/types";

// Parameters for creating a new conversation session
export interface CreateSessionParams {
  title?: string;
  provider: string;
  model: string;
}

// Interface for storing and retrieving sessions
export interface SessionStore {
  create(params: CreateSessionParams): Session;
  get(sessionId: string): Session | undefined;
  list(): Session[];
  touch(sessionId: string): void;
}

// Parameters for creating a new message entry
export interface CreateMessageParams {
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// Interface for storing and retrieving conversation messages
export interface MessageStore {
  create(params: CreateMessageParams): Message;
  getBySessionId(sessionId: string): Message[];
  clear(sessionId: string): void;
}

// In-memory implementation of the session store
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();

  create(params: CreateSessionParams): Session {
    const now = new Date();
    const session: Session = {
      id: crypto.randomUUID(),
      title: params.title ?? "New Session",
      provider: params.provider,
      model: params.model,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updatedAt = new Date();
    }
  }
}

// In-memory implementation of the message history store
export class InMemoryMessageStore implements MessageStore {
  private messages = new Map<string, Message[]>();

  create(params: CreateMessageParams): Message {
    const message: Message = {
      id: crypto.randomUUID(),
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls,
      toolResults: params.toolResults,
      createdAt: new Date(),
    };

    const sessionMessages = this.messages.get(params.sessionId) ?? [];
    sessionMessages.push(message);
    this.messages.set(params.sessionId, sessionMessages);

    return message;
  }

  getBySessionId(sessionId: string): Message[] {
    return [...(this.messages.get(sessionId) ?? [])];
  }

  clear(sessionId: string): void {
    this.messages.delete(sessionId);
  }
}

