#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$PWD/.local/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PWD/.local/gradle}"
export CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -d "$ANDROID_HOME/platforms" ]]; then
  echo "Android SDK platforms not found at $ANDROID_HOME" >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --no-audit --no-fund
fi
npx --no-install expo prebuild --platform android --no-install
cd android
# Compile a standalone test APK with bundled JS, signed with the generated
# development key. This is not a Play Store production signing identity.
./gradlew assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m'
cd ..
mkdir -p artifacts
cp android/app/build/outputs/apk/release/app-release.apk artifacts/astha-pos-android-arm64.apk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose artifacts/astha-pos-android-arm64.apk
shasum -a 256 artifacts/astha-pos-android-arm64.apk
