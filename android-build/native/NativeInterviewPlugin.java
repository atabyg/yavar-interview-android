package __PACKAGE__;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.pdf.PdfDocument;
import android.view.View;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "NativeInterview")
public class NativeInterviewPlugin extends Plugin {
    private interface PdfReady {
        void onReady(File pdf);
        void onError(String message);
    }

    @PluginMethod
    public void isBiometricAvailable(PluginCall call) {
        int result = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        JSObject value = new JSObject();
        value.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        value.put("reason", Integer.toString(result));
        call.resolve(value);
    }

    @PluginMethod
    public void authenticateBiometric(PluginCall call) {
        int result = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (result != BiometricManager.BIOMETRIC_SUCCESS) {
            call.resolve(new JSObject().put("authenticated", false));
            return;
        }
        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt = new BiometricPrompt(getActivity(), executor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    call.resolve(new JSObject().put("authenticated", true));
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.resolve(new JSObject().put("authenticated", false));
                }

                @Override
                public void onAuthenticationFailed() {
                    // Keep the system prompt open so the user can retry; do not unlock here.
                }
            });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("ورود امن به مصاحبه یاورشهرها")
            .setSubtitle("اثر انگشت ثبت‌شده روی دستگاه را تأیید کنید")
            .setNegativeButtonText("ورود با رمز")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build();
        prompt.authenticate(info);
    }

    @PluginMethod
    public void savePdf(PluginCall call) {
        String html = call.getString("html");
        String name = safePdfName(call.getString("fileName"));
        if (html == null || html.trim().isEmpty()) {
            call.reject("محتوای گزارش خالی است؛ PDF ساخته نشد.");
            return;
        }
        renderHtmlToPdf(call, html, name, new PdfReady() {
            @Override
            public void onReady(File pdf) {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_TITLE, name);
                pendingPdfs.put(call.getCallbackId(), pdf);
                try {
                    startActivityForResult(call, intent, "savePdfResult");
                } catch (Exception error) {
                    pendingPdfs.remove(call.getCallbackId());
                    pdf.delete();
                    call.reject("پنجره انتخاب محل ذخیره PDF باز نشد.", error);
                }
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    private final java.util.Map<String, File> pendingPdfs = new java.util.concurrent.ConcurrentHashMap<>();

    @ActivityCallback
    private void savePdfResult(PluginCall call, ActivityResult result) {
        File pdf = pendingPdfs.remove(call.getCallbackId());
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null ||
            result.getData().getData() == null) {
            if (pdf != null) pdf.delete();
            call.reject("ذخیره PDF لغو شد؛ فایلی در پوشه عمومی ثبت نشد.");
            return;
        }
        Uri destination = result.getData().getData();
        try (InputStream input = new FileInputStream(pdf);
             OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) throw new IllegalStateException("مسیر مقصد برای نوشتن باز نشد.");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
            pdf.delete();
            call.resolve(new JSObject().put("uri", destination.toString()));
        } catch (Exception error) {
            if (pdf != null) pdf.delete();
            call.reject("نوشتن PDF در محل انتخاب‌شده ناموفق بود.", error);
        }
    }

    @PluginMethod
    public void sharePdf(PluginCall call) {
        String html = call.getString("html");
        String name = safePdfName(call.getString("fileName"));
        if (html == null || html.trim().isEmpty()) {
            call.reject("محتوای گزارش خالی است؛ PDF ساخته نشد.");
            return;
        }
        renderHtmlToPdf(call, html, name, new PdfReady() {
            @Override
            public void onReady(File pdf) {
                try {
                    Uri uri = FileProvider.getUriForFile(
                        getContext(), getContext().getPackageName() + ".fileprovider", pdf);
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType("application/pdf");
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity().startActivity(Intent.createChooser(intent, "اشتراک گزارش PDF"));
                    call.resolve(new JSObject().put("chooserOpened", true));
                } catch (Exception error) {
                    pdf.delete();
                    call.reject("منوی اشتراک PDF باز نشد.", error);
                }
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    private String safePdfName(String value) {
        String name = value == null ? "interview-report.pdf" : value.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.isEmpty()) name = "interview-report";
        if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        return name;
    }

    private void renderHtmlToPdf(PluginCall call, String sourceHtml, String fileName, PdfReady ready) {
        Activity activity = getActivity();
        if (activity == null) {
            ready.onError("فعالیت اندروید برای تولید PDF در دسترس نیست.");
            return;
        }
        activity.runOnUiThread(() -> {
            WebView web = null;
            File target = null;
            try {
                File outputDir = new File(getContext().getCacheDir(), "pdf_exports");
                if (!outputDir.exists() && !outputDir.mkdirs()) {
                    ready.onError("پوشه موقت امن برای تولید PDF ساخته نشد.");
                    return;
                }
                long oldest = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
                File[] oldFiles = outputDir.listFiles();
                if (oldFiles != null) {
                    for (File old : oldFiles) if (old.isFile() && old.lastModified() < oldest) old.delete();
                }
                target = File.createTempFile("yavar-", ".pdf", outputDir);
                final File pdfTarget = target;
                web = new WebView(getContext());
                web.getSettings().setJavaScriptEnabled(false);
                web.setBackgroundColor(android.graphics.Color.WHITE);
                web.setWebViewClient(new WebViewClient() {
                    private boolean started = false;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (started) return;
                        started = true;
                        PdfDocument document = null;
                        try {
                            final int pageWidth = 595;
                            final int pageHeight = 842;
                            final int margin = 24;
                            final int printableWidth = pageWidth - margin * 2;
                            final int printableHeight = pageHeight - margin * 2;
                            final int contentWidth = 794;
                            view.measure(
                                View.MeasureSpec.makeMeasureSpec(contentWidth, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
                            int contentHeight = Math.max(view.getMeasuredHeight(),
                                (int) Math.ceil(view.getContentHeight() * view.getScale()));
                            if (contentHeight <= 0) throw new IllegalStateException("گزارش محتوایی برای چاپ ندارد.");
                            view.layout(0, 0, contentWidth, contentHeight);
                            float scale = (float) printableWidth / (float) contentWidth;
                            int sourcePageHeight = Math.max(1, (int) (printableHeight / scale));
                            int pageCount = Math.max(1, (int) Math.ceil((double) contentHeight / sourcePageHeight));
                            document = new PdfDocument();
                            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                                PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(
                                    pageWidth, pageHeight, pageIndex + 1).create();
                                PdfDocument.Page page = document.startPage(pageInfo);
                                android.graphics.Canvas canvas = page.getCanvas();
                                canvas.save();
                                canvas.translate(margin, margin);
                                canvas.clipRect(0, 0, printableWidth, printableHeight);
                                canvas.scale(scale, scale);
                                canvas.translate(0, -pageIndex * sourcePageHeight);
                                view.draw(canvas);
                                canvas.restore();
                                document.finishPage(page);
                            }
                            try (FileOutputStream output = new FileOutputStream(pdfTarget)) {
                                document.writeTo(output);
                                output.flush();
                            }
                            document.close();
                            document = null;
                            view.destroy();
                            if (pdfTarget.length() <= 0) {
                                pdfTarget.delete();
                                ready.onError("PDF ساخته‌شده خالی است؛ خروجی صادر نشد.");
                            } else {
                                ready.onReady(pdfTarget);
                            }
                        } catch (Exception error) {
                            if (document != null) document.close();
                            view.destroy();
                            pdfTarget.delete();
                            ready.onError("ساخت PDF ناموفق بود: " + error.getMessage());
                        }
                    }
                });
                String wrapped = "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\"/>" +
                    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>" +
                    "<style>body{font-family:sans-serif;direction:rtl;text-align:right;line-height:1.65;" +
                    "overflow-wrap:anywhere;margin:0;padding:0}table{width:100%;border-collapse:collapse;table-layout:fixed}" +
                    "td,th{border:1px solid #999;padding:5px;vertical-align:top;text-align:right;overflow-wrap:anywhere}" +
                    "h1{font-size:17pt}p,li,td,th{font-size:10pt}</style></head><body>" + sourceHtml + "</body></html>";
                web.loadDataWithBaseURL(null, wrapped, "text/html", "UTF-8", null);
            } catch (Exception error) {
                if (web != null) web.destroy();
                if (target != null) target.delete();
                ready.onError("ساخت PDF ناموفق بود: " + error.getMessage());
            }
        });
    }
}
}
