// Crash-safe recorder: audio is cut into 1-second chunks written straight to IndexedDB,
// split into 10-minute segments (each stays far below OpenAI's 25 MB limit), and auto-resumes
// if the mic is interrupted (calls, app switch, MIUI killing the stream).
import { putChunk, patchInterview } from "./db";
import { getSettings } from "./settings";

const SEG_MS = 10 * 60 * 1000;

export function pickMime() {
  const list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export class Recorder {
  constructor() {
    this.id = ""; this.stream = null; this.recordStream = null; this.destination = null; this.mr = null; this.seg = 0; this.n = 0; this.mime = "";
    this.state = "idle"; this.want = false; this.accMs = 0; this.lastResume = 0;
    this.q = Promise.resolve(); this.onState = () => {}; this.ctx = null; this.analyser = null;
    this.buf = null; this.wake = null; this.timers = []; this.vis = null; this.storageError = null; this.audioProcessingUnavailable = false;
  }
  setState(s) { this.state = s; this.onState(s); }
  elapsed() { return Math.floor((this.accMs + (this.state === "recording" ? Date.now() - this.lastResume : 0)) / 1000); }

  async start(id, mime, onState) {
    this.id = id; this.mime = mime; this.onState = onState || (() => {}); this.storageError = null; this.audioProcessingUnavailable = false;
    this.seg = 0; this.n = 0; this.accMs = 0; this.want = true;
    await this.openStream();
    this.openSegment();
    this.lastResume = Date.now();
    this.setState("recording");
    this.timers.push(setInterval(() => this.rotate(), SEG_MS));
    this.timers.push(setInterval(() => patchInterview(this.id, { durationSec: this.elapsed() }, true), 5000));
    this.acquireWake();
    this.vis = () => {
      if (document.visibilityState === "visible" && this.want) { this.acquireWake(); this.ensureAlive(); }
    };
    document.addEventListener("visibilitychange", this.vis);
  }

  async openStream() {
    const prefs = getSettings();
    const enhanced = prefs.speechEnhancement !== false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true }
      },
    });
    // Use a processed recording stream only where this WebView supports the Web Audio graph.
    this.recordStream = this.stream;
    const tr = this.stream.getAudioTracks()[0];
    if (tr) tr.onended = () => { if (this.want) { this.closeRec(); this.setState("interrupted"); this.timeFreeze(); } };
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("AudioContext unavailable");
      this.ctx = new AC({ latencyHint: "interactive" });
      if (this.ctx.state === "suspended") await this.ctx.resume();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.buf = new Uint8Array(this.analyser.fftSize);
      if (enhanced) {
        // A gentle high-pass removes low rumble; a soft compressor evens level without a hard gate.
        const highpass = this.ctx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 78;
        highpass.Q.value = 0.707;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -27;
        compressor.knee.value = 18;
        compressor.ratio.value = 2.5;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.24;
        this.destination = this.ctx.createMediaStreamDestination();
        src.connect(highpass);
        highpass.connect(compressor);
        compressor.connect(this.analyser);
        this.analyser.connect(this.destination);
        this.recordStream = this.destination.stream;
      } else {
        src.connect(this.analyser);
      }
      // Keep the graph alive without playing microphone audio back through the phone speaker.
      const silent = this.ctx.createGain();
      silent.gain.value = 0;
      this.analyser.connect(silent);
      silent.connect(this.ctx.destination);
    } catch (e) {
      this.audioProcessingUnavailable = true;
      this.recordStream = this.stream;
      this.analyser = null;
      try { if (this.ctx) await this.ctx.close(); } catch (ignored) {}
      this.ctx = null;
      this.destination = null;
      this.buf = null;
    }
  }
  timeFreeze() { if (this.lastResume) { this.accMs += Date.now() - this.lastResume; this.lastResume = 0; } }

  openSegment() {
    const opts = { audioBitsPerSecond: 64000 };
    if (this.mime) opts.mimeType = this.mime;
    const mr = new MediaRecorder(this.recordStream || this.stream, opts);
    const seg = this.seg;
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) { const n = this.n++; this.q = this.q.then(() => putChunk(this.id, seg, n, e.data)).catch((error) => { this.storageError = error || new Error("ذخیرهٔ بخشی از صدای ضبط‌شده ناموفق بود."); }); }
    };
    mr.onerror = () => { if (this.want) this.ensureAlive(); };
    mr.onstop = () => { if (this.want && !this.rotating && this.mr === mr && this.state === "recording") this.ensureAlive(); };
    mr.start(1000);
    this.mr = mr;
  }
  stopMr() {
    return new Promise((resolve) => {
      const mr = this.mr;
      if (!mr || mr.state === "inactive") return resolve();
      const done = () => resolve();
      mr.addEventListener("stop", done, { once: true });
      try { mr.requestData(); mr.stop(); } catch (e) { resolve(); }
    });
  }
  async rotate() {
    if (this.state !== "recording" || !this.mr) return;
    this.rotating = true;
    await this.stopMr();
    this.seg++; this.n = 0;
    try { this.openSegment(); } catch (e) { /* ensureAlive will retry */ }
    this.rotating = false;
  }
  closeRec() { /* data already persisted per second; nothing to flush when the source died */ }

  // Re-open mic/recorder if the OS killed it. Everything recorded so far is already in the DB.
  async ensureAlive() {
    if (!this.want || this.reviving) return;
    const tr = this.stream && this.stream.getAudioTracks()[0];
    const alive = tr && tr.readyState === "live" && this.mr && this.mr.state !== "inactive";
    if (alive || this.state === "paused") return;
    this.reviving = true;
    try {
      await this.stopMr();
      if (!tr || tr.readyState !== "live") { this.stopStream(); await this.openStream(); }
      this.seg++; this.n = 0;
      this.openSegment();
      if (!this.lastResume) this.lastResume = Date.now();
      this.setState("recording");
    } catch (e) { this.setState("interrupted"); }
    this.reviving = false;
  }
  async resumeAfterInterrupt() { this.want = true; await this.ensureAlive(); }

  pause() { if (this.state !== "recording" || !this.mr) return; try { this.mr.pause(); } catch (e) { return; } this.timeFreeze(); this.setState("paused"); }
  resume() { if (this.state !== "paused" || !this.mr) return; try { this.mr.resume(); } catch (e) { return; } this.lastResume = Date.now(); this.setState("recording"); }

  level() {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let s = 0; for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  }

  async acquireWake() {
    try { if (navigator.wakeLock && !(this.wake && !this.wake.released)) this.wake = await navigator.wakeLock.request("screen"); } catch (e) { /* ignore */ }
  }
  stopStream() { try { if (this.recordStream && this.recordStream !== this.stream) this.recordStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ } try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ } try { this.ctx && this.ctx.close(); } catch (e) { /* ignore */ } this.ctx = null; this.analyser = null; this.destination = null; this.recordStream = null; this.stream = null; }

  async stop() {
    this.want = false;
    this.timers.forEach(clearInterval); this.timers = [];
    if (this.vis) document.removeEventListener("visibilitychange", this.vis);
    const dur = this.elapsed();
    this.timeFreeze();
    await this.stopMr();
    await this.q;
    if (this.storageError) await patchInterview(this.id, { audioSaveError: String((this.storageError && this.storageError.message) || this.storageError || "خطای ذخیرهٔ صوت") }, true);
    this.stopStream();
    try { this.wake && this.wake.release(); } catch (e) { /* ignore */ }
    this.setState("idle");
    return dur;
  }
}
