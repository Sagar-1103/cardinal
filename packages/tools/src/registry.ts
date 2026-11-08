import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool, ToolSchema } from "./types";

// Registry for storing and discovering available tools
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  // Registers a tool in the registry
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  // Retrieves a tool by name, or undefined if not found
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // Retrieves a tool by name, or throws an error listing registered tools
  getOrThrow(name: string): Tool {
    const tool = this.get(name);
    if (!tool) {
      const available = this.list()
        .map((t) => t.name)
        .join(", ");
      throw new Error(`Unknown tool "${name}". Available: ${available}`);
    }
    return tool;
  }

  // Lists all currently registered tools
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Converts all registered tool parameters into JSON Schema definitions for LLMs
  schemas(): ToolSchema[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
    }));
  }
}

