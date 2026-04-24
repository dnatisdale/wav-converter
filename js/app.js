const state = {
  queue: [],
  isConverting: false,
};

const el = {
  dropZone: document.getElementById("dropZone"),
  pickFilesBtn: document.getElementById("pickFilesBtn"),
  fileInput: document.getElementById("fileInput"),
  formatSelect: document.getElementById("formatSelect"),
  bitrateSelect: document.getElementById("bitrateSelect"),
  channelSelect: document.getElementById("channelSelect"),
  sampleRateSelect: document.getElementById("sampleRateSelect"),
  formatNotice: document.getElementById("formatNotice"),
  convertAllBtn: document.getElementById("convertAllBtn"),
  downloadZipBtn: document.getElementById("downloadZipBtn"),
  clearBtn: document.getElementById("clearBtn"),
  statusText: document.getElementById("statusText"),
  overallProgressText: document.getElementById("overallProgressText"),
  overallProgressBar: document.getElementById("overallProgressBar"),
  queueStats: document.getElementById("queueStats"),
  queueList: document.getElementById("queueList"),
  installBtn: document.getElementById("installBtn"),
  installHelp: document.getElementById("installHelp"),
};

const CHUNK_SIZE = 1152;
let audioContext = null;
let deferredInstallPrompt = null;

function ensureAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioContext = new Ctx();
  }
  return audioContext;
}

function setStatus(text) {
  el.statusText.textContent = text;
}

function setOverallProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  el.overallProgressText.textContent = `${Math.round(clamped)}%`;
  el.overallProgressBar.style.width = `${clamped}%`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function sanitizeBaseName(filename) {
  return filename.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_");
}

function getOutputExt(format) {
  return (
    {
      mp3: "mp3",
      wav: "wav",
      flac: "flac",
      ogg: "ogg",
      opus: "opus",
      m4a: "m4a",
    }[format] || "bin"
  );
}

function showFormatNotice() {
  const format = el.formatSelect.value;

  if (format === "m4a") {
    el.formatNotice.textContent =
      "AAC / M4A is experimental. It may work only in some browsers. If this fails, switch to MP3 for dependable results.";
  } else if (format === "ogg" || format === "opus") {
    el.formatNotice.textContent =
      "Ogg and Opus depend on browser MediaRecorder support. Chrome and Edge are usually your best bet.";
  } else if (format === "flac") {
    el.formatNotice.textContent =
      "FLAC is lossless, so quality stays high while file size is often smaller than WAV. Bitrate does not apply to FLAC in this app.";
  } else if (format === "wav") {
    el.formatNotice.textContent =
      "WAV output is lossless PCM and very dependable, but the files can be large. Bitrate does not apply to WAV in this app.";
  } else {
    el.formatNotice.textContent =
      "MP3 is the most dependable compressed output in this app.";
  }
}

function updateBitrateAvailability() {
  const format = el.formatSelect.value;
  const disabled = format === "wav" || format === "flac";
  el.bitrateSelect.disabled = disabled;
}

function updateZipButton() {
  const readyCount = state.queue.filter(
    (item) => item.status === "done" && item.outputBlob,
  ).length;
  el.downloadZipBtn.disabled = readyCount === 0 || state.isConverting;
}

function updateQueueStats() {
  const total = state.queue.length;
  const ready = state.queue.filter((item) => item.status === "done").length;
  const errors = state.queue.filter((item) => item.status === "error").length;
  const size = state.queue.reduce(
    (sum, item) => sum + (item.file?.size || 0),
    0,
  );

  el.queueStats.textContent =
    total === 0
      ? "No files yet."
      : `${total} file${total === 1 ? "" : "s"} • ${ready} ready • ${errors} error${
          errors === 1 ? "" : "s"
        } • ${formatBytes(size)} input`;
}

function revokeUrls() {
  for (const item of state.queue) {
    if (item.outputUrl) {
      URL.revokeObjectURL(item.outputUrl);
    }
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

window.removeItem = function removeItem(index) {
  const item = state.queue[index];
  if (item?.outputUrl) {
    URL.revokeObjectURL(item.outputUrl);
  }
  state.queue.splice(index, 1);
  renderQueue();
};

function renderQueue() {
  updateQueueStats();
  updateZipButton();

  if (!state.queue.length) {
    el.queueList.innerHTML = "";
    return;
  }

  el.queueList.innerHTML = state.queue
    .map((item, index) => {
      return `
        <div class="queue-item">
          <div class="queue-top">
            <div>
              <div class="file-name">${escapeHtml(item.file.name)}</div>
              <div class="small-meta">
                ${formatBytes(item.file.size)}
                ${item.duration ? ` • ${formatSeconds(item.duration)}` : ""}
                ${item.sampleRate ? ` • ${item.sampleRate} Hz` : ""}
                ${item.channels ? ` • ${item.channels === 1 ? "Mono" : "Stereo"}` : ""}
              </div>
            </div>
            <span class="badge">${item.status}</span>
          </div>

          <div class="item-status">${escapeHtml(item.statusText || "Queued")}</div>
          <div class="progress-bar">
            <div style="width:${item.progress || 0}%"></div>
          </div>

          <div class="item-actions">
            ${
              item.outputUrl
                ? `<a class="download-link" href="${item.outputUrl}" download="${escapeHtml(
                    item.outputName,
                  )}">Download</a>`
                : ""
            }
            <button class="secondary-btn" type="button" onclick="removeItem(${index})" ${
              state.isConverting ? "disabled" : ""
            }>Remove</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  const wavs = files.filter(
    (file) =>
      /\.wav$/i.test(file.name) ||
      file.type === "audio/wav" ||
      file.type === "audio/x-wav",
  );

  for (const file of wavs) {
    state.queue.push({
      file,
      status: "queued",
      statusText: "Queued",
      progress: 0,
      outputBlob: null,
      outputUrl: "",
      outputName: "",
      duration: 0,
      sampleRate: 0,
      channels: 0,
    });
  }

  setStatus(
    wavs.length
      ? `Added ${wavs.length} WAV file${wavs.length === 1 ? "" : "s"}.`
      : "No WAV files were added.",
  );

  renderQueue();
}

function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function floatToFlacInt16(float32) {
  const out = new Int32Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    out[i] =
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

function interleaveFloat32(left, right) {
  const output = new Float32Array(left.length * 2);
  let offset = 0;
  for (let i = 0; i < left.length; i += 1) {
    output[offset++] = left[i];
    output[offset++] = right[i];
  }
  return output;
}

function interleaveInt32(left, right) {
  const output = new Int32Array(left.length * 2);
  let offset = 0;
  for (let i = 0; i < left.length; i += 1) {
    output[offset++] = left[i];
    output[offset++] = right[i];
  }
  return output;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWavFromAudioBuffer(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  let samples;
  if (channels === 2) {
    samples = interleaveFloat32(
      audioBuffer.getChannelData(0),
      audioBuffer.getChannelData(1),
    );
  } else {
    samples = audioBuffer.getChannelData(0);
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bitDepth) / 8, true);
  view.setUint16(32, (channels * bitDepth) / 8, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeFileToAudioBuffer(file) {
  const ctx = ensureAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

async function transformAudioBuffer(sourceBuffer, channelMode, sampleRateMode) {
  const targetChannels =
    channelMode === "mono"
      ? 1
      : channelMode === "stereo"
        ? 2
        : sourceBuffer.numberOfChannels;

  const targetSampleRate =
    sampleRateMode === "keep"
      ? sourceBuffer.sampleRate
      : Number(sampleRateMode);

  if (
    targetChannels === sourceBuffer.numberOfChannels &&
    targetSampleRate === sourceBuffer.sampleRate
  ) {
    return sourceBuffer;
  }

  const length = Math.ceil(sourceBuffer.duration * targetSampleRate);
  const offline = new OfflineAudioContext(
    targetChannels,
    length,
    targetSampleRate,
  );
  const source = offline.createBufferSource();

  let normalizedBuffer = sourceBuffer;

  if (targetChannels !== sourceBuffer.numberOfChannels) {
    normalizedBuffer = offline.createBuffer(
      targetChannels,
      Math.ceil(sourceBuffer.duration * sourceBuffer.sampleRate),
      sourceBuffer.sampleRate,
    );

    const monoData = sourceBuffer.getChannelData(0);

    if (targetChannels === 1) {
      normalizedBuffer.copyToChannel(monoData, 0);
    } else {
      normalizedBuffer.copyToChannel(monoData, 0);
      normalizedBuffer.copyToChannel(
        sourceBuffer.numberOfChannels > 1
          ? sourceBuffer.getChannelData(1)
          : monoData,
        1,
      );
    }
  }

  source.buffer = normalizedBuffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

function encodeMp3(audioBuffer, bitrate, onProgress) {
  const channels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
  const chunks = [];

  const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const right =
    channels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null;

  const totalSamples = left.length;

  for (let i = 0; i < totalSamples; i += CHUNK_SIZE) {
    let mp3buf;

    if (channels > 1 && right) {
      mp3buf = encoder.encodeBuffer(
        left.subarray(i, i + CHUNK_SIZE),
        right.subarray(i, i + CHUNK_SIZE),
      );
    } else {
      mp3buf = encoder.encodeBuffer(left.subarray(i, i + CHUNK_SIZE));
    }

    if (mp3buf.length > 0) {
      chunks.push(new Uint8Array(mp3buf));
    }

    if (onProgress) {
      onProgress(Math.min(1, (i + CHUNK_SIZE) / totalSamples));
    }
  }

  const end = encoder.flush();
  if (end.length > 0) {
    chunks.push(new Uint8Array(end));
  }

  return new Blob(chunks, { type: "audio/mpeg" });
}

function pickMimeType(format) {
  const candidates = [];

  if (format === "ogg") {
    candidates.push("audio/ogg;codecs=vorbis", "audio/ogg");
  } else if (format === "opus") {
    candidates.push(
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    );
  } else if (format === "m4a") {
    candidates.push("audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac");
  }

  return (
    candidates.find(
      (type) =>
        window.MediaRecorder &&
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported(type),
    ) || ""
  );
}

async function encodeViaMediaRecorder(
  audioBuffer,
  format,
  bitrate,
  onProgress,
) {
  if (!window.MediaRecorder) {
    throw new Error("This browser does not support MediaRecorder.");
  }

  const mimeType = pickMimeType(format);
  if (!mimeType) {
    throw new Error(
      `This browser does not support ${format.toUpperCase()} export in this app.`,
    );
  }

  const destContext = new AudioContext();
  const source = destContext.createBufferSource();
  source.buffer = audioBuffer;

  const destination = destContext.createMediaStreamDestination();
  source.connect(destination);

  const recorderOptions = { mimeType };
  if (bitrate) {
    recorderOptions.audioBitsPerSecond = Number(bitrate) * 1000;
  }

  const chunks = [];
  const recorder = new MediaRecorder(destination.stream, recorderOptions);

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      reject(event.error || new Error("MediaRecorder failed."));
    };

    recorder.onstop = async () => {
      try {
        await destContext.close();
      } catch (_) {}

      const fallbackType =
        format === "m4a" ? "audio/mp4" : mimeType.split(";")[0];
      resolve(new Blob(chunks, { type: fallbackType }));
    };

    recorder.start(250);

    const startedAt = performance.now();
    const durationMs = Math.max(300, audioBuffer.duration * 1000);

    const ticker = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      if (onProgress) {
        onProgress(Math.min(0.98, elapsed / durationMs));
      }
    }, 200);

    source.onended = () => {
      clearInterval(ticker);
      if (onProgress) {
        onProgress(1);
      }
      recorder.stop();
    };

    source.start(0);
  });
}

function waitForFlacReady(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const flac = window.Flac;

    if (!flac) {
      reject(new Error("FLAC library was not loaded."));
      return;
    }

    if (typeof flac.isReady === "function" && flac.isReady()) {
      resolve(flac);
      return;
    }

    let settled = false;

    const cleanup = () => {
      settled = true;
    };

    const done = () => {
      if (settled) return;
      cleanup();
      resolve(flac);
    };

    const fail = () => {
      if (settled) return;
      cleanup();
      reject(new Error("FLAC library did not finish loading."));
    };

    const timer = setTimeout(fail, timeoutMs);

    if (typeof flac.on === "function") {
      flac.on("ready", () => {
        clearTimeout(timer);
        done();
      });
      return;
    }

    flac.onready = () => {
      clearTimeout(timer);
      done();
    };
  });
}

async function encodeFlac(audioBuffer, onProgress) {
  const flac = await waitForFlacReady();

  if (
    typeof flac.create_libflac_encoder !== "function" ||
    typeof flac.init_encoder_stream !== "function" ||
    typeof flac.FLAC__stream_encoder_process_interleaved !== "function"
  ) {
    throw new Error("FLAC encoder API is unavailable in this browser.");
  }

  const channels = Math.min(audioBuffer.numberOfChannels, 2);
  const bitsPerSample = 16;
  const compressionLevel = 5;
  const totalSamples = audioBuffer.length;

  const encoder = flac.create_libflac_encoder(
    audioBuffer.sampleRate,
    channels,
    bitsPerSample,
    compressionLevel,
    totalSamples,
    false,
    0,
  );

  if (!encoder) {
    throw new Error("Could not create the FLAC encoder.");
  }

  const chunks = [];
  const writeCallback = (data) => {
    chunks.push(new Uint8Array(data));
  };

  const initStatus = flac.init_encoder_stream(
    encoder,
    writeCallback,
    null,
    false,
  );
  if (initStatus !== 0) {
    try {
      flac.FLAC__stream_encoder_delete(encoder);
    } catch (_) {}
    throw new Error(`FLAC encoder init failed (code ${initStatus}).`);
  }

  try {
    let interleaved;

    if (channels === 2) {
      const left = floatToFlacInt16(audioBuffer.getChannelData(0));
      const right = floatToFlacInt16(audioBuffer.getChannelData(1));
      interleaved = interleaveInt32(left, right);
    } else {
      interleaved = floatToFlacInt16(audioBuffer.getChannelData(0));
    }

    if (onProgress) onProgress(0.15);

    const ok = flac.FLAC__stream_encoder_process_interleaved(
      encoder,
      interleaved,
      audioBuffer.length,
    );

    if (!ok) {
      const stateCode =
        typeof flac.FLAC__stream_encoder_get_state === "function"
          ? flac.FLAC__stream_encoder_get_state(encoder)
          : "unknown";
      throw new Error(`FLAC encoding failed (state ${stateCode}).`);
    }

    if (onProgress) onProgress(0.95);

    const finished = flac.FLAC__stream_encoder_finish(encoder);
    if (!finished) {
      throw new Error("FLAC encoder could not finalize the file.");
    }

    if (onProgress) onProgress(1);

    return new Blob(chunks, { type: "audio/flac" });
  } finally {
    try {
      flac.FLAC__stream_encoder_delete(encoder);
    } catch (_) {}
  }
}

async function convertItem(
  item,
  format,
  bitrate,
  channelMode,
  sampleRateMode,
  itemIndex,
  total,
) {
  item.status = "working";
  item.statusText = "Decoding WAV...";
  item.progress = 4;
  renderQueue();

  const decoded = await decodeFileToAudioBuffer(item.file);
  item.duration = decoded.duration;
  item.sampleRate = decoded.sampleRate;
  item.channels = decoded.numberOfChannels;

  item.statusText = "Preparing audio...";
  item.progress = 10;
  renderQueue();

  const prepared = await transformAudioBuffer(
    decoded,
    channelMode,
    sampleRateMode,
  );

  let outputBlob;

  if (format === "mp3") {
    item.statusText = "Encoding MP3...";
    outputBlob = encodeMp3(prepared, Number(bitrate), (progress) => {
      item.progress = 10 + Math.round(progress * 80);
      const overall = ((itemIndex + progress) / total) * 100;
      setOverallProgress(overall);
      renderQueue();
    });
  } else if (format === "wav") {
    item.statusText = "Encoding WAV...";
    outputBlob = encodeWavFromAudioBuffer(prepared);
    item.progress = 96;
  } else if (format === "flac") {
    item.statusText = "Encoding FLAC...";
    outputBlob = await encodeFlac(prepared, (progress) => {
      item.progress = 10 + Math.round(progress * 80);
      const overall = ((itemIndex + progress) / total) * 100;
      setOverallProgress(overall);
      renderQueue();
    });
  } else {
    item.statusText = `Encoding ${format.toUpperCase()}...`;
    outputBlob = await encodeViaMediaRecorder(
      prepared,
      format,
      bitrate,
      (progress) => {
        item.progress = 10 + Math.round(progress * 80);
        const overall = ((itemIndex + progress) / total) * 100;
        setOverallProgress(overall);
        renderQueue();
      },
    );
  }

  if (item.outputUrl) {
    URL.revokeObjectURL(item.outputUrl);
  }

  item.outputBlob = outputBlob;
  item.outputUrl = URL.createObjectURL(outputBlob);
  item.outputName = `${sanitizeBaseName(item.file.name)}.${getOutputExt(format)}`;
  item.status = "done";
  item.statusText = "Ready to download";
  item.progress = 100;
}

async function convertAll() {
  if (!state.queue.length || state.isConverting) return;

  state.isConverting = true;
  renderQueue();

  const format = el.formatSelect.value;
  const bitrate = el.bitrateSelect.value;
  const channelMode = el.channelSelect.value;
  const sampleRateMode = el.sampleRateSelect.value;

  setStatus(
    `Converting ${state.queue.length} file${state.queue.length === 1 ? "" : "s"} to ${format.toUpperCase()}...`,
  );
  setOverallProgress(0);

  for (let i = 0; i < state.queue.length; i += 1) {
    const item = state.queue[i];

    try {
      await convertItem(
        item,
        format,
        bitrate,
        channelMode,
        sampleRateMode,
        i,
        state.queue.length,
      );
    } catch (error) {
      item.status = "error";
      item.statusText = error?.message || "Conversion failed";
      item.progress = 0;
    }

    setOverallProgress(((i + 1) / state.queue.length) * 100);
    renderQueue();
  }

  state.isConverting = false;
  setStatus("Finished. Download each file or the ZIP.");
  renderQueue();
}

async function downloadZip() {
  const readyItems = state.queue.filter(
    (item) => item.outputBlob && item.status === "done",
  );
  if (!readyItems.length) return;

  const zip = new JSZip();
  for (const item of readyItems) {
    zip.file(item.outputName, item.outputBlob);
  }

  setStatus("Creating ZIP...");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "batch-audio-converter-export.zip";
  a.click();

  URL.revokeObjectURL(url);
  setStatus("ZIP downloaded.");
}

function clearQueue() {
  if (state.isConverting) return;
  revokeUrls();
  state.queue = [];
  setOverallProgress(0);
  setStatus("Queue cleared.");
  renderQueue();
}

function isSecureInstallContext() {
  return (
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function setupInstallUi() {
  if (!el.installBtn || !el.installHelp) return;

  if (!isSecureInstallContext()) {
    el.installBtn.hidden = true;
    el.installHelp.innerHTML =
      "To install, open this app from <strong>http://localhost</strong> or <strong>https://</strong>. Chrome will not show the install icon from <code>file:///</code>.";
    return;
  }

  el.installHelp.innerHTML =
    "Once Chrome validates the manifest and service worker, the install button or address-bar install icon should appear.";

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    el.installBtn.hidden = false;
    el.installHelp.textContent = "This app is ready to install.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    el.installBtn.hidden = true;
    el.installHelp.textContent =
      "Installed. You can now launch it like a normal app.";
  });

  el.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    el.installBtn.hidden = true;
  });
}

function installServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
        console.info("Service worker registered", registration.scope);
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    });
  }
}

function handleFormatUiChange() {
  showFormatNotice();
  updateBitrateAvailability();
}

function openFilePicker() {
  if (!el.fileInput) return;
  el.fileInput.click();
}

function handleFileInputChange(event) {
  addFiles(event.target.files);

  // Reset so choosing the same file(s) again still triggers change.
  event.target.value = "";
}

function bindEvents() {
  el.pickFilesBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFilePicker();
  });

  el.fileInput.addEventListener("change", handleFileInputChange);

  el.convertAllBtn.addEventListener("click", convertAll);
  el.downloadZipBtn.addEventListener("click", downloadZip);
  el.clearBtn.addEventListener("click", clearQueue);
  el.formatSelect.addEventListener("change", handleFormatUiChange);

  el.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    el.dropZone.classList.add("dragover");
  });

  el.dropZone.addEventListener("dragleave", () => {
    el.dropZone.classList.remove("dragover");
  });

  el.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    el.dropZone.classList.remove("dragover");
    addFiles(event.dataTransfer.files);
  });

  el.dropZone.addEventListener("click", (event) => {
    if (event.target === el.pickFilesBtn) return;
    openFilePicker();
  });

  el.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  });
}

handleFormatUiChange();
renderQueue();
bindEvents();
setupInstallUi();
installServiceWorker();
