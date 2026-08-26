import { describe, expect, it } from "vitest";
import { deriveMissionEvents } from "./mission-events";
import type { MissionPhase, TelemetrySample } from "./types";

function sample(sequence: number, missionPhase: MissionPhase, faultFlags = 0): TelemetrySample {
  return { sequence, timestampUs: sequence * 10_000, missionPhase, positionM: [0, 0, 0], velocityMps: [0, 0, 0], orientationWxyz: [1, 0, 0, 0], thrustPercent: 0, chamberPressureMpa: 0, faultFlags, serverReceivedAtMs: 0 };
}

describe("deriveMissionEvents", () => {
  it("detects phase transitions and fault edges once", () => {
    const events = deriveMissionEvents([
      sample(0, "PRELAUNCH"), sample(200, "POWERED_ASCENT"),
      sample(300, "POWERED_ASCENT", 1), sample(301, "POWERED_ASCENT", 1),
      sample(400, "COAST", 0), sample(500, "DESCENT"),
    ]);
    expect(events.map((event) => event.label)).toEqual([
      "LIFTOFF / POWERED ASCENT", "THRUSTER LOSS ACTIVE",
      "MAIN ENGINE CUTOFF", "THRUSTER LOSS CLEARED",
      "APOGEE / DESCENT INITIATED",
    ]);
  });
});
