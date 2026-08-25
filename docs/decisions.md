# Engineering Decisions

## Transport boundaries

UDP connects the simulator to the streaming server because telemetry is
high-rate, time-sensitive, and superseded quickly by newer samples. Losing an
occasional sample is preferable to delaying the simulation behind retransmits.
The browser boundary uses WebSockets because clients need a broadly supported,
persistent connection and reliable delivery of commands and initial history.

Telemetry loss is acceptable and measured. Control commands and their
acknowledgements are not acceptable losses; the future command path will use a
reliable transport or retry commands by ID until acknowledged.

## Time and latency

Version 1 `timestamp_us` is simulation time, not wall-clock time. It makes
flight playback deterministic but cannot alone measure network latency. Each
process will use its local monotonic clock for durations. End-to-end latency
will require the server to add a receive timestamp and the browser/server clocks
to be compared or synchronized; wall clocks are used only for display.

## Compatibility and packet ordering

Receivers reject and count unknown protocol versions. A new version must define
its own exact layout and decoder rather than guessing from packet length.

Sequence numbers distinguish gaps from reordering: forward jumps create a
provisional missing-packet count, while packets behind the latest sequence are
counted as reordered. Counters use wraparound-aware unsigned comparisons.

## Memory and threading

All queues and telemetry history will have fixed capacities. The simulator will
publish through a bounded single-producer/single-consumer queue so network I/O
cannot block its fixed-rate loop.

