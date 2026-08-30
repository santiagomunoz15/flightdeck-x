export type MissionPhase = "PRELAUNCH" | "POWERED_ASCENT" | "COAST" | "DESCENT" | "LANDING_BURN" | "LANDED" | "TERMINATED";
export interface TelemetrySample {
  sequence: number; timestampUs: number; missionPhase: MissionPhase;
  positionM: [number, number, number]; velocityMps: [number, number, number];
  orientationWxyz: [number, number, number, number]; thrustPercent: number;
  chamberPressureMpa: number; faultFlags: number; serverReceivedAtMs: number;
  truthPositionM: [number, number, number]; truthVelocityMps: [number, number, number];
}
export interface StreamMetrics { received: number; valid: number; rejected: number; lost: number; reordered: number; }
export type FaultType = "thruster_loss" | "sensor_noise" | "packet_loss";
export type ControlType = FaultType | "pause" | "abort" | "fts";
export interface CommandState { id: string; control: ControlType; enabled: boolean; status: "pending" | "acknowledged" | "failed"; message?: string; }
export type ServerMessage =
  | { type: "history"; samples: TelemetrySample[]; metrics: StreamMetrics }
  | { type: "reset"; metrics: StreamMetrics }
  | { type: "telemetry"; sample: TelemetrySample; metrics: StreamMetrics }
  | { type: "control_status"; connected: boolean }
  | { type: "command_ack"; id: string; control: ControlType; enabled: boolean; acknowledgedAtMs: number }
  | { type: "command_error"; id?: string; message: string };
export type ConnectionStatus = "connecting" | "connected" | "disconnected";
