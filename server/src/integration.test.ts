import { createSocket } from "node:dgram";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { TelemetryServer } from "./server.js";
import { telemetryFixture } from "./test-fixture.js";
import type { ServerMessage } from "./types.js";

const UDP_PORT = 18_500;
const WS_PORT = 18_080;
let server: TelemetryServer | undefined;
const clients: WebSocket[] = [];

async function nextMessage(client: WebSocket): Promise<ServerMessage> {
  const [data] = await once(client, "message") as [WebSocket.RawData];
  return JSON.parse(data.toString()) as ServerMessage;
}

async function connectClient(): Promise<{ client: WebSocket; first: ServerMessage }> {
  const client = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  clients.push(client);
  const firstMessage = nextMessage(client);
  await once(client, "open");
  return { client, first: await firstMessage };
}

async function sendPacket(packet: Uint8Array): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.send(packet, UDP_PORT, "127.0.0.1", (error) => error ? reject(error) : resolve());
  });
  socket.close();
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server?.stop();
  server = undefined;
});

describe("UDP to WebSocket integration", () => {
  it("backfills a second client and streams live packets to both", async () => {
    server = new TelemetryServer({ udpHost: "127.0.0.1", udpPort: UDP_PORT, wsHost: "127.0.0.1", wsPort: WS_PORT, historyCapacity: 10, controlHost: "127.0.0.1", controlPort: 18_501 });
    await server.start();

    const firstClient = await connectClient();
    expect(firstClient.first).toMatchObject({ type: "history", samples: [] });

    for (const sequence of [1, 2, 3]) {
      const live = nextMessage(firstClient.client);
      await sendPacket(telemetryFixture(sequence));
      expect(await live).toMatchObject({ type: "telemetry", sample: { sequence } });
    }

    const secondClient = await connectClient();
    expect(secondClient.first).toMatchObject({
      type: "history",
      samples: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }],
    });

    const firstLive = nextMessage(firstClient.client);
    const secondLive = nextMessage(secondClient.client);
    await sendPacket(telemetryFixture(4));
    expect(await firstLive).toMatchObject({ type: "telemetry", sample: { sequence: 4 } });
    expect(await secondLive).toMatchObject({ type: "telemetry", sample: { sequence: 4 } });
  });
});
