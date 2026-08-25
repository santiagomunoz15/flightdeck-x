#include "flightdeck/flight_simulation.hpp"

#include <chrono>
#include <iomanip>
#include <iostream>
#include <string_view>
#include <thread>

namespace {

using flightdeck::simulation::FlightSimulation;
using flightdeck::simulation::MissionPhase;
using flightdeck::simulation::kFixedStepSeconds;

void print_usage(std::string_view program) {
  std::cout << "Usage: " << program << " [--no-realtime]\n"
            << "  --no-realtime  Run the fixed-step simulation without wall-clock delays\n";
}

void print_state(const flightdeck::simulation::FlightState& state) {
  std::cout << std::fixed << std::setprecision(2)
            << "t=" << std::setw(6) << state.simulation_time_s << " s"
            << "  phase=" << std::setw(15) << flightdeck::simulation::to_string(state.phase)
            << "  altitude=" << std::setw(8) << state.altitude_m << " m"
            << "  velocity=" << std::setw(8) << state.velocity_mps << " m/s"
            << "  mass=" << std::setw(8) << state.mass_kg << " kg"
            << "  thrust=" << std::setw(7) << state.thrust_n / 1'000.0 << " kN\n";
}

}  // namespace

int main(int argc, char* argv[]) {
  bool realtime = true;
  for (int i = 1; i < argc; ++i) {
    const std::string_view argument{argv[i]};
    if (argument == "--no-realtime") {
      realtime = false;
    } else if (argument == "--help" || argument == "-h") {
      print_usage(argv[0]);
      return 0;
    } else {
      std::cerr << "Unknown option: " << argument << '\n';
      print_usage(argv[0]);
      return 2;
    }
  }

  FlightSimulation simulation;
  auto next_step = std::chrono::steady_clock::now();
  std::uint64_t step_count = 0;
  MissionPhase last_printed_phase = simulation.state().phase;
  print_state(simulation.state());

  while (simulation.state().phase != MissionPhase::landed) {
    if (realtime) {
      next_step += std::chrono::milliseconds{10};
      std::this_thread::sleep_until(next_step);
    }

    simulation.step(kFixedStepSeconds);
    ++step_count;
    const auto& state = simulation.state();
    const bool one_second_elapsed = step_count % 100U == 0U;
    const bool phase_changed = state.phase != last_printed_phase;
    if (one_second_elapsed || phase_changed) {
      print_state(state);
      last_printed_phase = state.phase;
    }
  }

  std::cout << "Flight complete after " << step_count
            << " fixed steps at 100 Hz\n";
}

