#include "flightdeck/telemetry.hpp"

#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#include <array>
#include <cerrno>
#include <csignal>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <optional>
#include <string_view>

namespace {

volatile std::sig_atomic_t stop_requested = 0;

void handle_signal(int) { stop_requested = 1; }

std::string_view phase_name(flightdeck::protocol::MissionPhase phase) {
  using flightdeck::protocol::MissionPhase;
  switch (phase) {
    case MissionPhase::prelaunch: return "PRELAUNCH";
    case MissionPhase::powered_ascent: return "POWERED_ASCENT";
    case MissionPhase::coast: return "COAST";
    case MissionPhase::descent: return "DESCENT";
    case MissionPhase::landing_burn: return "LANDING_BURN";
    case MissionPhase::landed: return "LANDED";
  }
  return "UNKNOWN";
}

struct ReceiverStats {
  std::uint64_t received{};
  std::uint64_t valid{};
  std::uint64_t rejected{};
  std::uint64_t lost{};
  std::uint64_t reordered{};
};

void print_stats(const ReceiverStats& stats) {
  std::cout << "packets received=" << stats.received
            << " valid=" << stats.valid
            << " rejected=" << stats.rejected
            << " lost=" << stats.lost
            << " reordered=" << stats.reordered << '\n';
}

}  // namespace

int main(int argc, char* argv[]) {
  std::uint64_t max_packets = 0;
  if (argc == 3 && std::string_view{argv[1]} == "--max-packets") {
    max_packets = std::strtoull(argv[2], nullptr, 10);
  } else if (argc != 1) {
    std::cerr << "Usage: " << argv[0] << " [--max-packets COUNT]\n";
    return 2;
  }

  const int socket_fd = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (socket_fd < 0) {
    std::cerr << "socket: " << std::strerror(errno) << '\n';
    return 1;
  }

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(5000);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::bind(socket_fd, reinterpret_cast<const sockaddr*>(&address),
             sizeof(address)) < 0) {
    std::cerr << "bind: " << std::strerror(errno) << '\n';
    ::close(socket_fd);
    return 1;
  }

  const timeval receive_timeout{.tv_sec = 0, .tv_usec = 250'000};
  if (::setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &receive_timeout,
                   sizeof(receive_timeout)) < 0) {
    std::cerr << "setsockopt: " << std::strerror(errno) << '\n';
    ::close(socket_fd);
    return 1;
  }

  std::signal(SIGINT, handle_signal);
  std::signal(SIGTERM, handle_signal);
  std::cout << "Listening for FlightDeck telemetry on 127.0.0.1:5000\n";

  ReceiverStats stats{};
  std::optional<std::uint32_t> latest_sequence;
  std::array<std::byte, 2048> buffer{};
  while (!stop_requested && (max_packets == 0 || stats.received < max_packets)) {
    const ssize_t size = ::recvfrom(socket_fd, buffer.data(), buffer.size(), 0,
                                    nullptr, nullptr);
    if (size < 0) {
      if (errno == EINTR) continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
      std::cerr << "recvfrom: " << std::strerror(errno) << '\n';
      break;
    }
    ++stats.received;
    const auto result = flightdeck::protocol::deserialize(
        std::span<const std::byte>(buffer).first(static_cast<std::size_t>(size)));
    if (!result) {
      ++stats.rejected;
      continue;
    }
    ++stats.valid;

    if (latest_sequence) {
      const std::uint32_t delta = result.telemetry.sequence - *latest_sequence;
      if (delta > 1U && delta < 0x80000000U) {
        stats.lost += delta - 1U;
      } else if (delta == 0U || delta >= 0x80000000U) {
        ++stats.reordered;
      }
      if (delta > 0U && delta < 0x80000000U) {
        latest_sequence = result.telemetry.sequence;
      }
    } else {
      latest_sequence = result.telemetry.sequence;
    }

    if (stats.valid == 1U || stats.valid % 100U == 0U ||
        result.telemetry.mission_phase == flightdeck::protocol::MissionPhase::landed) {
      std::cout << std::fixed << std::setprecision(2)
                << "seq=" << result.telemetry.sequence
                << " phase=" << phase_name(result.telemetry.mission_phase)
                << " altitude=" << result.telemetry.position_m[2] << " m"
                << " velocity=" << result.telemetry.velocity_mps[2] << " m/s\n";
    }
  }

  print_stats(stats);
  ::close(socket_fd);
  return 0;
}
