import { z } from "zod";
import { readdirSync, statSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  path: z
    .string()
    .default(".")
    .describe("Directory path, relative to working directory"),
  recursive: z.boolean().default(false).describe("Whether to list recursively"),
  maxDepth: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe("Max depth for recursive listing"),
});

// Common directories to skip when listing project contents
const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".turbo",
  ".cardinal",
]);

// Helper to recursively collect directory tree entries
function listDir(
  dir: string,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number,
): string[] {
  const entries: string[] = [];
  const items = readdirSync(dir);
  const indent = "  ".repeat(currentDepth);

  for (const item of items) {
    if (IGNORED_NAMES.has(item)) {
      continue;
    }

    const fullPath = join(dir, item);
    let isDir = false;
    try {
      isDir = statSync(fullPath).isDirectory();
    } catch {
      continue;
    }

    if (isDir) {
      entries.push(`${indent}📁 ${item}/`);
      if (recursive && currentDepth < maxDepth) {
        entries.push(
          ...listDir(fullPath, recursive, maxDepth, currentDepth + 1),
        );
      }
    } else {
      entries.push(`${indent}📄 ${item}`);
    }
  }

  return entries;
}

// Tool for inspecting directory structures and file trees
export const listDirectoryTool: Tool = {
  name: "list_directory",
  description:
    "List the contents of a directory, showing files and subdirectories.",
  parameters,
  permissionLevel: "read",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const fullPath = resolve(context.workingDir, parsed.path);

    if (!existsSync(fullPath)) {
      return {
        content: `Error: Directory not found: ${parsed.path}`,
        isError: true,
      };
    }

    try {
      const entries = listDir(fullPath, parsed.recursive, parsed.maxDepth, 0);
      return {
        content: entries.join("\n") || "(empty directory)",
        isError: false,
        metadata: { path: parsed.path, entryCount: entries.length },
      };
    } catch (error) {
      return {
        content: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  },
};

