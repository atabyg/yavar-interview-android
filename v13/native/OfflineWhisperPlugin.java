package __PACKAGE__;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OfflineWhisper")
public class OfflineWhisperPlugin extends Plugin {
    private static final String TAG = "YavarOfflineWhisper";
    private static final String MODEL_NAME = "ggml-tiny-q5_1.bin";
    private static final String MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny-q5_1.bin?download=true";
    private static final String MODEL_SHA256 = "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7";
    private static final long MIN_MODEL_BYTES = 30000000L;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean nativeLoaded = false;

    private native String nativeTranscribe(String modelPath, String wavPath);

    private File modelFile() {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, MODEL_NAME);
    }

    private boolean isValidModel(File file) {
        return file != null && file.isFile() && file.length() >= MIN_MODEL_BYTES && file.length() < 40000000L;
    }

    private void resolveOnMain(PluginCall call, JSObject result) {
        mainHandler.post(() -> call.resolve(result));
    }

    private void rejectOnMain(PluginCall call, String message, Exception error) {
        mainHandler.post(() -> call.reject(message, error));
    }

    private void progress(long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        data.put("progress", total > 0 ? Math.min(100, Math.round(downloaded * 100.0 / total)) : 0);
        mainHandler.post(() -> notifyListeners("modelDownloadProgress", data));
    }

    private File ensureBundledModel() throws IOException {
        File target = modelFile();
        if (isValidModel(target)) return target;

        File temp = new File(target.getParentFile(), MODEL_NAME + ".bundled");
        if (temp.exists()) temp.delete();
        try (BufferedInputStream input = new BufferedInputStream(getContext().getAssets().open("models/" + MODEL_NAME));
             BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temp))) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        if (!isValidModel(temp)) {
            temp.delete();
            throw new IOException("مدل گفتار داخل APK ناقص است؛ برنامه را دوباره نصب کنید.");
        }
        if (target.exists() && !target.delete()) {
            temp.delete();
            throw new IOException("فایل مدل قبلی قابل جایگزینی نیست.");
        }
        if (!temp.renameTo(target)) {
            copyFile(temp, target);
            temp.delete();
        }
        return target;
    }

    private JSObject status() {
        File file = modelFile();
        JSObject result = new JSObject();
        result.put("downloaded", isValidModel(file));
        result.put("bundled", true);
        result.put("sizeBytes", file.exists() ? file.length() : 0);
        result.put("model", "Whisper tiny-q5_1 multilingual (bundled in APK)");
        result.put("downloadSizeBytes", 0);
        result.put("nativeReady", nativeLoaded);
        return result;
    }

    @PluginMethod
    public void modelStatus(PluginCall call) {
        worker.execute(() -> {
            try {
                ensureBundledModel();
                // Load JNI now so missing ABI/native-library packaging errors are visible in Settings.
                ensureNativeLibrary();
                resolveOnMain(call, status());
            } catch (Throwable e) {
                Log.e(TAG, "Offline Whisper readiness check failed", e);
                Exception failure = e instanceof Exception ? (Exception) e : new Exception(e);
                rejectOnMain(call, "موتور آفلاین Whisper یا کتابخانهٔ بومی روی این گوشی آماده نیست: " + String.valueOf(e.getMessage()), failure);
            }
        });
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        worker.execute(() -> {
            File target = modelFile();
            if (isValidModel(target)) {
                resolveOnMain(call, status());
                return;
            }
            File temp = new File(target.getParentFile(), MODEL_NAME + ".download");
            Exception last = null;
            for (int attempt = 1; attempt <= 3; attempt++) {
                HttpURLConnection connection = null;
                try {
                    temp.delete();
                    connection = (HttpURLConnection) new URL(MODEL_URL).openConnection();
                    connection.setRequestProperty("User-Agent", "YavarInterviewAndroid/9");
                    connection.setRequestProperty("Accept-Encoding", "identity");
                    connection.setConnectTimeout(25000);
                    connection.setReadTimeout(60000);
                    connection.setInstanceFollowRedirects(true);
                    connection.connect();
                    final int code = connection.getResponseCode();
                    if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
                    long total = connection.getContentLength();
                    if (total <= 0) total = 32200000L;
                    long copied = 0;
                    long lastReported = -262144;
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    progress(0, total);
                    try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                         BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temp))) {
                        byte[] buffer = new byte[65536];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            output.write(buffer, 0, count);
                            digest.update(buffer, 0, count);
                            copied += count;
                            if (copied - lastReported >= 262144) {
                                progress(copied, total);
                                lastReported = copied;
                            }
                        }
                    }
                    if (copied < MIN_MODEL_BYTES) throw new IOException("Downloaded model is incomplete (" + copied + " bytes)");
                    StringBuilder actual = new StringBuilder();
                    for (byte value : digest.digest()) actual.append(String.format(Locale.US, "%02x", value & 0xff));
                    if (!MODEL_SHA256.equals(actual.toString())) throw new IOException("Model SHA-256 verification failed");
                    if (target.exists() && !target.delete()) throw new IOException("Cannot replace old model file");
                    if (!temp.renameTo(target)) {
                        copyFile(temp, target);
                        temp.delete();
                    }
                    progress(copied, total);
                    resolveOnMain(call, status());
                    return;
                } catch (Exception ex) {
                    last = ex instanceof Exception ? (Exception) ex : new IOException(ex);
                    temp.delete();
                    Log.w(TAG, "Model download attempt " + attempt + " failed", ex);
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
            rejectOnMain(call, "دانلود مدل آفلاین کامل نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.", last);
        });
    }

    private static void copyFile(File source, File dest) throws IOException {
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(dest)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.getFD().sync();
        }
    }

    private File stagedFile(String token) throws IOException {
        if (token == null || !token.matches("[A-Za-z0-9_-]{1,80}")) throw new IOException("invalid_audio_token");
        return new File(getContext().getCacheDir(), "yavar-asr-" + token + ".bin");
    }

    @PluginMethod
    public void beginAudio(PluginCall call) {
        try {
            String token = call.getString("token");
            File file = stagedFile(token);
            if (file.exists() && !file.delete()) throw new IOException("Cannot reset temporary audio");
            try (FileOutputStream output = new FileOutputStream(file)) { output.flush(); }
            JSObject result = new JSObject();
            result.put("token", token);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("ساخت فایل موقت صوت آفلاین ممکن نشد.", e);
        }
    }

    @PluginMethod
    public void appendAudioPart(PluginCall call) {
        try {
            String token = call.getString("token");
            String data = call.getString("data", "");
            File file = stagedFile(token);
            if (!file.isFile()) throw new IOException("offline_audio_not_started");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (file.length() + bytes.length > 45000000L) throw new IOException("offline_audio_segment_too_large");
            try (FileOutputStream output = new FileOutputStream(file, true)) {
                output.write(bytes);
                output.flush();
            }
            JSObject result = new JSObject();
            result.put("writtenBytes", file.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("ذخیرهٔ موقت صوت برای تبدیل آفلاین ممکن نشد.", e);
        }
    }

    @PluginMethod
    public void cancelAudio(PluginCall call) {
        try {
            File file = stagedFile(call.getString("token"));
            if (file.exists()) file.delete();
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void transcribeAudio(PluginCall call) {
        final String token = call.getString("token");
        worker.execute(() -> {
            File source = null;
            File wav = null;
            try {
                File model = ensureBundledModel();
                source = stagedFile(token);
                if (!source.isFile() || source.length() < 1024) throw new IOException("فایل صوتی برای تبدیل پیدا نشد.");
                wav = new File(getContext().getCacheDir(), "yavar-asr-" + token + ".wav");
                decodeAudioToWav(source, wav, token);
                ensureNativeLibrary();
                String text = nativeTranscribe(model.getAbsolutePath(), wav.getAbsolutePath());
                if (text == null) throw new IOException("مدل آفلاین خروجی متنی نداد.");
                if (text.startsWith("__YAVAR_NATIVE_ERROR__:")) {
                    throw new IOException("تبدیل آفلاین ناموفق بود: " + text.substring("__YAVAR_NATIVE_ERROR__:".length()));
                }
                JSObject result = new JSObject();
                result.put("text", text.trim());
                result.put("audioDurationSeconds", Math.max(0, (wav.length() - 44) / 32000.0));
                resolveOnMain(call, result);
            } catch (Throwable e) {
                Log.e(TAG, "Offline transcription failed", e);
                Exception failure = e instanceof Exception ? (Exception) e : new Exception(e);
                rejectOnMain(call, "تبدیل صوت با مدل آفلاین انجام نشد. اگر فایل صوتی خراب است، دوباره ضبط کنید؛ جزئیات: " + String.valueOf(e.getMessage()), failure);
            } finally {
                if (source != null) source.delete();
                if (wav != null) wav.delete();
                File raw = new File(getContext().getCacheDir(), "yavar-asr-" + token + ".pcm");
                raw.delete();
            }
        });
    }

    private synchronized void ensureNativeLibrary() {
        if (!nativeLoaded) {
            System.loadLibrary("yavarwhisper");
            nativeLoaded = true;
        }
    }

    private void decodeAudioToWav(File source, File wav, String token) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec decoder = null;
        File raw = new File(getContext().getCacheDir(), "yavar-asr-" + token + ".pcm");
        boolean started = false;
        Pcm16MonoResampler resampler = null;
        try {
            extractor.setDataSource(source.getAbsolutePath());
            int track = -1;
            MediaFormat inputFormat = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat candidate = extractor.getTrackFormat(i);
                String mime = candidate.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    track = i;
                    inputFormat = candidate;
                    break;
                }
            }
            if (track < 0 || inputFormat == null) throw new IOException("فایل ضبط‌شده ترک صوتی قابل‌خواندن ندارد.");
            extractor.selectTrack(track);
            String mime = inputFormat.getString(MediaFormat.KEY_MIME);
            decoder = MediaCodec.createDecoderByType(mime);
            decoder.configure(inputFormat, null, null, 0);
            decoder.start();
            started = true;

            try (BufferedOutputStream rawOutput = new BufferedOutputStream(new FileOutputStream(raw), 65536)) {
                boolean inputEos = false;
                boolean outputEos = false;
                MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
                while (!outputEos) {
                    if (!inputEos) {
                        int inputIndex = decoder.dequeueInputBuffer(10000);
                        if (inputIndex >= 0) {
                            java.nio.ByteBuffer input = decoder.getInputBuffer(inputIndex);
                            if (input == null) throw new IOException("دریافت بافر ورودی صوت ممکن نشد.");
                            input.clear();
                            int size = extractor.readSampleData(input, 0);
                            if (size < 0) {
                                decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                inputEos = true;
                            } else {
                                long presentationTime = Math.max(0, extractor.getSampleTime());
                                decoder.queueInputBuffer(inputIndex, 0, size, presentationTime, 0);
                                extractor.advance();
                            }
                        }
                    }

                    int outputIndex = decoder.dequeueOutputBuffer(info, 10000);
                    if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        MediaFormat outputFormat = decoder.getOutputFormat();
                        if (resampler == null) {
                            int rate = outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                            int channels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                            int encoding = outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)
                                    ? outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
                                    : AudioFormat.ENCODING_PCM_16BIT;
                            resampler = new Pcm16MonoResampler(rate, channels, encoding, rawOutput);
                        }
                    } else if (outputIndex >= 0) {
                        try {
                            if (info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                                MediaFormat outputFormat = decoder.getOutputFormat();
                                if (resampler == null) {
                                    int rate = outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                                    int channels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                                    int encoding = outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)
                                            ? outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
                                            : AudioFormat.ENCODING_PCM_16BIT;
                                    resampler = new Pcm16MonoResampler(rate, channels, encoding, rawOutput);
                                }
                                java.nio.ByteBuffer pcm = decoder.getOutputBuffer(outputIndex);
                                if (pcm != null) {
                                    pcm = pcm.duplicate().order(java.nio.ByteOrder.LITTLE_ENDIAN);
                                    pcm.position(info.offset);
                                    pcm.limit(info.offset + info.size);
                                    resampler.consume(pcm);
                                }
                            }
                            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputEos = true;
                        } finally {
                            decoder.releaseOutputBuffer(outputIndex, false);
                        }
                    }
                }
                if (resampler == null || resampler.bytesWritten < 3200) {
                    throw new IOException("خروجی صوتی پس از رمزگشایی خالی است.");
                }
                resampler.flush();
            }
            writeWavHeaderAndCopy(raw, wav);
        } finally {
            if (decoder != null) {
                try { if (started) decoder.stop(); } catch (Exception ignored) {}
                try { decoder.release(); } catch (Exception ignored) {}
            }
            try { extractor.release(); } catch (Exception ignored) {}
            raw.delete();
        }
    }

    private static void writeWavHeaderAndCopy(File raw, File wav) throws IOException {
        long dataSize = raw.length();
        if (dataSize < 3200 || dataSize > 0xffffffffL - 36) throw new IOException("PCM output size is invalid.");
        ByteArrayOutputStream header = new ByteArrayOutputStream(44);
        header.write(new byte[] {'R','I','F','F'});
        writeLeInt(header, (int) (36 + dataSize));
        header.write(new byte[] {'W','A','V','E','f','m','t',' '});
        writeLeInt(header, 16);
        writeLeShort(header, 1);
        writeLeShort(header, 1);
        writeLeInt(header, 16000);
        writeLeInt(header, 32000);
        writeLeShort(header, 2);
        writeLeShort(header, 16);
        header.write(new byte[] {'d','a','t','a'});
        writeLeInt(header, (int) dataSize);
        try (BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(wav), 65536);
             BufferedInputStream input = new BufferedInputStream(new FileInputStream(raw), 65536)) {
            header.writeTo(output);
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
    }

    private static void writeLeInt(ByteArrayOutputStream output, int value) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
        output.write((value >>> 16) & 0xff);
        output.write((value >>> 24) & 0xff);
    }

    private static void writeLeShort(ByteArrayOutputStream output, int value) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
    }

    private static final class Pcm16MonoResampler {
        private final int sampleRate;
        private final int channels;
        private final int encoding;
        private final BufferedOutputStream output;
        private final byte[] outputBuffer = new byte[65536];
        private int outputPosition = 0;
        private long frameIndex = 0;
        private double nextOutputPosition = 0.0;
        private float previous = 0.0f;
        private long bytesWritten = 0;

        Pcm16MonoResampler(int sampleRate, int channels, int encoding, BufferedOutputStream output) throws IOException {
            if (sampleRate <= 0 || channels <= 0) throw new IOException("Unsupported decoded audio format.");
            this.sampleRate = sampleRate;
            this.channels = channels;
            this.encoding = encoding;
            this.output = output;
        }

        void consume(java.nio.ByteBuffer buffer) throws IOException {
            int bytesPerSample = encoding == AudioFormat.ENCODING_PCM_FLOAT ? 4
                    : encoding == AudioFormat.ENCODING_PCM_8BIT ? 1 : 2;
            while (buffer.remaining() >= bytesPerSample * channels) {
                float mono = 0.0f;
                for (int ch = 0; ch < channels; ch++) {
                    float sample;
                    if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                        sample = buffer.getFloat();
                    } else if (encoding == AudioFormat.ENCODING_PCM_8BIT) {
                        sample = ((buffer.get() & 0xff) - 128) / 128.0f;
                    } else {
                        sample = buffer.getShort() / 32768.0f;
                    }
                    mono += sample;
                }
                mono /= channels;
                while (nextOutputPosition <= frameIndex + 1.0e-8) {
                    float value;
                    if (frameIndex == 0) value = mono;
                    else {
                        double fraction = nextOutputPosition - (frameIndex - 1);
                        fraction = Math.max(0.0, Math.min(1.0, fraction));
                        value = (float) (previous + (mono - previous) * fraction);
                    }
                    writeSample(value);
                    nextOutputPosition += sampleRate / 16000.0;
                }
                previous = mono;
                frameIndex++;
            }
        }

        private void writeSample(float sample) throws IOException {
            float limited = Math.max(-1.0f, Math.min(1.0f, sample));
            short value = (short) Math.round(limited * 32767.0f);
            outputBuffer[outputPosition++] = (byte) (value & 0xff);
            outputBuffer[outputPosition++] = (byte) ((value >>> 8) & 0xff);
            bytesWritten += 2;
            if (outputPosition == outputBuffer.length) flushBuffer();
        }

        private void flushBuffer() throws IOException {
            if (outputPosition > 0) {
                output.write(outputBuffer, 0, outputPosition);
                outputPosition = 0;
            }
        }

        void flush() throws IOException {
            flushBuffer();
            output.flush();
        }
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
