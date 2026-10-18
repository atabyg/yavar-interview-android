#!/usr/bin/env bash
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle

add_perm() {
  local permission="$1"
  local declaration="$2"
  if ! grep -q "android.permission.$permission" "$MANIFEST"; then
    sed -i "/<manifest /a\\    $declaration" "$MANIFEST"
  fi
  grep -q "android.permission.$permission" "$MANIFEST" || { echo "::error::failed to add $permission"; exit 1; }
}
add_perm INTERNET '<uses-permission android:name="android.permission.INTERNET" />'
add_perm RECORD_AUDIO '<uses-permission android:name="android.permission.RECORD_AUDIO" />'
add_perm MODIFY_AUDIO_SETTINGS '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
add_perm WAKE_LOCK '<uses-permission android:name="android.permission.WAKE_LOCK" />'
if ! grep -q 'hardware.microphone' "$MANIFEST"; then
  sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.microphone" android:required="false" />' "$MANIFEST"
fi
if ! grep -q 'android.speech.RecognitionService' "$MANIFEST"; then
  sed -i '/<\/manifest>/i\    <queries>\n        <intent><action android:name="android.speech.RecognitionService" /></intent>\n    </queries>' "$MANIFEST"
fi
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"
sed -i -E "s/versionCode [0-9]+/versionCode 9/; s/versionName ['\"][^'\"]*['\"]/versionName \"9.0.0\"/" "$GRADLE"
grep -Eq 'versionCode 9' "$GRADLE" || { echo "::error::versionCode was not updated"; exit 1; }
grep -Eq 'versionName [\"'\\''\"]9.0.0[\"'\\''\"]' "$GRADLE" || { echo "::error::versionName was not updated"; exit 1; }

MAIN=$(find android/app/src/main/java -name MainActivity.java | head -n1)
test -n "$MAIN" || { echo "::error::MainActivity.java not found"; exit 1; }
PKG=$(grep -m1 '^package ' "$MAIN" | sed 's/package \(.*\);/\1/')
DIR=$(dirname "$MAIN")
PLUGIN="$DIR/OfflineSpeechPlugin.java"
cat > "$PLUGIN" <<'JAVA'
package PLACEHOLDER_PACKAGE;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OfflineSpeech")
public class OfflineSpeechPlugin extends Plugin implements RecognitionListener {
    private SpeechRecognizer recognizer;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean running = false;
    private boolean useOnDevice = false;
    private boolean onlineFallbackTried = false;
    private String language = "fa-IR";
    private int failures = 0;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean systemAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        JSObject ret = new JSObject();
        // Keep recognition available when the on-device engine is absent; the system service can use network speech recognition.
        ret.put("available", systemAvailable);
        ret.put("onDevice", onDevice);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        language = call.getString("language", "fa-IR");
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("offline_unavailable: Android speech recognition service is not available");
            return;
        }
        stopInternal();
        running = true;
        failures = 0;
        useOnDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        onlineFallbackTried = false;
        try {
            recognizer = useOnDevice
                ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())
                : SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(this);
            startListeningSafe();
            call.resolve();
        } catch (Exception ex) {
            stopInternal();
            call.reject("Could not start speech recognition", ex);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        running = false;
        handler.removeCallbacksAndMessages(null);
        try {
            if (recognizer != null) recognizer.stopListening();
        } catch (Exception ignored) {}
        handler.postDelayed(this::destroyRecognizer, 1600);
        call.resolve();
    }

    private void startListeningSafe() {
        if (!running || recognizer == null) return;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        // Prefer on-device only when Android confirms an on-device recognizer exists.
        // On Android 11 and when no local engine exists, allow the system's network recognizer.
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, useOnDevice);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        try {
            recognizer.startListening(intent);
        } catch (Exception ex) {
            emitError("مشکل در آغاز تشخیص گفتار؛ در حال تلاش دوباره.");
            scheduleRestart(1200);
        }
    }

    private void scheduleRestart(long delay) {
        if (!running) return;
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(() -> {
            if (!running) return;
            if (recognizer == null) {
                try {
                    recognizer = useOnDevice
                        ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())
                        : SpeechRecognizer.createSpeechRecognizer(getContext());
                    recognizer.setRecognitionListener(this);
                } catch (Exception ex) {
                    emitError("موتور تشخیص گفتار در دسترس نیست.");
                    return;
                }
            }
            startListeningSafe();
        }, delay);
    }

    private void emitError(String message) {
        JSObject data = new JSObject();
        data.put("message", message);
        notifyListeners("speechError", data);
    }

    private void destroyRecognizer() {
        try { if (recognizer != null) { recognizer.destroy(); } } catch (Exception ignored) {}
        recognizer = null;
    }

    private void stopInternal() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        destroyRecognizer();
    }

    private void publish(String event, String text) {
        if (text == null || text.trim().isEmpty()) return;
        JSObject data = new JSObject();
        data.put("text", text.trim());
        notifyListeners(event, data);
    }

    @Override public void onReadyForSpeech(Bundle params) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float rmsdB) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onEvent(int eventType, Bundle params) {}

    @Override public void onPartialResults(Bundle results) {
        if (results == null) return;
        ArrayList<String> text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (text != null && !text.isEmpty()) publish("partialResult", text.get(0));
    }

    @Override public void onResults(Bundle results) {
        if (results != null) {
            ArrayList<String> text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (text != null && !text.isEmpty()) publish("finalResult", text.get(0));
        }
        failures = 0;
        scheduleRestart(250);
    }

    private boolean fallbackToOnline(String reason) {
        if (!running || !useOnDevice || onlineFallbackTried) return false;
        onlineFallbackTried = true;
        useOnDevice = false;
        emitError(reason + "؛ موتور معمول اندروید امتحان می‌شود.");
        destroyRecognizer();
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(this);
            startListeningSafe();
        } catch (Exception ex) {
            emitError("موتور تشخیص گفتار آنلاین نیز در دسترس نیست.");
            scheduleRestart(1500);
        }
        return true;
    }

    @Override public void onError(int error) {
        if (!running) return;
        // Local engine availability does not guarantee that its Persian model is installed.
        if (useOnDevice && (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
            fallbackToOnline("بستهٔ فارسی آفلاین در دسترس نیست");
            return;
        }
        failures++;
        // Some local engines report repeated no-match/timeouts instead of a language error.
        // Switch to the regular system recognizer after repeated failures so text is not silently lost.
        if (useOnDevice && failures >= 3 && (error == SpeechRecognizer.ERROR_NO_MATCH
                || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                || error == SpeechRecognizer.ERROR_SERVER
                || error == SpeechRecognizer.ERROR_NETWORK
                || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                || error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
            fallbackToOnline("تشخیص آفلاین فارسی نتیجه‌ای نداد");
            return;
        }
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            emitError("مجوز میکروفن برای تشخیص گفتار داده نشده است.");
            running = false;
            return;
        }
        if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            emitError("موتور گفتار خطای موقت داد (کد " + error + ").");
        }
        scheduleRestart(Math.min(3000, 400 + failures * 250));
    }

    @Override protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }
}
JAVA
sed -i "s/PLACEHOLDER_PACKAGE/$PKG/" "$PLUGIN"

cat > "$MAIN" <<JAVA
package $PKG;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(OfflineSpeechPlugin.class);
        registerPlugin(OfflineWhisperPlugin.class);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
JAVA

# Install the native Whisper engine and offline speech plugin into the generated Capacitor project.
NATIVE_DIR="android/app/src/main/cpp"
JAVA_NATIVE_DIR="$(dirname "$MAIN")"
mkdir -p "$NATIVE_DIR" "$NATIVE_DIR/whisper.cpp"
WHISPER_ARCHIVE="/tmp/yavar-whisper-v1.9.4.tar.gz"
curl -fsSL --retry 3 "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.4.tar.gz" -o "$WHISPER_ARCHIVE"
tar -xzf "$WHISPER_ARCHIVE" --strip-components=1 -C "$NATIVE_DIR/whisper.cpp"
cp native/CMakeLists.txt "$NATIVE_DIR/CMakeLists.txt"
cp native/whisper_jni.cpp "$NATIVE_DIR/whisper_jni.cpp"
cp native/OfflineWhisperPlugin.java "$JAVA_NATIVE_DIR/OfflineWhisperPlugin.java"

# Bundle the multilingual Whisper model inside the APK so users never need an in-app model download.
MODEL_ASSET_DIR="android/app/src/main/assets/models"
MODEL_ASSET="$MODEL_ASSET_DIR/ggml-tiny-q5_1.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny-q5_1.bin?download=true"
MODEL_SHA256="818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"
mkdir -p "$MODEL_ASSET_DIR"
if [[ ! -s "$MODEL_ASSET" ]] || [[ "$(sha256sum "$MODEL_ASSET" | awk '{print $1}')" != "$MODEL_SHA256" ]]; then
  curl -fL --retry 4 --retry-delay 2 --connect-timeout 30 "$MODEL_URL" -o "$MODEL_ASSET.tmp"
  echo "$MODEL_SHA256  $MODEL_ASSET.tmp" | sha256sum -c -
  mv "$MODEL_ASSET.tmp" "$MODEL_ASSET"
fi
test -s "$MODEL_ASSET"
echo "Bundled offline Persian Whisper model: $(du -h "$MODEL_ASSET" | cut -f1)"
sed -i "s/__PACKAGE__/$PKG/g" "$JAVA_NATIVE_DIR/OfflineWhisperPlugin.java"
JNI_PKG="$(printf '%s' "$PKG" | tr '.' '/')"
sed -i "s|__PACKAGE_SLASH__|$JNI_PKG|g" "$NATIVE_DIR/whisper_jni.cpp"

# Enable the native CMake target for the ARM Android devices this app supports.
python3 - "$GRADLE" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()

if "android {" not in text:
    raise SystemExit("Could not find android block in build.gradle")

if "abiFilters" not in text:
    # Add the ARM ABIs supported by the local Whisper native library.
    text = re.sub(
        r"(?m)^(\s*defaultConfig\s*\{)",
        r'\1\n        ndk { abiFilters "arm64-v8a", "armeabi-v7a" }'
        '\n        externalNativeBuild { cmake { cppFlags "-std=c++17 -O3"; arguments "-DCMAKE_BUILD_TYPE=Release" } }',
        text,
        count=1,
    )

if 'path "src/main/cpp/CMakeLists.txt"' not in text:
    start = re.search(r"(?m)^android\s*\{", text)
    if not start:
        raise SystemExit("Could not locate the top-level android block")
    end = text.find("\n}\n", start.end())
    if end < 0:
        raise SystemExit("Could not locate the closing brace of the android block")
    block = (
        '    externalNativeBuild {\n'
        '        cmake {\n'
        '            path "src/main/cpp/CMakeLists.txt"\n'
        '            version "3.22.1"\n'
        '        }\n'
        '    }'
    )
    text = text[:end] + "\n" + block + text[end:]

# Sanity checks: CMake configuration must be within the android block, not repositories.
android_start = re.search(r"(?m)^android\s*\{", text)
repo_start = re.search(r"(?m)^repositories\s*\{", text)
cmake_path = text.find('path "src/main/cpp/CMakeLists.txt"')
android_end = text.find("\n}\n", android_start.end())
if cmake_path < android_start.end() or cmake_path > android_end:
    raise SystemExit("CMake configuration was not inserted inside the android block")
if repo_start and repo_start.start() < cmake_path < text.find("\n}\n", repo_start.end()):
    raise SystemExit("CMake configuration was incorrectly inserted inside repositories")

open(path, "w", encoding="utf-8").write(text)
PY
grep -q 'path "src/main/cpp/CMakeLists.txt"' "$GRADLE" || { echo "::error::CMake configuration missing"; exit 1; }
test -s "$NATIVE_DIR/whisper.cpp/CMakeLists.txt"
test -s "$JAVA_NATIVE_DIR/OfflineWhisperPlugin.java"

echo "Android v9 patch complete; local Whisper engine configured."
