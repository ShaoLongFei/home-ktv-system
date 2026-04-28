import type { PlaybackEvent, PlaybackSession, QueueEntry } from "@home-ktv/domain";
import type { PlaybackTarget, PlayerTelemetryEvent, SwitchTarget } from "@home-ktv/player-contracts";

export interface SessionEngineState {
  session: PlaybackSession;
  queue: readonly QueueEntry[];
  events: readonly PlaybackEvent[];
}

export type SessionEngineCommand =
  | { type: "apply-playback-target"; target: PlaybackTarget }
  | { type: "apply-switch-target"; target: SwitchTarget }
  | { type: "record-player-telemetry"; event: PlayerTelemetryEvent };

export interface SessionCommandHandlers {
  reduce: (state: SessionEngineState, command: SessionEngineCommand) => SessionEngineState;
  handleTelemetry: (state: SessionEngineState, event: PlayerTelemetryEvent) => SessionEngineState;
}

export function reduceSessionEngine(state: SessionEngineState, _command: SessionEngineCommand): SessionEngineState {
  return state;
}

export function createSessionCommandHandlers(): SessionCommandHandlers {
  return {
    reduce: reduceSessionEngine,
    handleTelemetry: (state) => state
  };
}
