const table = new Uint32Array(256);
for (let value = 0; value < table.length; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  table[value] = crc >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}
