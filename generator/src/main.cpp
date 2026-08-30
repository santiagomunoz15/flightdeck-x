#include "flightdeck/control_server.hpp"
#include "flightdeck/flight_simulation.hpp"
#include "flightdeck/telemetry.hpp"
#include "flightdeck/udp_transmitter.hpp"

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <string_view>
#include <thread>

namespace {

using flightdeck::simulation::FlightSimulation;
using flightdeck::simulation::MissionPhase;
using flightdeck::simulation::kFixedStepSeconds;

flightdeck::protocol::MissionPhase wire_phase(MissionPhase phase) {
  using WirePhase = flightdeck::protocol::MissionPhase;
  switch (phase) {
    case MissionPhase::prelaunch: return WirePhase::prelaunch;
    case MissionPhase::powered_ascent: return WirePhase::powered_ascent;
    case MissionPhase::coast: return WirePhase::coast;
    case MissionPhase::descent: return WirePhase::descent;
    case MissionPhase::landing_burn: return WirePhase::landing_burn;
    case MissionPhase::landed: return WirePhase::landed;
    case MissionPhase::terminated: return WirePhase::terminated;
  }
  return WirePhase::prelaunch;
}

flightdeck::protocol::Telemetry make_telemetry(
    const flightdeck::simulation::FlightState& state, std::uint32_t sequence,
    std::uint32_t fault_flags) {
  const float thrust_percent = static_cast<float>(
      state.thrust_n / 300'000.0 * 100.0);
  auto telemetry = flightdeck::protocol::Telemetry{
      .sequence = sequence,
      .timestamp_us = static_cast<std::uint64_t>(state.simulation_time_s * 1'000'000.0),
      .mission_phase = wire_phase(state.phase),
      .position_m = {state.downrange_m, state.crossrange_m, state.altitude_m},
      .velocity_mps = {state.horizontal_velocity_mps, state.crossrange_velocity_mps, state.velocity_mps},
      .orientation_wxyz = {
          static_cast<float>(state.orientation_wxyz[0]),
          static_cast<float>(state.orientation_wxyz[1]),
          static_cast<float>(state.orientation_wxyz[2]),
          static_cast<float>(state.orientation_wxyz[3]),
      },
      .thrust_percent = thrust_percent,
      .chamber_pressure_mpa = thrust_percent * 0.12F,
      .fault_flags = fault_flags,
      .truth_position_m = {state.downrange_m, state.crossrange_m, state.altitude_m},
      .truth_velocity_mps = {state.horizontal_velocity_mps, state.crossrange_velocity_mps, state.velocity_mps},
  };
  if ((fault_flags & flightdeck::generator::kSensorNoise) != 0U) {
    telemetry.position_m[2] += std::sin(static_cast<double>(sequence) * 0.173) * 8.0;
    telemetry.velocity_mps[2] += std::sin(static_cast<double>(sequence) * 0.311) * 1.5;
    telemetry.position_m[0] += std::sin(static_cast<double>(sequence) * 0.137) * 3.0;
    telemetry.velocity_mps[0] += std::sin(static_cast<double>(sequence) * 0.271) * 0.6;
    telemetry.position_m[1] += std::sin(static_cast<double>(sequence) * 0.151) * 3.0;
    telemetry.velocity_mps[1] += std::sin(static_cast<double>(sequence) * 0.293) * 0.6;
  }
  return telemetry;
}

void print_usage(std::string_view program) {
  std::cout << "Usage: " << program
            << " [--no-realtime] [--no-network] [--no-control] [--corrupt-once] [--max-steps COUNT]\n"
            << "  --no-realtime  Run without wall-clock delays\n"
            << "  --no-network   Do not transmit UDP telemetry\n"
            << "  --no-control   Do not listen for fault commands on TCP port 5001\n"
            << "  --corrupt-once Corrupt packet 250 to exercise receiver validation\n"
            << "  --max-steps N  Stop after N simulation steps (useful for tests)\n";
}

void print_state(const flightdeck::simulation::FlightState& state) {
  std::cout << std::fixed << std::setprecision(2)
            << "t=" << std::setw(6) << state.simulation_time_s << " s"
            << "  phase=" << std::setw(15) << flightdeck::simulation::to_string(state.phase)
            << "  altitude=" << std::setw(8) << state.altitude_m << " m"
            << "  downrange=" << std::setw(8) << state.downrange_m << " m"
            << "  crossrange=" << std::setw(7) << state.crossrange_m << " m"
            << "  vertical_v=" << std::setw(8) << state.velocity_mps << " m/s"
            << "  east_v=" << std::setw(7) << state.horizontal_velocity_mps << " m/s"
            << "  north_v=" << std::setw(6) << state.crossrange_velocity_mps << " m/s"
            << "  mass=" << std::setw(8) << state.mass_kg << " kg"
            << "  thrust=" << std::setw(7) << state.thrust_n / 1'000.0 << " kN\n";
}

}  // namespace

int main(int argc, char* argv[]) {
  bool realtime = true;
  bool network_enabled = true;
  bool corrupt_once = false;
  bool control_enabled = true;
  std::uint64_t maximum_steps = 0;
  for (int i = 1; i < argc; ++i) {
    const std::string_view argument{argv[i]};
    if (argument == "--no-realtime") {
      realtime = false;
    } else if (argument == "--no-network") {
      network_enabled = false;
    } else if (argument == "--no-control") {
      control_enabled = false;
    } else if (argument == "--corrupt-once") {
      corrupt_once = true;
    } else if (argument == "--max-steps" && i + 1 < argc) {
      maximum_steps = std::strtoull(argv[++i], nullptr, 10);
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
  flightdeck::generator::ControlServer control_server;
  if (control_enabled && !control_server.start()) {
    std::cerr << "Unable to start control server: "
              << control_server.error_message() << '\n';
    return 1;
  }
  flightdeck::generator::UdpTransmitter transmitter{"127.0.0.1", 5000};
  if (network_enabled && !transmitter.start()) {
    std::cerr << "Unable to start UDP transmitter: "
              << transmitter.error_message() << '\n';
    return 1;
  }
  auto next_step = std::chrono::steady_clock::now();
  std::uint64_t step_count = 0;
  MissionPhase last_printed_phase = simulation.state().phase;
  print_state(simulation.state());

  while (simulation.state().phase != MissionPhase::landed &&
         simulation.state().phase != MissionPhase::terminated &&
         (maximum_steps == 0 || step_count < maximum_steps)) {
    if (realtime) {
      next_step += std::chrono::milliseconds{10};
      std::this_thread::sleep_until(next_step);
    }

    if (control_server.consume_fts_request()) simulation.terminate();
    else if (control_server.consume_abort_request()) simulation.request_abort();
    if (control_server.paused() && simulation.state().phase != MissionPhase::landed &&
        simulation.state().phase != MissionPhase::terminated) {
      std::this_thread::sleep_for(std::chrono::milliseconds{10});
      if (realtime) next_step = std::chrono::steady_clock::now();
      continue;
    }

    const std::uint32_t fault_flags = control_server.fault_flags();
    simulation.set_thruster_loss(
        (fault_flags & flightdeck::generator::kThrusterLoss) != 0U);
    simulation.step(kFixedStepSeconds);
    ++step_count;
    const auto& state = simulation.state();
    if (network_enabled) {
      auto packet = flightdeck::protocol::serialize(
          make_telemetry(state, static_cast<std::uint32_t>(step_count - 1U), fault_flags));
      if (corrupt_once && step_count == 250U) packet[20] ^= std::byte{0x01};
      const bool intentional_drop =
          (fault_flags & flightdeck::generator::kPacketLoss) != 0U &&
          step_count % 10U == 0U;
      if (!intentional_drop) static_cast<void>(transmitter.try_send(packet));
    }
    const bool one_second_elapsed = step_count % 100U == 0U;
    const bool phase_changed = state.phase != last_printed_phase;
    if (one_second_elapsed || phase_changed) {
      print_state(state);
      last_printed_phase = state.phase;
    }
  }

  transmitter.stop();
  control_server.stop();
  const auto network_stats = transmitter.stats();

  std::cout << (simulation.state().phase == MissionPhase::landed
                    ? "Flight complete after "
                    : simulation.state().phase == MissionPhase::terminated
                        ? "Simulation terminated after "
                        : "Simulation stopped after ")
            << step_count << " fixed steps at 100 Hz\n";
  if (network_enabled) {
    std::cout << "UDP queued=" << network_stats.queued
              << " queue_dropped=" << network_stats.queue_dropped
              << " sent=" << network_stats.sent
              << " send_errors=" << network_stats.send_errors << '\n';
  }
}
