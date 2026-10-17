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
        registerPlugin(NativeInterviewPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
EOF


# Register the native PDF print bridge. Android's print dialog lets the user choose
# "Save as PDF" and the destination. Opening the dialog is not proof the file was saved.
JAVA_DIR=$(dirname "$MAIN")
cat > "$JAVA_DIR/NativeInterviewPlugin.java" <<'JAVA'
package __PACKAGE__;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeInterview")
public class NativeInterviewPlugin extends Plugin {
    @PluginMethod
    public void isBiometricAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", false);
        result.put("reason", "ورود زیست‌سنجی در این نسخه فعال نیست.");
        call.resolve(result);
    }

    @PluginMethod
    public void authenticateBiometric(PluginCall call) {
        JSObject result = new JSObject();
        result.put("authenticated", false);
        call.resolve(result);
    }

    @PluginMethod
    public void savePdf(PluginCall call) {
        openPrintDialog(call, false);
    }

    @PluginMethod
    public void sharePdf(PluginCall call) {
        openPrintDialog(call, true);
    }

    private void openPrintDialog(PluginCall call, boolean shareFlow) {
        final String fileName = call.getString("fileName", "yavar-report.pdf");
        final String html = call.getString("html", "");
        if (html.isEmpty()) {
            call.reject("محتوای گزارش خالی است.");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("فعالیت اندروید در دسترس نیست.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(activity);
                printWebView.getSettings().setJavaScriptEnabled(false);
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        try {
                            PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                            if (printManager == null) {
                                call.reject("سرویس چاپ اندروید در دسترس نیست.");
                                return;
                            }
                            String jobName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setResolution(new PrintAttributes.Resolution("yavar_pdf", "PDF", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                            printManager.print(jobName, view.createPrintDocumentAdapter(jobName), attributes);
                            JSObject result = new JSObject();
                            if (shareFlow) {
                                result.put("chooserOpened", true);
                            } else {
                                result.put("uri", "android-print-dialog");
                            }
                            call.resolve(result);
                        } catch (Exception error) {
                            call.reject("بازکردن پنجره چاپ/ذخیره PDF ناموفق بود.", error);
                        }
                    }
                });
                printWebView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                call.reject("ساخت پیش‌نمایش PDF ناموفق بود.", error);
            }
        });
    }
}
JAVA
sed -i "s/__PACKAGE__/$PKG/" "$JAVA_DIR/NativeInterviewPlugin.java"

# Set V5 version metadata while preserving V4 applicationId for in-place Android upgrade.
BUILD=android/app/build.gradle
sed -E -i 's/versionCode[[:space:]]*=?[[:space:]]*[0-9]+/versionCode 5/' "$BUILD"
sed -E -i 's/versionName[[:space:]]*=?[[:space:]]*"[^"]+"/versionName "5.0.0"/' "$BUILD"
grep -q 'applicationId "com.yavarshahrha.interview.v4"' "$BUILD" || { echo "::error::Unexpected applicationId; must remain compatible with V4"; exit 1; }
grep -q 'versionCode 5' "$BUILD" || { echo "::error::Could not set V5 versionCode"; exit 1; }
grep -q 'versionName "5.0.0"' "$BUILD" || { echo "::error::Could not set V5 versionName"; exit 1; }
echo "V5 package metadata:"
grep -E 'applicationId|versionCode|versionName|minSdkVersion' "$BUILD" android/variables.gradle || true
