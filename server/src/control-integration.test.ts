import { once } from "node:events";
import { createServer, type Server as TcpServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { TelemetryServer } from "./server.js";
import type { ServerMessage } from "./types.js";

const UDP_PORT = 18_510;
const WS_PORT = 18_081;
const CONTROL_PORT = 18_511;
let telemetryServer: TelemetryServer | undefined;
let controlServer: TcpServer | undefined;
let client: WebSocket | undefined;

function waitForType(socket: WebSocket, type: ServerMessage["type"]): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const listener = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.type === type) { socket.off("message", listener); resolve(message); }
    };
    socket.on("message", listener);
  });
}

afterEach(async () => {
  client?.close();
  await telemetryServer?.stop();
  await new Promise<void>((resolve) => controlServer?.close(() => resolve()) ?? resolve());
});

describe("browser to simulator control integration", () => {
  it("forwards a validated command and broadcasts its acknowledgement", async () => {
    controlServer = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (line: string) => {
        expect(line).toBe("COMMAND\ttest-command-1\tthruster_loss\t1\n");
        socket.write("ACK\ttest-command-1\tthruster_loss\t1\n");
      });
    });
    controlServer.listen(CONTROL_PORT, "127.0.0.1");
    await once(controlServer, "listening");

    telemetryServer = new TelemetryServer({
      udpHost: "127.0.0.1", udpPort: UDP_PORT,
      wsHost: "127.0.0.1", wsPort: WS_PORT, historyCapacity: 10,
      controlHost: "127.0.0.1", controlPort: CONTROL_PORT,
    });
    await telemetryServer.start();
    await new Promise((resolve) => setTimeout(resolve, 25));

    client = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    const history = waitForType(client, "history");
    const controlStatus = waitForType(client, "control_status");
    await once(client, "open");
    expect(await history).toMatchObject({ type: "history" });
    expect(await controlStatus).toEqual({ type: "control_status", connected: true });

    const acknowledgement = waitForType(client, "command_ack");
    client.send(JSON.stringify({
      type: "command", id: "test-command-1", control: "thruster_loss",
      enabled: true, issuedAtMs: Date.now(),
    }));
    expect(await acknowledgement).toMatchObject({
      type: "command_ack", id: "test-command-1", control: "thruster_loss", enabled: true,
    });
  });
});
