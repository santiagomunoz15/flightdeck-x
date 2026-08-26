import { describe, expect, it } from "vitest";
import { chartSamples, dynamicPressureKpa, speedMps, startsNewFlight } from "./telemetry-utils";
import type { TelemetrySample } from "./types";

const sample = (sequence: number): TelemetrySample => ({ sequence, timestampUs: sequence * 10_000, missionPhase: "COAST", positionM: [0, 0, 0], velocityMps: [3, 4, 0], orientationWxyz: [1, 0, 0, 0], thrustPercent: 0, chamberPressureMpa: 0, faultFlags: 0, truthPositionM: [0, 0, 0], truthVelocityMps: [3, 4, 0], serverReceivedAtMs: 0 });

describe("telemetry helpers", () => {
  it("calculates speed and sea-level dynamic pressure", () => {
    expect(speedMps(sample(1))).toBe(5);
    expect(dynamicPressureKpa(sample(1))).toBeCloseTo(0.0153125);
  });
  it("bounds chart data while retaining the newest sample", () => {
    const values = Array.from({ length: 1000 }, (_, index) => sample(index));
    const result = chartSamples(values, 100);
    expect(result.length).toBeLessThanOrEqual(101);
    expect(result.at(-1)?.sequence).toBe(999);
  });
  it("detects sequence and simulation-clock restarts", () => {
    const previous = { ...sample(6902), timestampUs: 69_030_000 };
    expect(startsNewFlight(previous, sample(0))).toBe(true);
    expect(startsNewFlight(previous, { ...sample(7), timestampUs: 70_000 })).toBe(true);
    expect(startsNewFlight(previous, { ...sample(6903), timestampUs: 69_040_000 })).toBe(false);
  });
});
