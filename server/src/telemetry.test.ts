import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32.js";
import { telemetryFixture } from "./test-fixture.js";
import { decodeTelemetry } from "./telemetry.js";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("decodeTelemetry", () => {
  it("decodes the C++ protocol layout", () => {
    const result = decodeTelemetry(telemetryFixture(), 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sample).toMatchObject({
      sequence: 42, timestampUs: 1_500_000, missionPhase: "COAST",
      positionM: [10, -20, 1234.5], velocityMps: [1, 2, -3],
      orientationWxyz: [1, 0, 0, 0], thrustPercent: 75.5,
      chamberPressureMpa: 9.25, faultFlags: 5, serverReceivedAtMs: 1000,
    });
  });

  it("rejects bad sizes and corruption", () => {
    expect(decodeTelemetry(new Uint8Array(98))).toEqual({ ok: false, error: "wrong_size" });
    const corrupt = telemetryFixture();
    corrupt[20] = (corrupt[20] ?? 0) ^ 1;
    expect(decodeTelemetry(corrupt)).toEqual({ ok: false, error: "checksum_mismatch" });
  });
});
