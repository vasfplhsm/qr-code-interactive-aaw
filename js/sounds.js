// ============================================================
// SOUND ENGINE  –  Web Audio API (no external audio files needed)
// ============================================================
window.AAWSounds = (() => {
  let audioCtx = null;

  function ctx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browsers block autoplay until user gesture)
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // Ensure audio context is unlocked on first user interaction
  function unlockAudio() {
    ctx();
    document.removeEventListener("click", unlockAudio);
    document.removeEventListener("touchstart", unlockAudio);
    document.removeEventListener("keydown", unlockAudio);
  }
  document.addEventListener("click", unlockAudio);
  document.addEventListener("touchstart", unlockAudio);
  document.addEventListener("keydown", unlockAudio);

  // ================================================================
  //  1) Participant join chime — pleasant ascending bell tone
  // ================================================================
  function playJoinChime() {
    const ac = ctx();
    const now = ac.currentTime;

    // Two-note ascending chime (C5 → E5)
    const notes = [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(3000, now);

      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);

      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.55);
    });

    // Soft shimmer layer
    const shimmer = ac.createOscillator();
    const shimGain = ac.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(1318.5, now); // E6
    shimGain.gain.setValueAtTime(0, now);
    shimGain.gain.linearRampToValueAtTime(0.06, now + 0.08);
    shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    shimmer.connect(shimGain);
    shimGain.connect(ac.destination);
    shimmer.start(now + 0.06);
    shimmer.stop(now + 0.65);
  }

  // ================================================================
  //  2) Celebration fanfare — triumphant brass-like chord progression
  // ================================================================
  function playCelebrationFanfare() {
    const ac = ctx();
    const now = ac.currentTime;

    // Fanfare chord: C major → G major → C major (triumphant)
    const chords = [
      { notes: [261.63, 329.63, 392.00, 523.25], time: 0,   dur: 0.5 },
      { notes: [293.66, 369.99, 440.00, 587.33], time: 0.4, dur: 0.5 },
      { notes: [329.63, 415.30, 523.25, 659.25], time: 0.8, dur: 0.8 },
      { notes: [392.00, 493.88, 587.33, 783.99], time: 1.3, dur: 1.2 },
    ];

    chords.forEach(({ notes, time, dur }) => {
      notes.forEach((freq) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const filter = ac.createBiquadFilter();

        // Sawtooth for brassy tone
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + time);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2000 + freq, now + time);
        filter.Q.setValueAtTime(1, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.08, now + time + 0.05);
        gain.gain.setValueAtTime(0.08, now + time + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });
    });

    // Cymbal crash (white noise burst)
    const bufSize = ac.sampleRate * 2;
    const noiseBuf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const output = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ac.createGain();
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(7000, now);
    noiseGain.gain.setValueAtTime(0, now + 1.3);
    noiseGain.gain.linearRampToValueAtTime(0.12, now + 1.35);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ac.destination);
    noise.start(now + 1.3);
    noise.stop(now + 3.6);

    // Final triumphant bell
    setTimeout(() => {
      const bell = ac.createOscillator();
      const bellGain = ac.createGain();
      bell.type = "sine";
      bell.frequency.setValueAtTime(1046.5, ac.currentTime); // C6
      bellGain.gain.setValueAtTime(0.2, ac.currentTime);
      bellGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.5);
      bell.connect(bellGain);
      bellGain.connect(ac.destination);
      bell.start(ac.currentTime);
      bell.stop(ac.currentTime + 2.6);
    }, 2000);
  }

  // ================================================================
  //  3) Firework pop / crackle sounds
  // ================================================================
  let fireworkSoundInterval = null;

  function playFireworkPop() {
    const ac = ctx();
    const now = ac.currentTime;

    // Short noise burst (pop)
    const bufSize = Math.floor(ac.sampleRate * 0.15);
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
    }

    const source = ac.createBufferSource();
    source.buffer = buf;
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();

    // Randomize pitch by changing the filter
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(800 + Math.random() * 2400, now);
    filter.Q.setValueAtTime(0.5 + Math.random() * 2, now);

    gain.gain.setValueAtTime(0.06 + Math.random() * 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start(now);
    source.stop(now + 0.15);
  }

  function startFireworkSounds() {
    if (fireworkSoundInterval) return;
    // Play pop sounds at random intervals
    function scheduleNext() {
      const delay = 200 + Math.random() * 500;
      fireworkSoundInterval = setTimeout(() => {
        playFireworkPop();
        // Sometimes double-pop for crackle effect
        if (Math.random() < 0.4) {
          setTimeout(playFireworkPop, 30 + Math.random() * 70);
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
    playJoinChime,
    playCelebrationFanfare,
    startFireworkSounds,
    stopFireworkSounds
  };
})();
