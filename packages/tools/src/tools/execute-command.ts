import { z } from "zod";
import { execSync } from "child_process";
import { resolve } from "path";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  command: z.string().describe("The shell command to execute"),
  cwd: z.string().optional().describe("Working directory for the command"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(30000)
    .describe("Timeout in milliseconds"),
});

// Tool for executing shell commands and capturing stdout and stderr
export const executeCommandTool: Tool = {
  name: "execute_command",
  description:
    "Execute a shell command and return its output. The command runs in the project's working directory by default. Use with caution; destructive commands require approval.",
  parameters,
  permissionLevel: "execute",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const cwd = parsed.cwd
      ? resolve(context.workingDir, parsed.cwd)
      : context.workingDir;

    try {
      const output = execSync(parsed.command, {
        cwd,
        encoding: "utf-8",
        timeout: parsed.timeoutMs,
        maxBuffer: 1024 * 1024 * 5,
        env: { ...process.env },
      });

      return {
        content: output.trim() || "(no output)",
        isError: false,
        metadata: { command: parsed.command, cwd },
      };
    } catch (error: any) {
      const stderr = error.stderr?.toString().trim() ?? "";
      const stdout = error.stdout?.toString().trim() ?? "";
      const output = [stdout, stderr].filter(Boolean).join("\n");

      return {
        content: `Command failed (exit code ${error.status ?? "unknown"}):\n${output || error.message}`,
        isError: true,
        metadata: { command: parsed.command, exitCode: error.status },
      };
    }
  },
};

