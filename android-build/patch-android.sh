#!/usr/bin/env bash
set -euo pipefail

MANIFEST=android/app/src/main/AndroidManifest.xml

# Microphone permissions for recording the interview.
if ! grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST"; then
  sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />#' "$MANIFEST"
fi
grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST" || { echo "::error::Failed to add RECORD_AUDIO permission"; exit 1; }

# Keep sensitive interview data out of cloud backups.
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"

# Block screenshots / recents thumbnails (FLAG_SECURE).
MAIN=$(find android/app/src/main/java -name MainActivity.java | head -n1)
PKG=$(grep -m1 '^package ' "$MAIN" | sed 's/package \(.*\);/\1/')
cat > "$MAIN" <<EOF
package $PKG;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
EOF

echo "minSdkVersion:"; grep -n 'minSdkVersion' android/variables.gradle || true
