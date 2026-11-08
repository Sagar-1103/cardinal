import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  path: z
    .string()
    .describe("The file path to read, relative to working directory"),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Start line (1-indexed, inclusive)"),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("End line (1-indexed, inclusive)"),
});

// Tool for reading file contents with optional line range slices
export const readFileTool: Tool = {
  name: "read_file",
  description:
    "Read the contents of a file. Optionally specify a line range to read a subset.",
  parameters,
  permissionLevel: "read",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const fullPath = resolve(context.workingDir, parsed.path);

    if (!existsSync(fullPath)) {
      return {
        content: `Error: File not found: ${parsed.path}`,
        isError: true,
      };
    }

    try {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      // Record that this file has been read in the current session
      context.readFiles.add(fullPath);

      if (parsed.startLine || parsed.endLine) {
        const start = (parsed.startLine ?? 1) - 1;
        const end = parsed.endLine ?? lines.length;
        const slice = lines.slice(start, end);

        return {
          content: slice
            .map((line, i) => `${start + i + 1}: ${line}`)
            .join("\n"),
          isError: false,
          metadata: {
            path: parsed.path,
            totalLines: lines.length,
            shownLines: slice.length,
          },
        };
      }

      return {
        content: lines.map((line, i) => `${i + 1}: ${line}`).join("\n"),
        isError: false,
        metadata: {
          path: parsed.path,
          totalLines: lines.length,
          bytes: Buffer.byteLength(content),
        },
      };
    } catch (error) {
      return {
        content: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  },
};

