require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroWakeWord"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/mikevocalz/nitro-wakeword.git", :tag => "#{s.version}" }
  # Language mode, not the compiler release. C++ interop still requires a modern toolchain.
  s.swift_version = "5.0"

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{h,m,mm}",
  ]
  # Objective-C wrapper over ONNX Runtime, visible to the Swift sources of this pod.
  s.public_header_files = ["ios/OnnxSession.h"]

  s.frameworks = "AVFoundation"
  # ONNX Runtime C/C++ API (no `use_modular_headers!` needed, unlike onnxruntime-objc).
  s.dependency "onnxruntime-c", ">= 1.20.0"

  load 'nitrogen/generated/ios/NitroWakeWord+autolinking.rb'
  add_nitrogen_files(s)
end
