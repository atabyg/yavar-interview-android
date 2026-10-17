#!/usr/bin/env bash
set -euo pipefail

MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle
TEMPLATE=native/NativeInterviewPlugin.java

# Microphone is required only for the recording explicitly started by the user.
if ! grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST"; then
  if grep -q 'android.permission.INTERNET' "$MANIFEST"; then
    sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />#' "$MANIFEST"
  else
    sed -i 's#<manifest#<manifest#' "$MANIFEST"
    sed -i '/<application/i\    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />' "$MANIFEST"
  fi
fi
grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST" || { echo "::error::Failed to add RECORD_AUDIO permission"; exit 1; }

# Keep sensitive interview data out of cloud backups.
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"

# Native biometric prompt for Android devices; API key is never embedded.
if ! grep -q 'androidx.biometric:biometric' "$GRADLE"; then
  sed -i '/dependencies[[:space:]]*{/a\    implementation "androidx.biometric:biometric:1.1.0"' "$GRADLE"
fi

MAIN=$(find android/app/src/main/java -name MainActivity.java -print -quit)
[ -n "$MAIN" ] || { echo "::error::MainActivity.java not found"; exit 1; }
[ -f "$TEMPLATE" ] || { echo "::error::NativeInterviewPlugin.java template not found"; exit 1; }
PKG=$(grep -m1 '^package ' "$MAIN" | sed 's/package \(.*\);/\1/')
TARGET_DIR=$(dirname "$MAIN")
sed "s/__PACKAGE__/$PKG/" "$TEMPLATE" > "$TARGET_DIR/NativeInterviewPlugin.java"

# Register the native plugin and preserve FLAG_SECURE.
cat > "$MAIN" <<EOF
package $PKG;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeInterviewPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
EOF

echo "minSdkVersion:"; grep -n 'minSdkVersion' android/variables.gradle || true
