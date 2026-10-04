(() => {
  // Settings
  const STORAGE_KEY = "audioJournal.entries";
  const PARAGRAPH_PAUSE_MS = 2500; // a silence longer than this starts a new paragraph

  //Page elements
  const $ = id => document.getElementById(id);
  const ui = {
    recBtn: $("rec"),
    status: $("status"),
    live: $("live"),
    timer: $("timer"),
    meter: $("meter"),
    toast: $("toast"),
    entry: $("entry"),
    empty: $("empty"),
    date: $("cDate"),
    time: $("cTime"),
    body: $("cBody"),
    count: $("cCount"),
    history: $("hist"),
    historyTitle: $("histH"),
    cleanTab: $("tClean"),
    rawTab: $("tRaw"),
    copyBtn: $("copy"),
    deleteBtn: $("del"),
  };

  // App state
  let entries = loadEntries();
  let currentId = null; // date of the entry on screen
  let view = "clean";   // "clean" or "raw"

  // Recording state, shared by both engines
  let recording = false;  // true from pressing Record until pressing Stop
  let segments = [];      // [{ text, gap }] where gap = ms of silence before that piece
  let hadError = false;
  let startedAt = 0;
  let timerId = null;

  //Small helpers
  let toastTimer;
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1800);
  }

  function setStatus(message, isError = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle("err", isError);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }

  function countWords(text) {
    return (text.trim().match(/\S+/g) || []).length;
  }

  // Storage
  function loadEntries() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveEntries() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    catch { showToast("Couldn't save to this browser"); }
  }

  // Text cleanup
  const FILLERS = /\b(um+|uh+|erm|hmm+|ah+)\b,?\s*/gi;
  const REPEATED_WORDS = /\b(\w+)(\s+\1\b)+/gi;
  const QUESTION_START = /^(what|why|how|when|where|who|which|do|does|did|is|are|am|can|could|should|would|will)\b/i;

  // Order matters: the lowercase "i" rule runs last
  const REPLACEMENTS = [
    [/\bgonna\b/gi, "going to"],
    [/\bwanna\b/gi, "want to"],
    [/\bgotta\b/gi, "have to"],
    [/\bkinda\b/gi, "kind of"],
    [/\bsorta\b/gi, "sort of"],
    [/\bdunno\b/gi, "don't know"],
    [/\bim\b/gi, "I'm"],
    [/\bive\b/gi, "I've"],
    [/\bill\b/gi, "I'll"],
    [/\bid\b/gi, "I'd"],
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bwont\b/gi, "won't"],
    [/\bdidnt\b/gi, "didn't"],
    [/\bdoesnt\b/gi, "doesn't"],
    [/\bisnt\b/gi, "isn't"],
    [/\bwasnt\b/gi, "wasn't"],
    [/\bthats\b/gi, "that's"],
    [/\bwhats\b/gi, "what's"],
    [/\bi\b/g, "I"],
  ];

  // Cleans one spoken phrase into a proper sentence
  function cleanSentence(text) {
    let t = text.replace(/\s+/g, " ").trim();
    t = t.replace(FILLERS, "");
    t = t.replace(REPEATED_WORDS, "$1");
    for (const [pattern, replacement] of REPLACEMENTS) t = t.replace(pattern, replacement);
    t = t.trim();
    if (!t) return "";

    if (!/[.!?]$/.test(t)) t += QUESTION_START.test(t) ? "?" : ".";
    return t.replace(/(^|[.!?]\s+)([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
  }

  // Joins phrases into paragraphs, starting a new one after a long pause
  function cleanTranscript(segs) {
    const paragraphs = [];
    segs.forEach((seg, i) => {
      const sentence = cleanSentence(seg.text);
      if (!sentence) return;

      const startsNewParagraph = i === 0 || seg.gap > PARAGRAPH_PAUSE_MS || paragraphs.length === 0;
      if (startsNewParagraph) paragraphs.push(sentence);
      else paragraphs[paragraphs.length - 1] += " " + sentence;
    });
    return paragraphs.join("\n\n");
  }

  // Showing entries
  function currentEntry() {
    return entries.find(e => e.date === currentId);
  }

  function render() {
    const entry = currentEntry();
    ui.entry.hidden = !entry;
    ui.empty.hidden = entries.length > 0;
    if (entry) showEntry(entry);

    ui.cleanTab.setAttribute("aria-pressed", view === "clean");
    ui.rawTab.setAttribute("aria-pressed", view === "raw");
    showHistory();
  }

  function showEntry(entry) {
    ui.date.textContent = formatDate(entry.date);
    ui.time.textContent = formatTime(entry.date);
    ui.count.textContent = entry.wordCount + (entry.wordCount === 1 ? " word" : " words");

    ui.body.textContent = "";
    ui.body.className = "body" + (view === "raw" ? " raw" : "");
    const text = view === "raw" ? entry.rawText : entry.cleanText;
    for (const paragraph of text.split("\n\n")) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      ui.body.appendChild(p);
    }
  }

  function showHistory() {
    ui.history.textContent = "";
    const newestFirst = [...entries].reverse();
    ui.historyTitle.hidden = newestFirst.length < 2;
    if (newestFirst.length < 2) return;

    for (const entry of newestFirst) {
      const li = document.createElement("li");
      li.appendChild(makeHistoryButton(entry));
      ui.history.appendChild(li);
    }
  }

  function makeHistoryButton(entry) {
    const button = document.createElement("button");
    button.type = "button";
    if (entry.date === currentId) button.setAttribute("aria-current", "true");

    const title = document.createElement("span");
    title.className = "d";
    title.textContent = formatDate(entry.date) + " at " + formatTime(entry.date);

    const preview = document.createElement("span");
    preview.className = "p";
    preview.textContent = entry.cleanText.replace(/\n+/g, " ");

    button.append(title, preview);
    button.onclick = () => {
      currentId = entry.date;
      render();
      ui.entry.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return button;
  }

  // Recorder UI (button, timer, meter)
  function setRecordingUI(isOn) {
    ui.recBtn.classList.toggle("on", isOn);
    ui.recBtn.setAttribute("aria-pressed", isOn);
    ui.recBtn.setAttribute("aria-label", isOn ? "Stop recording" : "Start recording");
    ui.meter.classList.toggle("on", isOn);
    if (!isOn) {
      ui.timer.textContent = "";
      ui.live.style.display = "none";
    }
  }

  function updateTimer() {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    ui.timer.textContent = mm + ":" + ss;
  }

  function startTimer() {
    startedAt = Date.now();
    updateTimer();
    timerId = setInterval(updateTimer, 500);
  }

  function stopTimer() {
    clearInterval(timerId);
  }

  // ============ Finishing a recording (both engines end up here) ============
  function finishRecording() {
    const wasActive = ui.recBtn.classList.contains("on");
    recording = false;
    stopTimer();
    setRecordingUI(false);
    if (!wasActive) return;

    const rawText = segments.map(s => s.text).join(" ").trim();
    if (!rawText) {
      if (!hadError) setStatus("Didn't catch anything. Try again.");
      return;
    }

    const cleanText = cleanTranscript(segments);
    const entry = {
      date: new Date().toISOString(),
      rawText,
      cleanText,
      wordCount: countWords(cleanText),
    };
    entries.push(entry);
    saveEntries();
    currentId = entry.date;
    view = "clean";
    render();
    setStatus("Saved.");
  }

  // ============ Engine 1: the browser's built-in speech recognition ============
  const SpeechRecognition = !navigator.brave && (window.SpeechRecognition || window.webkitSpeechRecognition);
  let recognition;

  const SPEECH_ERRORS = {
    "not-allowed": "Mic access blocked. Allow the microphone and try again.",
    "service-not-allowed": "Speech service blocked. Open this page over https or localhost.",
    "audio-capture": "No microphone found.",
    "network": "Network error. Chrome needs internet for speech recognition.",
  };

  function showLiveText(interimText) {
    ui.live.textContent = segments.map(s => s.text).join(" ") + " ";
    const interim = document.createElement("span");
    interim.className = "interim";
    interim.textContent = interimText;
    ui.live.appendChild(interim);
    ui.live.scrollTop = ui.live.scrollHeight;
  }

  function startBrowserSpeech() {
    segments = [];
    hadError = false;
    let lastFinalAt = 0;     // when the previous phrase was finalised
    let phraseStartedAt = 0; // when we first heard the current phrase

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = event => {
      const now = Date.now();
      if (!phraseStartedAt) phraseStartedAt = now;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          interim += result[0].transcript;
          continue;
        }
        const text = result[0].transcript.trim();
        if (text) {
          const gap = lastFinalAt ? phraseStartedAt - lastFinalAt : 0;
          segments.push({ text, gap });
        }
        lastFinalAt = now;
        phraseStartedAt = 0;
      }
      showLiveText(interim);
    };

    recognition.onerror = event => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      hadError = true;
      setStatus(SPEECH_ERRORS[event.error] || "Error: " + event.error, true);
    };

    // Chrome stops by itself after a silence, so restart until the user presses Stop
    recognition.onend = () => {
      if (recording && !hadError) {
        try { recognition.start(); return; } catch {}
      }
      finishRecording();
    };

    try {
      recognition.start();
      recording = true;
      startTimer();
      setRecordingUI(true);
      ui.live.style.display = "block";
      ui.live.textContent = "";
      setStatus("Listening. Talk freely.");
    } catch {
      setStatus("Couldn't start the mic.", true);
    }
  }

  function stopBrowserSpeech() {
    recording = false;
    recognition.stop();
    setStatus("Cleaning up...");
  }

  // Engine 2: record audio, transcribe on the server (/api/transcribe)
  const canRecordAudio = !!(navigator.mediaDevices && window.MediaRecorder);
  let recorder, micStream, audioChunks = [];

  async function startServerRecording() {
    segments = [];
    hadError = false;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("Mic access blocked. Allow the microphone and try again.", true);
      return;
    }

    audioChunks = [];
    recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
    recorder.onstop = sendAudioToServer;
    recorder.start();

    recording = true;
    startTimer();
    setRecordingUI(true);
    setStatus("Recording. Your text appears when you stop.");
  }

  function stopServerRecording() {
    recording = false;
    stopTimer();
    ui.recBtn.disabled = true; // locked until the transcript comes back
    recorder.stop();
    micStream.getTracks().forEach(track => track.stop());
    setStatus("Transcribing...");
  }

  async function sendAudioToServer() {
    const audio = new Blob(audioChunks, { type: recorder.mimeType });
    const extension = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("audio", audio, "entry." + extension);

    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "HTTP " + response.status);
      segments = data.segments || [];
    } catch (error) {
      hadError = true;
      setStatus("Transcription failed: " + error.message, true);
    }

    ui.recBtn.disabled = false;
    finishRecording();
  }

 
  const engine = SpeechRecognition ? "browser" : canRecordAudio ? "server" : null;

  if (!engine) {
    ui.recBtn.disabled = true;
    setStatus("This browser can't record audio. Use Chrome or Edge.", true);
  }

  function startRecording() {
    if (engine === "server") startServerRecording();
    else startBrowserSpeech();
  }

  function stopRecording() {
    if (engine === "server") stopServerRecording();
    else stopBrowserSpeech();
  }

  
  ui.recBtn.onclick = () => (recording ? stopRecording() : startRecording());

  ui.cleanTab.onclick = () => { view = "clean"; render(); };
  ui.rawTab.onclick = () => { view = "raw"; render(); };

  ui.copyBtn.onclick = async () => {
    const entry = currentEntry();
    if (!entry) return;
    const text = formatDate(entry.date) + ", " + formatTime(entry.date) + "\n\n" + entry.cleanText;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      showToast("Copy blocked by browser");
    }
  };

  ui.deleteBtn.onclick = () => {
    if (!confirm("Delete this entry?")) return;
    entries = entries.filter(e => e.date !== currentId);
    saveEntries();
    currentId = entries.length ? entries[entries.length - 1].date : null;
    render();
    showToast("Deleted");
  };

  if (entries.length) currentId = entries[entries.length - 1].date;
  render();
})();