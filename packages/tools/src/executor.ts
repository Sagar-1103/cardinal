import { getEventBus } from "@cardinal/events";
import type { ToolCall, ToolResult as TypesToolResult } from "@cardinal/types";
import type { ToolRegistry } from "./registry";
import type { ToolContext, ToolResult } from "./types";

// Coordinates argument validation, tool execution, and lifecycle event emission
export class ToolExecutor {
  private bus = getEventBus();

  constructor(private registry: ToolRegistry) {}

  // Executes a tool call within a given session context
  async execute(
    toolCall: ToolCall,
    context: ToolContext,
  ): Promise<TypesToolResult> {
    const start = performance.now();

    try {
      const tool = this.registry.getOrThrow(toolCall.name);

      this.bus.emit("tool:executing", {
        sessionId: context.sessionId,
        toolCall,
      });

      // Validate inputs against the tool Zod schema
      const validatedArgs = tool.parameters.parse(toolCall.arguments);

      const result: ToolResult = await tool.execute(validatedArgs, context);
      const durationMs = Math.round(performance.now() - start);

      this.bus.emit("tool:completed", {
        sessionId: context.sessionId,
        toolCallId: toolCall.id,
        result: {
          toolCallId: toolCall.id,
          content: result.content,
          isError: result.isError,
        },
        durationMs,
      });

      return {
        toolCallId: toolCall.id,
        content: result.content,
        isError: result.isError,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const durationMs = Math.round(performance.now() - start);

      this.bus.emit("tool:error", {
        sessionId: context.sessionId,
        toolCallId: toolCall.id,
        error: errorMsg,
      });

      return {
        toolCallId: toolCall.id,
        content: `Tool execution error: ${errorMsg}`,
        isError: true,
      };
    }
  }
}

