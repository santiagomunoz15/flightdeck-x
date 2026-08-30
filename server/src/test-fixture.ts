import { crc32 } from "./crc32.js";
import { CRC_OFFSET, TELEMETRY_MAGIC, TELEMETRY_PACKET_SIZE, TELEMETRY_VERSION } from "./telemetry.js";

export function telemetryFixture(sequence = 42, timestampUs = 1_500_000n): Uint8Array {
  const packet = new Uint8Array(TELEMETRY_PACKET_SIZE);
  const view = new DataView(packet.buffer);
  view.setUint32(0, TELEMETRY_MAGIC, false);
  view.setUint16(4, TELEMETRY_VERSION, false);
  view.setUint32(6, sequence, false);
  view.setBigUint64(10, timestampUs, false);
  view.setUint8(18, 2);
  [10, -20, 1234.5].forEach((value, index) => view.setFloat64(19 + index * 8, value, false));
  [1, 2, -3].forEach((value, index) => view.setFloat64(43 + index * 8, value, false));
  [1, 0, 0, 0].forEach((value, index) => view.setFloat32(67 + index * 4, value, false));
  view.setFloat32(83, 75.5, false);
  view.setFloat32(87, 9.25, false);
  [1.5, -0.75].forEach((value, index) => view.setFloat32(91 + index * 4, value, false));
  [12, -8].forEach((value, index) => view.setFloat32(99 + index * 4, value, false));
  view.setUint32(107, 5, false);
  [10.25, -20.25, 1234.75].forEach((value, index) => view.setFloat64(111 + index * 8, value, false));
  [1.25, 2.25, -3.25].forEach((value, index) => view.setFloat64(135 + index * 8, value, false));
  view.setUint32(CRC_OFFSET, crc32(packet.subarray(0, CRC_OFFSET)), false);
  return packet;
}
