import { useEffect, useRef, useState } from "react";
import { displaySamples, shouldRetainSample, startsNewFlight } from "./telemetry-utils";
import type { CommandState, ConnectionStatus, ControlType, ServerMessage, StreamMetrics, TelemetrySample } from "./types";

const EMPTY_METRICS: StreamMetrics = { received: 0, valid: 0, rejected: 0, lost: 0, reordered: 0 };
const MAX_CLIENT_SAMPLES = 2000;

export function useTelemetry(url: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [metrics, setMetrics] = useState<StreamMetrics>(EMPTY_METRICS);
  const [transportLatencyMs, setTransportLatencyMs] = useState(0);
  const [lastPacketAt, setLastPacketAt] = useState<number>();
  const [controlConnected, setControlConnected] = useState(false);
  const [commandState, setCommandState] = useState<CommandState>();
  const [paused, setPaused] = useState(false);
  const reconnectAttempt = useRef(0);
  const socketRef = useRef<WebSocket | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let frame: number | undefined;
    let pending: TelemetrySample[] = [];
    let replaceWithHistory = false;
    let pendingMetrics: StreamMetrics | undefined;
    let latestSample: TelemetrySample | undefined;
    let latestRetainedSample: TelemetrySample | undefined;

    const flush = () => {
      frame = undefined;
      if (replaceWithHistory || pending.length > 0) {
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
        } else {
          setLastPacketAt(undefined);
          setTransportLatencyMs(0);
        }
      }
      if (pendingMetrics) { setMetrics(pendingMetrics); pendingMetrics = undefined; }
    };

    const scheduleFlush = () => { if (frame === undefined) frame = requestAnimationFrame(flush); };
    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      socket = new WebSocket(url);
      socketRef.current = socket;
      socket.addEventListener("open", () => { reconnectAttempt.current = 0; setStatus("connected"); });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          if (message.type === "control_status") {
            setControlConnected(message.connected);
            return;
          }
          if (message.type === "command_ack") {
            setCommandState({ id: message.id, control: message.control, enabled: message.enabled, status: "acknowledged" });
            if (message.control === "pause") setPaused(message.enabled);
            return;
          }
          if (message.type === "command_error") {
            setCommandState((current) => ({
              id: message.id ?? current?.id ?? "unknown",
              control: current?.control ?? "thruster_loss",
              enabled: current?.enabled ?? false,
              status: "failed",
              message: message.message,
            }));
            return;
          }
          if (message.type === "history") {
            latestSample = message.samples.at(-1);
            pending = displaySamples(message.samples).slice(-MAX_CLIENT_SAMPLES);
            latestRetainedSample = pending.at(-1);
            replaceWithHistory = true;
          } else if (message.type === "reset") {
            pending = [];
            latestSample = undefined;
            latestRetainedSample = undefined;
            replaceWithHistory = true;
          } else {
            if (startsNewFlight(latestSample, message.sample)) {
              pending = [];
              latestRetainedSample = undefined;
              replaceWithHistory = true;
            }
            if (shouldRetainSample(latestRetainedSample, message.sample)) {
              pending.push(message.sample);
              latestRetainedSample = message.sample;
            }
            latestSample = message.sample;
          }
          pendingMetrics = message.metrics;
          scheduleFlush();
        } catch { /* Ignore malformed server messages. */ }
      });
      socket.addEventListener("close", () => {
        if (disposed) return;
        setStatus("disconnected");
        setControlConnected(false);
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
      socketRef.current = undefined;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [url]);

  const sendControlCommand = (control: ControlType, enabled: boolean) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !controlConnected) return false;
    const id = crypto.randomUUID();
    socket.send(JSON.stringify({ type: "command", id, control, enabled, issuedAtMs: Date.now() }));
    setCommandState({ id, control, enabled, status: "pending" });
    return true;
  };

  return { status, samples, latest: samples.at(-1), metrics, transportLatencyMs, lastPacketAt, controlConnected, commandState, paused, sendControlCommand };
}
