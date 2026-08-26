import { describe, expect, it } from "vitest";
import { TelemetryServer } from "./server.js";
import { telemetryFixture } from "./test-fixture.js";

describe("TelemetryServer", () => {
  it("validates, tracks sequence gaps, and bounds history", () => {
    const server = new TelemetryServer({ udpHost: "127.0.0.1", udpPort: 5000, wsHost: "127.0.0.1", wsPort: 8080, historyCapacity: 2, controlHost: "127.0.0.1", controlPort: 5001 });
    server.acceptPacket(telemetryFixture(10));
    server.acceptPacket(telemetryFixture(12));
    server.acceptPacket(telemetryFixture(13));
    const corrupt = telemetryFixture(14);
    corrupt[30] = (corrupt[30] ?? 0) ^ 1;
    server.acceptPacket(corrupt);

    expect(server.metrics).toEqual({ received: 4, valid: 3, rejected: 1, lost: 1, reordered: 0 });
    expect(server.history.map((sample) => sample.sequence)).toEqual([12, 13]);
  });

  it("clears history and metrics when a new simulator run starts", () => {
    const server = new TelemetryServer({ udpHost: "127.0.0.1", udpPort: 5000, wsHost: "127.0.0.1", wsPort: 8080, historyCapacity: 10, controlHost: "127.0.0.1", controlPort: 5001 });
    server.acceptPacket(telemetryFixture(100));
    server.acceptPacket(telemetryFixture(102));
    server.acceptPacket(telemetryFixture(0));

    expect(server.history.map((sample) => sample.sequence)).toEqual([0]);
    expect(server.metrics).toEqual({ received: 1, valid: 1, rejected: 0, lost: 0, reordered: 0 });
  });

  it("detects a new run from a reset simulation clock when sequence zero is missed", () => {
    const server = new TelemetryServer({ udpHost: "127.0.0.1", udpPort: 5000, wsHost: "127.0.0.1", wsPort: 8080, historyCapacity: 10, controlHost: "127.0.0.1", controlPort: 5001 });
    server.acceptPacket(telemetryFixture(500, 10_000_000n));
    server.acceptPacket(telemetryFixture(7, 70_000n));

    expect(server.history.map((sample) => sample.sequence)).toEqual([7]);
    expect(server.metrics).toEqual({ received: 1, valid: 1, rejected: 0, lost: 0, reordered: 0 });
  });
});
