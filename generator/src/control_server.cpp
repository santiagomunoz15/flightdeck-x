#include "flightdeck/control_server.hpp"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

#include <array>
#include <cerrno>
#include <cstring>
#include <sstream>
#include <string_view>

namespace flightdeck::generator {
namespace {

std::uint32_t fault_mask(std::string_view name) {
  if (name == "thruster_loss") return kThrusterLoss;
  if (name == "sensor_noise") return kSensorNoise;
  if (name == "packet_loss") return kPacketLoss;
  return 0;
}

}  // namespace

ControlServer::~ControlServer() { stop(); }

bool ControlServer::start() {
  socket_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
  if (socket_fd_ < 0) { error_message_ = std::strerror(errno); return false; }
  const int reuse = 1;
  static_cast<void>(::setsockopt(socket_fd_, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)));
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port_);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::bind(socket_fd_, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) < 0 ||
      ::listen(socket_fd_, 4) < 0) {
    error_message_ = std::strerror(errno);
    ::close(socket_fd_); socket_fd_ = -1; return false;
  }
  running_.store(true, std::memory_order_release);
  worker_ = std::thread(&ControlServer::run, this);
  return true;
}

void ControlServer::run() noexcept {
  while (running_.load(std::memory_order_acquire)) {
    fd_set sockets;
    FD_ZERO(&sockets); FD_SET(socket_fd_, &sockets);
    timeval timeout{.tv_sec = 0, .tv_usec = 250'000};
    if (::select(socket_fd_ + 1, &sockets, nullptr, nullptr, &timeout) <= 0) continue;
    const int client = ::accept(socket_fd_, nullptr, nullptr);
    if (client >= 0) handle_client(client);
  }
}

void ControlServer::handle_client(int client_fd) noexcept {
  timeval timeout{.tv_sec = 0, .tv_usec = 250'000};
  static_cast<void>(::setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)));
  std::string pending;
  std::array<char, 1024> buffer{};
  while (running_.load(std::memory_order_acquire)) {
    const ssize_t size = ::recv(client_fd, buffer.data(), buffer.size(), 0);
    if (size == 0) break;
    if (size < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) continue;
      break;
    }
    pending.append(buffer.data(), static_cast<std::size_t>(size));
    for (std::size_t newline; (newline = pending.find('\n')) != std::string::npos;) {
      const std::string response = handle_command(pending.substr(0, newline));
      pending.erase(0, newline + 1U);
      static_cast<void>(::send(client_fd, response.data(), response.size(), 0));
    }
  }
  ::close(client_fd);
}

std::string ControlServer::handle_command(const std::string& line) noexcept {
  std::istringstream input(line);
  std::string verb, id, control, enabled_text;
  if (!std::getline(input, verb, '\t') || !std::getline(input, id, '\t') ||
      !std::getline(input, control, '\t') || !std::getline(input, enabled_text) ||
      verb != "COMMAND" || id.empty()) {
    return "ERROR\tmalformed_command\n";
  }
  if (enabled_text != "0" && enabled_text != "1") {
    return "ERROR\tinvalid_control\n";
  }
  const bool enabled = enabled_text == "1";
  const std::uint32_t mask = fault_mask(control);
  if (mask != 0U) {
    if (enabled) fault_flags_.fetch_or(mask, std::memory_order_acq_rel);
    else fault_flags_.fetch_and(~mask, std::memory_order_acq_rel);
  } else if (control == "pause") {
    paused_.store(enabled, std::memory_order_release);
  } else if (control == "abort") {
    if (enabled) abort_requested_.store(true, std::memory_order_release);
  } else if (control == "fts") {
    if (enabled) fts_requested_.store(true, std::memory_order_release);
  } else {
    return "ERROR\tinvalid_control\n";
  }
  return "ACK\t" + id + "\t" + control + "\t" + enabled_text + "\n";
}

void ControlServer::stop() noexcept {
  running_.store(false, std::memory_order_release);
  if (socket_fd_ >= 0) { ::shutdown(socket_fd_, SHUT_RDWR); ::close(socket_fd_); socket_fd_ = -1; }
  if (worker_.joinable()) worker_.join();
}

}  // namespace flightdeck::generator
