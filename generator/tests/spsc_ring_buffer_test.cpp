#include "flightdeck/spsc_ring_buffer.hpp"

#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <thread>

namespace {

void require(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    std::exit(EXIT_FAILURE);
  }
}

void test_capacity_boundary() {
  flightdeck::generator::SpscRingBuffer<int, 2> queue;
  require(queue.empty(), "new queue is not empty");
  require(queue.try_push(10), "first push failed");
  require(queue.try_push(20), "second push failed");
  require(!queue.try_push(30), "push succeeded beyond capacity");
  require(queue.try_pop() == 10, "first value was not FIFO");
  require(queue.try_pop() == 20, "second value was not FIFO");
  require(!queue.try_pop().has_value(), "empty queue returned a value");
}

void test_concurrent_ordering() {
  constexpr std::uint32_t kCount = 100'000;
  flightdeck::generator::SpscRingBuffer<std::uint32_t, 256> queue;
  std::atomic<bool> failed{false};

  std::thread consumer([&] {
    for (std::uint32_t expected = 0; expected < kCount;) {
      if (const auto value = queue.try_pop()) {
        if (*value != expected) failed.store(true, std::memory_order_relaxed);
        ++expected;
      } else {
        std::this_thread::yield();
      }
    }
  });

  for (std::uint32_t value = 0; value < kCount;) {
    if (queue.try_push(value)) {
      ++value;
    } else {
      std::this_thread::yield();
    }
  }
  consumer.join();
  require(!failed.load(std::memory_order_relaxed),
          "concurrent queue values were reordered or corrupted");
  require(queue.empty(), "queue was not empty after concurrent transfer");
}

}  // namespace

int main() {
  test_capacity_boundary();
  test_concurrent_ordering();
  std::cout << "All SPSC ring buffer tests passed\n";
}
