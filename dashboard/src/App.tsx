import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deriveMissionEvents, type MissionEvent } from "./mission-events";
import { RocketView } from "./RocketView";
import { chartSamples, dynamicPressureKpa, speedMps } from "./telemetry-utils";
import type { ConnectionStatus, TelemetrySample } from "./types";
import { useTelemetry } from "./useTelemetry";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8080";
const IDENTITY: [number, number, number, number] = [1, 0, 0, 0];

function statusText(status: ConnectionStatus) { return status === "connected" ? "LINK NOMINAL" : status === "connecting" ? "ACQUIRING SIGNAL" : "LINK LOST"; }
function format(value: number | undefined, digits = 1) { return value === undefined ? "—" : value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }); }

function Metric({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "metric-accent" : ""}`}><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>;
}

const FAULTS = [
  { type: "thruster_loss" as const, mask: 1, label: "THRUSTER LOSS", detail: "LIMIT OUTPUT TO 60%" },
  { type: "sensor_noise" as const, mask: 2, label: "SENSOR NOISE", detail: "SEEDED ALT / VEL NOISE" },
  { type: "packet_loss" as const, mask: 4, label: "PACKET LOSS", detail: "DROP EVERY 10TH SAMPLE" },
];

function TelemetryChart({ samples, events }: { samples: TelemetrySample[]; events: MissionEvent[] }) {
  const data = useMemo(() => chartSamples(samples).map((sample) => ({ time: sample.timestampUs / 1e6, altitude: sample.positionM[2], velocity: sample.velocityMps[2], truthAltitude: sample.truthPositionM[2], truthVelocity: sample.truthVelocityMps[2], pressure: dynamicPressureKpa(sample) })), [samples]);
  return (
    <div className="chart-wrap">
      <div className="panel-heading"><div><span>FLIGHT PROFILE</span><h2>Measured and truth telemetry</h2></div><div className="legend"><i className="altitude" />Measured <i className="truth" />Truth <i className="velocity" />Velocity</div></div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#547078" strokeOpacity={0.14} strokeWidth={0.75} horizontal={false} vertical />
          <CartesianGrid stroke="#6f888f" strokeOpacity={0.24} strokeWidth={0.75} horizontal vertical={false} />
          <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value: number) => value === 0 ? "0" : `${value.toFixed(1)}s`} stroke="#547078" tickLine={false} axisLine={false} />
          <YAxis yAxisId="alt" tickFormatter={(value: number) => `${Math.round(value)}m`} stroke="#547078" tickLine={false} axisLine={false} width={78} />
          <YAxis yAxisId="vel" orientation="right" tickFormatter={(value: number) => `${value.toFixed(1)}m/s`} stroke="#547078" tickLine={false} axisLine={false} width={76} />
          <Tooltip
            contentStyle={{ background: "#0d171c", border: "1px solid #29434b", borderRadius: 2 }}
            labelFormatter={(value) => `T+ ${Number(value).toFixed(3)} s`}
            formatter={(value, name) => [
              `${Number(value).toFixed(3)} ${String(name).toLowerCase().includes("altitude") ? "m" : "m/s"}`,
              ({ altitude: "Measured altitude", velocity: "Measured velocity", truthAltitude: "Truth altitude", truthVelocity: "Truth velocity" } as Record<string, string>)[String(name)] ?? String(name),
            ]}
          />
          {events.filter((event) => event.category === "fault").map((event) => (
            <ReferenceLine
              key={event.id}
              x={event.timestampUs / 1e6}
              stroke={event.severity === "critical" ? "#e96d42" : "#e8ae4a"}
              strokeDasharray="3 3"
              strokeOpacity={0.8}
              label={{ value: "FAULT", position: "insideTop", fill: "#e8ae4a", fontSize: 8 }}
            />
          ))}
          <Line yAxisId="alt" type="monotone" dataKey="truthAltitude" stroke="#a8bbc0" strokeDasharray="4 4" dot={false} strokeWidth={1.2} isAnimationActive={false} />
          <Line yAxisId="vel" type="monotone" dataKey="truthVelocity" stroke="#a8bbc0" strokeDasharray="4 4" dot={false} strokeWidth={1.2} isAnimationActive={false} />
          <Line yAxisId="alt" type="monotone" dataKey="altitude" stroke="#67d6c7" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line yAxisId="vel" type="monotone" dataKey="velocity" stroke="#e96d42" dot={false} strokeWidth={1.6} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EventLog({ events }: { events: MissionEvent[] }) {
  const visible = events.slice(-8).reverse();
  return (
    <section className="event-log panel">
      <div className="panel-heading"><div><span>MISSION EVENTS</span><h2>Flight and anomaly log</h2></div><b>{events.length} EVENTS</b></div>
      <div className="event-list">
        {visible.length === 0 && <div className="event-empty">AWAITING FLIGHT EVENTS</div>}
        {visible.map((event) => (
          <div className={`event-row ${event.severity}`} key={event.id}>
            <time>T+ {(event.timestampUs / 1e6).toFixed(3)}s</time>
            <i />
            <strong>{event.label}</strong>
            <span>SEQ {String(event.sequence).padStart(6, "0")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const telemetry = useTelemetry(WS_URL);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frame = 0, count = 0, last = performance.now(), handle = 0;
    const tick = (now: number) => { count += 1; if (now - last >= 1000) { setFps(Math.round(count * 1000 / (now - last))); count = 0; last = now; } handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick); return () => cancelAnimationFrame(handle);
  }, []);

  const sample = telemetry.latest;
  const altitude = sample?.positionM[2];
  const speed = sample ? speedMps(sample) : undefined;
  const dynamicPressure = sample ? dynamicPressureKpa(sample) : undefined;
  const altitudeResidual = sample ? sample.positionM[2] - sample.truthPositionM[2] : undefined;
  const velocityResidual = sample ? sample.velocityMps[2] - sample.truthVelocityMps[2] : undefined;
  const landingError = sample ? 1000 - sample.positionM[0] : undefined;
  const packetAge = telemetry.lastPacketAt ? Math.max(0, Date.now() - telemetry.lastPacketAt) : undefined;
  const nominal = telemetry.status === "connected" && (sample?.faultFlags ?? 0) === 0;
  const healthText = telemetry.status !== "connected"
    ? "CHECK TELEMETRY LINK"
    : (sample?.faultFlags ?? 0) !== 0 ? "FAULT CONDITION ACTIVE" : "ALL SYSTEMS NOMINAL";
  const trajectory = useMemo(
    () => chartSamples(telemetry.samples, 500).map((item) => item.positionM),
    [telemetry.samples],
  );
  const events = useMemo(() => deriveMissionEvents(telemetry.samples), [telemetry.samples]);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><div className="brand-mark">FX</div><div><span>FLIGHTDECK X</span><small>REAL-TIME VEHICLE TELEMETRY</small></div></div>
        <div className="mission-clock"><span>MISSION ELAPSED TIME</span><strong>T+ {format(sample ? sample.timestampUs / 1e6 : undefined, 2)} <small>SEC</small></strong></div>
        <div className={`link-state ${telemetry.status}`}><i /><div><span>{statusText(telemetry.status)}</span><small>{WS_URL.replace("ws://", "")}</small></div></div>
      </header>

      <section className="mission-strip">
        <div><span>MISSION</span><strong>FDX-02 / 1 KM HOP</strong></div>
        <div><span>FLIGHT PHASE</span><strong className="phase">{sample?.missionPhase ?? "STANDBY"}</strong></div>
        <div><span>VEHICLE HEALTH</span><strong className={nominal ? "good" : "warn"}>{healthText}</strong></div>
        <div><span>PACKET SEQUENCE</span><strong>{sample ? String(sample.sequence).padStart(6, "0") : "———"}</strong></div>
      </section>

      <section className="dashboard-grid">
        <div className="left-column">
          <div className="metrics-grid">
            <Metric label="ALTITUDE" value={format(altitude, 1)} unit="METERS" accent />
            <Metric label="VELOCITY" value={format(speed, 1)} unit="M / S" />
            <Metric label="THRUST" value={format(sample?.thrustPercent, 1)} unit="PERCENT" />
            <Metric label="DYNAMIC PRESSURE" value={format(dynamicPressure, 2)} unit="KPA" />
          </div>
          <TelemetryChart samples={telemetry.samples} events={events} />
          <EventLog events={events} />
        </div>

        <div className="right-column">
          <section className="attitude-panel panel">
            <div className="panel-heading"><div><span>GUIDANCE</span><h2>Vehicle attitude</h2></div><b>QUATERNION</b></div>
            <RocketView orientation={sample?.orientationWxyz ?? IDENTITY} position={sample?.positionM ?? [0, 0, 0]} verticalVelocity={sample?.velocityMps[2] ?? 0} missionPhase={sample?.missionPhase ?? "PRELAUNCH"} trail={trajectory} thrustPercent={sample?.thrustPercent ?? 0} />
            <div className="quaternion-readout">{["W", "X", "Y", "Z"].map((label, index) => <div key={label}><span>{label}</span><strong>{format(sample?.orientationWxyz[index], 3)}</strong></div>)}</div>
          </section>

          <section className="systems panel">
            <div className="panel-heading"><div><span>PROPULSION</span><h2>Engine health</h2></div><i className={nominal ? "health-dot" : "health-dot warn"} /></div>
            <div className="system-row"><span>CHAMBER PRESSURE</span><strong>{format(sample?.chamberPressureMpa, 2)} <small>MPA</small></strong></div>
            <div className="system-row"><span>FAULT REGISTER</span><strong>{sample ? `0x${sample.faultFlags.toString(16).padStart(8, "0")}` : "—"}</strong></div>
            <div className="system-row"><span>ALTITUDE RESIDUAL</span><strong>{format(altitudeResidual, 3)} <small>M</small></strong></div>
            <div className="system-row"><span>VELOCITY RESIDUAL</span><strong>{format(velocityResidual, 3)} <small>M/S</small></strong></div>
            <div className="system-row"><span>DOWNRANGE</span><strong>{format(sample?.positionM[0], 1)} <small>M</small></strong></div>
            <div className="system-row"><span>LANDING ERROR</span><strong>{format(landingError, 1)} <small>M</small></strong></div>
          </section>

          <section className="fault-panel panel">
            <div className="panel-heading"><div><span>TEST CONTROL</span><h2>Fault injection</h2></div><b className={telemetry.controlConnected ? "control-online" : "control-offline"}>{telemetry.controlConnected ? "SIM LINK READY" : "SIM OFFLINE"}</b></div>
            <div className="fault-list">
              {FAULTS.map((fault) => {
                const active = ((sample?.faultFlags ?? 0) & fault.mask) !== 0;
                const pending = telemetry.commandState?.status === "pending" && telemetry.commandState.fault === fault.type;
                return (
                  <button key={fault.type} className={`fault-control ${active ? "active" : ""}`} disabled={!telemetry.controlConnected || pending} onClick={() => telemetry.sendFaultCommand(fault.type, !active)}>
                    <i /><span><strong>{fault.label}</strong><small>{fault.detail}</small></span><b>{pending ? "SENDING" : active ? "ACTIVE" : "ARM"}</b>
                  </button>
                );
              })}
            </div>
            <div className={`command-state ${telemetry.commandState?.status ?? "idle"}`}>
              {telemetry.commandState ? `${telemetry.commandState.status.toUpperCase()} / ${telemetry.commandState.fault.replace("_", " ").toUpperCase()}${telemetry.commandState.message ? ` / ${telemetry.commandState.message}` : ""}` : "AWAITING OPERATOR COMMAND"}
            </div>
          </section>
        </div>
      </section>

      <footer>
        <span>STREAM <b>{telemetry.metrics.valid.toLocaleString()}</b> VALID</span>
        <span>LOSS <b>{telemetry.metrics.lost}</b></span>
        <span>REJECTED <b>{telemetry.metrics.rejected}</b></span>
        <span>TRANSPORT <b>{telemetry.transportLatencyMs} MS</b></span>
        <span>PACKET AGE <b>{packetAge === undefined ? "—" : `${packetAge} MS`}</b></span>
        <span>RENDER <b>{fps} FPS</b></span>
      </footer>
    </main>
  );
}
