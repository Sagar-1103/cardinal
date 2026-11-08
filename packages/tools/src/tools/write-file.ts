import { z } from "zod";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  path: z
    .string()
    .describe("The file path to create, relative to working directory"),
  content: z.string().describe("The full content to write to the file"),
});

// Tool for creating new files and missing parent directories
export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Create a new file with the specified content. Parent directories are created automatically. Fails if the file already exists; use edit_file to modify existing files.",
  parameters,
  permissionLevel: "write",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const fullPath = resolve(context.workingDir, parsed.path);

    if (existsSync(fullPath)) {
      return {
        content: `Error: File already exists: ${parsed.path}. Use edit_file to modify existing files.`,
        isError: true,
      };
    }

    try {
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, parsed.content, "utf-8");

      // Mark the new file as read so subsequent edits can proceed
      context.readFiles.add(fullPath);

      return {
        content: `File created: ${parsed.path} (${Buffer.byteLength(parsed.content)} bytes)`,
        isError: false,
        metadata: {
          path: parsed.path,
          bytes: Buffer.byteLength(parsed.content),
        },
      };
    } catch (error) {
      return {
        content: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  },
};

