# Sherpa's JNI implementation looks up fields and methods by their original names.
# Keep the Java/Kotlin wrapper API intact in minified release builds.
-keep class com.k2fsa.sherpa.onnx.** { *; }
