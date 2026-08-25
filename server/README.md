# Streaming Server

The TypeScript service validates and decodes binary UDP telemetry on port 5000,
stores the latest 60 seconds in a bounded buffer, and distributes history and
live samples to WebSocket clients on port 8080.

```sh
npm run dev --workspace server
```

Environment variables can override `UDP_HOST`, `UDP_PORT`, `WS_HOST`, `WS_PORT`,
and `HISTORY_CAPACITY`.
