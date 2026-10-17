#!/usr/bin/env bash
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle

add_perm() {
  grep -q "$1" "$MANIFEST" || sed -i "s#<uses-permission android:name=\"android.permission.INTERNET\" />#<uses-permission android:name=\"android.permission.INTERNET\" />\n    $2#" "$MANIFEST"
  grep -q "$1" "$MANIFEST" || { echo "::error::failed to add $1"; exit 1; }
}
add_perm RECORD_AUDIO '<uses-permission android:name="android.permission.RECORD_AUDIO" />'
add_perm MODIFY_AUDIO_SETTINGS '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
add_perm WAKE_LOCK '<uses-permission android:name="android.permission.WAKE_LOCK" />'
# microphone is optional so the app still installs on any device
grep -q 'hardware.microphone' "$MANIFEST" || sed -i 's#<application#<uses-feature android:name="android.hardware.microphone" android:required="false" />\n    <application#' "$MANIFEST"

# interview data must not go to cloud backup
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"

# version 8.0.0
sed -i -E 's/versionCode [0-9]+/versionCode 8/; s/versionName "[^"]*"/versionName "8.0.0"/' "$GRADLE"

# Screen stays on while the app is open (prevents the mic being cut when the screen sleeps),
# and screenshots / recents thumbnails are blocked.
MAIN=$(find android/app/src/main/java -name MainActivity.java | head -n1)
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
echo "minSdkVersion:"; grep -n 'minSdkVersion' android/variables.gradle || true
