# Mission-Control Dashboard

The React mission-control interface displays live and backfilled telemetry,
vehicle attitude, rolling charts, propulsion health, packet metrics, transport
latency, and render performance.

```sh
npm run dev --workspace dashboard
```

The dashboard connects to `ws://127.0.0.1:8080` by default. Set `VITE_WS_URL`
to use another streaming server.
