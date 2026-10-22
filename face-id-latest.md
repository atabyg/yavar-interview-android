# Face-ID build: success
commit: 8517ee9c659d5bd35acadef2dc6be45db2bdd2ac
run: https://github.com/atabyg/yavar-interview-android/actions/runs/39872362428
time: 2026-10-22T23:35:24Z

## Error and warning lines
```
PASS YuNet output cls_8 has the expected length
PASS YuNet output obj_8 has the expected length
PASS YuNet output bbox_8 has the expected length
PASS YuNet output kps_8 has the expected length
PASS YuNet output cls_16 has the expected length
PASS YuNet output obj_16 has the expected length
PASS YuNet output bbox_16 has the expected length
PASS YuNet output kps_16 has the expected length
PASS YuNet output cls_32 has the expected length
PASS YuNet output obj_32 has the expected length
PASS YuNet output bbox_32 has the expected length
PASS YuNet output kps_32 has the expected length
PASS decodeYunet runs on the real outputs
PASS SFace output is 128-d (got 128)
PASS SFace is deterministic for identical input
PASS SFace output changes with the input
PASS [browser] OpenCV reference: opencv 5.0.0 face box [178.2, 62.9, 89.9, 113.3] score 0.932 | [ WARN:0@0.314] global net_impl_backend.cpp:345 setPreferableTarget Targets are not supported by the new graph engine for now | [ WARN:0@0.380] global net_impl_backend.cpp:345 setPreferableTarget Targets are not supported by the new grap
PASS [browser] WebAssembly SIMD supported by this browser
PASS [browser] ONNX Runtime + both models loaded through face-engine.js (774 ms)
PASS [browser] detector finds exactly one confident face: n=1 score=0.943 (85 ms)
PASS [browser] box IoU vs OpenCV = 0.955
PASS [browser] mean landmark error vs OpenCV = 3.9% of face width
PASS [browser] embedding is a 128-d unit vector (73 ms incl. alignment)
PASS [browser] embedding cosine vs OpenCV reference = 0.9522 (need >= 0.90)
PASS [browser] base crop quality: sharp=546.7 bright=140
PASS [browser] portrait 480x640 frame: box IoU vs expected = 0.915
PASS [browser] rotated 10deg, scale 0.7: cosine to base = 0.961 sharp=281.1 bright=139
PASS [browser] dim brightness(0.6): cosine to base = 0.942 sharp=235.2 bright=83
PASS [browser] blur(1px): cosine to base = 0.938 sharp=55.7 bright=139
PASS [browser] blur(2px): cosine to base = 0.785 sharp=8.6 bright=142
PASS [browser] blur(3px): cosine to base = 0.506 sharp=3.2 bright=144
PASS [browser] blur(5px): cosine to base = 0.226 sharp=1.6 bright=146
PASS [browser] very dark brightness(0.3): cosine to base = 0.906 sharp=58.9 bright=41
PASS [browser] overexposed brightness(1.8): cosine to base = 0.485 sharp=1072.2 bright=203
::warning::Repository signing secrets absent; using default Android debug signing.
::warning::Repository signing secrets absent; using default Android debug signing.
::warning::Repository signing secrets absent; using default Android debug signing.
```

## Last lines of the build log
```
> Task :capacitor-share:stripDebugDebugSymbols NO-SOURCE
> Task :capacitor-preferences:mergeDebugJavaResource
> Task :capacitor-preferences:syncDebugLibJars
> Task :capacitor-preferences:bundleDebugAar
> Task :capacitor-preferences:assembleDebug
> Task :capacitor-share:copyDebugJniLibsProjectAndLocalJars
> Task :capacitor-share:extractDebugAnnotations
> Task :capacitor-share:extractDeepLinksForAarDebug
> Task :capacitor-share:mergeDebugGeneratedProguardFiles
> Task :capacitor-share:mergeDebugConsumerProguardFiles
> Task :capacitor-share:prepareDebugArtProfile
> Task :capacitor-share:prepareLintJarForPublish
> Task :capacitor-share:mergeDebugJavaResource
> Task :capacitor-share:syncDebugLibJars
> Task :capacitor-share:bundleDebugAar
> Task :capacitor-share:assembleDebug

BUILD SUCCESSFUL in 2m 33s
192 actionable tasks: 192 executed
Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v3.2 scheme (APK Signature Scheme v3.2): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
WARNING: META-INF/com/android/build/gradle/app-metadata.properties not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.activity_activity.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.annotation_annotation-experimental.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.appcompat_appcompat-resources.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.appcompat_appcompat.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.arch.core_core-runtime.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.coordinatorlayout_coordinatorlayout.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.core_core-ktx.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.core_core-splashscreen.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.core_core.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.cursoradapter_cursoradapter.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.customview_customview.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.drawerlayout_drawerlayout.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.emoji2_emoji2-views-helper.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.emoji2_emoji2.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.fragment_fragment.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.interpolator_interpolator.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-livedata-core.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-livedata.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-process.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-runtime.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-viewmodel-savedstate.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.lifecycle_lifecycle-viewmodel.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.loader_loader.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.profileinstaller_profileinstaller.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.savedstate_savedstate.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.startup_startup-runtime.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.tracing_tracing.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.vectordrawable_vectordrawable-animated.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.vectordrawable_vectordrawable.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.versionedparcelable_versionedparcelable.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.viewpager_viewpager.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/androidx.webkit_webkit.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/kotlinx_coroutines_android.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/kotlinx_coroutines_core.version not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/services/kotlinx.coroutines.CoroutineExceptionHandler not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/services/kotlinx.coroutines.internal.MainDispatcherFactory not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
16KB ELF alignment OK: libyavarwhisper.so
total 78448
-rw-r--r-- 1 runner runner 80328509 Oct 22 23:35 yavar-interview-v13-face-id.apk
71f2a819522a5c5d013f14f97d8e26534fe12cbb7f9b1d0c3a97a572926a7b43  /home/runner/work/yavar-interview-android/yavar-interview-android/artifacts/yavar-interview-v13-face-id.apk
Stable signing: disabled; upgrade compatibility is not guaranteed
```
