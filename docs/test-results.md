# Test Results

## Milestone 2: deterministic flight simulation

Tested with Apple Clang 21 in C++20 mode on August 25, 2026. Initial tests
compiled the sources directly with the warning flags defined by the CMake
targets. After installing CMake 4.4.2, the complete documented configure,
build, and CTest workflow also passed from a clean out-of-tree build.

Five complete flights were run at a fixed 0.01-second step. Each flight:

- visited all six mission phases in order;
- landed after 69.03 simulated seconds and 6,903 steps;
- reached approximately 2,241.07 m maximum altitude;
- ended at 16,000 kg without crossing the 15,000 kg dry-mass bound;
- maintained a normalized orientation quaternion; and
- produced identical landing time, maximum altitude, and final mass.

The simulator also completed with `-Wall -Wextra -Wpedantic -Werror`, and all
protocol and simulation tests passed.

## Milestone 3: UDP telemetry

A bounded 500-packet localhost test ran at the nominal 100 Hz rate. The
simulator reported:

```text
UDP queued=500 queue_dropped=0 sent=500 send_errors=0
```

Packet 250 was deliberately changed after CRC calculation. The receiver
reported:

```text
packets received=500 valid=499 rejected=1 lost=1 reordered=0
```

This demonstrates that the network worker kept pace at the nominal rate, CRC
validation rejected the damaged datagram, and the following sequence gap was
counted. A separate accelerated full-flight run intentionally outran the
network worker and filled the queue; the simulator continued to completion and
reported queue drops rather than blocking.

The SPSC queue also transferred 100,000 sequential values between two threads
without loss, corruption, or reordering in its concurrency test.

## Complete build validation

The documented workflow was run from a clean build directory:

```text
cmake -S . -B /tmp/flightdeck-x-cmake-build -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/flightdeck-x-cmake-build --parallel
ctest --test-dir /tmp/flightdeck-x-cmake-build --output-on-failure
```

All targets compiled without warnings and all three registered tests passed.
The CMake-built simulator and receiver then reproduced the 500-packet UDP
result recorded above.

## Milestones 4 and 5: server and dashboard

The TypeScript server and React dashboard passed strict production builds. The
server test suite covers binary decoding, CRC validation, bounded history,
sequence gaps, and a live UDP-to-WebSocket test with two clients. The second
client received three buffered samples immediately, then both clients received
the next live sample.

The production-built server was also tested against the actual C++ simulator at
100 Hz. A WebSocket probe received all 200 transmitted packets in order, from
sequence 0 (`PRELAUNCH`) through sequence 199 (`POWERED_ASCENT`), with no queue
drops or send errors.

The dashboard production build and telemetry-helper tests passed. Its client
history is bounded at 6,000 samples, chart data is decimated for rendering, and
incoming 100 Hz messages are batched to animation frames.
