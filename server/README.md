# Streaming Server

The TypeScript service validates and decodes binary UDP telemetry on port 5000,
stores the latest 60 seconds in a bounded buffer, and distributes history and
live samples to WebSocket clients on port 8080.
It also maintains a reliable TCP control connection to the simulator on port
5001 for fault commands and acknowledgements.

```sh
npm run dev --workspace server
```

Environment variables can override `UDP_HOST`, `UDP_PORT`, `WS_HOST`, `WS_PORT`,
and `HISTORY_CAPACITY`.
The control endpoint can be changed with `CONTROL_HOST` and `CONTROL_PORT`.
