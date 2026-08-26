# FlightDeck X Demo Script

This walkthrough is designed for a 60–90 second screen recording or live
portfolio demonstration.

## Prepare

Build once:

```sh
cmake -S . -B build
cmake --build build
npm install
```

Start the streaming server and dashboard in separate terminals before
recording:

```sh
npm run dev:server
npm run dev:dashboard
```

Open `http://127.0.0.1:5173` and confirm that telemetry is waiting and the
simulator control status reads `SIM OFFLINE`.

For a single-command rehearsal instead, run `npm run demo`; it supervises all
three processes and shuts them down when the flight ends.

## Record

1. Start `./build/generator/flight_simulator`. Point out that both links become
   nominal without refreshing the browser.
2. During powered ascent, show altitude, velocity, chamber pressure, the 3D
   trajectory trail, and the `LIFTOFF` event.
3. Arm **Sensor Noise** for several seconds. Show its acknowledgement, noisy
   measured traces separating from dashed truth, non-zero residuals, the event
   marker, and health warning; then clear it.
4. Arm **Packet Loss**. Show every tenth sequence disappear and the loss counter
   increase while the simulation and UI continue updating; then clear it.
5. Arm **Thruster Loss** during a powered phase. Show acknowledgement, fault flag
   `0x1`, thrust limited to 60%, and trajectory divergence. Clear it after the
   effect is visible if a nominal-duration landing is desired.
6. At apogee and landing-burn ignition, point out the automatic events and the
   rocket descending along its accumulated 3D path.
7. Finish on touchdown with the event log, packet statistics, transport latency,
   and render FPS visible.

## Engineering points to explain

- UDP telemetry cannot block the fixed-rate simulation; sequence numbers and
  CRC32 expose loss and corruption.
- WebSocket clients receive bounded history before live samples and reconnect
  without a page refresh.
- Fault commands use reliable TCP, unique IDs, retry after reconnect, and
  simulator acknowledgements.
- Sensor noise changes measurements rather than the underlying truth state.
- The 3D model receives the normalized quaternion directly, while ENU position
  telemetry drives its location and trajectory trail.

## Useful recovery checks

- Restart the simulator: graph history, metrics, trajectory, and events reset at
  the new flight boundary.
- Restart the TypeScript server: the dashboard shows link loss, reconnects, and
  resumes automatically.
- Open a second dashboard tab: it immediately receives current bounded history
  without affecting the simulator rate.
