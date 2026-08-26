#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace flightdeck::simulation {

inline constexpr double kFixedStepSeconds = 0.01;

enum class MissionPhase : std::uint8_t {
  prelaunch,
  powered_ascent,
  coast,
  descent,
  landing_burn,
  landed,
};

[[nodiscard]] std::string_view to_string(MissionPhase phase) noexcept;

struct FlightConfig {
  double gravity_mps2{9.80665};
  double initial_mass_kg{20'000.0};
  double dry_mass_kg{15'000.0};
  double maximum_thrust_n{300'000.0};
  double ascent_mass_flow_kgps{200.0};
  double prelaunch_duration_s{2.0};
  double ascent_burn_duration_s{25.0};
  double landing_burn_margin{1.15};
  double target_apogee_m{2'400.0};
  double target_downrange_m{1'000.0};
  double ascent_horizontal_acceleration_mps2{1.05};
};

struct FlightState {
  MissionPhase phase{MissionPhase::prelaunch};
  double simulation_time_s{};
  double phase_time_s{};
  double altitude_m{};
  double downrange_m{};
  double velocity_mps{};
  double horizontal_velocity_mps{};
  double acceleration_mps2{};
  double horizontal_acceleration_mps2{};
  double mass_kg{};
  double thrust_n{};
  std::array<double, 4> orientation_wxyz{1.0, 0.0, 0.0, 0.0};
};

class FlightSimulation {
 public:
  explicit FlightSimulation(FlightConfig config = {});
  void step(double dt_s = kFixedStepSeconds) noexcept;
  void set_thruster_loss(bool enabled) noexcept { thruster_loss_ = enabled; }

  [[nodiscard]] const FlightState& state() const noexcept { return state_; }
  [[nodiscard]] const FlightConfig& config() const noexcept { return config_; }

 private:
  void transition_to(MissionPhase next) noexcept;
  void normalize_orientation() noexcept;
  void update_orientation(double thrust_east_n, double thrust_up_n) noexcept;
  [[nodiscard]] bool should_start_landing_burn() const noexcept;

  FlightConfig config_;
  FlightState state_;
  bool thruster_loss_{};
};

}  // namespace flightdeck::simulation
