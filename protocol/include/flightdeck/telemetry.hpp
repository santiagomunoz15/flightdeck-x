#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace flightdeck::protocol {

inline constexpr std::uint32_t kTelemetryMagic = 0x46445831U;
inline constexpr std::uint16_t kTelemetryVersion = 2U;
inline constexpr std::size_t kTelemetryPacketSize = 163U;
inline constexpr std::size_t kCrcOffset = 159U;

enum class MissionPhase : std::uint8_t {
  prelaunch = 0,
  powered_ascent = 1,
  coast = 2,
  descent = 3,
  landing_burn = 4,
  landed = 5,
};

static_assert(sizeof(std::uint16_t) == 2);
static_assert(sizeof(std::uint32_t) == 4);
static_assert(sizeof(std::uint64_t) == 8);
static_assert(sizeof(float) == 4);
static_assert(sizeof(double) == 8);

#pragma pack(push, 1)
struct PackedTelemetryPacket {
  std::array<std::byte, 4> magic;
  std::array<std::byte, 2> version;
  std::array<std::byte, 4> sequence;
  std::array<std::byte, 8> timestamp_us;
  std::array<std::byte, 1> mission_phase;
  std::array<std::byte, 24> position_m;
  std::array<std::byte, 24> velocity_mps;
  std::array<std::byte, 16> orientation_wxyz;
  std::array<std::byte, 4> thrust_percent;
  std::array<std::byte, 4> chamber_pressure_mpa;
  std::array<std::byte, 8> gimbal_command_deg;
  std::array<std::byte, 8> grid_fin_command_deg;
  std::array<std::byte, 4> fault_flags;
  std::array<std::byte, 24> truth_position_m;
  std::array<std::byte, 24> truth_velocity_mps;
  std::array<std::byte, 4> crc32;
};
#pragma pack(pop)

static_assert(sizeof(PackedTelemetryPacket) == kTelemetryPacketSize);

struct Telemetry {
  std::uint32_t sequence{};
  std::uint64_t timestamp_us{};
  MissionPhase mission_phase{MissionPhase::prelaunch};
  std::array<double, 3> position_m{};
  std::array<double, 3> velocity_mps{};
  std::array<float, 4> orientation_wxyz{1.0F, 0.0F, 0.0F, 0.0F};
  float thrust_percent{};
  float chamber_pressure_mpa{};
  std::array<float, 2> gimbal_command_deg{};
  std::array<float, 2> grid_fin_command_deg{};
  std::uint32_t fault_flags{};
  std::array<double, 3> truth_position_m{};
  std::array<double, 3> truth_velocity_mps{};

  bool operator==(const Telemetry&) const = default;
};

enum class DecodeError {
  none,
  wrong_size,
  wrong_magic,
  unsupported_version,
  checksum_mismatch,
};

struct DecodeResult {
  Telemetry telemetry{};
  DecodeError error{DecodeError::none};

  [[nodiscard]] explicit operator bool() const noexcept {
    return error == DecodeError::none;
  }
};

using TelemetryBytes = std::array<std::byte, kTelemetryPacketSize>;

[[nodiscard]] std::uint32_t crc32(std::span<const std::byte> bytes) noexcept;
[[nodiscard]] TelemetryBytes serialize(const Telemetry& telemetry) noexcept;
[[nodiscard]] DecodeResult deserialize(std::span<const std::byte> bytes) noexcept;

}  // namespace flightdeck::protocol
