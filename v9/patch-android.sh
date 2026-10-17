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
    private String language = "fa-IR";
    private int failures = 0;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean systemAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", systemAvailable && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || onDevice));
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && !SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            call.reject("offline_unavailable: on-device speech recognition is not installed");
            return;
        }
        stopInternal();
        running = true;
        failures = 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            } else {
                // Older Android versions only offer a preference hint; some recognition services may ignore it.
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            }
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
        handler.postDelayed(this::destroyRecognizer, 350);
        call.resolve();
    }

    private void startListeningSafe() {
        if (!running || recognizer == null) return;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
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
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                    else recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
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

    @Override public void onError(int error) {
        if (!running) return;
        failures++;
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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
JAVA
echo "Android version 9 patch complete."
