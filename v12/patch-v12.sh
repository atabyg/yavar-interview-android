#!/usr/bin/env bash
# v12 patch: runs after patch-android.sh. Fixes (1) native plugin registration order, (2) version 11,
# (3) stable signing key so a new APK installs OVER an older v11+ install, (4) clean uninstall (no auto-backup/restore leftovers).
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle
MAIN=$(find android/app/src/main/java -name MainActivity.java | head -n1)
test -n "$MAIN" || { echo "::error::MainActivity.java not found"; exit 1; }
PKG=$(grep -m1 '^package ' "$MAIN" | sed 's/package \(.*\);/\1/')

# 1) Capacitor requires registerPlugin() BEFORE super.onCreate(); otherwise OfflineWhisper is "not implemented" on Android
#    and the Settings page shows the offline-model error.
cat > "$MAIN" <<JAVA
package $PKG;

import android.os.Bundle;
import android.content.Intent;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineSpeechPlugin.class);
        registerPlugin(OfflineWhisperPlugin.class);
        registerPlugin(SharedInboxPlugin.class);
        super.onCreate(savedInstanceState);
        SharedInboxPlugin.setPendingIntent(getIntent());
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        SharedInboxPlugin.setPendingIntent(intent);
    }
}
JAVA
grep -q 'registerPlugin(OfflineWhisperPlugin.class);' "$MAIN" || { echo "::error::plugin registration missing"; exit 1; }
grep -q 'registerPlugin(SharedInboxPlugin.class);' "$MAIN" || { echo "::error::SharedInbox plugin registration missing"; exit 1; }

# 1b) Android Share / Open-with bridge for coded TXT or DOCX results from external AI apps.
SHARED_PLUGIN="$DIR/SharedInboxPlugin.java"
cat > "$SHARED_PLUGIN" <<JAVA
package $PKG;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "SharedInbox")
public class SharedInboxPlugin extends Plugin {
    private static volatile Intent pendingIntent;
    private static volatile SharedInboxPlugin instance;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    public static void setPendingIntent(Intent intent) {
        if (intent == null) return;
        pendingIntent = new Intent(intent);
        SharedInboxPlugin active = instance;
        if (active != null) {
            JSObject event = new JSObject();
            event.put("available", true);
            active.notifyListeners("sharedContent", event);
        }
    }
    @Override public void load() { super.load(); instance = this; }

    @PluginMethod public void consume(PluginCall call) {
        final Intent intent = pendingIntent;
        pendingIntent = null;
        if (intent == null) { call.resolve(new JSObject()); return; }
        worker.execute(() -> {
            try {
                JSObject out = new JSObject();
                Uri uri = extractUri(intent);
                if (uri != null) {
                    String name = displayName(uri);
                    String mime = getContext().getContentResolver().getType(uri);
                    if (mime == null || mime.trim().isEmpty()) mime = intent.getType() == null ? "application/octet-stream" : intent.getType();
                    byte[] bytes = readBounded(uri);
                    out.put("name", name); out.put("mimeType", mime);
                    if (isTextFile(name, mime)) out.put("text", new String(bytes, StandardCharsets.UTF_8).replace("\uFEFF", ""));
                    else out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                } else {
                    CharSequence raw = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                    if (raw != null && raw.length() > 0) { out.put("text", raw.toString()); out.put("name", "shared-result.txt"); out.put("mimeType", "text/plain"); }
                }
                getActivity().runOnUiThread(() -> call.resolve(out));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("خواندن فایل دریافتی از برنامهٔ دیگر ممکن نشد: " + String.valueOf(error.getMessage()), error));
            }
        });
    }
    private Uri extractUri(Intent intent) {
        if (Intent.ACTION_VIEW.equals(intent.getAction())) return intent.getData();
        Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream instanceof Uri) return (Uri) stream;
        try { ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (streams != null && !streams.isEmpty()) return streams.get(0); } catch (Exception ignored) {}
        return null;
    }
    private String displayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) { int col = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (col >= 0) return cursor.getString(col); }
        } catch (Exception ignored) { } finally { if (cursor != null) cursor.close(); }
        String fallback = uri.getLastPathSegment();
        return fallback == null || fallback.trim().isEmpty() ? "shared-result.txt" : fallback;
    }
    private byte[] readBounded(Uri uri) throws IOException {
        final int maxBytes = 20 * 1024 * 1024;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IOException("فایل قابل خواندن نیست.");
            byte[] buffer = new byte[32768]; int count, total = 0;
            while ((count = in.read(buffer)) != -1) { total += count; if (total > maxBytes) throw new IOException("حجم فایل اشتراک‌گذاری‌شده بیشتر از ۲۰ مگابایت است."); out.write(buffer, 0, count); }
            return out.toByteArray();
        }
    }
    private boolean isTextFile(String name, String mime) {
        String lower = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".zip")) return false;
        return (mime != null && mime.startsWith("text/")) || lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".text");
    }
    @Override protected void handleOnDestroy() { if (instance == this) instance = null; worker.shutdown(); super.handleOnDestroy(); }
}
JAVA

# 1c) Make the app visible in Android's Share / Open-with chooser for TXT and DOCX results.
python3 - "$MANIFEST" <<'PY'
import re, sys
from pathlib import Path
p = Path(sys.argv[1])
s = p.read_text(encoding="utf-8")
if "YAVAR_SHARED_INTENT" not in s:
    filters = """
        <!-- YAVAR_SHARED_INTENT: receive coded AI result TXT / DOCX -->
        <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="text/plain" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="text/markdown" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/octet-stream" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.SEND_MULTIPLE" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="text/plain" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.SEND_MULTIPLE" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="content" android:mimeType="text/plain" /></intent-filter>
        <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="content" android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></intent-filter>
"""
    pattern = r'(<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>)(.*?)(</activity>)'
    def modify(m):
        opening = m.group(1)
        if re.search(r'android:launchMode=', opening): opening = re.sub(r'android:launchMode="[^"]+"', 'android:launchMode="singleTask"', opening)
        else: opening = opening[:-1] + ' android:launchMode="singleTask">'
        return opening + m.group(2) + filters + m.group(3)
    s, n = re.subn(pattern, modify, s, count=1, flags=re.S)
    if n != 1: raise SystemExit("Could not find MainActivity in AndroidManifest.xml")
    p.write_text(s, encoding="utf-8")
PY


# 2) Version 12
sed -i -E "s/versionCode [0-9]+/versionCode 12/; s/versionName ['\"][^'\"]*['\"]/versionName \"12.0.0\"/" "$GRADLE"
grep -Eq 'versionCode 12' "$GRADLE" || { echo "::error::versionCode 12 not set"; exit 1; }

# 3) Optional stable signing from GitHub Actions Secrets; never store keystore bytes/passwords in the public repository.
# Set YAVAR_KEYSTORE_B64, YAVAR_STORE_PASSWORD, YAVAR_KEY_ALIAS and YAVAR_KEY_PASSWORD in repository Actions secrets.
# Without them Gradle's standard debug signature is used; APK build succeeds but upgrade compatibility is not guaranteed.
if [[ -n "${YAVAR_KEYSTORE_B64:-}" && -n "${YAVAR_STORE_PASSWORD:-}" && -n "${YAVAR_KEY_ALIAS:-}" && -n "${YAVAR_KEY_PASSWORD:-}" ]]; then
  printf '%s' "$YAVAR_KEYSTORE_B64" | base64 -d > android/app/yavar-release.jks
  test -s android/app/yavar-release.jks
  python3 - "$GRADLE" <<'PY'
import re, sys
p = sys.argv[1]
t = open(p, encoding="utf-8").read()
if 'signingConfigs.yavar' not in t:
    sign = '''    signingConfigs {
        yavar {
            storeFile file("yavar-release.jks")
            storePassword System.getenv("YAVAR_STORE_PASSWORD")
            keyAlias System.getenv("YAVAR_KEY_ALIAS")
            keyPassword System.getenv("YAVAR_KEY_PASSWORD")
        }
    }
'''
    t = re.sub(r'(?m)^android\s*\{', lambda m: m.group(0) + '\n' + sign, t, count=1)
    if re.search(r'(?m)^\s*debug\s*\{', t) is None:
        t = re.sub(r'(?m)^(\s*)buildTypes\s*\{', lambda m: m.group(0) + '\n' + m.group(1) + '    debug { signingConfig signingConfigs.yavar }', t, count=1)
open(p, 'w', encoding="utf-8").write(t)
PY
  grep -q 'signingConfigs.yavar' "$GRADLE" || { echo "::error::signing config not applied"; exit 1; }
else
  echo "::warning::Repository signing secrets absent; using default Android debug signing."
fi

# 4) Clean uninstall/update: no Android auto-backup, so removing the app wipes all data and reinstall starts clean.
sed -i 's#android:allowBackup="true"#android:allowBackup="false"#' "$MANIFEST"
if ! grep -q 'android:fullBackupContent' "$MANIFEST"; then
  sed -i 's#<application #<application android:fullBackupContent="false" android:dataExtractionRules="@xml/yavar_no_backup" #' "$MANIFEST"
fi
mkdir -p android/app/src/main/res/xml
cat > android/app/src/main/res/xml/yavar_no_backup.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup><exclude domain="root" /><exclude domain="file" /><exclude domain="database" /><exclude domain="sharedpref" /></cloud-backup>
    <device-transfer><exclude domain="root" /><exclude domain="file" /><exclude domain="database" /><exclude domain="sharedpref" /></device-transfer>
</data-extraction-rules>
XML

# Android 14+ compatible: keep min/target SDK as generated by Capacitor 6 (minSdk 22+, targetSdk 34).
echo "Android v12 patch complete."
