/* ==========================================================================
   Rhena AI — Speech-to-Text Logic
   Uses the browser's Web Speech API (SpeechRecognition) to transcribe
   speech to text in real time. Pure vanilla JS, no dependencies.
   ========================================================================== */

(() => {
  "use strict";

  /* ----- DOM references ----- */
  const appEl = document.querySelector(".app");
  const micButton = document.getElementById("micButton");
  const micStatus = document.getElementById("micStatus");
  const transcriptEl = document.getElementById("transcript");
  const wordCountEl = document.getElementById("wordCount");
  const charCountEl = document.getElementById("charCount");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const toastEl = document.getElementById("toast");

  /* ----- Speech recognition setup ----- */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let isListening = false; // true while a recognition session is actively running
  let wantsListening = false; // true from the moment the user presses start until they press stop
  // Tracks text already finalized by the recognizer, so interim results
  // can be appended live without duplicating previously confirmed words.
  let finalizedTranscript = "";
  // Guards against a known recognizer glitch where it repeats the last final
  // phrase verbatim instead of picking up new speech (seen especially on mobile).
  let lastFinalText = "";
  let noSpeechStreak = 0;
  let toastTimeout = null;
  let finishedTimeout = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    // continuous:false + auto-restart-on-end (see handleRecognitionEnd) processes
    // speech in short bursts instead of one long-lived session. A single long
    // continuous session is prone to a known Chrome bug where it starts
    // repeating/hallucinating the last phrase instead of transcribing new audio.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = handleRecognitionStart;
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;
  } else {
    micStatus.textContent = "⚠️ Speech recognition not supported in this browser";
    micButton.disabled = true;
    micButton.style.opacity = "0.5";
    micButton.style.cursor = "not-allowed";
  }

  /* ----- Mic button click: toggles listening on/off ----- */
  micButton.addEventListener("click", () => {
    if (!recognition) return;

    if (wantsListening) {
      wantsListening = false;
      recognition.stop();
    } else {
      // Seed the running transcript with whatever text already sits in the
      // textarea, so typed/edited content is preserved and appended to.
      finalizedTranscript = transcriptEl.value ? transcriptEl.value + " " : "";
      lastFinalText = "";
      noSpeechStreak = 0;
      wantsListening = true;
      startRecognition();
    }
  });

  function startRecognition() {
    try {
      recognition.start();
    } catch (err) {
      // start() throws InvalidStateError if called while already active;
      // anything else is a real failure and should be surfaced.
      if (err.name !== "InvalidStateError") {
        console.error("Rhena AI: recognition.start() failed", err);
        showToast("Couldn't start listening: " + err.message);
        wantsListening = false;
      }
    }
  }

  function handleRecognitionStart() {
    isListening = true;
    appEl.classList.remove("is-finished");
    appEl.classList.add("is-listening");
    micButton.setAttribute("aria-pressed", "true");
    micButton.setAttribute("aria-label", "Stop listening");
    micStatus.textContent = "🎙️ Listening...";
    clearTimeout(finishedTimeout);
  }

  function handleRecognitionResult(event) {
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;

      if (result.isFinal) {
        const cleaned = text.trim();
        // Skip an exact repeat of the immediately preceding final phrase — a
        // recognizer glitch, not something a person would normally say twice verbatim.
        if (cleaned && cleaned.toLowerCase() !== lastFinalText.toLowerCase()) {
          finalizedTranscript += text + " ";
          lastFinalText = cleaned;
          noSpeechStreak = 0;
        }
      } else {
        interimTranscript += text;
      }
    }

    transcriptEl.value = finalizedTranscript + interimTranscript;
    updateCounts();
    // Auto-scroll to the latest words as they stream in.
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function handleRecognitionError(event) {
    if (event.error === "aborted") return;

    if (event.error === "no-speech") {
      // Expected during normal pauses between sentences since each burst
      // auto-restarts; only warn if nothing real has come through for a while.
      noSpeechStreak++;
      if (noSpeechStreak === 4) {
        showToast("Still no speech detected — check your microphone input");
      }
      return;
    }

    console.error("Rhena AI: recognition error", event.error);

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showToast("Microphone access was denied");
      wantsListening = false;
    } else if (event.error === "audio-capture") {
      showToast("No microphone was found");
      wantsListening = false;
    } else if (event.error === "network") {
      showToast("Network error reaching the speech service");
    } else {
      showToast("Something went wrong: " + event.error);
    }
  }

  function handleRecognitionEnd() {
    isListening = false;

    if (wantsListening) {
      // Seamlessly start the next burst so it still feels like one session.
      startRecognition();
      return;
    }

    appEl.classList.remove("is-listening");
    micButton.setAttribute("aria-pressed", "false");
    micButton.setAttribute("aria-label", "Start listening");

    appEl.classList.add("is-finished");
    micStatus.textContent = "✅ Finished";

    // Return to the neutral "Ready" state after a short confirmation beat.
    finishedTimeout = setTimeout(() => {
      appEl.classList.remove("is-finished");
      micStatus.textContent = "🎤 Ready";
    }, 2200);
  }

  /* ----- Live word / character counts ----- */
  function updateCounts() {
    const text = transcriptEl.value;
    const trimmed = text.trim();
    const words = trimmed.length ? trimmed.split(/\s+/).length : 0;

    wordCountEl.textContent = words;
    charCountEl.textContent = text.length;
  }

  transcriptEl.addEventListener("input", () => {
    // Keep the internal buffer in sync with manual edits so a subsequent
    // recognition session appends to the edited text, not stale state.
    finalizedTranscript = transcriptEl.value ? transcriptEl.value + " " : "";
    updateCounts();
  });

  /* ----- Copy transcript ----- */
  copyBtn.addEventListener("click", async () => {
    const text = transcriptEl.value.trim();
    if (!text) {
      showToast("Nothing to copy yet");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast("Transcript copied to clipboard");
      flashButton(copyBtn);
    } catch (err) {
      showToast("Copy failed — try selecting the text manually");
    }
  });

  function flashButton(button) {
    button.classList.add("action-btn--copied");
    setTimeout(() => button.classList.remove("action-btn--copied"), 1400);
  }

  /* ----- Clear transcript ----- */
  clearBtn.addEventListener("click", () => {
    if (!transcriptEl.value) return;

    transcriptEl.value = "";
    finalizedTranscript = "";
    updateCounts();
    transcriptEl.focus();
    showToast("Transcript cleared");
  });

  /* ----- Toast helper ----- */
  function showToast(message) {
    clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");

    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  /* ----- Init ----- */
  updateCounts();
})();
