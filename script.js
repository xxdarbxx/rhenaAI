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
  let isListening = false;
  // Tracks text already finalized by the recognizer, so interim results
  // can be appended live without duplicating previously confirmed words.
  let finalizedTranscript = "";
  let toastTimeout = null;
  let finishedTimeout = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
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

    if (isListening) {
      recognition.stop();
    } else {
      // Seed the running transcript with whatever text already sits in the
      // textarea, so typed/edited content is preserved and appended to.
      finalizedTranscript = transcriptEl.value ? transcriptEl.value + " " : "";
      try {
        recognition.start();
      } catch (err) {
        // start() throws if called while already active; safe to ignore.
      }
    }
  });

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
        finalizedTranscript += text + " ";
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
    if (event.error === "no-speech" || event.error === "aborted") return;

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showToast("Microphone access was denied");
    } else {
      showToast("Something went wrong: " + event.error);
    }
  }

  function handleRecognitionEnd() {
    isListening = false;
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
