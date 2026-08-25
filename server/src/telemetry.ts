import { crc32 } from "./crc32.js";
import { missionPhases, type TelemetrySample } from "./types.js";

export const TELEMETRY_MAGIC = 0x46445831;
export const TELEMETRY_VERSION = 1;
export const TELEMETRY_PACKET_SIZE = 99;
export const CRC_OFFSET = 95;

export type DecodeError = "wrong_size" | "wrong_magic" | "unsupported_version" | "checksum_mismatch" | "invalid_phase" | "invalid_number";
export type DecodeResult = { ok: true; sample: TelemetrySample } | { ok: false; error: DecodeError };

export function decodeTelemetry(packet: Uint8Array, receivedAtMs = Date.now()): DecodeResult {
  if (packet.byteLength !== TELEMETRY_PACKET_SIZE) return { ok: false, error: "wrong_size" };
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint32(0, false) !== TELEMETRY_MAGIC) return { ok: false, error: "wrong_magic" };
  if (view.getUint16(4, false) !== TELEMETRY_VERSION) return { ok: false, error: "unsupported_version" };
  if (view.getUint32(CRC_OFFSET, false) !== crc32(packet.subarray(0, CRC_OFFSET))) return { ok: false, error: "checksum_mismatch" };
  const phase = missionPhases[view.getUint8(18)];
  if (phase === undefined) return { ok: false, error: "invalid_phase" };

  const sample: TelemetrySample = {
    sequence: view.getUint32(6, false), timestampUs: Number(view.getBigUint64(10, false)), missionPhase: phase,
    positionM: [view.getFloat64(19, false), view.getFloat64(27, false), view.getFloat64(35, false)],
    velocityMps: [view.getFloat64(43, false), view.getFloat64(51, false), view.getFloat64(59, false)],
    orientationWxyz: [view.getFloat32(67, false), view.getFloat32(71, false), view.getFloat32(75, false), view.getFloat32(79, false)],
    thrustPercent: view.getFloat32(83, false), chamberPressureMpa: view.getFloat32(87, false),
    faultFlags: view.getUint32(91, false), serverReceivedAtMs: receivedAtMs,
  };
  const numbers = [...sample.positionM, ...sample.velocityMps, ...sample.orientationWxyz, sample.thrustPercent, sample.chamberPressureMpa];
  return numbers.every(Number.isFinite) ? { ok: true, sample } : { ok: false, error: "invalid_number" };
}
