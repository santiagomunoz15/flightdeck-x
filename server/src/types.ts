export const missionPhases = ["PRELAUNCH", "POWERED_ASCENT", "COAST", "DESCENT", "LANDING_BURN", "LANDED"] as const;
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
export interface FaultCommand { type: "command"; id: string; fault: FaultType; enabled: boolean; issuedAtMs: number; }
export type ClientMessage = FaultCommand;

export type ServerMessage =
  | { type: "history"; samples: TelemetrySample[]; metrics: StreamMetrics }
  | { type: "reset"; metrics: StreamMetrics }
  | { type: "telemetry"; sample: TelemetrySample; metrics: StreamMetrics }
  | { type: "control_status"; connected: boolean }
  | { type: "command_ack"; id: string; fault: FaultType; enabled: boolean; acknowledgedAtMs: number }
  | { type: "command_error"; id?: string; message: string };
