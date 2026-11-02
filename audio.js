// ============================================================
// VeloRider — Audio System
// Telegram Mini Apps / iOS Safari / Android / Desktop
// ============================================================

const AUDIO_STORAGE_KEY = 'velorider_audio_settings_v2';

let audioContext = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;

let enabled = false;
let volume = 0.65;
let audioUnlocked = false;
let currentScene = 'garage';
let musicTimer = null;
let nextStepTime = 0;
let currentStep = 0;
let panelHidden = false;
let resumePromise = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setStatus(message) {
    const status = document.getElementById('audio-status');
    if (status) status.textContent = message;
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

function loadSettings() {
    // iOS may require a fresh user gesture after the Mini App opens.
    // Therefore, audio is deliberately not auto-enabled on reload.
    enabled = false;

    try {
        const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
        if (!raw) return;

        const data = JSON.parse(raw);
        if (typeof data.volume === 'number') {
            volume = clamp(data.volume, 0, 1);
        }
        if (typeof data.panelHidden === 'boolean') {
            panelHidden = data.panelHidden;
        }
    } catch (error) {
        console.warn('Не удалось загрузить настройки звука:', error);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
            volume,
            panelHidden
        }));
    } catch (error) {
        console.warn('Не удалось сохранить настройки звука:', error);
    }
}

// ------------------------------------------------------------
// AudioContext
// ------------------------------------------------------------

function ensureAudioContext() {
    if (audioContext && audioContext.state !== 'closed') {
        return audioContext;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        console.error('Web Audio API не поддерживается.');
        setStatus('Этот браузер не поддерживает Web Audio API.');
        return null;
    }

    try {
        audioContext = new AudioContextClass({ latencyHint: 'interactive' });

        masterGain = audioContext.createGain();
        musicGain = audioContext.createGain();
        sfxGain = audioContext.createGain();

        masterGain.gain.value = 0;
        musicGain.gain.value = 0.72;
        sfxGain.gain.value = 0.8;

        musicGain.connect(masterGain);
        sfxGain.connect(masterGain);
        masterGain.connect(audioContext.destination);

        audioContext.addEventListener('statechange', handleAudioStateChange);
        return audioContext;
    } catch (error) {
        console.error('Не удалось создать AudioContext:', error);
        setStatus('Не удалось создать аудиосистему.');
        return null;
    }
}

function handleAudioStateChange() {
    if (!audioContext) return;

    if (audioContext.state === 'running') {
        audioUnlocked = true;
        applyVolume();

        if (enabled && !document.hidden) {
            startMusic(true);
        }
        setStatus(enabled ? 'Звук работает' : 'Звук готов');
        return;
    }

    // Не сбрасываем enabled автоматически: iOS может временно
    // приостановить/прервать контекст при сворачивании Telegram.
    audioUnlocked = false;
    stopMusic();

    if (enabled) {
        setStatus('Аудио приостановлено iOS. Вернись в игру или нажми звук ещё раз.');
    }
}

function applyVolume() {
    if (!audioContext || !masterGain) return;

    const targetVolume = enabled ? volume : 0;
    try {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.setTargetAtTime(
            targetVolume,
            audioContext.currentTime,
            0.04
        );
    } catch (error) {
        console.warn('Не удалось изменить громкость:', error);
    }
}

// ------------------------------------------------------------
// iOS / Telegram audio unlock
// IMPORTANT: call from a real button tap.
// ------------------------------------------------------------

async function unlockAudio() {
    if (resumePromise) return resumePromise;

    resumePromise = (async () => {
        const context = ensureAudioContext();
        if (!context) return false;

        try {
            if (context.state !== 'running') {
                // resume() is invoked immediately in the button's tap flow.
                await context.resume();
            }

            if (context.state !== 'running') {
                console.warn('AudioContext state:', context.state);
                return false;
            }

            audioUnlocked = true;
            applyVolume();

            if (enabled) startMusic(true);

            console.info('VeloRider AudioContext:', context.state);
            setStatus('Звук работает');
            return true;
        } catch (error) {
            console.error('Не удалось запустить звук:', error);
            setStatus('iPhone не запустил аудио. Нажми кнопку звука ещё раз.');
            return false;
        }
    })();

    try {
        return await resumePromise;
    } finally {
        resumePromise = null;
    }
}

async function setEnabled(value) {
    if (!value) {
        enabled = false;
        stopMusic();
        applyVolume();
        saveSettings();
        updateUI();
        setStatus('Звук выключен');
        return true;
    }

    enabled = true;
    updateUI();

    const success = await unlockAudio();
    if (!success) {
        enabled = false;
        stopMusic();
        applyVolume();
        updateUI();
        setStatus('Не получилось включить звук. Нажми кнопку ещё раз.');
        return false;
    }

    applyVolume();
    startMusic(true);
    saveSettings();
    updateUI();
    setStatus('Звук работает');
    return true;
}

// ------------------------------------------------------------
// Synthesizer
// ------------------------------------------------------------

function scheduleTone(
    frequency,
    startTime,
    duration,
    waveform = 'triangle',
    gainValue = 0.1,
    destination = musicGain
) {
    if (!audioContext || !destination || audioContext.state !== 'running') return;

    try {
        const oscillator = audioContext.createOscillator();
        const envelope = audioContext.createGain();
        const start = Math.max(startTime, audioContext.currentTime);
        const end = start + duration;

        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(frequency, start);

        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, gainValue),
            start + 0.015
        );
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(envelope);
        envelope.connect(destination);
        oscillator.start(start);
        oscillator.stop(end + 0.03);

        oscillator.addEventListener('ended', () => {
            oscillator.disconnect();
            envelope.disconnect();
        }, { once: true });
    } catch (error) {
        console.warn('Ошибка генерации ноты:', error);
    }
}

const GARAGE_MELODY = [
    0, null, 2, null, 4, null, 2, null,
    5, null, 4, null, 2, null, 1, null
];

const RACE_MELODY = [
    0, 2, 4, 2, 5, 4, 2, 4,
    7, 5, 4, 5, 2, 4, 1, 2
];

const NOTE_FREQUENCIES = [
    220.00, 246.94, 293.66, 329.63,
    392.00, 440.00, 493.88, 587.33
];

const GARAGE_BASS = [110.00, 130.81, 146.83, 130.81];
const RACE_BASS = [110.00, 146.83, 164.81, 146.83];

function playMusicStep(time) {
    if (!audioContext || !musicGain || audioContext.state !== 'running') return;

    const step = currentStep % 16;
    const isRace = currentScene === 'race';
    const melody = isRace ? RACE_MELODY : GARAGE_MELODY;
    const bass = isRace ? RACE_BASS : GARAGE_BASS;
    const noteIndex = melody[step];

    if (noteIndex !== null) {
        scheduleTone(
            NOTE_FREQUENCIES[noteIndex],
            time,
            isRace ? 0.16 : 0.22,
            isRace ? 'sawtooth' : 'triangle',
            isRace ? 0.07 : 0.055,
            musicGain
        );
    }

    if (step % 4 === 0) {
        const bassIndex = Math.floor(step / 4) % bass.length;
        scheduleTone(
            bass[bassIndex],
            time,
            0.28,
            'sine',
            isRace ? 0.12 : 0.09,
            musicGain
        );
    }

    if (isRace && step % 4 === 2) {
        scheduleTone(
            NOTE_FREQUENCIES[3],
            time,
            0.07,
            'square',
            0.025,
            musicGain
        );
    }

    currentStep++;
}

function getStepDuration() {
    const bpm = currentScene === 'race' ? 138 : 105;
    return 60 / bpm / 2;
}

function scheduleMusic() {
    if (!audioContext || !enabled || !audioUnlocked) return;
    if (audioContext.state !== 'running') return;

    const now = audioContext.currentTime;
    if (nextStepTime < now - 0.2) {
        nextStepTime = now + 0.03;
    }

    while (nextStepTime < now + 0.12) {
        playMusicStep(nextStepTime);
        nextStepTime += getStepDuration();
    }
}

function startMusic(forceRestart = false) {
    if (!enabled || !audioUnlocked || !audioContext) return;
    if (audioContext.state !== 'running' || document.hidden) return;

    if (musicTimer && !forceRestart) return;

    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }

    currentStep = 0;
    nextStepTime = audioContext.currentTime + 0.04;

    musicTimer = setInterval(scheduleMusic, 25);
    scheduleMusic();
}

function stopMusic() {
    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }
}

// ------------------------------------------------------------
// Public API used by main.js
// ------------------------------------------------------------

export function setAudioScene(scene) {
    const nextScene = scene === 'race' ? 'race' : 'garage';
    if (currentScene === nextScene) return;

    currentScene = nextScene;
    currentStep = 0;

    if (enabled && audioUnlocked) {
        startMusic(true);
    }
}

export function playRaceResult(result) {
    if (!enabled || !audioUnlocked || !audioContext) return;
    if (audioContext.state !== 'running') return;

    const isWin = result === true || result === 'win' || result?.won === true;
    const notes = isWin ? [523.25, 659.25, 783.99] : [392.00, 293.66];
    const start = audioContext.currentTime + 0.03;

    notes.forEach((frequency, index) => {
        scheduleTone(
            frequency,
            start + index * 0.14,
            0.2,
            'triangle',
            0.16,
            sfxGain
        );
    });
}

// ------------------------------------------------------------
// Audio controls UI
// ------------------------------------------------------------

function injectAudioStyles() {
    if (document.getElementById('velorider-audio-style')) return;

    const style = document.createElement('style');
    style.id = 'velorider-audio-style';
    style.textContent = `
        #audio-panel {
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            z-index: 99999;
            width: min(205px, calc(100vw - 20px));
            box-sizing: border-box;
            padding: 10px;
            color: #fff;
            background: rgba(20, 25, 35, .96);
            border: 1px solid rgba(255, 255, 255, .18);
            border-radius: 12px;
            font-family: Arial, sans-serif;
            box-shadow: 0 5px 20px rgba(0, 0, 0, .35);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }
        #audio-panel .audio-row { display: flex; align-items: center; gap: 7px; }
        #audio-panel button {
            border: 0; border-radius: 8px; padding: 9px 10px;
            color: #fff; background: #333d50; font-size: 12px;
            font-weight: 800; cursor: pointer; touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }
        #audio-panel button:active { transform: scale(.97); }
        #audio-enabled { flex: 1; background: #256b45 !important; }
        #audio-enabled.audio-off { background: #8a3940 !important; }
        #audio-hide { width: 32px; min-width: 32px; font-size: 15px !important; }
        #audio-panel .audio-volume-row {
            display: flex; align-items: center; gap: 7px;
            margin-top: 10px; font-size: 11px;
        }
        #audio-volume { flex: 1; min-width: 0; accent-color: #55c889; }
        #audio-volume-value { width: 32px; text-align: right; }
        #audio-status { margin-top: 8px; font-size: 10px; line-height: 1.4; color: #c1cada; }
        #audio-show {
            display: none; position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%; right: auto;
            transform: translateX(-50%);
            z-index: 99999; width: 42px; height: 42px;
            border: 1px solid rgba(255,255,255,.2); border-radius: 50%;
            color: #fff; background: rgba(20,25,35,.96);
            font-size: 19px; cursor: pointer;
            touch-action: manipulation;
        }
        #audio-show.visible { display: block; }
        @media (max-width: 480px) {
            #audio-panel {
                width: min(190px, calc(100vw - 20px));
                left: 50%;
                right: auto;
            }
        }
    `;
    document.head.appendChild(style);
}

function updateUI() {
    const toggle = document.getElementById('audio-enabled');
    const volumeInput = document.getElementById('audio-volume');
    const volumeLabel = document.getElementById('audio-volume-value');
    const panel = document.getElementById('audio-panel');
    const showButton = document.getElementById('audio-show');

    if (toggle) {
        toggle.textContent = enabled ? 'Звук: вкл' : 'Звук: выкл';
        toggle.classList.toggle('audio-off', !enabled);
        toggle.setAttribute('aria-pressed', String(enabled));
    }
    if (volumeInput) volumeInput.value = String(Math.round(volume * 100));
    if (volumeLabel) volumeLabel.textContent = `${Math.round(volume * 100)}%`;
    if (panel) panel.style.display = panelHidden ? 'none' : 'block';
    if (showButton) showButton.classList.toggle('visible', panelHidden);
}

function createAudioPanel() {
    if (document.getElementById('audio-panel')) return;

    injectAudioStyles();

    const panel = document.createElement('div');
    panel.id = 'audio-panel';
    panel.innerHTML = `
        <div class="audio-row">
            <button id="audio-enabled" type="button" aria-pressed="false">Звук: выкл</button>
            <button id="audio-hide" type="button" aria-label="Скрыть настройки звука">×</button>
        </div>
        <div class="audio-volume-row">
            <span>Громкость</span>
            <input id="audio-volume" type="range" min="0" max="100" value="65" step="1" aria-label="Громкость">
            <span id="audio-volume-value">65%</span>
        </div>
        <div id="audio-status" aria-live="polite">Нажми «Звук: выкл», чтобы включить музыку</div>
    `;

    const showButton = document.createElement('button');
    showButton.id = 'audio-show';
    showButton.type = 'button';
    showButton.textContent = '♫';
    showButton.setAttribute('aria-label', 'Показать настройки звука');

    document.body.appendChild(panel);
    document.body.appendChild(showButton);

    document.getElementById('audio-enabled').addEventListener('click', () => {
        // This click is the required user gesture on iOS.
        void setEnabled(!enabled);
    });

    document.getElementById('audio-volume').addEventListener('input', event => {
        volume = clamp(Number(event.target.value) / 100, 0, 1);
        applyVolume();
        saveSettings();
        updateUI();
    });

    document.getElementById('audio-hide').addEventListener('click', () => {
        panelHidden = true;
        saveSettings();
        updateUI();
    });

    showButton.addEventListener('click', () => {
        panelHidden = false;
        saveSettings();
        updateUI();
    });

    updateUI();
}

export function initAudioControls() {
    loadSettings();
    createAudioPanel();
    updateUI();
    console.info('VeloRider Audio System initialized');
}

// Recover the sequencer when Telegram/iOS returns the Mini App to foreground.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopMusic();
        return;
    }

    if (enabled && audioContext?.state === 'running') {
        audioUnlocked = true;
        startMusic(true);
    }
});

window.addEventListener('pagehide', () => {
    stopMusic();
    saveSettings();
});

window.addEventListener('beforeunload', saveSettings);
