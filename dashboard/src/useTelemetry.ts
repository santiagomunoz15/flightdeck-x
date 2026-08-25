import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus, ServerMessage, StreamMetrics, TelemetrySample } from "./types";

const EMPTY_METRICS: StreamMetrics = { received: 0, valid: 0, rejected: 0, lost: 0, reordered: 0 };
const MAX_CLIENT_SAMPLES = 6000;

export function useTelemetry(url: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [metrics, setMetrics] = useState<StreamMetrics>(EMPTY_METRICS);
  const [transportLatencyMs, setTransportLatencyMs] = useState(0);
  const [lastPacketAt, setLastPacketAt] = useState<number>();
  const reconnectAttempt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let frame: number | undefined;
    let pending: TelemetrySample[] = [];
    let replaceWithHistory = false;
    let pendingMetrics: StreamMetrics | undefined;

    const flush = () => {
      frame = undefined;
      if (pending.length > 0) {
        const incoming = pending;
        pending = [];
        const latest = incoming.at(-1);
        setSamples((current) => replaceWithHistory
          ? incoming.slice(-MAX_CLIENT_SAMPLES)
          : [...current, ...incoming].slice(-MAX_CLIENT_SAMPLES));
        replaceWithHistory = false;
        if (latest) {
          const now = Date.now();
          setLastPacketAt(now);
          setTransportLatencyMs(Math.max(0, now - latest.serverReceivedAtMs));
        }
      }
      if (pendingMetrics) { setMetrics(pendingMetrics); pendingMetrics = undefined; }
    };

    const scheduleFlush = () => { if (frame === undefined) frame = requestAnimationFrame(flush); };
    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      socket = new WebSocket(url);
      socket.addEventListener("open", () => { reconnectAttempt.current = 0; setStatus("connected"); });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          if (message.type === "history") {
            pending = message.samples.slice(-MAX_CLIENT_SAMPLES);
            replaceWithHistory = true;
          } else if (message.type === "reset") {
            pending = [];
            replaceWithHistory = true;
          } else pending.push(message.sample);
          pendingMetrics = message.metrics;
          scheduleFlush();
        } catch { /* Ignore malformed server messages. */ }
      });
      socket.addEventListener("close", () => {
        if (disposed) return;
        setStatus("disconnected");
        const delay = Math.min(500 * 2 ** reconnectAttempt.current, 5000);
        reconnectAttempt.current += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
      socket.addEventListener("error", () => socket?.close());
    };
    connect();
    return () => {
      disposed = true;
      socket?.close();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [url]);

  return { status, samples, latest: samples.at(-1), metrics, transportLatencyMs, lastPacketAt };
}
