#include "flightdeck/flight_simulation.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace flightdeck::simulation {

std::string_view to_string(MissionPhase phase) noexcept {
  switch (phase) {
    case MissionPhase::prelaunch: return "PRELAUNCH";
    case MissionPhase::powered_ascent: return "POWERED_ASCENT";
    case MissionPhase::coast: return "COAST";
    case MissionPhase::descent: return "DESCENT";
    case MissionPhase::landing_burn: return "LANDING_BURN";
    case MissionPhase::landed: return "LANDED";
    case MissionPhase::terminated: return "TERMINATED";
  }
  return "UNKNOWN";
}

FlightSimulation::FlightSimulation(FlightConfig config) : config_(config) {
  state_.mass_kg = config_.initial_mass_kg;
}

void FlightSimulation::request_abort() noexcept {
  if (state_.phase == MissionPhase::prelaunch) transition_to(MissionPhase::landed);
  else if (state_.phase == MissionPhase::powered_ascent) transition_to(MissionPhase::coast);
}

void FlightSimulation::terminate() noexcept {
  state_.thrust_n = 0.0;
  state_.acceleration_mps2 = 0.0;
  state_.horizontal_acceleration_mps2 = 0.0;
  state_.crossrange_acceleration_mps2 = 0.0;
  transition_to(MissionPhase::terminated);
}

void FlightSimulation::transition_to(MissionPhase next) noexcept {
  state_.phase = next;
  state_.phase_time_s = 0.0;
}

bool FlightSimulation::should_start_landing_burn() const noexcept {
  if (state_.velocity_mps >= 0.0) return false;
  const double maximum_upward_acceleration =
      config_.maximum_thrust_n * (thruster_loss_ ? 0.6 : 1.0) /
          state_.mass_kg - config_.gravity_mps2;
  if (maximum_upward_acceleration <= 0.0) return true;
  const double stopping_distance = state_.velocity_mps * state_.velocity_mps /
                                   (2.0 * maximum_upward_acceleration);
  return state_.altitude_m <= stopping_distance * config_.landing_burn_margin;
}

void FlightSimulation::normalize_orientation() noexcept {
  double norm_squared = 0.0;
  for (const double component : state_.orientation_wxyz) {
    norm_squared += component * component;
  }
  if (norm_squared <= std::numeric_limits<double>::epsilon()) {
    state_.orientation_wxyz = {1.0, 0.0, 0.0, 0.0};
    return;
  }
  const double inverse_norm = 1.0 / std::sqrt(norm_squared);
  for (double& component : state_.orientation_wxyz) component *= inverse_norm;
}

void FlightSimulation::update_orientation(double thrust_east_n,
                                          double thrust_north_n,
                                          double thrust_up_n) noexcept {
  const double magnitude = std::hypot(
      std::hypot(thrust_east_n, thrust_north_n), thrust_up_n);
  if (magnitude <= std::numeric_limits<double>::epsilon()) {
    return;
  }
  const double east = thrust_east_n / magnitude;
  const double north = thrust_north_n / magnitude;
  const double up = thrust_up_n / magnitude;
  const double scalar = std::sqrt(std::max(0.0, (1.0 + up) / 2.0));
  if (scalar <= std::numeric_limits<double>::epsilon()) {
    state_.orientation_wxyz = {0.0, 1.0, 0.0, 0.0};
  } else {
    state_.orientation_wxyz = {
        scalar, -north / (2.0 * scalar), east / (2.0 * scalar), 0.0};
  }
}

void FlightSimulation::step(double dt_s) noexcept {
  if (!(dt_s > 0.0) || !std::isfinite(dt_s) ||
      state_.phase == MissionPhase::landed || state_.phase == MissionPhase::terminated) {
    return;
  }

  state_.simulation_time_s += dt_s;
  state_.phase_time_s += dt_s;
  state_.thrust_n = 0.0;
  state_.horizontal_acceleration_mps2 = 0.0;
  state_.crossrange_acceleration_mps2 = 0.0;

  switch (state_.phase) {
    case MissionPhase::prelaunch:
      state_.acceleration_mps2 = 0.0;
      if (state_.phase_time_s >= config_.prelaunch_duration_s) {
        transition_to(MissionPhase::powered_ascent);
      }
      break;
    case MissionPhase::powered_ascent: {
      state_.thrust_n = config_.maximum_thrust_n * (thruster_loss_ ? 0.6 : 1.0);
      const double propellant_available = state_.mass_kg - config_.dry_mass_kg;
      const double propellant_used = std::min(
          propellant_available, config_.ascent_mass_flow_kgps * dt_s);
      state_.mass_kg -= std::max(0.0, propellant_used);
      const double thrust_east_n = std::min(
          state_.mass_kg * config_.ascent_horizontal_acceleration_mps2,
          state_.thrust_n * 0.25);
      const double thrust_north_n = std::min(
          state_.mass_kg * config_.ascent_crossrange_acceleration_mps2,
          state_.thrust_n * 0.1);
      const double thrust_up_n = std::sqrt(std::max(
          0.0, state_.thrust_n * state_.thrust_n -
              thrust_east_n * thrust_east_n - thrust_north_n * thrust_north_n));
      state_.horizontal_acceleration_mps2 = thrust_east_n / state_.mass_kg;
      state_.crossrange_acceleration_mps2 = thrust_north_n / state_.mass_kg;
      state_.acceleration_mps2 = thrust_up_n / state_.mass_kg - config_.gravity_mps2;
      state_.horizontal_velocity_mps += state_.horizontal_acceleration_mps2 * dt_s;
      state_.crossrange_velocity_mps += state_.crossrange_acceleration_mps2 * dt_s;
      state_.velocity_mps += state_.acceleration_mps2 * dt_s;
      state_.downrange_m += state_.horizontal_velocity_mps * dt_s;
      state_.crossrange_m += state_.crossrange_velocity_mps * dt_s;
      state_.altitude_m += state_.velocity_mps * dt_s;
      update_orientation(thrust_east_n, thrust_north_n, thrust_up_n);
      const double predicted_ballistic_apogee = state_.altitude_m +
          state_.velocity_mps * state_.velocity_mps / (2.0 * config_.gravity_mps2);
      if (predicted_ballistic_apogee >= config_.target_apogee_m ||
          state_.phase_time_s >= config_.ascent_burn_duration_s ||
          state_.mass_kg <= config_.dry_mass_kg) {
        transition_to(MissionPhase::coast);
      }
      break;
    }
    case MissionPhase::coast:
      state_.acceleration_mps2 = -config_.gravity_mps2;
      state_.velocity_mps += state_.acceleration_mps2 * dt_s;
      state_.downrange_m += state_.horizontal_velocity_mps * dt_s;
      state_.crossrange_m += state_.crossrange_velocity_mps * dt_s;
      state_.altitude_m += state_.velocity_mps * dt_s;
      if (state_.velocity_mps <= 0.0) transition_to(MissionPhase::descent);
      break;
    case MissionPhase::descent:
      state_.acceleration_mps2 = -config_.gravity_mps2;
      state_.horizontal_acceleration_mps2 = std::clamp(
          (config_.target_downrange_m - state_.downrange_m) * 0.0008 -
              state_.horizontal_velocity_mps * 0.018,
          -config_.maximum_grid_fin_acceleration_mps2,
          config_.maximum_grid_fin_acceleration_mps2);
      state_.crossrange_acceleration_mps2 = std::clamp(
          (config_.target_crossrange_m - state_.crossrange_m) * 0.0008 -
              state_.crossrange_velocity_mps * 0.018,
          -config_.maximum_grid_fin_acceleration_mps2,
          config_.maximum_grid_fin_acceleration_mps2);
      state_.horizontal_velocity_mps += state_.horizontal_acceleration_mps2 * dt_s;
      state_.crossrange_velocity_mps += state_.crossrange_acceleration_mps2 * dt_s;
      state_.velocity_mps += state_.acceleration_mps2 * dt_s;
      state_.downrange_m += state_.horizontal_velocity_mps * dt_s;
      state_.crossrange_m += state_.crossrange_velocity_mps * dt_s;
      state_.altitude_m += state_.velocity_mps * dt_s;
      if (should_start_landing_burn()) transition_to(MissionPhase::landing_burn);
      break;
    case MissionPhase::landing_burn: {
      const double safe_altitude = std::max(state_.altitude_m, 1.0);
      const double desired_upward_acceleration =
          state_.velocity_mps < 0.0
              ? state_.velocity_mps * state_.velocity_mps /
                    (2.0 * safe_altitude) * 1.05
              : 0.0;
      const double remaining_range = config_.target_downrange_m - state_.downrange_m;
      const double desired_horizontal_acceleration = std::clamp(
          remaining_range * 0.08 - state_.horizontal_velocity_mps * 0.57,
          -4.0, 4.0);
      const double remaining_crossrange = config_.target_crossrange_m - state_.crossrange_m;
      const double desired_crossrange_acceleration = std::clamp(
          remaining_crossrange * 0.08 - state_.crossrange_velocity_mps * 0.57,
          -4.0, 4.0);
      double thrust_east_n = state_.mass_kg * desired_horizontal_acceleration;
      double thrust_north_n = state_.mass_kg * desired_crossrange_acceleration;
      double thrust_up_n = state_.mass_kg *
                           (config_.gravity_mps2 + desired_upward_acceleration);
      const double maximum_thrust = config_.maximum_thrust_n *
                                    (thruster_loss_ ? 0.6 : 1.0);
      const double requested_thrust = std::hypot(
          std::hypot(thrust_east_n, thrust_north_n), thrust_up_n);
      if (requested_thrust > maximum_thrust) {
        const double scale = maximum_thrust / requested_thrust;
        thrust_east_n *= scale;
        thrust_north_n *= scale;
        thrust_up_n *= scale;
      }
      state_.thrust_n = std::hypot(
          std::hypot(thrust_east_n, thrust_north_n), thrust_up_n);
      state_.horizontal_acceleration_mps2 = thrust_east_n / state_.mass_kg;
      state_.crossrange_acceleration_mps2 = thrust_north_n / state_.mass_kg;
      state_.acceleration_mps2 = thrust_up_n / state_.mass_kg - config_.gravity_mps2;
      state_.horizontal_velocity_mps += state_.horizontal_acceleration_mps2 * dt_s;
      state_.crossrange_velocity_mps += state_.crossrange_acceleration_mps2 * dt_s;
      state_.velocity_mps += state_.acceleration_mps2 * dt_s;
      state_.downrange_m += state_.horizontal_velocity_mps * dt_s;
      state_.crossrange_m += state_.crossrange_velocity_mps * dt_s;
      state_.altitude_m += state_.velocity_mps * dt_s;
      update_orientation(thrust_east_n, thrust_north_n, thrust_up_n);
      if (state_.altitude_m <= 0.0) {
        state_.altitude_m = 0.0;
        state_.velocity_mps = 0.0;
        state_.horizontal_velocity_mps = 0.0;
        state_.crossrange_velocity_mps = 0.0;
        state_.acceleration_mps2 = 0.0;
        state_.horizontal_acceleration_mps2 = 0.0;
        state_.crossrange_acceleration_mps2 = 0.0;
        state_.thrust_n = 0.0;
        transition_to(MissionPhase::landed);
      }
      break;
    }
    case MissionPhase::landed:
    case MissionPhase::terminated:
      break;
  }

  normalize_orientation();
}

}  // namespace flightdeck::simulation
