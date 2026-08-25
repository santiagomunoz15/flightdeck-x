add_library(flightdeck_simulation src/flight_simulation.cpp)
target_include_directories(flightdeck_simulation PUBLIC include)
target_compile_features(flightdeck_simulation PUBLIC cxx_std_20)

add_executable(flight_simulator src/main.cpp)
target_link_libraries(flight_simulator PRIVATE flightdeck_simulation)

add_executable(flight_simulation_test tests/flight_simulation_test.cpp)
target_link_libraries(flight_simulation_test PRIVATE flightdeck_simulation)

foreach(target flightdeck_simulation flight_simulator flight_simulation_test)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /WX)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
endforeach()

add_test(NAME flight_simulation_test COMMAND flight_simulation_test)
