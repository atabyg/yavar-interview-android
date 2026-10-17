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
# Microphone is optional so the app can install on devices without a microphone.
if ! grep -q 'hardware.microphone' "$MANIFEST"; then
  sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.microphone" android:required="false" />' "$MANIFEST"
fi

# Interview data must not go to cloud backup.
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"

# Set the application version regardless of whether the generated template uses single or double quotes.
sed -i -E "s/versionCode [0-9]+/versionCode 8/; s/versionName ['\"][^'\"]*['\"]/versionName \"8.0.0\"/" "$GRADLE"
grep -Eq 'versionCode 8' "$GRADLE" || { echo "::error::versionCode was not updated"; exit 1; }
grep -Eq 'versionName ["'\''"]8.0.0["'\''"]' "$GRADLE" || { echo "::error::versionName was not updated"; exit 1; }

# Keep the screen on during a recording session and block screenshots/recents thumbnails.
MAIN=$(find android/app/src/main/java -name MainActivity.java | head -n1)
test -n "$MAIN" || { echo "::error::MainActivity.java not found"; exit 1; }
PKG=$(grep -m1 '^package ' "$MAIN" | sed 's/package \(.*\);/\1/')
cat > "$MAIN" <<JAVA
package $PKG;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
JAVA
echo "minSdkVersion:"
grep -n 'minSdkVersion' android/variables.gradle || true
