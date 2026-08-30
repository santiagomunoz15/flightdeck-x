#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <thread>

namespace flightdeck::generator {

inline constexpr std::uint32_t kThrusterLoss = 1U << 0U;
inline constexpr std::uint32_t kSensorNoise = 1U << 1U;
inline constexpr std::uint32_t kPacketLoss = 1U << 2U;

class ControlServer {
 public:
  explicit ControlServer(std::uint16_t port = 5001) : port_(port) {}
  ~ControlServer();
  ControlServer(const ControlServer&) = delete;
  ControlServer& operator=(const ControlServer&) = delete;

  [[nodiscard]] bool start();
  void stop() noexcept;
  [[nodiscard]] std::uint32_t fault_flags() const noexcept {
    return fault_flags_.load(std::memory_order_acquire);
  }
  [[nodiscard]] bool paused() const noexcept { return paused_.load(std::memory_order_acquire); }
  [[nodiscard]] bool consume_abort_request() noexcept { return abort_requested_.exchange(false, std::memory_order_acq_rel); }
  [[nodiscard]] bool consume_fts_request() noexcept { return fts_requested_.exchange(false, std::memory_order_acq_rel); }
  [[nodiscard]] const std::string& error_message() const noexcept { return error_message_; }

 private:
  void run() noexcept;
  void handle_client(int client_fd) noexcept;
  [[nodiscard]] std::string handle_command(const std::string& line) noexcept;

  std::uint16_t port_;
  int socket_fd_{-1};
  std::string error_message_;
  std::atomic<bool> running_{false};
  std::atomic<std::uint32_t> fault_flags_{0};
  std::atomic<bool> paused_{false};
  std::atomic<bool> abort_requested_{false};
  std::atomic<bool> fts_requested_{false};
  std::thread worker_;
};

}  // namespace flightdeck::generator
