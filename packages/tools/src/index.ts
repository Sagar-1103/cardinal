import { ToolRegistry } from "./registry";
import { readFileTool } from "./tools/read-file";
import { writeFileTool } from "./tools/write-file";
import { editFileTool } from "./tools/edit-file";
import { listDirectoryTool } from "./tools/list-directory";
import { searchFilesTool } from "./tools/search-files";
import { executeCommandTool } from "./tools/execute-command";

// Exports for tool management and execution
export { ToolRegistry } from "./registry";
export { ToolExecutor } from "./executor";
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolSchema,
  ToolPermissionLevel,
} from "./types";

// Individual built-in tools
export { readFileTool } from "./tools/read-file";
export { writeFileTool } from "./tools/write-file";
export { editFileTool } from "./tools/edit-file";
export { listDirectoryTool } from "./tools/list-directory";
export { searchFilesTool } from "./tools/search-files";
export { executeCommandTool } from "./tools/execute-command";

// Creates a tool registry pre-populated with all standard built-in tools
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(listDirectoryTool);
  registry.register(searchFilesTool);
  registry.register(executeCommandTool);
  return registry;
}
