import { tool, jsonSchema, type CoreMessage, type CoreTool } from "ai";
import type { StreamMessage, StreamPart, ToolDefinition } from "../types";

// Converts cardinal tool definitions into Vercel AI SDK tool format
export function convertTools(
  tools?: ToolDefinition[],
): Record<string, CoreTool> | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  const result: Record<string, CoreTool> = {};
  for (const t of tools) {
    result[t.name] = tool({
      description: t.description,
      parameters: jsonSchema(t.parameters),
    });
  }
  return result;
}

// Converts generic stream messages into Vercel AI SDK CoreMessage format
export function convertMessages(messages: StreamMessage[]): CoreMessage[] {
  return messages.map((msg): CoreMessage => {
    switch (msg.role) {
      case "system":
        return { role: "system", content: msg.content };
      case "user":
        return { role: "user", content: msg.content };
      case "assistant":
        return { role: "assistant", content: msg.content };
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: msg.toolCallId ?? "call_default",
              toolName: "",
              result: msg.content,
            },
          ],
        };
    }
  });
}

// Transforms raw AI SDK stream parts into Cardinal StreamPart format
export async function* transformStream(
  fullStream: AsyncIterable<any>,
): AsyncIterable<StreamPart> {
  for await (const part of fullStream) {
    switch (part.type) {
      case "text-delta":
        yield { type: "text", text: part.textDelta };
        break;
      case "tool-call":
        yield {
          type: "tool-call",
          toolCall: {
            id: part.toolCallId,
            name: part.toolName,
            arguments: part.args ?? {},
          },
        };
        break;
      case "finish": {
        const promptTokens = part.usage?.promptTokens ?? 0;
        const completionTokens = part.usage?.completionTokens ?? 0;
        const totalTokens =
          part.usage?.totalTokens ?? promptTokens + completionTokens;

        yield {
          type: "usage",
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        };
        yield {
          type: "finish",
          reason: part.finishReason ?? "stop",
        };
        break;
      }
      case "error":
        yield {
          type: "error",
          error:
            part.error instanceof Error
              ? part.error.message
              : String(part.error),
        };
        break;
    }
  }
}

