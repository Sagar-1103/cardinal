import { getEventBus } from "@cardinal/events";
import type { PermissionsConfig } from "@cardinal/config";
import type { ToolCall } from "@cardinal/types";

// Permission categories evaluated before tool execution
export type PermissionLevel = "read" | "write" | "execute" | "network";

// Result of a permission check evaluation
export type ApprovalResult =
  | { approved: true; auto: boolean }
  | { approved: false; reason: string };

// Callback function used by interactive UIs to request user confirmation
export type ApprovalCallback = (toolCall: ToolCall) => Promise<boolean>;

// Safety gate that validates tool calls against approval modes and blocked commands
export class PermissionChecker {
  private bus = getEventBus();
  private approvalCallback?: ApprovalCallback;

  constructor(private config: PermissionsConfig) {}

  // Sets the interactive callback for user approval prompts
  setApprovalCallback(callback: ApprovalCallback): void {
    this.approvalCallback = callback;
  }

  // Evaluates whether a tool call is permitted to execute
  async check(
    sessionId: string,
    toolCall: ToolCall,
    permissionLevel: PermissionLevel,
  ): Promise<ApprovalResult> {
    // Check against the blocked commands list first
    if (permissionLevel === "execute") {
      const blockedReason = this.isBlocked(toolCall);
      if (blockedReason) {
        this.bus.emit("permission:denied", {
          sessionId,
          toolCallId: toolCall.id,
          reason: blockedReason,
        });
        return { approved: false, reason: blockedReason };
      }
    }

    const mode = this.config.requireApproval;

    // Never mode auto-approves all non-blocked actions
    if (mode === "never") {
      this.bus.emit("permission:auto-approved", {
        sessionId,
        toolCallId: toolCall.id,
      });
      return { approved: true, auto: true };
    }

    // Write-only mode auto-approves read operations
    if (mode === "write-only" && permissionLevel === "read") {
      this.bus.emit("permission:auto-approved", {
        sessionId,
        toolCallId: toolCall.id,
      });
      return { approved: true, auto: true };
    }

    // Interactive approval required
    this.bus.emit("permission:requested", { sessionId, toolCall });

    if (this.approvalCallback) {
      const approved = await this.approvalCallback(toolCall);
      if (approved) {
        this.bus.emit("permission:approved", {
          sessionId,
          toolCallId: toolCall.id,
        });
        return { approved: true, auto: false };
      }

      this.bus.emit("permission:denied", {
        sessionId,
        toolCallId: toolCall.id,
        reason: "User denied the action",
      });
      return { approved: false, reason: "User denied the action" };
    }

    // Default to denying the action when no approval handler is present
    this.bus.emit("permission:denied", {
      sessionId,
      toolCallId: toolCall.id,
      reason: "No approval handler configured",
    });
    return { approved: false, reason: "No approval handler configured" };
  }

  // Inspects the command string for any dangerous blocked patterns
  private isBlocked(toolCall: ToolCall): string | null {
    const command = String(toolCall.arguments?.command ?? "");
    for (const pattern of this.config.blockedCommands) {
      if (command.includes(pattern)) {
        return `Command blocked: contains "${pattern}"`;
      }
    }
    return null;
  }
}

