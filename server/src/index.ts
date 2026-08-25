import { TelemetryServer } from "./server.js";

function integerEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const server = new TelemetryServer({
  udpHost: process.env.UDP_HOST ?? "127.0.0.1", udpPort: integerEnvironment("UDP_PORT", 5000),
  wsHost: process.env.WS_HOST ?? "127.0.0.1", wsPort: integerEnvironment("WS_PORT", 8080),
  historyCapacity: integerEnvironment("HISTORY_CAPACITY", 6000),
});
await server.start();
console.log(`UDP telemetry: ${server.options.udpHost}:${server.options.udpPort}`);
console.log(`WebSocket stream: ws://${server.options.wsHost}:${server.options.wsPort}`);

async function shutdown(): Promise<void> { console.log("Shutting down telemetry server..."); await server.stop(); process.exit(0); }
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
