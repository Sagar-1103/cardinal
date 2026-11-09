import type { ToolCall, TokenUsage } from "@cardinal/types";
import type { StreamPart } from "@cardinal/providers";

// Structured response extracted from a model stream
export interface ParsedResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
  finishReason: string;
}

// Parses an async stream of parts into aggregated text and tool call actions
export async function parseStream(
  stream: AsyncIterable<StreamPart>,
  onTextChunk?: (chunk: string) => void,
): Promise<ParsedResponse> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let usage: TokenUsage | null = null;
  let finishReason = "stop";

  for await (const part of stream) {
    switch (part.type) {
      case "text":
        text += part.text;
        onTextChunk?.(part.text);
        break;
      case "tool-call":
        toolCalls.push(part.toolCall);
        break;
      case "usage":
        usage = part.usage;
        break;
      case "finish":
        finishReason = part.reason;
        break;
      case "error":
        throw new Error(`Provider error: ${part.error}`);
    }
  }

  return { text, toolCalls, usage, finishReason };
}

