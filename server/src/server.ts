import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { WebSocket, WebSocketServer } from "ws";
import { CircularBuffer } from "./circular-buffer.js";
import { SequenceTracker } from "./sequence-tracker.js";
import { decodeTelemetry } from "./telemetry.js";
import type { ServerMessage, StreamMetrics, TelemetrySample } from "./types.js";

export interface ServerOptions { udpHost: string; udpPort: number; wsHost: string; wsPort: number; historyCapacity: number; }

export class TelemetryServer {
  readonly #history: CircularBuffer<TelemetrySample>;
  readonly #sequence = new SequenceTracker();
  readonly #metrics: StreamMetrics = { received: 0, valid: 0, rejected: 0, lost: 0, reordered: 0 };
  #udp: UdpSocket | undefined;
  #websocket: WebSocketServer | undefined;
  constructor(readonly options: ServerOptions) { this.#history = new CircularBuffer(options.historyCapacity); }

  async start(): Promise<void> {
    this.#websocket = new WebSocketServer({ host: this.options.wsHost, port: this.options.wsPort });
    this.#websocket.on("connection", (client) => this.#send(client, { type: "history", samples: this.#history.toArray(), metrics: this.metrics }));
    this.#udp = createSocket("udp4");
    this.#udp.on("message", (packet) => this.acceptPacket(packet));
    await new Promise<void>((resolve, reject) => {
      this.#udp?.once("error", reject);
      this.#udp?.bind(this.options.udpPort, this.options.udpHost, resolve);
    });
  }

  acceptPacket(packet: Uint8Array): void {
    this.#metrics.received += 1;
    const result = decodeTelemetry(packet);
    if (!result.ok) { this.#metrics.rejected += 1; return; }
    this.#metrics.valid += 1;
    this.#sequence.observe(result.sample.sequence);
    this.#metrics.lost = this.#sequence.lost;
    this.#metrics.reordered = this.#sequence.reordered;
    this.#history.push(result.sample);
    this.#broadcast({ type: "telemetry", sample: result.sample, metrics: this.metrics });
  }

  get metrics(): StreamMetrics { return { ...this.#metrics }; }
  get history(): TelemetrySample[] { return this.#history.toArray(); }
  async stop(): Promise<void> {
    await Promise.all([
      new Promise<void>((resolve) => this.#udp?.close(() => resolve()) ?? resolve()),
      new Promise<void>((resolve) => this.#websocket?.close(() => resolve()) ?? resolve()),
    ]);
    this.#udp = undefined;
    this.#websocket = undefined;
  }
  #send(client: WebSocket, message: ServerMessage): void { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message)); }
  #broadcast(message: ServerMessage): void {
    const encoded = JSON.stringify(message);
    for (const client of this.#websocket?.clients ?? []) if (client.readyState === WebSocket.OPEN) client.send(encoded);
  }
}
