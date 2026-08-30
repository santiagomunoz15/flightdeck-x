#include "flightdeck/telemetry.hpp"

#include <array>
#include <cstddef>
#include <cstdlib>
#include <iostream>
#include <span>

namespace {

using flightdeck::protocol::DecodeError;
using flightdeck::protocol::Telemetry;

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    std::exit(EXIT_FAILURE);
  }
}

Telemetry fixture() {
  return {
      .sequence = 0x01020304U,
      .timestamp_us = 0x0102030405060708ULL,
      .mission_phase = flightdeck::protocol::MissionPhase::coast,
      .position_m = {1.0, -2.0, 3.5},
      .velocity_mps = {4.0, 5.0, -6.0},
      .orientation_wxyz = {1.0F, 0.0F, 0.0F, 0.0F},
      .thrust_percent = 75.5F,
      .chamber_pressure_mpa = 9.25F,
      .gimbal_command_deg = {1.5F, -0.75F},
      .grid_fin_command_deg = {12.0F, -8.0F},
      .fault_flags = 0x00000005U,
      .truth_position_m = {1.25, -2.25, 3.75},
      .truth_velocity_mps = {4.25, 5.25, -6.25},
  };
}

void test_round_trip() {
  const auto original = fixture();
  const auto bytes = flightdeck::protocol::serialize(original);
  const auto result = flightdeck::protocol::deserialize(bytes);
  require(static_cast<bool>(result), "valid packet failed to decode");
  require(result.telemetry == original, "round-trip fields differ");
}

void test_known_prefix() {
  const auto bytes = flightdeck::protocol::serialize(fixture());
  constexpr std::array<std::byte, 18> expected{
      std::byte{0x46}, std::byte{0x44}, std::byte{0x58}, std::byte{0x31},
      std::byte{0x00}, std::byte{0x02},
      std::byte{0x01}, std::byte{0x02}, std::byte{0x03}, std::byte{0x04},
      std::byte{0x01}, std::byte{0x02}, std::byte{0x03}, std::byte{0x04},
      std::byte{0x05}, std::byte{0x06}, std::byte{0x07}, std::byte{0x08},
  };
  require(std::equal(expected.begin(), expected.end(), bytes.begin()),
          "known big-endian header fixture differs");
}

void test_standard_crc_fixture() {
  constexpr std::array<std::byte, 9> input{
      std::byte{'1'}, std::byte{'2'}, std::byte{'3'},
      std::byte{'4'}, std::byte{'5'}, std::byte{'6'},
      std::byte{'7'}, std::byte{'8'}, std::byte{'9'},
  };
  require(flightdeck::protocol::crc32(input) == 0xCBF43926U,
          "CRC-32 does not match the standard check value");
}

void test_rejections() {
  const auto valid = flightdeck::protocol::serialize(fixture());
  require(flightdeck::protocol::deserialize(
              std::span<const std::byte>(valid).first(valid.size() - 1U)).error ==
              DecodeError::wrong_size,
          "short packet was not rejected");

  auto corrupt = valid;
  corrupt[20] ^= std::byte{0x01};
  require(flightdeck::protocol::deserialize(corrupt).error ==
              DecodeError::checksum_mismatch,
          "corrupt packet was not rejected");

  auto bad_magic = valid;
  bad_magic[0] = std::byte{0};
  require(flightdeck::protocol::deserialize(bad_magic).error ==
              DecodeError::wrong_magic,
          "wrong magic was not rejected");

  auto bad_version = valid;
  bad_version[5] = std::byte{3};
  require(flightdeck::protocol::deserialize(bad_version).error ==
              DecodeError::unsupported_version,
          "unknown version was not rejected");
}

}  // namespace

int main() {
  test_round_trip();
  test_known_prefix();
  test_standard_crc_fixture();
  test_rejections();
  std::cout << "All telemetry protocol tests passed\n";
}
