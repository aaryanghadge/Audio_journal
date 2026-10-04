(() => {
  const KEY = "audioJournal.entries", PARA_MS = 2500;
  const $ = id => document.getElementById(id);
  const recBtn = $("rec"), statusEl = $("status"), liveEl = $("live");

  // ---------- Storage ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const persist = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { toast("Couldn't save to this browser"); } };
  let entries = load(), currentId = null, view = "clean";

  // ---------- Toast ----------
  let tt; function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 1800); }

  // ---------- Cleanup ----------
  const REPL = [
    [/\bgonna\b/gi,"going to"],[/\bwanna\b/gi,"want to"],[/\bgotta\b/gi,"have to"],[/\bkinda\b/gi,"kind of"],
    [/\bsorta\b/gi,"sort of"],[/\bdunno\b/gi,"don't know"],[/\bim\b/gi,"I'm"],[/\bive\b/gi,"I've"],[/\bill\b/gi,"I'll"],
    [/\bid\b/gi,"I'd"],[/\bdont\b/gi,"don't"],[/\bcant\b/gi,"can't"],[/\bwont\b/gi,"won't"],[/\bdidnt\b/gi,"didn't"],
    [/\bdoesnt\b/gi,"doesn't"],[/\bisnt\b/gi,"isn't"],[/\bwasnt\b/gi,"wasn't"],[/\bthats\b/gi,"that's"],[/\bwhats\b/gi,"what's"],[/\bi\b/g,"I"]
  ];
  const Q = /^(what|why|how|when|where|who|which|do|does|did|is|are|am|can|could|should|would|will)\b/i;
  function cleanSeg(text) {
    let t = text.replace(/\s+/g," ").trim();
    t = t.replace(/\b(um+|uh+|erm|hmm+|ah+)\b,?\s*/gi,"");
    t = t.replace(/\b(\w+)(\s+\1\b)+/gi,"$1");
    REPL.forEach(([re,to]) => { t = t.replace(re,to); });
    t = t.trim(); if (!t) return "";
    if (!/[.!?]$/.test(t)) t += Q.test(t) ? "?" : ".";
    return t.replace(/(^|[.!?]\s+)([a-z])/g,(_,p,c) => p + c.toUpperCase());
  }
  function buildClean(segs) {
    const paras = [];
    segs.forEach((s,i) => {
      const c = cleanSeg(s.text); if (!c) return;
      if (i === 0 || s.gap > PARA_MS || !paras.length) paras.push(c); else paras[paras.length-1] += " " + c;
    });
    return paras.join("\n\n");
  }
  const words = t => (t.trim().match(/\S+/g) || []).length;
  const fmtDate = d => new Date(d).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const fmtTime = d => new Date(d).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});

  // ---------- Render ----------
  function render() {
    const e = entries.find(x => x.date === currentId);
    $("entry").hidden = !e; $("empty").hidden = entries.length > 0;
    if (e) {
      $("cDate").textContent = fmtDate(e.date); $("cTime").textContent = fmtTime(e.date);
      const body = $("cBody"); body.textContent = ""; body.className = "body" + (view === "raw" ? " raw" : "");
      (view === "raw" ? e.rawText : e.cleanText).split("\n\n").forEach(p => { const el = document.createElement("p"); el.textContent = p; body.appendChild(el); });
      $("cCount").textContent = e.wordCount + (e.wordCount === 1 ? " word" : " words");
    }
    $("tClean").setAttribute("aria-pressed", view === "clean"); $("tRaw").setAttribute("aria-pressed", view === "raw");
    const h = $("hist"); h.textContent = "";
    const past = entries.slice().reverse();
    $("histH").hidden = past.length < 2;
    if (past.length >= 2) past.forEach(x => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; if (x.date === currentId) b.setAttribute("aria-current","true");
      const d = document.createElement("span"); d.className = "d"; d.textContent = fmtDate(x.date) + " at " + fmtTime(x.date);
      const p = document.createElement("span"); p.className = "p"; p.textContent = x.cleanText.replace(/\n+/g," ");
      b.append(d,p); b.onclick = () => { currentId = x.date; render(); $("entry").scrollIntoView({behavior:"smooth",block:"start"}); };
      li.appendChild(b); h.appendChild(li);
    });
  }
  $("tClean").onclick = () => { view = "clean"; render(); };
  $("tRaw").onclick = () => { view = "raw"; render(); };
  $("copy").onclick = async () => {
    const e = entries.find(x => x.date === currentId); if (!e) return;
    try { await navigator.clipboard.writeText(fmtDate(e.date) + ", " + fmtTime(e.date) + "\n\n" + e.cleanText); toast("Copied"); } catch { toast("Copy blocked by browser"); }
  };
  $("del").onclick = () => {
    if (!confirm("Delete this entry?")) return;
    entries = entries.filter(x => x.date !== currentId); persist(entries);
    currentId = entries.length ? entries[entries.length-1].date : null; render(); toast("Deleted");
  };

  function setStatus(m, err = false) { statusEl.textContent = m; statusEl.classList.toggle("err", err); }

  // ---------- Speech ----------
  // Browser speech recognition where it works (not Brave); otherwise record audio and transcribe on the server
  const SR = (!navigator.brave && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
  const canRecord = !!(navigator.mediaDevices && window.MediaRecorder);
  const useServer = !SR && canRecord;
  if (!SR && !canRecord) { recBtn.disabled = true; setStatus("This browser can't record audio. Use Chrome or Edge.", true); }

  let recog, recording = false, segs = [], lastFinal = 0, segStart = 0, fatal = false, t0 = 0, tick;

  function paintLive(interim) {
    liveEl.textContent = ""; liveEl.append(segs.map(s => s.text).join(" ") + " ");
    const i = document.createElement("span"); i.className = "interim"; i.textContent = interim; liveEl.appendChild(i);
    liveEl.scrollTop = liveEl.scrollHeight;
  }
  const clock = () => { const s = Math.floor((Date.now() - t0) / 1000); $("timer").textContent = String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0"); };

  function start() {
    if (useServer) return startServer();
    segs = []; lastFinal = 0; segStart = 0; fatal = false;
    recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = "en-IN";
    recog.onresult = ev => {
      const now = Date.now(); if (!segStart) segStart = now;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) segs.push({ text, gap: lastFinal ? segStart - lastFinal : 0 });
          lastFinal = now; segStart = 0;
        } else interim += r[0].transcript;
      }
      paintLive(interim);
    };
    recog.onerror = ev => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      fatal = true;
      setStatus({ "not-allowed":"Mic access blocked. Allow the microphone and try again.",
        "service-not-allowed":"Speech service blocked. Open this page over https or localhost.",
        "audio-capture":"No microphone found.", "network":"Network error. Chrome needs internet for speech recognition." }[ev.error] || "Error: " + ev.error, true);
    };
    recog.onend = () => { if (recording && !fatal) { try { recog.start(); return; } catch {} } finish(); };
    try {
      recog.start(); recording = true; t0 = Date.now(); clock(); tick = setInterval(clock, 500);
      recBtn.classList.add("on"); recBtn.setAttribute("aria-pressed","true"); recBtn.setAttribute("aria-label","Stop recording");
      $("meter").classList.add("on"); liveEl.style.display = "block"; liveEl.textContent = ""; setStatus("Listening. Talk freely.");
    } catch { setStatus("Couldn't start the mic.", true); }
  }
  function stop() {
    if (useServer) return stopServer();
    recording = false; if (recog) recog.stop(); setStatus("Cleaning up...");
  }
  function finish() {
    const was = recBtn.classList.contains("on"); recording = false; clearInterval(tick);
    recBtn.classList.remove("on"); recBtn.setAttribute("aria-pressed","false"); recBtn.setAttribute("aria-label","Start recording");
    $("meter").classList.remove("on"); $("timer").textContent = ""; liveEl.style.display = "none";
    if (!was) return;
    const rawText = segs.map(s => s.text).join(" ").trim();
    if (!rawText) { if (!fatal) setStatus("Didn't catch anything. Try again."); return; }
    const cleanText = buildClean(segs);
    const entry = { date: new Date().toISOString(), rawText, cleanText, wordCount: words(cleanText) };
    entries.push(entry); persist(entries); currentId = entry.date; view = "clean"; render(); setStatus("Saved."); 
  }
  // ---------- Server transcription (MediaRecorder -> /api/transcribe) ----------
  let mr, chunks = [], stream;
  async function startServer() {
    segs = []; fatal = false;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setStatus("Mic access blocked. Allow the microphone and try again.", true); return; }
    chunks = [];
    mr = new MediaRecorder(stream);
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = transcribe;
    mr.start();
    recording = true; t0 = Date.now(); clock(); tick = setInterval(clock, 500);
    recBtn.classList.add("on"); recBtn.setAttribute("aria-pressed","true"); recBtn.setAttribute("aria-label","Stop recording");
    $("meter").classList.add("on"); setStatus("Recording. Your text appears when you stop.");
  }
  function stopServer() {
    recording = false; clearInterval(tick); recBtn.disabled = true;
    mr.stop(); stream.getTracks().forEach(t => t.stop());
    setStatus("Transcribing...");
  }
  async function transcribe() {
    const blob = new Blob(chunks, { type: mr.mimeType });
    const fd = new FormData();
    fd.append("audio", blob, "entry." + (mr.mimeType.includes("mp4") ? "mp4" : "webm"));
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
      segs = data.segments || [];
    } catch (e) {
      fatal = true;
      setStatus("Transcription failed: " + e.message, true);
    }
    recBtn.disabled = false;
    finish();
  }

  recBtn.onclick = () => recording ? stop() : start();

  // ---------- Init ----------
  if (entries.length) currentId = entries[entries.length-1].date;
  render();
})();
