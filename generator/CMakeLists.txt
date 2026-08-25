find_package(Threads REQUIRED)

add_library(flightdeck_simulation src/flight_simulation.cpp)
target_include_directories(flightdeck_simulation PUBLIC include)
target_compile_features(flightdeck_simulation PUBLIC cxx_std_20)

add_executable(flight_simulator src/main.cpp)
target_link_libraries(flight_simulator PRIVATE flightdeck_simulation flightdeck_protocol Threads::Threads)

add_library(flightdeck_network src/udp_transmitter.cpp)
target_include_directories(flightdeck_network PUBLIC include)
target_link_libraries(flightdeck_network PUBLIC flightdeck_protocol Threads::Threads)
target_compile_features(flightdeck_network PUBLIC cxx_std_20)
target_link_libraries(flight_simulator PRIVATE flightdeck_network)

add_executable(telemetry_receiver src/receiver_main.cpp)
target_link_libraries(telemetry_receiver PRIVATE flightdeck_protocol)

add_executable(flight_simulation_test tests/flight_simulation_test.cpp)
target_link_libraries(flight_simulation_test PRIVATE flightdeck_simulation)

add_executable(spsc_ring_buffer_test tests/spsc_ring_buffer_test.cpp)
target_link_libraries(spsc_ring_buffer_test PRIVATE Threads::Threads)
target_include_directories(spsc_ring_buffer_test PRIVATE include)
target_compile_features(spsc_ring_buffer_test PRIVATE cxx_std_20)

foreach(target flightdeck_simulation flightdeck_network flight_simulator telemetry_receiver
               flight_simulation_test spsc_ring_buffer_test)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /WX)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
endforeach()

add_test(NAME flight_simulation_test COMMAND flight_simulation_test)
add_test(NAME spsc_ring_buffer_test COMMAND spsc_ring_buffer_test)
