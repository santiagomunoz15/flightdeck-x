#include "flightdeck/flight_simulation.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {

using flightdeck::simulation::FlightSimulation;
using flightdeck::simulation::MissionPhase;
using flightdeck::simulation::kFixedStepSeconds;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    std::exit(EXIT_FAILURE);
  }
}

struct FlightSummary {
  double landing_time_s{};
  double maximum_altitude_m{};
  double landing_downrange_m{};
  double final_mass_kg{};
};

FlightSummary run_complete_flight() {
  FlightSimulation simulation;
  double maximum_altitude = 0.0;
  double previous_mass = simulation.state().mass_kg;
  MissionPhase previous_phase = simulation.state().phase;
  double prelanding_vertical_velocity = 0.0;
  double prelanding_horizontal_velocity = 0.0;
  std::array<bool, 6> phases_seen{};
  phases_seen[0] = true;

  for (int step = 0; step < 30'000; ++step) {
    prelanding_vertical_velocity = simulation.state().velocity_mps;
    prelanding_horizontal_velocity = simulation.state().horizontal_velocity_mps;
    simulation.step();
    const auto& state = simulation.state();
    maximum_altitude = std::max(maximum_altitude, state.altitude_m);
    require(std::isfinite(state.altitude_m), "altitude became non-finite");
    require(std::isfinite(state.downrange_m), "downrange became non-finite");
    require(state.mass_kg <= previous_mass, "mass increased during flight");
    require(state.mass_kg >= simulation.config().dry_mass_kg,
            "mass fell below dry mass");

    double quaternion_norm_squared = 0.0;
    for (const double component : state.orientation_wxyz) {
      quaternion_norm_squared += component * component;
    }
    require(std::abs(quaternion_norm_squared - 1.0) < 1e-12,
            "orientation quaternion is not normalized");

    if (state.phase != previous_phase) {
      require(static_cast<int>(state.phase) == static_cast<int>(previous_phase) + 1,
              "mission phase transition skipped or went backward");
      phases_seen[static_cast<std::size_t>(state.phase)] = true;
      previous_phase = state.phase;
    }
    previous_mass = state.mass_kg;

    if (state.phase == MissionPhase::landed) {
      for (const bool seen : phases_seen) require(seen, "mission phase was not visited");
      require(state.altitude_m == 0.0, "landed altitude is not zero");
      require(state.velocity_mps == 0.0, "landed velocity is not zero");
      require(maximum_altitude > 2'390.0 && maximum_altitude < 2'410.0,
              "maximum altitude missed the 2.4 km target");
      require(std::abs(state.downrange_m - simulation.config().target_downrange_m) < 10.0,
              "landing missed the downrange target");
      require(state.horizontal_velocity_mps == 0.0,
              "landed horizontal velocity is not zero");
      require(std::abs(prelanding_vertical_velocity) < 3.0,
              "vertical touchdown speed exceeded the limit");
      require(std::abs(prelanding_horizontal_velocity) < 1.1,
              "horizontal touchdown speed exceeded the limit");
      return {state.simulation_time_s, maximum_altitude, state.downrange_m,
              state.mass_kg};
    }
  }

  require(false, "flight did not land within 300 simulated seconds");
  return {};
}

void test_prelaunch_is_stationary() {
  FlightSimulation simulation;
  for (int i = 0; i < 100; ++i) simulation.step(kFixedStepSeconds);
  require(simulation.state().phase == MissionPhase::prelaunch,
          "prelaunch ended too early");
  require(simulation.state().altitude_m == 0.0, "rocket moved before launch");
}

void test_complete_flight_is_deterministic() {
  const FlightSummary first = run_complete_flight();
  for (int flight = 1; flight < 5; ++flight) {
    const FlightSummary repeated = run_complete_flight();
    require(first.landing_time_s == repeated.landing_time_s,
            "landing time is not deterministic");
    require(first.maximum_altitude_m == repeated.maximum_altitude_m,
            "maximum altitude is not deterministic");
    require(first.landing_downrange_m == repeated.landing_downrange_m,
            "landing position is not deterministic");
    require(first.final_mass_kg == repeated.final_mass_kg,
            "final mass is not deterministic");
  }
}

void test_thruster_loss_reduces_acceleration() {
  FlightSimulation nominal;
  FlightSimulation degraded;
  degraded.set_thruster_loss(true);
  for (int step = 0; step < 300; ++step) {
    nominal.step();
    degraded.step();
  }
  require(degraded.state().thrust_n == nominal.state().thrust_n * 0.6,
          "thruster-loss fault did not reduce available thrust by 40 percent");
  require(degraded.state().altitude_m < nominal.state().altitude_m,
          "thruster-loss trajectory did not diverge from nominal");
}

}  // namespace

int main() {
  test_prelaunch_is_stationary();
  test_complete_flight_is_deterministic();
  test_thruster_loss_reduces_acceleration();
  std::cout << "All flight simulation tests passed\n";
}
