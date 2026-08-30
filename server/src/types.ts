export const missionPhases = ["PRELAUNCH", "POWERED_ASCENT", "COAST", "DESCENT", "LANDING_BURN", "LANDED", "TERMINATED"] as const;
export type MissionPhase = (typeof missionPhases)[number];

export interface TelemetrySample {
  sequence: number;
  timestampUs: number;
  missionPhase: MissionPhase;
  positionM: [number, number, number];
  velocityMps: [number, number, number];
  orientationWxyz: [number, number, number, number];
  thrustPercent: number;
  chamberPressureMpa: number;
  faultFlags: number;
  truthPositionM: [number, number, number];
  truthVelocityMps: [number, number, number];
  serverReceivedAtMs: number;
}

export interface StreamMetrics {
  received: number;
  valid: number;
  rejected: number;
  lost: number;
  reordered: number;
}

export type FaultType = "thruster_loss" | "sensor_noise" | "packet_loss";
export type ControlType = FaultType | "pause" | "abort" | "fts";
export interface ControlCommand { type: "command"; id: string; control: ControlType; enabled: boolean; issuedAtMs: number; }
export type ClientMessage = ControlCommand;

export type ServerMessage =
  | { type: "history"; samples: TelemetrySample[]; metrics: StreamMetrics }
  | { type: "reset"; metrics: StreamMetrics }
  | { type: "telemetry"; sample: TelemetrySample; metrics: StreamMetrics }
  | { type: "control_status"; connected: boolean }
  | { type: "command_ack"; id: string; control: ControlType; enabled: boolean; acknowledgedAtMs: number }
  | { type: "command_error"; id?: string; message: string };
