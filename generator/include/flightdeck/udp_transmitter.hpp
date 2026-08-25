#pragma once

#include "flightdeck/spsc_ring_buffer.hpp"
#include "flightdeck/telemetry.hpp"

#include <atomic>
#include <cstdint>
#include <string>
#include <thread>

namespace flightdeck::generator {

struct TransmitterStats {
  std::uint64_t queued{};
  std::uint64_t queue_dropped{};
  std::uint64_t sent{};
  std::uint64_t send_errors{};
};

class UdpTransmitter {
 public:
  UdpTransmitter(std::string host, std::uint16_t port);
  ~UdpTransmitter();

  UdpTransmitter(const UdpTransmitter&) = delete;
  UdpTransmitter& operator=(const UdpTransmitter&) = delete;

  [[nodiscard]] bool start();
  [[nodiscard]] bool try_send(const protocol::TelemetryBytes& packet) noexcept;
  void stop() noexcept;
  [[nodiscard]] TransmitterStats stats() const noexcept;
  [[nodiscard]] const std::string& error_message() const noexcept { return error_message_; }

 private:
  void run() noexcept;

  std::string host_;
  std::uint16_t port_;
  std::string error_message_;
  int socket_fd_{-1};
  SpscRingBuffer<protocol::TelemetryBytes, 1024> queue_;
  std::atomic<bool> running_{false};
  std::thread worker_;
  std::atomic<std::uint64_t> queued_{0};
  std::atomic<std::uint64_t> queue_dropped_{0};
  std::atomic<std::uint64_t> sent_{0};
  std::atomic<std::uint64_t> send_errors_{0};
};

}  // namespace flightdeck::generator
