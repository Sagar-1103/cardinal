import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  path: z
    .string()
    .describe("The file path to edit, relative to working directory"),
  oldString: z
    .string()
    .describe("The exact string to find and replace. Must match exactly."),
  newString: z.string().describe("The replacement string"),
});

// Tool for making exact string replacements in existing files
export const editFileTool: Tool = {
  name: "edit_file",
  description:
    "Make a surgical edit to an existing file by replacing an exact string match. The oldString must match exactly one location in the file. You must read_file before editing.",
  parameters,
  permissionLevel: "write",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const fullPath = resolve(context.workingDir, parsed.path);

    // Enforce read before write safety rule
    if (!context.readFiles.has(fullPath)) {
      return {
        content: `Error: You must read_file "${parsed.path}" before editing it.`,
        isError: true,
      };
    }

    if (!existsSync(fullPath)) {
      return {
        content: `Error: File not found: ${parsed.path}`,
        isError: true,
      };
    }

    try {
      const content = readFileSync(fullPath, "utf-8");

      // Verify the target string exists
      if (!content.includes(parsed.oldString)) {
        return {
          content: `Error: The specified oldString was not found in ${parsed.path}. Make sure it matches the file content exactly, including whitespace and indentation.`,
          isError: true,
        };
      }

      // Verify the target string is unique in the file
      const occurrences = content.split(parsed.oldString).length - 1;
      if (occurrences > 1) {
        return {
          content: `Error: The oldString was found ${occurrences} times in ${parsed.path}. Add more surrounding lines to make it match exactly once.`,
          isError: true,
        };
      }

      const newContent = content.replace(parsed.oldString, parsed.newString);
      writeFileSync(fullPath, newContent, "utf-8");

      return {
        content: `File edited: ${parsed.path}`,
        isError: false,
        metadata: { path: parsed.path },
      };
    } catch (error) {
      return {
        content: `Error editing file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  },
};

