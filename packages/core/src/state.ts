import type { AgentState } from "@cardinal/types";
import { getEventBus } from "@cardinal/events";

// State machine managing the lifecycle and status transitions of an agent
export class AgentStateMachine {
  private bus = getEventBus();
  private _state: AgentState = "idle";

  constructor(private sessionId: string) {}

  // Returns the current state of the agent
  get state(): AgentState {
    return this._state;
  }

  // Transitions the agent to a new state and notifies event listeners
  transition(to: AgentState): void {
    const from = this._state;
    if (from === to) {
      return;
    }

    this._state = to;
    this.bus.emit("agent:state-changed", {
      sessionId: this.sessionId,
      from,
      to,
    });

    if (to === "thinking") {
      this.bus.emit("agent:thinking", { sessionId: this.sessionId });
    } else if (to === "idle") {
      this.bus.emit("agent:idle", { sessionId: this.sessionId });
    } else if (to === "error") {
      this.bus.emit("agent:error", {
        sessionId: this.sessionId,
        error: "Agent entered error state",
      });
    }
  }
}

