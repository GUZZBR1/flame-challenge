cmake_minimum_required(VERSION 3.20)
project(freefall_engine CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ---- pure physics core (no deps — also the Emscripten target) ----
add_library(ffengine STATIC
    src/combustion_solver.cpp
    src/airflow_propagator.cpp
    src/material_risk.cpp
    src/chamber.cpp
)
target_include_directories(ffengine PUBLIC include)
target_compile_options(ffengine PRIVATE -O2 -Wall -Wextra)

if(EMSCRIPTEN)
    # WASM build for the browser client (same C++ core, embind API).
    # Usage: emcmake cmake .. -DEMSCRIPTEN=ON && emmake make ffengine_wasm
    add_executable(ffengine_wasm bindings/wasm.cpp
        $<TARGET_OBJECTS:ffengine>)
    target_include_directories(ffengine_wasm PRIVATE include)
    set_target_properties(ffengine_wasm PROPERTIES
        OUTPUT_NAME freefall_engine
        SUFFIX .js
        LINK_FLAGS "-lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1")
endif()

# ---- pybind11 native module ----
if(NOT EMSCRIPTEN)
    find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
    if(NOT PYBIND11_CMAKE_DIR)
        execute_process(
            COMMAND ${Python3_EXECUTABLE} -c "import pybind11; print(pybind11.get_cmake_dir())"
            OUTPUT_VARIABLE PYBIND11_CMAKE_DIR
            OUTPUT_STRIP_TRAILING_WHITESPACE
            ERROR_QUIET)
    endif()
    if(PYBIND11_CMAKE_DIR)
        list(APPEND CMAKE_PREFIX_PATH "${PYBIND11_CMAKE_DIR}")
        find_package(pybind11 CONFIG REQUIRED)
        pybind11_add_module(freefall_engine bindings/python.cpp)
        target_link_libraries(freefall_engine PRIVATE ffengine)
    else()
        message(WARNING "pybind11 not found — skipping python module (pip install pybind11)")
    endif()

    enable_testing()
    add_executable(test_physics tests/test_physics_accuracy.cpp)
    target_link_libraries(test_physics PRIVATE ffengine)
    add_test(NAME physics_accuracy COMMAND test_physics)
endif()
