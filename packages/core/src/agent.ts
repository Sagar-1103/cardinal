import { getEventBus } from "@cardinal/events";
import type { CardinalConfig } from "@cardinal/config";
import type { ProviderOrchestrator } from "@cardinal/providers";
import type { ToolExecutor, ToolRegistry } from "@cardinal/tools";
import type { PermissionChecker } from "@cardinal/permissions";
import type { SessionStore, MessageStore } from "./store";
import { AgentStateMachine } from "./state";
import { parseStream } from "./parser";
import { buildSystemPrompt } from "./prompts";

// Dependencies and configuration required to run an agent
export interface AgentOptions {
  config: CardinalConfig;
  providerOrchestrator: ProviderOrchestrator;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  permissionChecker: PermissionChecker;
  sessionStore: SessionStore;
  messageStore: MessageStore;
  workingDir?: string;
  maxSteps?: number;
  systemPrompt?: string;
}

// Summary statistics and output returned by an agent run
export interface AgentRunResult {
  response: string;
  toolCallCount: number;
  steps: number;
}

// Central coordinator that drives the multi-turn conversational and tool execution loop
export class Agent {
  private bus = getEventBus();
  private state: AgentStateMachine;
  private abortController: AbortController | null = null;
  private readFiles = new Set<string>();

  constructor(
    private sessionId: string,
    private options: AgentOptions,
  ) {
    this.state = new AgentStateMachine(sessionId);
  }

  // Returns the current status of the agent
  get currentState() {
    return this.state.state;
  }

  // Runs the agent loop for an incoming user message until completion or max steps
  async run(
    userMessage: string,
    onTextChunk?: (chunk: string) => void,
  ): Promise<AgentRunResult> {
    const {
      config,
      providerOrchestrator,
      toolRegistry,
      toolExecutor,
      permissionChecker,
      sessionStore,
      messageStore,
    } = this.options;

    const maxSteps = this.options.maxSteps ?? 25;
    const workingDir = this.options.workingDir ?? process.cwd();
    this.abortController = new AbortController();

    // 1. Record the user message
    messageStore.create({
      sessionId: this.sessionId,
      role: "user",
      content: userMessage,
    });
    sessionStore.touch(this.sessionId);

    let steps = 0;
    let totalToolCalls = 0;
    let finalResponse = "";

    try {
      while (steps < maxSteps) {
        if (this.abortController.signal.aborted) {
          break;
        }

        steps++;
        this.state.transition("thinking");

        // 2. Prepare system prompt and conversation messages
        const systemPrompt =
          this.options.systemPrompt ??
          buildSystemPrompt(config.customInstructions);

        const history = messageStore.getBySessionId(this.sessionId);
        const providerMessages = [
          { role: "system" as const, content: systemPrompt },
          ...history.map((m) => {
            const toolCallId = m.toolResults?.[0]?.toolCallId;
            return {
              role: m.role,
              content: m.content,
              ...(toolCallId ? { toolCallId } : {}),
            };
          }),
        ];

        // 3. Collect tool schemas
        const toolSchemas = toolRegistry.schemas();

        // 4. Stream response from provider
        this.state.transition("streaming");

        const streamResult = providerOrchestrator.stream(
          this.sessionId,
          {
            messages: providerMessages,
            tools: toolSchemas,
            maxTokens: config.provider.maxTokens,
            temperature: config.provider.temperature,
            signal: this.abortController.signal,
          },
          config.provider,
        );

        const parsed = await parseStream(streamResult.stream, onTextChunk);

        // 5. Record the assistant response
        if (parsed.text || parsed.toolCalls.length > 0) {
          messageStore.create({
            sessionId: this.sessionId,
            role: "assistant",
            content: parsed.text,
            toolCalls:
              parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined,
          });
        }

        // 6. If no tools were called, the turn is complete
        if (parsed.toolCalls.length === 0) {
          finalResponse = parsed.text;
          break;
        }

        // 7. Execute requested tool calls
        this.state.transition("executing");

        for (const toolCall of parsed.toolCalls) {
          if (this.abortController.signal.aborted) {
            break;
          }

          totalToolCalls++;
          const tool = toolRegistry.get(toolCall.name);

          if (!tool) {
            messageStore.create({
              sessionId: this.sessionId,
              role: "tool",
              content: `Error: Unknown tool "${toolCall.name}"`,
              toolResults: [
                {
                  toolCallId: toolCall.id,
                  content: `Error: Unknown tool "${toolCall.name}"`,
                  isError: true,
                },
              ],
            });
            continue;
          }

          // Check permissions before running
          const approval = await permissionChecker.check(
            this.sessionId,
            toolCall,
            tool.permissionLevel,
          );

          if (!approval.approved) {
            messageStore.create({
              sessionId: this.sessionId,
              role: "tool",
              content: `Permission denied: ${approval.reason}`,
              toolResults: [
                {
                  toolCallId: toolCall.id,
                  content: `Permission denied: ${approval.reason}`,
                  isError: true,
                },
              ],
            });
            continue;
          }

          // Execute tool and record result
          const result = await toolExecutor.execute(toolCall, {
            workingDir,
            sessionId: this.sessionId,
            readFiles: this.readFiles,
          });

          messageStore.create({
            sessionId: this.sessionId,
            role: "tool",
            content: result.content,
            toolResults: [result],
          });
        }

        // Continue next loop step with tool results in context
      }

      if (steps >= maxSteps && !finalResponse) {
        this.bus.emit("agent:max-steps", {
          sessionId: this.sessionId,
          steps: maxSteps,
        });
        finalResponse = "(Reached maximum number of steps)";
      }

      this.state.transition("idle");

      return {
        response: finalResponse,
        toolCallCount: totalToolCalls,
        steps,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.state.transition("error");

      return {
        response: `Error: ${errorMsg}`,
        toolCallCount: totalToolCalls,
        steps,
      };
    } finally {
      this.abortController = null;
    }
  }

  // Cancels the current running agent task
  abort(): void {
    this.abortController?.abort();
    this.state.transition("idle");
  }
}

