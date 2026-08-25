import { crc32 } from "./crc32.js";
import { CRC_OFFSET, TELEMETRY_MAGIC, TELEMETRY_PACKET_SIZE, TELEMETRY_VERSION } from "./telemetry.js";

export function telemetryFixture(sequence = 42): Uint8Array {
  const packet = new Uint8Array(TELEMETRY_PACKET_SIZE);
  const view = new DataView(packet.buffer);
  view.setUint32(0, TELEMETRY_MAGIC, false);
  view.setUint16(4, TELEMETRY_VERSION, false);
  view.setUint32(6, sequence, false);
  view.setBigUint64(10, 1_500_000n, false);
  view.setUint8(18, 2);
  [10, -20, 1234.5].forEach((value, index) => view.setFloat64(19 + index * 8, value, false));
  [1, 2, -3].forEach((value, index) => view.setFloat64(43 + index * 8, value, false));
  [1, 0, 0, 0].forEach((value, index) => view.setFloat32(67 + index * 4, value, false));
  view.setFloat32(83, 75.5, false);
  view.setFloat32(87, 9.25, false);
  view.setUint32(91, 5, false);
  view.setUint32(CRC_OFFSET, crc32(packet.subarray(0, CRC_OFFSET)), false);
  return packet;
}
