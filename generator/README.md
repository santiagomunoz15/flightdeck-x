# Telemetry Generator

The generator contains a deterministic, fixed-step vertical rocket simulation.
Its intentionally simple physics make mission-state and telemetry behavior easy
to inspect before more realism is added.

## Run

After building from the repository root:

```sh
./build/generator/flight_simulator
```

The executable advances at 100 Hz in real time and prints state once per
simulated second. Use `--no-realtime` to run a complete flight as fast as
possible.

## Inspect UDP telemetry

Run the validation receiver first, then start the simulator in another terminal:

```sh
./build/generator/telemetry_receiver
./build/generator/flight_simulator
```

The simulator sends one binary packet per step to `127.0.0.1:5000`. Press
Ctrl-C to stop the receiver and print its received, rejected, lost, and
reordered counters. The simulation thread hands packets to a bounded SPSC queue;
if networking falls behind, it drops new packets and reports the total instead
of delaying the physics loop.

For a short validation run, `--max-steps 500` stops after five seconds.
`--corrupt-once` damages packet 250 after its CRC is calculated so the receiver
should report one rejected and one lost packet.
