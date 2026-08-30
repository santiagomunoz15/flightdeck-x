import { createConnection, type Socket } from "node:net";
import type { ControlCommand, ControlType } from "./types.js";

interface ControlCallbacks {
  onStatus(connected: boolean): void;
  onAcknowledgement(id: string, control: ControlType, enabled: boolean): void;
}

export class SimulatorControlClient {
  #socket: Socket | undefined;
  #pending = new Map<string, ControlCommand>();
  #buffer = "";
  #running = false;
  #connected = false;
  #reconnectTimer: NodeJS.Timeout | undefined;

  constructor(readonly host: string, readonly port: number, readonly callbacks: ControlCallbacks) {}
  get connected(): boolean { return this.#connected; }

  start(): void { this.#running = true; this.#connect(); }
  send(command: ControlCommand): void {
    this.#pending.set(command.id, command);
    this.#write(command);
  }
  stop(): void {
    this.#running = false;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#socket?.destroy();
    this.#setConnected(false);
  }

  #connect(): void {
    if (!this.#running || this.#socket) return;
    const socket = createConnection({ host: this.host, port: this.port });
    this.#socket = socket;
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      this.#setConnected(true);
      for (const command of this.#pending.values()) this.#write(command);
    });
    socket.on("data", (chunk: string) => this.#acceptData(chunk));
    socket.on("error", () => undefined);
    socket.on("close", () => {
      this.#socket = undefined;
      this.#buffer = "";
      this.#setConnected(false);
      if (this.#running) this.#reconnectTimer = setTimeout(() => this.#connect(), 500);
    });
  }

  #write(command: ControlCommand): void {
    if (!this.#connected || !this.#socket) return;
    this.#socket.write(`COMMAND\t${command.id}\t${command.control}\t${command.enabled ? 1 : 0}\n`);
  }

  #acceptData(chunk: string): void {
    this.#buffer += chunk;
    for (let newline; (newline = this.#buffer.indexOf("\n")) >= 0;) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      const [verb, id, control, enabled] = line.split("\t");
      if (verb !== "ACK" || !id || !isControl(control) || (enabled !== "0" && enabled !== "1")) continue;
      this.#pending.delete(id);
      this.callbacks.onAcknowledgement(id, control, enabled === "1");
    }
  }

  #setConnected(connected: boolean): void {
    if (this.#connected === connected) return;
    this.#connected = connected;
    this.callbacks.onStatus(connected);
  }
}

export function isControl(value: unknown): value is ControlType {
  return value === "thruster_loss" || value === "sensor_noise" || value === "packet_loss" ||
    value === "pause" || value === "abort" || value === "fts";
}
