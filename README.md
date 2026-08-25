# FlightDeck X

A learning project for building a real-time rocket telemetry and mission-control
system from first principles.

The finished system will have four independent layers:

```text
C++ simulator -> UDP binary packets -> streaming server -> WebSocket -> React UI
```

## What you will learn

- How flight state is represented and updated in a fixed-rate simulation loop
- How binary packet layouts, sequence numbers, and checksums work
- How UDP differs from reliable transports such as TCP and WebSockets
- How a server validates, buffers, and distributes real-time data
- How quaternions drive a 3D model without Euler-angle singularities
- How to measure latency, packet loss, render rate, and system health

## Suggested technology stack

- **Generator:** C++20 and CMake
- **Wire format:** packed binary structs initially; Protocol Buffers later
- **Generator-to-server transport:** UDP
- **Streaming server:** Node.js, TypeScript, and `ws`
- **Browser transport:** WebSockets
- **Dashboard:** React, TypeScript, Vite, React Three Fiber, and Recharts
- **Repository structure:**

```text
flightdeck-x/
  protocol/       Shared packet specification
  generator/      C++ flight simulator and UDP transmitter
  server/         UDP receiver and WebSocket relay
  dashboard/      React mission-control interface
  docs/           Architecture notes and test results
```

## Build and test

Milestone 1 requires CMake 3.20 or newer and a C++20 compiler:

```sh
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

See [`protocol/telemetry.md`](protocol/telemetry.md) for the version 1 wire
contract and [`docs/decisions.md`](docs/decisions.md) for the engineering
decisions behind it.

## Build roadmap

Build one vertical slice at a time. Do not begin with the full dashboard: first
prove that one packet can travel from the simulator to a terminal.

### Milestone 1: Define one telemetry packet

Create `protocol/telemetry.md` and document every field before writing code.
Start with:

| Field | Type | Unit | Purpose |
|---|---:|---|---|
| magic | `uint32` | — | Identifies a FlightDeck packet |
| version | `uint16` | — | Allows future format changes |
| sequence | `uint32` | — | Detects dropped or reordered packets |
| timestamp_us | `uint64` | µs | Simulator timestamp |
| position | 3 × `float64` | m | Cartesian x, y, z |
| velocity | 3 × `float64` | m/s | Cartesian velocity |
| orientation | 4 × `float32` | — | Normalized quaternion w, x, y, z |
| thrust | `float32` | % | Commanded thrust level |
| chamber_pressure | `float32` | MPa | Engine health value |
| fault_flags | `uint32` | bit field | Active simulated faults |
| crc32 | `uint32` | — | Detects packet corruption |

Decide and record byte order, exact packet size, quaternion ordering, coordinate
system, and CRC coverage. Network byte order (big-endian) is a good default.

**Checkpoint:** Write a tiny program that creates one packet, serializes it,
deserializes it, and proves every decoded field matches the original.

### Milestone 2: Build the C++ simulation loop

Create a fixed-step loop that runs at 100 Hz (`dt = 0.01 s`). Start with a
simple vertical flight model rather than a physically complete rocket:

```text
acceleration = thrust / mass - gravity
velocity    += acceleration * dt
altitude    += velocity * dt
```

Represent mission phases as a state machine:

```text
PRELAUNCH -> POWERED_ASCENT -> COAST -> DESCENT -> LANDING_BURN -> LANDED
```

Add orientation only after position and velocity behave correctly. Normalize
the quaternion after every integration step.

**Checkpoint:** Print one line per second and confirm that altitude, velocity,
mass, and mission phase change plausibly. The simulation should remain stable
for several complete flights.

### Milestone 3: Send and validate UDP packets

Serialize each simulator state and send it to `127.0.0.1:5000`. Build a minimal
receiver that prints sequence number and altitude. Then add CRC32 validation and
packet-loss detection:

```text
packets_lost = current_sequence - previous_sequence - 1
```

Use a single-producer/single-consumer ring buffer between the simulation and
network threads. The simulation thread should never wait for the network.

**Checkpoint:** Run for five minutes at 100 Hz. Record packets sent, received,
rejected, and lost. Intentionally corrupt a packet and confirm it is rejected.

### Milestone 4: Create the streaming server

Build a TypeScript server that:

1. Listens for UDP telemetry on port 5000.
2. Checks packet size, magic, version, CRC, and sequence number.
3. Decodes valid packets into a typed internal object.
4. Stores the most recent 30–60 seconds in a bounded circular buffer.
5. Serves WebSocket clients on port 8080.
6. Sends buffered history when a client connects, then streams live updates.

Keep UDP input binary. JSON over the browser WebSocket is acceptable for the
first version because it is easy to inspect; optimize it only after measuring.

**Checkpoint:** Open two browser tabs and confirm both receive live data and an
immediate history backfill without affecting the simulator rate.

### Milestone 5: Build the dashboard incrementally

Implement the UI in this order:

1. Connection badge and last-packet timestamp
2. Numeric altitude, speed, and mission-phase readouts
3. Rolling altitude, velocity, and dynamic-pressure charts
4. A simple Three.js rocket driven directly by the quaternion
5. Green/amber/red engine and sensor-health indicators
6. Packet loss, end-to-end latency, and rendering FPS metrics

Do not convert the quaternion to Euler angles for rendering. With Three.js,
assign the received normalized quaternion directly to the model.

**Checkpoint:** Disconnect and restart the server. The UI should visibly enter
a disconnected state, reconnect automatically, and resume without refreshing.

### Milestone 6: Add fault injection

Add a command path from UI to server to simulator. Begin with three deterministic
faults:

- Thruster loss: reduce available thrust by 40%
- Sensor noise: add seeded noise to one measurement
- Packet loss: deliberately drop every Nth transmitted packet

Every command should have an ID, timestamp, acknowledgement, and visible effect.
Keep the true simulated state separate from the noisy sensor measurement so the
difference is observable.

**Checkpoint:** Trigger each fault and verify the packet flags, health panel,
plots, and recovery behavior all agree.

## First working session

For the first session, complete only Milestone 1:

1. Install CMake, a C++20 compiler, Node.js LTS, and Git.
2. Create the five top-level folders shown above.
3. Write `protocol/telemetry.md` with the exact packet contract.
4. Define the matching packed C++ struct.
5. Add compile-time assertions for primitive widths and total packet size.
6. Write a round-trip serialization test.
7. Commit the result before starting the simulator.

Useful questions to answer in `docs/decisions.md`:

- Why use UDP between the simulator and server?
- What data loss is acceptable, and what must be reliable?
- Which clock is used to measure latency?
- What happens when an unknown protocol version arrives?
- How does a consumer distinguish missing packets from reordered packets?

## Engineering habits

- Keep units in field names or documentation; never rely on memory.
- Use a monotonic clock for durations and a wall clock only for display.
- Bound every queue and history buffer so memory cannot grow indefinitely.
- Separate truth state, sensor state, and displayed state.
- Test serialization with known byte fixtures, not only round trips.
- Measure before optimizing and save benchmark results in `docs/`.
- Commit each passing milestone so experiments are easy to undo.

## Definition of done

The project is complete when it can simulate a full flight, stream at 100 Hz,
recover cleanly from disconnects, backfill new clients, visualize orientation
and plots, inject faults, and report measured latency and packet loss without
blocking the simulation loop.
