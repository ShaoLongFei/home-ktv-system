import type {
  ControlCommandResultStatus,
  ControlCommandType,
  ControlSessionId,
  RoomId
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ControlCommandRow } from "../../../db/schema.js";

export interface RoomSessionCommandRecord {
  commandId: string;
  roomId: RoomId;
  controlSessionId: ControlSessionId;
  sessionVersion: number;
  type: ControlCommandType;
  payload: Record<string, unknown>;
  resultStatus: ControlCommandResultStatus;
  resultPayload: Record<string, unknown>;
  createdAt: string;
}

export interface InsertCommandAttemptInput {
  commandId: string;
  roomId: RoomId;
  controlSessionId: ControlSessionId;
  sessionVersion: number;
  type: ControlCommandType;
  payload: Record<string, unknown>;
  resultStatus: ControlCommandResultStatus;
  resultPayload?: Record<string, unknown>;
}

export interface UpdateCommandResultInput {
  commandId: string;
  resultStatus: ControlCommandResultStatus;
  resultPayload?: Record<string, unknown>;
}

export interface RoomSessionCommandRepository {
  findCommand(commandId: string): Promise<RoomSessionCommandRecord | null>;
  insertCommandAttempt(input: InsertCommandAttemptInput): Promise<RoomSessionCommandRecord>;
  updateCommandResult(input: UpdateCommandResultInput): Promise<RoomSessionCommandRecord | null>;
}

export class PgRoomSessionCommandRepository implements RoomSessionCommandRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findCommand(commandId: string): Promise<RoomSessionCommandRecord | null> {
    const result = await this.db.query<ControlCommandRow>(
      `SELECT command_id, room_id, control_session_id, session_version, command_type,
              command_payload, result_status, result_payload, created_at
       FROM control_commands
       WHERE command_id = $1
       LIMIT 1`,
      [commandId]
    );

    const row = result.rows[0];
    return row ? mapControlCommandRow(row) : null;
  }

  async insertCommandAttempt(input: InsertCommandAttemptInput): Promise<RoomSessionCommandRecord> {
    const result = await this.db.query<ControlCommandRow>(
      `INSERT INTO control_commands (
         command_id, room_id, control_session_id, session_version, command_type,
         command_payload, result_status, result_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
       RETURNING command_id, room_id, control_session_id, session_version, command_type,
                 command_payload, result_status, result_payload, created_at`,
      [
        input.commandId,
        input.roomId,
        input.controlSessionId,
        input.sessionVersion,
        input.type,
        JSON.stringify(input.payload),
        input.resultStatus,
        JSON.stringify(input.resultPayload ?? {})
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Command insert did not return a row");
    }

    return mapControlCommandRow(row);
  }

  async updateCommandResult(input: UpdateCommandResultInput): Promise<RoomSessionCommandRecord | null> {
    const result = await this.db.query<ControlCommandRow>(
      `UPDATE control_commands
       SET result_status = $2,
           result_payload = $3::jsonb
       WHERE command_id = $1
       RETURNING command_id, room_id, control_session_id, session_version, command_type,
                 command_payload, result_status, result_payload, created_at`,
      [input.commandId, input.resultStatus, JSON.stringify(input.resultPayload ?? {})]
    );

    const row = result.rows[0];
    return row ? mapControlCommandRow(row) : null;
  }
}

function mapControlCommandRow(row: ControlCommandRow): RoomSessionCommandRecord {
  return {
    commandId: row.command_id,
    roomId: row.room_id as RoomId,
    controlSessionId: row.control_session_id as ControlSessionId,
    sessionVersion: row.session_version,
    type: row.command_type as ControlCommandType,
    payload: row.command_payload,
    resultStatus: row.result_status as ControlCommandResultStatus,
    resultPayload: row.result_payload,
    createdAt: row.created_at.toISOString()
  };
}
