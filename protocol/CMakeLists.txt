add_library(flightdeck_protocol
  src/telemetry.cpp
)

target_include_directories(flightdeck_protocol PUBLIC include)
target_compile_features(flightdeck_protocol PUBLIC cxx_std_20)

if(MSVC)
  target_compile_options(flightdeck_protocol PRIVATE /W4 /WX)
else()
  target_compile_options(flightdeck_protocol PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

add_executable(telemetry_test tests/telemetry_test.cpp)
target_link_libraries(telemetry_test PRIVATE flightdeck_protocol)

if(MSVC)
  target_compile_options(telemetry_test PRIVATE /W4 /WX)
else()
  target_compile_options(telemetry_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

add_test(NAME telemetry_test COMMAND telemetry_test)

