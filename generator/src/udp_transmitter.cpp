#include "flightdeck/udp_transmitter.hpp"

#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>

#include <chrono>
#include <cerrno>
#include <cstring>
#include <thread>
#include <utility>

namespace flightdeck::generator {

UdpTransmitter::UdpTransmitter(std::string host, std::uint16_t port)
    : host_(std::move(host)), port_(port) {}

UdpTransmitter::~UdpTransmitter() { stop(); }

bool UdpTransmitter::start() {
  if (running_.load(std::memory_order_acquire)) return true;
  socket_fd_ = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (socket_fd_ < 0) {
    error_message_ = std::strerror(errno);
    return false;
  }
  in_addr address{};
  if (::inet_pton(AF_INET, host_.c_str(), &address) != 1) {
    error_message_ = "host must be an IPv4 address";
    ::close(socket_fd_);
    socket_fd_ = -1;
    return false;
  }
  running_.store(true, std::memory_order_release);
  worker_ = std::thread(&UdpTransmitter::run, this);
  return true;
}

bool UdpTransmitter::try_send(const protocol::TelemetryBytes& packet) noexcept {
  if (!running_.load(std::memory_order_acquire)) return false;
  if (!queue_.try_push(packet)) {
    queue_dropped_.fetch_add(1, std::memory_order_relaxed);
    return false;
  }
  queued_.fetch_add(1, std::memory_order_relaxed);
  return true;
}

void UdpTransmitter::run() noexcept {
  sockaddr_in destination{};
  destination.sin_family = AF_INET;
  destination.sin_port = htons(port_);
  static_cast<void>(::inet_pton(AF_INET, host_.c_str(), &destination.sin_addr));

  while (running_.load(std::memory_order_acquire) || !queue_.empty()) {
    const auto packet = queue_.try_pop();
    if (!packet) {
      std::this_thread::sleep_for(std::chrono::microseconds{100});
      continue;
    }
    const auto bytes_sent = ::sendto(
        socket_fd_, packet->data(), packet->size(), 0,
        reinterpret_cast<const sockaddr*>(&destination), sizeof(destination));
    if (bytes_sent == static_cast<ssize_t>(packet->size())) {
      sent_.fetch_add(1, std::memory_order_relaxed);
    } else {
      send_errors_.fetch_add(1, std::memory_order_relaxed);
    }
  }
}

void UdpTransmitter::stop() noexcept {
  running_.store(false, std::memory_order_release);
  if (worker_.joinable()) worker_.join();
  if (socket_fd_ >= 0) {
    ::close(socket_fd_);
    socket_fd_ = -1;
  }
}

TransmitterStats UdpTransmitter::stats() const noexcept {
  return {
      queued_.load(std::memory_order_relaxed),
      queue_dropped_.load(std::memory_order_relaxed),
      sent_.load(std::memory_order_relaxed),
      send_errors_.load(std::memory_order_relaxed),
  };
}

}  // namespace flightdeck::generator
