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
