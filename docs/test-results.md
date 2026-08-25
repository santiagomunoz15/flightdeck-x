# Test Results

## Milestone 2: deterministic flight simulation

Tested with Apple Clang 21 in C++20 mode on August 25, 2026. Since CMake was
not available on the development machine, the same sources and warning flags
defined by the CMake targets were compiled directly.

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
