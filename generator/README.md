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
