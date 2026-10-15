cmake_minimum_required(VERSION 3.16)
project(polodeck_shot_clock_core LANGUAGES CXX)

add_library(polodeck_core lib/polodeck_core/src/ShotClockCore.cpp)
target_include_directories(polodeck_core PUBLIC lib/polodeck_core/include)
target_compile_features(polodeck_core PUBLIC cxx_std_17)

add_executable(polodeck_core_tests test/native/test_shot_clock_core.cpp)
target_link_libraries(polodeck_core_tests PRIVATE polodeck_core)

enable_testing()
add_test(NAME polodeck_core_tests COMMAND polodeck_core_tests)
