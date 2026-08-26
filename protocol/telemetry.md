# FlightDeck X Telemetry Protocol

Protocol version: **1**

Each UDP datagram contains exactly one 147-byte telemetry packet. Multi-byte
values use network byte order (big-endian). Floating-point values use their
IEEE 754 binary representation, with those bits written in big-endian order.

## Packet layout

| Offset | Size | Field | Type | Unit | Description |
|---:|---:|---|---|---|---|
| 0 | 4 | `magic` | `uint32` | — | `0x46445831` (ASCII `FDX1`) |
| 4 | 2 | `version` | `uint16` | — | Protocol version; currently `1` |
| 6 | 4 | `sequence` | `uint32` | packet | Increments once per attempted transmission, wrapping modulo 2^32 |
| 10 | 8 | `timestamp_us` | `uint64` | µs | Simulation time since the start of the current flight |
| 18 | 1 | `mission_phase` | `uint8` | — | Current mission-state value; see below |
| 19 | 24 | `position_m` | 3 × `float64` | m | World-frame Cartesian position `(x, y, z)` |
| 43 | 24 | `velocity_mps` | 3 × `float64` | m/s | World-frame Cartesian velocity `(x, y, z)` |
| 67 | 16 | `orientation_wxyz` | 4 × `float32` | — | Normalized body-to-world quaternion `(w, x, y, z)` |
| 83 | 4 | `thrust_percent` | `float32` | % | Commanded thrust in the inclusive range 0–100 |
| 87 | 4 | `chamber_pressure_mpa` | `float32` | MPa | Measured engine chamber pressure |
| 91 | 4 | `fault_flags` | `uint32` | — | Active faults; zero means nominal |
| 95 | 24 | `truth_position_m` | 3 × `float64` | m | Noise-free world-frame simulation position |
| 119 | 24 | `truth_velocity_mps` | 3 × `float64` | m/s | Noise-free world-frame simulation velocity |
| 143 | 4 | `crc32` | `uint32` | — | IEEE CRC-32 of bytes 0–142 |

### Mission phases

| Value | Phase |
|---:|---|
| 0 | `PRELAUNCH` |
| 1 | `POWERED_ASCENT` |
| 2 | `COAST` |
| 3 | `DESCENT` |
| 4 | `LANDING_BURN` |
| 5 | `LANDED` |

## Coordinate and orientation conventions

The world frame is right-handed East-North-Up: `+x` is east, `+y` is north,
and `+z` is up. The rocket body frame is right-handed with `+z` running from
the engine toward the nose. `orientation_wxyz` rotates a body-frame vector
into the world frame. The identity quaternion is `(1, 0, 0, 0)`.

Quaternion values must be finite and normalized before transmission. Receivers
may reject packets whose quaternion norm differs materially from 1.

## CRC and validation

`crc32` uses the IEEE CRC-32 polynomial `0xEDB88320`, initial value
`0xFFFFFFFF`, and final XOR `0xFFFFFFFF`. It covers the first 143 bytes of the
packet and does not cover the CRC field itself.

A receiver validates packet size, magic, supported version, CRC, and field
sanity before publishing a packet. Unknown versions are rejected and counted;
they are never decoded using the version 1 layout.

Sequence gaps reveal missing transmissions. Because UDP can reorder packets,
a sequence lower than the latest accepted sequence is classified as late or
reordered rather than immediately changing the loss count. Wraparound-aware
comparison is required.

## Fault flags

| Bit | Mask | Meaning |
|---:|---:|---|
| 0 | `0x00000001` | Thruster output loss active |
| 1 | `0x00000002` | Sensor noise active |
| 2 | `0x00000004` | Intentional packet loss active |
| 3–31 | — | Reserved; transmit as zero |
