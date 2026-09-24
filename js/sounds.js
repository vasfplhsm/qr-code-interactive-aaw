// ============================================================
// SOUND ENGINE  –  Web Audio API & Speech Synthesis
// Zero external audio files required, runs 100% locally
// ============================================================
window.AAWSounds = (() => {
  let audioCtx = null;
  let isAudioUnlocked = false;
  const unlockListeners = [];

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => { });
    }
    return audioCtx;
  }

  function primeAudio(ac) {
    try {
      const buffer = ac.createBuffer(1, 1, 22050);
      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.connect(ac.destination);
      source.start(0);
    } catch (e) { }
  }

  function unlockAudio() {
    const ac = getAudioContext();
    if (!ac) return;

    if (ac.state === "suspended") {
      ac.resume().then(() => {
        primeAudio(ac);
        markUnlocked();
      }).catch(() => { });
    } else {
      primeAudio(ac);
      markUnlocked();
    }
  }

  function markUnlocked() {
    if (isAudioUnlocked) return;
    isAudioUnlocked = true;
    unlockListeners.forEach(cb => {
      try { cb(); } catch (e) { }
    });
  }

  // Listen to any user interaction to unlock browser autoplay policy
  ["click", "touchstart", "touchend", "pointerdown", "keydown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      unlockAudio();
    }, { passive: true });
  });

  function onUnlock(callback) {
    if (isAudioUnlocked) {
      callback();
    } else {
      unlockListeners.push(callback);
    }
  }

  function isUnlocked() {
    return isAudioUnlocked && audioCtx && audioCtx.state === "running";
  }

  // ================================================================
  //  0) Test tone — quick pleasant confirmation chime
  // ================================================================
  function playTestTone() {
    unlockAudio();
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    const notes = [659.25, 783.99]; // E5, G5
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.1);

      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.4);
    });
  }

  // ================================================================
  //  1) Subtle typing click for input field
  // ================================================================
  let lastKeyClickTime = 0;
  function playKeyClick() {
    const nowMs = Date.now();
    if (nowMs - lastKeyClickTime < 45) return; // limit rapid bursts
    lastKeyClickTime = nowMs;

    unlockAudio();
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(500 + Math.random() * 200, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // ================================================================
  //  2) Participant join chime — vibrant 3-note ascending bell chime
  // ================================================================
  function playJoinChime() {
    unlockAudio();
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    // Three-note ascending bell chime: C5 (523.25) -> E5 (659.25) -> G5 (783.99)
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.11);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(3500, now + i * 0.11);

      gain.gain.setValueAtTime(0, now + i * 0.11);
      gain.gain.linearRampToValueAtTime(0.35, now + i * 0.11 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.55);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);

      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.6);
    });

    // High sparkling overtone
    const shimmer = ac.createOscillator();
    const shimGain = ac.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(1567.98, now + 0.22); // G6
    shimGain.gain.setValueAtTime(0, now + 0.22);
    shimGain.gain.linearRampToValueAtTime(0.12, now + 0.26);
    shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    shimmer.connect(shimGain);
    shimGain.connect(ac.destination);
    shimmer.start(now + 0.22);
    shimmer.stop(now + 0.85);
  }

  // ================================================================
  //  3) Spoken celebration voice announcement (SpeechSynthesis)
  // ================================================================
  function speakCelebration(message) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const phrase = message || "Congratulations! 100 percent participation reached! Thank you for you participation!";
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 1.0;
      utterance.pitch = 1.15;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferred = voices.find(v =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel") || v.default)
        );
        if (preferred) utterance.voice = preferred;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
    }
  }

  // Ensure speech synthesis voices are preloaded
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    } catch (e) { }
  }

  // ================================================================
  //  4) Celebration fanfare — triumphant brass chords, cymbal & bells
  // ================================================================
  function playCelebrationFanfare() {
    unlockAudio();
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    // Fanfare chord sequence
    const chords = [
      { notes: [261.63, 329.63, 392.00, 523.25], time: 0, dur: 0.45 },
      { notes: [293.66, 369.99, 440.00, 587.33], time: 0.35, dur: 0.45 },
      { notes: [329.63, 415.30, 523.25, 659.25], time: 0.7, dur: 0.7 },
      { notes: [392.00, 493.88, 587.33, 783.99], time: 1.15, dur: 1.4 },
    ];

    chords.forEach(({ notes, time, dur }) => {
      notes.forEach((freq) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const filter = ac.createBiquadFilter();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + time);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2400 + freq, now + time);
        filter.Q.setValueAtTime(1.2, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.12, now + time + 0.04);
        gain.gain.setValueAtTime(0.12, now + time + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });
    });

    // Cymbal crash (white noise burst)
    try {
      const bufSize = ac.sampleRate * 2;
      const noiseBuf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const output = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) output[i] = Math.random() * 2 - 1;

      const noise = ac.createBufferSource();
      noise.buffer = noiseBuf;
      const noiseGain = ac.createGain();
      const noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = "highpass";
      noiseFilter.frequency.setValueAtTime(6500, now);
      noiseGain.gain.setValueAtTime(0, now + 1.15);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 1.2);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ac.destination);
      noise.start(now + 1.15);
      noise.stop(now + 3.3);
    } catch (e) { }

    // Final triumphant bell
    setTimeout(() => {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const bell = audioCtx.createOscillator();
      const bellGain = audioCtx.createGain();
      bell.type = "sine";
      bell.frequency.setValueAtTime(1046.5, t); // C6
      bellGain.gain.setValueAtTime(0.28, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      bell.connect(bellGain);
      bellGain.connect(audioCtx.destination);
      bell.start(t);
      bell.stop(t + 2.6);
    }, 1800);

    // Speak joyful congratulations announcement after fanfare intro
    setTimeout(() => {
      speakCelebration("Congratulations! 100 percent participation reached! Thank you for your participation!");
    }, 1200);
  }

  // ================================================================
  //  5) Firework pop / crackle sounds
  // ================================================================
  let fireworkSoundInterval = null;

  function playFireworkPop() {
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    try {
      const bufSize = Math.floor(ac.sampleRate * 0.16);
      const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.18));
      }

      const source = ac.createBufferSource();
      source.buffer = buf;
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(600 + Math.random() * 2600, now);
      filter.Q.setValueAtTime(0.7 + Math.random() * 2, now);

      gain.gain.setValueAtTime(0.12 + Math.random() * 0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      source.start(now);
      source.stop(now + 0.16);

      // Low boom layer for heavy rockets
      if (Math.random() < 0.35) {
        const boom = ac.createOscillator();
        const boomGain = ac.createGain();
        boom.type = "sine";
        boom.frequency.setValueAtTime(140 + Math.random() * 60, now);
        boom.frequency.exponentialRampToValueAtTime(40, now + 0.22);
        boomGain.gain.setValueAtTime(0.18, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        boom.connect(boomGain);
        boomGain.connect(ac.destination);
        boom.start(now);
        boom.stop(now + 0.26);
      }
    } catch (e) { }
  }

  function startFireworkSounds() {
    if (fireworkSoundInterval) return;
    function scheduleNext() {
      const delay = 180 + Math.random() * 420;
      fireworkSoundInterval = setTimeout(() => {
        playFireworkPop();
        if (Math.random() < 0.5) {
          setTimeout(playFireworkPop, 30 + Math.random() * 80);
        }
        if (fireworkSoundInterval !== null) scheduleNext();
      }, delay);
    }
    scheduleNext();
  }

  function stopFireworkSounds() {
    if (fireworkSoundInterval) {
      clearTimeout(fireworkSoundInterval);
      fireworkSoundInterval = null;
    }
  }

  return {
    unlockAudio,
    isUnlocked,
    onUnlock,
    playTestTone,
    playKeyClick,
    playJoinChime,
    playCelebrationFanfare,
    speakCelebration,
    startFireworkSounds,
    stopFireworkSounds
  };
})();
