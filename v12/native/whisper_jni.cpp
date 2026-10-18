#include <jni.h>
#include <android/log.h>
#include "whisper.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <unistd.h>

#define TAG "YavarWhisper"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static std::mutex g_mutex;
static whisper_context * g_context = nullptr;
static std::string g_model_path;

static uint16_t read_u16(const unsigned char * p) {
    return static_cast<uint16_t>(p[0] | (static_cast<uint16_t>(p[1]) << 8));
}
static uint32_t read_u32(const unsigned char * p) {
    return static_cast<uint32_t>(p[0]) |
           (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) |
           (static_cast<uint32_t>(p[3]) << 24);
}

static bool read_wav_16k_mono(const std::string & path, std::vector<float> & samples, std::string & error) {
    std::ifstream in(path, std::ios::binary);
    if (!in) { error = "cannot_open_wav"; return false; }

    unsigned char header[44] = {};
    in.read(reinterpret_cast<char *>(header), sizeof(header));
    if (in.gcount() != static_cast<std::streamsize>(sizeof(header)) ||
        std::memcmp(header, "RIFF", 4) != 0 ||
        std::memcmp(header + 8, "WAVE", 4) != 0) {
        error = "invalid_wav_header";
        return false;
    }

    const uint16_t channels = read_u16(header + 22);
    const uint32_t sample_rate = read_u32(header + 24);
    const uint16_t bits = read_u16(header + 34);
    const uint32_t data_size = read_u32(header + 40);
    if (channels != 1 || sample_rate != 16000 || bits != 16) {
        error = "wav_must_be_16khz_mono_pcm16";
        return false;
    }
    if (data_size < 3200 || (data_size % 2) != 0) {
        error = "audio_too_short_or_invalid";
        return false;
    }

    samples.clear();
    samples.reserve(data_size / 2);
    unsigned char buffer[32768];
    uint32_t remaining = data_size;
    while (remaining > 0) {
        const std::streamsize want = static_cast<std::streamsize>(
            std::min<uint32_t>(remaining, sizeof(buffer)));
        in.read(reinterpret_cast<char *>(buffer), want);
        const std::streamsize got = in.gcount();
        if (got <= 0 || (got % 2) != 0) {
            error = "truncated_wav";
            return false;
        }
        for (std::streamsize i = 0; i < got; i += 2) {
            const int16_t value = static_cast<int16_t>(read_u16(buffer + i));
            samples.push_back(static_cast<float>(value) / 32768.0f);
        }
        remaining -= static_cast<uint32_t>(got);
    }
    return !samples.empty();
}

static jstring make_java_string(JNIEnv * env, const std::string & value) {
    return env->NewStringUTF(value.c_str());
}

static jstring native_transcribe(JNIEnv * env, jobject,
                                 jstring model_path_j, jstring wav_path_j) {
    const char * model_chars = env->GetStringUTFChars(model_path_j, nullptr);
    const char * wav_chars = env->GetStringUTFChars(wav_path_j, nullptr);
    if (model_chars == nullptr || wav_chars == nullptr) {
        if (model_chars != nullptr) env->ReleaseStringUTFChars(model_path_j, model_chars);
        if (wav_chars != nullptr) env->ReleaseStringUTFChars(wav_path_j, wav_chars);
        return make_java_string(env, "__YAVAR_NATIVE_ERROR__:jni_strings");
    }

    const std::string model_path(model_chars);
    const std::string wav_path(wav_chars);
    env->ReleaseStringUTFChars(model_path_j, model_chars);
    env->ReleaseStringUTFChars(wav_path_j, wav_chars);

    std::vector<float> samples;
    std::string read_error;
    if (!read_wav_16k_mono(wav_path, samples, read_error)) {
        return make_java_string(env, "__YAVAR_NATIVE_ERROR__:" + read_error);
    }

    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_context == nullptr || g_model_path != model_path) {
        if (g_context != nullptr) {
            whisper_free(g_context);
            g_context = nullptr;
        }
        g_model_path = model_path;
        g_context = whisper_init_from_file(g_model_path.c_str());
        if (g_context == nullptr) {
            g_model_path.clear();
            return make_java_string(env, "__YAVAR_NATIVE_ERROR__:model_load_failed");
        }
    }

    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.translate = false;
    params.language = "fa";
    params.offset_ms = 0;
    params.no_context = true;
    params.single_segment = false;
    params.temperature = 0.0f;
    const long cpu_count = sysconf(_SC_NPROCESSORS_ONLN);
    params.n_threads = static_cast<int>(std::max(2L, std::min(4L, cpu_count > 0 ? cpu_count / 2 : 2L)));

    if (whisper_full(g_context, params, samples.data(), static_cast<int>(samples.size())) != 0) {
        LOGE("whisper_full failed for audio file");
        return make_java_string(env, "__YAVAR_NATIVE_ERROR__:inference_failed");
    }

    std::string result;
    const int count = whisper_full_n_segments(g_context);
    for (int i = 0; i < count; ++i) {
        const char * part = whisper_full_get_segment_text(g_context, i);
        if (part != nullptr && part[0] != '\0') {
            if (!result.empty()) result.push_back('\n');
            result += part;
        }
    }
    return make_java_string(env, result);
}

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM * vm, void *) {
    JNIEnv * env = nullptr;
    if (vm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6) != JNI_OK || env == nullptr) {
        return JNI_ERR;
    }
    jclass clazz = env->FindClass("__PACKAGE_SLASH__/OfflineWhisperPlugin");
    if (clazz == nullptr) {
        return JNI_ERR;
    }
    JNINativeMethod methods[] = {
        {
            const_cast<char *>("nativeTranscribe"),
            const_cast<char *>("(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"),
            reinterpret_cast<void *>(native_transcribe)
        }
    };
    const jint ok = env->RegisterNatives(clazz, methods, sizeof(methods) / sizeof(methods[0]));
    env->DeleteLocalRef(clazz);
    return ok == JNI_OK ? JNI_VERSION_1_6 : JNI_ERR;
}
