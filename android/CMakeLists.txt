cmake_minimum_required(VERSION 3.22.1)
project(nitrowakeword LANGUAGES CXX)

set(PACKAGE_NAME nitrowakeword)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(${PACKAGE_NAME} SHARED src/main/cpp/cpp-adapter.cpp)

# Nitrogen specs
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/nitrowakeword+autolinking.cmake)

target_include_directories(${PACKAGE_NAME} PRIVATE "src/main/cpp")

find_library(LOG_LIB log)

target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
)
