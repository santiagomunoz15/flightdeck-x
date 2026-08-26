# FlightDeck X Control Protocol

Fault commands travel over a persistent TCP connection from the TypeScript
server to the simulator on `127.0.0.1:5001`. TCP provides ordered, reliable
delivery. The server retains unacknowledged commands and resends them after a
connection is restored.

Each record is UTF-8 text terminated by `\n`, with tab-separated fields:

```text
COMMAND <id> <fault> <enabled>
ACK     <id> <fault> <enabled>
```

On the wire, spaces shown above are tab characters. `enabled` is `0` or `1`.
Command IDs contain 1–64 ASCII letters, digits, or hyphens.

Supported faults:

| Fault | Telemetry mask | Effect |
|---|---:|---|
| `thruster_loss` | `0x1` | Limits available thrust to 60% of nominal |
| `sensor_noise` | `0x2` | Adds deterministic noise to measured altitude and velocity while preserving truth state |
| `packet_loss` | `0x4` | Omits every tenth telemetry transmission |

The browser sends a JSON command with the same ID, fault, enabled state, and an
issue timestamp over WebSocket. The streaming server validates it, translates
it to the TCP record, and broadcasts the simulator acknowledgement back to all
browser clients.
