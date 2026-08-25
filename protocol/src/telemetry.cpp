#include "flightdeck/telemetry.hpp"

#include <bit>
#include <type_traits>

namespace flightdeck::protocol {
namespace {

template <typename UInt>
void write_unsigned(TelemetryBytes& output, std::size_t& offset, UInt value) {
  static_assert(std::is_unsigned_v<UInt>);
  for (std::size_t i = 0; i < sizeof(UInt); ++i) {
    const auto shift = static_cast<unsigned>((sizeof(UInt) - i - 1U) * 8U);
    output[offset++] = static_cast<std::byte>((value >> shift) & 0xFFU);
  }
}

template <typename UInt>
UInt read_unsigned(std::span<const std::byte> input, std::size_t& offset) {
  static_assert(std::is_unsigned_v<UInt>);
  UInt value = 0;
  for (std::size_t i = 0; i < sizeof(UInt); ++i) {
    value = static_cast<UInt>((value << 8U) |
                             std::to_integer<unsigned>(input[offset++]));
  }
  return value;
}

void write_float(TelemetryBytes& output, std::size_t& offset, float value) {
  write_unsigned(output, offset, std::bit_cast<std::uint32_t>(value));
}

void write_double(TelemetryBytes& output, std::size_t& offset, double value) {
  write_unsigned(output, offset, std::bit_cast<std::uint64_t>(value));
}

float read_float(std::span<const std::byte> input, std::size_t& offset) {
  return std::bit_cast<float>(read_unsigned<std::uint32_t>(input, offset));
}

double read_double(std::span<const std::byte> input, std::size_t& offset) {
  return std::bit_cast<double>(read_unsigned<std::uint64_t>(input, offset));
}

}  // namespace

std::uint32_t crc32(std::span<const std::byte> bytes) noexcept {
  std::uint32_t crc = 0xFFFFFFFFU;
  for (const auto byte : bytes) {
    crc ^= std::to_integer<std::uint8_t>(byte);
    for (int bit = 0; bit < 8; ++bit) {
      const std::uint32_t mask = 0U - (crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB88320U & mask);
    }
  }
  return crc ^ 0xFFFFFFFFU;
}

TelemetryBytes serialize(const Telemetry& telemetry) noexcept {
  TelemetryBytes output{};
  std::size_t offset = 0;

  write_unsigned(output, offset, kTelemetryMagic);
  write_unsigned(output, offset, kTelemetryVersion);
  write_unsigned(output, offset, telemetry.sequence);
  write_unsigned(output, offset, telemetry.timestamp_us);
  write_unsigned(output, offset, static_cast<std::uint8_t>(telemetry.mission_phase));
  for (const double value : telemetry.position_m) write_double(output, offset, value);
  for (const double value : telemetry.velocity_mps) write_double(output, offset, value);
  for (const float value : telemetry.orientation_wxyz) write_float(output, offset, value);
  write_float(output, offset, telemetry.thrust_percent);
  write_float(output, offset, telemetry.chamber_pressure_mpa);
  write_unsigned(output, offset, telemetry.fault_flags);

  const auto checksum = crc32(std::span<const std::byte>(output).first(kCrcOffset));
  write_unsigned(output, offset, checksum);
  return output;
}

DecodeResult deserialize(std::span<const std::byte> bytes) noexcept {
  if (bytes.size() != kTelemetryPacketSize) return {{}, DecodeError::wrong_size};

  std::size_t offset = 0;
  if (read_unsigned<std::uint32_t>(bytes, offset) != kTelemetryMagic) {
    return {{}, DecodeError::wrong_magic};
  }
  if (read_unsigned<std::uint16_t>(bytes, offset) != kTelemetryVersion) {
    return {{}, DecodeError::unsupported_version};
  }

  const auto expected_crc = crc32(bytes.first(kCrcOffset));
  std::size_t crc_offset = kCrcOffset;
  if (read_unsigned<std::uint32_t>(bytes, crc_offset) != expected_crc) {
    return {{}, DecodeError::checksum_mismatch};
  }

  Telemetry telemetry{};
  telemetry.sequence = read_unsigned<std::uint32_t>(bytes, offset);
  telemetry.timestamp_us = read_unsigned<std::uint64_t>(bytes, offset);
  telemetry.mission_phase =
      static_cast<MissionPhase>(read_unsigned<std::uint8_t>(bytes, offset));
  for (double& value : telemetry.position_m) value = read_double(bytes, offset);
  for (double& value : telemetry.velocity_mps) value = read_double(bytes, offset);
  for (float& value : telemetry.orientation_wxyz) value = read_float(bytes, offset);
  telemetry.thrust_percent = read_float(bytes, offset);
  telemetry.chamber_pressure_mpa = read_float(bytes, offset);
  telemetry.fault_flags = read_unsigned<std::uint32_t>(bytes, offset);

  return {telemetry, DecodeError::none};
}

}  // namespace flightdeck::protocol
