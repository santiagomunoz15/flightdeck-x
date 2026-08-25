#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <optional>
#include <utility>

namespace flightdeck::generator {

// Capacity is the number of usable elements. One internal slot distinguishes
// full from empty. Exactly one thread may call try_push and one may call try_pop.
template <typename T, std::size_t Capacity>
class SpscRingBuffer {
  static_assert(Capacity > 0);

 public:
  [[nodiscard]] bool try_push(const T& value) noexcept {
    const std::size_t head = head_.load(std::memory_order_relaxed);
    const std::size_t next = increment(head);
    if (next == tail_.load(std::memory_order_acquire)) return false;
    storage_[head] = value;
    head_.store(next, std::memory_order_release);
    return true;
  }

  [[nodiscard]] std::optional<T> try_pop() noexcept {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);
    if (tail == head_.load(std::memory_order_acquire)) return std::nullopt;
    T value = std::move(storage_[tail]);
    tail_.store(increment(tail), std::memory_order_release);
    return value;
  }

  [[nodiscard]] bool empty() const noexcept {
    return head_.load(std::memory_order_acquire) ==
           tail_.load(std::memory_order_acquire);
  }

 private:
  static constexpr std::size_t kStorageSize = Capacity + 1U;
  [[nodiscard]] static constexpr std::size_t increment(std::size_t index) noexcept {
    return (index + 1U) % kStorageSize;
  }

  std::array<T, kStorageSize> storage_{};
  alignas(64) std::atomic<std::size_t> head_{0};
  alignas(64) std::atomic<std::size_t> tail_{0};
};

}  // namespace flightdeck::generator
