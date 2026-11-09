import type { CardinalConfig } from "@cardinal/config";
import type { Session } from "@cardinal/types";
import {
  createDefaultRegistry,
  ProviderOrchestrator,
  type ProviderRegistry,
} from "@cardinal/providers";
import {
  createDefaultToolRegistry,
  ToolExecutor,
  type ToolRegistry,
} from "@cardinal/tools";
import {
  PermissionChecker,
  type ApprovalCallback,
} from "@cardinal/permissions";
import {
  type SessionStore,
  type MessageStore,
  InMemorySessionStore,
  InMemoryMessageStore,
} from "./store";
import { Agent } from "./agent";

// Optional configuration overrides for SessionManager
export interface SessionManagerOptions {
  sessionStore?: SessionStore;
  messageStore?: MessageStore;
  providerRegistry?: ProviderRegistry;
  toolRegistry?: ToolRegistry;
  permissionChecker?: PermissionChecker;
  workingDir?: string;
  maxSteps?: number;
}

// Manages conversation sessions and creates cached agent instances
export class SessionManager {
  private agents = new Map<string, Agent>();
  private sessionStore: SessionStore;
  private messageStore: MessageStore;
  private providerRegistry: ProviderRegistry;
  private providerOrchestrator: ProviderOrchestrator;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private permissionChecker: PermissionChecker;
  private workingDir?: string;
  private maxSteps?: number;

  constructor(
    private config: CardinalConfig,
    options?: SessionManagerOptions,
  ) {
    this.sessionStore = options?.sessionStore ?? new InMemorySessionStore();
    this.messageStore = options?.messageStore ?? new InMemoryMessageStore();

    this.providerRegistry =
      options?.providerRegistry ?? createDefaultRegistry();
    this.providerOrchestrator = new ProviderOrchestrator(this.providerRegistry);

    this.toolRegistry =
      options?.toolRegistry ?? createDefaultToolRegistry();
    this.toolExecutor = new ToolExecutor(this.toolRegistry);

    this.permissionChecker =
      options?.permissionChecker ?? new PermissionChecker(config.permissions);

    this.workingDir = options?.workingDir;
    this.maxSteps = options?.maxSteps;
  }

  // Creates a new chat session with provider and model metadata
  createSession(title?: string): Session {
    return this.sessionStore.create({
      provider: this.config.provider.name,
      model: this.config.provider.model,
      title,
    });
  }

  // Retrieves or instantiates an Agent for a given session ID
  getAgent(sessionId: string): Agent {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = new Agent(sessionId, {
        config: this.config,
        providerOrchestrator: this.providerOrchestrator,
        toolRegistry: this.toolRegistry,
        toolExecutor: this.toolExecutor,
        permissionChecker: this.permissionChecker,
        sessionStore: this.sessionStore,
        messageStore: this.messageStore,
        workingDir: this.workingDir,
        maxSteps: this.maxSteps,
      });
      this.agents.set(sessionId, agent);
    }
    return agent;
  }

  // Lists all known sessions
  listSessions(): Session[] {
    return this.sessionStore.list();
  }

  // Sets the interactive callback for user permission confirmation
  setApprovalCallback(callback: ApprovalCallback): void {
    this.permissionChecker.setApprovalCallback(callback);
  }
}

