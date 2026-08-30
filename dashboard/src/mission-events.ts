import type { TelemetrySample } from "./types";

export interface MissionEvent {
  id: string;
  timestampUs: number;
  sequence: number;
  category: "phase" | "fault";
  severity: "info" | "warning" | "critical";
  label: string;
}

const PHASE_EVENTS: Partial<Record<TelemetrySample["missionPhase"], string>> = {
  POWERED_ASCENT: "LIFTOFF / POWERED ASCENT",
  COAST: "MAIN ENGINE CUTOFF",
  DESCENT: "APOGEE / DESCENT INITIATED",
  LANDING_BURN: "LANDING BURN IGNITION",
  LANDED: "TOUCHDOWN",
  TERMINATED: "SIMULATED FLIGHT TERMINATED",
};

const FAULTS = [
  { mask: 1, label: "THRUSTER LOSS", severity: "critical" as const },
  { mask: 2, label: "SENSOR NOISE", severity: "warning" as const },
  { mask: 4, label: "PACKET LOSS", severity: "warning" as const },
];

export function deriveMissionEvents(samples: TelemetrySample[]): MissionEvent[] {
  const events: MissionEvent[] = [];
  let previous: TelemetrySample | undefined;
  for (const sample of samples) {
    if (previous && sample.missionPhase !== previous.missionPhase) {
      const touchdownSpeed = Math.abs(previous.truthVelocityMps[2]);
      const label = sample.missionPhase === "LANDED"
        ? touchdownSpeed <= 3 ? "SOFT TOUCHDOWN"
          : touchdownSpeed <= 8 ? "HARD LANDING" : "VEHICLE IMPACT"
        : PHASE_EVENTS[sample.missionPhase];
      if (label) events.push({
        id: `${sample.sequence}-phase-${sample.missionPhase}`,
        timestampUs: sample.timestampUs,
        sequence: sample.sequence,
        category: "phase",
        severity: label === "HARD LANDING" ? "warning" :
          label === "VEHICLE IMPACT" || sample.missionPhase === "TERMINATED" ? "critical" : "info",
        label,
      });
    }
    if (previous) {
      const changed = previous.faultFlags ^ sample.faultFlags;
      for (const fault of FAULTS) {
        if ((changed & fault.mask) === 0) continue;
        const active = (sample.faultFlags & fault.mask) !== 0;
        events.push({
          id: `${sample.sequence}-fault-${fault.mask}`,
          timestampUs: sample.timestampUs,
          sequence: sample.sequence,
          category: "fault",
          severity: active ? fault.severity : "info",
          label: `${fault.label} ${active ? "ACTIVE" : "CLEARED"}`,
        });
      }
    }
    previous = sample;
  }
  return events;
}
