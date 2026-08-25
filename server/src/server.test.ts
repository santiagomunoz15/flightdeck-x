import { describe, expect, it } from "vitest";
import { TelemetryServer } from "./server.js";
import { telemetryFixture } from "./test-fixture.js";

describe("TelemetryServer", () => {
  it("validates, tracks sequence gaps, and bounds history", () => {
    const server = new TelemetryServer({ udpHost: "127.0.0.1", udpPort: 5000, wsHost: "127.0.0.1", wsPort: 8080, historyCapacity: 2 });
    server.acceptPacket(telemetryFixture(10));
    server.acceptPacket(telemetryFixture(12));
    server.acceptPacket(telemetryFixture(13));
    const corrupt = telemetryFixture(14);
    corrupt[30] = (corrupt[30] ?? 0) ^ 1;
    server.acceptPacket(corrupt);

    expect(server.metrics).toEqual({ received: 4, valid: 3, rejected: 1, lost: 1, reordered: 0 });
    expect(server.history.map((sample) => sample.sequence)).toEqual([12, 13]);
  });
});
