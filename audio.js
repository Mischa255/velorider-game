import { clamp } from './utils.js';

const AUDIO_STORAGE_KEY = 'velorider_audio_settings_v9';

// ============================================================
// VeloRider — Audio System (MP3 Tracks + Synth SFX)
// ============================================================

let audioContext = null;
let sfxGain = null;

// Фоновая музыка (MP3)
const bgm = new Audio();
bgm.loop = true;
let fadeInterval = null;
let raceResultVolumeTimer = null;

let enabled = false;
let volume = 0.65;
const BGM_MAX_VOLUME = 0.6;

let audioUnlocked = false;
let currentScene = 'garage';

let panelHidden = false;
let resumePromise = null;

// ------------------------------------------------------------
// Вспомогательные функции
// ------------------------------------------------------------

function setStatus(message) {
    const status = document.getElementById('audio-status');
    if (status) {
        status.textContent = message;
    }
}

// ------------------------------------------------------------
// Настройки
// ------------------------------------------------------------

function loadSettings() {
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
        console.warn('Ошибка загрузки аудионастроек:', error);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(
            AUDIO_STORAGE_KEY,
            JSON.stringify({ volume, panelHidden })
        );
    } catch (error) {
        console.warn('Ошибка сохранения аудионастроек:', error);
    }
}

// ------------------------------------------------------------
// Фоновая музыка (MP3) — с защитой от багов переключения
// ------------------------------------------------------------

function updateBgmVolume() {
    if (!enabled) {
        bgm.volume = 0;
        return;
    }
    if (!fadeInterval) {
        bgm.volume = clamp(volume * BGM_MAX_VOLUME, 0, 1);
    }
}

function clearRaceResultVolumeTimer() {
    if (raceResultVolumeTimer === null) return false;
    clearTimeout(raceResultVolumeTimer);
    raceResultVolumeTimer = null;
    return true;
}

function playBgm(sceneName) {
    const restoreRaceResultVolume = clearRaceResultVolumeTimer();
    if (!enabled || !audioUnlocked) return;

    const trackName = /^(?:t\d+|[12]h[1-5])$/.test(sceneName) ? sceneName : 'garage';
    const fileName = `music/${trackName}.mp3`;

    // Если этот же трек уже играет и не на паузе — не дергаем лишний раз
    if (bgm.src.endsWith(fileName) && !bgm.paused) {
        if (restoreRaceResultVolume) updateBgmVolume();
        return;
    }

    if (fadeInterval) clearInterval(fadeInterval);

    // Быстрое переключение с защитой от зависания потока на мобильных
    bgm.pause();
    bgm.onerror = null;
    bgm.src = fileName;
    bgm.currentTime = 0;
    bgm.volume = clamp(volume * BGM_MAX_VOLUME, 0, 1);

    const fallbackToGarage = () => {
        if (
            trackName !== 'garage' &&
            enabled &&
            audioUnlocked &&
            currentScene === sceneName &&
            bgm.src.endsWith(fileName)
        ) {
            console.warn(`Музыка ${fileName} пока недоступна. Включаю музыку гаража.`);
            bgm.onerror = null;
            playBgm('garage');
        }
    };

    bgm.onerror = fallbackToGarage;
    bgm.play().catch(e => {
        console.warn('MP3 play error (возможно, файл еще грузится или заблокирован):', e);
        fallbackToGarage();
    });
}

function stopBgm() {
    clearRaceResultVolumeTimer();
    if (fadeInterval) clearInterval(fadeInterval);
    bgm.pause();
    bgm.currentTime = 0;
}

export function setAudioScene(scene) {
    if (clearRaceResultVolumeTimer()) updateBgmVolume();
    currentScene = scene;
    if (enabled && audioUnlocked) {
        playBgm(currentScene);
    }
}

// ------------------------------------------------------------
// Синтезатор для звуков UI и победы (AudioContext)
// ------------------------------------------------------------

function ensureAudioContext() {
    if (audioContext && audioContext.state !== 'closed') {
        return audioContext;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        console.error('Web Audio API не поддерживается');
        setStatus('Аудио не поддерживается этим браузером');
        return null;
    }

    try {
        audioContext = new AudioContextClass({ latencyHint: 'interactive' });
        sfxGain = audioContext.createGain();
        sfxGain.gain.value = volume;
        sfxGain.connect(audioContext.destination);

        audioContext.addEventListener('statechange', () => {
            if (!audioContext) return;
            if (audioContext.state === 'running') {
                audioUnlocked = true;
                if (enabled) playBgm(currentScene);
                setStatus(enabled ? 'Звук работает' : 'Звук выключен');
            } else {
                audioUnlocked = false;
                stopBgm();
                if (enabled && audioContext.state !== 'suspended') {
                    enabled = false;
                    updateUI();
                }
                setStatus('Звук приостановлен');
            }
        });
        return audioContext;
    } catch (error) {
        console.error('Не удалось создать AudioContext:', error);
        return null;
    }
}

function scheduleTone(frequency, startTime, duration, options = {}) {
    if (!audioContext || !sfxGain || !enabled || !audioUnlocked || audioContext.state !== 'running') return;

    try {
        const oscillator = audioContext.createOscillator();
        const envelope = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();

        oscillator.type = options.type || 'sine';
        oscillator.frequency.setValueAtTime(Math.max(1, frequency), startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(options.cutoff || 3000, startTime);
        filter.Q.value = 0.8;

        const gain = Math.max(0.0001, options.gain ?? 0.08);
        const attack = Math.max(0.001, options.attack ?? 0.01);
        const release = Math.max(0.02, options.release ?? 0.05);

        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.linearRampToValueAtTime(gain, startTime + attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

        oscillator.connect(filter);
        filter.connect(envelope);
        envelope.connect(sfxGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + release + 0.03);
    } catch (error) {
        console.warn('Ошибка генерации звука SFX:', error);
    }
}

function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

// ------------------------------------------------------------
// Звуки победы/поражения
// ------------------------------------------------------------

export function playCoinSound() {
    if (!audioContext || !audioUnlocked || !enabled) return;
    const now = audioContext.currentTime;
    scheduleTone(987.77, now, 0.07, { type: 'sine', gain: 0.1, attack: 0.002, release: 0.05 });
    scheduleTone(1318.51, now + 0.05, 0.12, { type: 'sine', gain: 0.12, attack: 0.002, release: 0.08 });
}

export function playBoostSound() {
    if (!audioContext || !audioUnlocked || !enabled) return;
    const now = audioContext.currentTime;
    scheduleTone(260, now, 0.18, { type: 'triangle', gain: 0.12, attack: 0.01, release: 0.15, cutoff: 3500 });
    scheduleTone(520, now + 0.07, 0.22, { type: 'sine', gain: 0.14, attack: 0.01, release: 0.18 });
}

export function playRaceResult(win) {
    if (!audioContext || !audioUnlocked || !enabled) return;

    clearRaceResultVolumeTimer();
    bgm.volume = clamp((volume * BGM_MAX_VOLUME) * 0.3, 0, 1);
    raceResultVolumeTimer = setTimeout(() => {
        raceResultVolumeTimer = null;
        updateBgmVolume();
    }, 3000);

    const now = audioContext.currentTime;

    if (win) {
        [72, 76, 79, 84].forEach((note, index) => {
            scheduleTone(midiToFrequency(note), now + index * 0.09, 0.16, {
                type: 'triangle', gain: 0.12, attack: 0.005, release: 0.08, cutoff: 4000
            });
        });
    } else {
        scheduleTone(midiToFrequency(48), now, 0.18, {
            type: 'sawtooth', gain: 0.09, attack: 0.01, release: 0.08, cutoff: 1200
        });
        scheduleTone(midiToFrequency(43), now + 0.15, 0.22, {
            type: 'sawtooth', gain: 0.08, attack: 0.01, release: 0.08, cutoff: 1100
        });
    }
}

// ------------------------------------------------------------
// Управление звуком и UI
// ------------------------------------------------------------

async function unlockAudio() {
    if (resumePromise) return resumePromise;

    resumePromise = (async () => {
        const ctx = ensureAudioContext();
        if (!ctx) return false;

        try {
            if (ctx.state !== 'running') await ctx.resume();
            if (ctx.state !== 'running') return false;

            audioUnlocked = true;
            if (enabled) playBgm(currentScene);

            setStatus(enabled ? 'Звук работает' : 'Звук выключен');
            return true;
        } catch (error) {
            console.error('Ошибка запуска аудио:', error);
            setStatus('Не удалось запустить звук. Нажми ещё раз.');
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
        stopBgm();
        saveSettings();
        updateUI();
        setStatus('Звук выключен');
        return true;
    }

    enabled = true;
    updateUI();
    updateBgmVolume();

    const success = await unlockAudio();
    if (!success) {
        enabled = false;
        stopBgm();
        updateUI();
        setStatus('Браузер не запустил аудио. Нажми ещё раз.');
        return false;
    }

    playBgm(currentScene);
    saveSettings();
    updateUI();
    setStatus('Звук работает');
    return true;
}

export function setAudioEnabled(value) {
    return setEnabled(Boolean(value));
}

function injectAudioStyles() {
    if (document.getElementById('velorider-audio-style')) return;
    const style = document.createElement('style');
    style.id = 'velorider-audio-style';
    style.textContent = `
        #audio-panel {
            position: fixed; top: calc(env(safe-area-inset-top, 0px) + 10px); left: 50%; transform: translateX(-50%);
            z-index: 99999; width: 205px; padding: 10px; color: #ffffff; background: rgba(20, 25, 35, 0.94);
            border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px; font-family: Arial, sans-serif;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.35); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        #audio-panel .audio-row { display: flex; align-items: center; gap: 7px; }
        #audio-panel button {
            border: none; border-radius: 8px; padding: 9px 10px; color: white; background: #333d50;
            font-size: 12px; font-weight: bold; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
        }
        #audio-panel button:active { transform: scale(0.97); }
        #audio-enabled { flex: 1; background: #256b45 !important; }
        #audio-enabled.audio-off { background: #8a3940 !important; }
        #audio-hide { width: 32px; min-width: 32px; font-size: 15px !important; }
        #audio-panel .audio-volume-row { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 11px; }
        #audio-volume { flex: 1; min-width: 0; accent-color: #55c889; }
        #audio-volume-value { width: 32px; text-align: right; }
        #audio-status { margin-top: 8px; font-size: 10px; line-height: 1.4; color: #b8c5d8; }
        #audio-show {
            display: none; position: fixed; top: calc(env(safe-area-inset-top, 0px) + 10px); left: 50%;
            transform: translateX(-50%); z-index: 99999; width: 42px; height: 42px; border: 1px solid rgba(255,255,255,0.2);
            border-radius: 50%; color: white; background: rgba(20,25,35,0.95); font-size: 19px; cursor: pointer;
        }
        #audio-show.visible { display: block; }
        @media (max-width: 480px) { #audio-panel { width: 190px; } }
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
            <button id="audio-enabled" type="button">Звук: выкл</button>
            <button id="audio-hide" type="button">×</button>
        </div>
        <div class="audio-volume-row">
            <span>Громкость</span>
            <input id="audio-volume" type="range" min="0" max="100" value="65" step="1">
            <span id="audio-volume-value">65%</span>
        </div>
        <div id="audio-status">Нажми «Звук: выкл», чтобы включить музыку</div>
    `;

    const showButton = document.createElement('button');
    showButton.id = 'audio-show';
    showButton.textContent = '♫';

    document.body.appendChild(panel);
    document.body.appendChild(showButton);

    document.getElementById('audio-enabled').addEventListener('click', () => setEnabled(!enabled));
    document.getElementById('audio-volume').addEventListener('input', e => {
        volume = clamp(Number(e.target.value) / 100, 0, 1);
        if (sfxGain) sfxGain.gain.value = volume;
        updateBgmVolume();
        saveSettings();
        updateUI();
    });
    document.getElementById('audio-hide').addEventListener('click', () => {
        panelHidden = true; saveSettings(); updateUI();
    });
    showButton.addEventListener('click', () => {
        panelHidden = false; saveSettings(); updateUI();
    });

    updateUI();
}

function setupAudioUnlock() {
    const unlock = () => { if (!audioUnlocked) void unlockAudio(); };
    document.addEventListener('pointerdown', unlock, { passive: true, once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
        // Автоматически возобновляем музыку, если пользователь вернулся в приложение
        if (!document.hidden && enabled && audioUnlocked) {
            bgm.play().catch(e => console.warn('Resume play error:', e));
        }
    });
}

// ------------------------------------------------------------
// Инициализация
// ------------------------------------------------------------

export function initAudioControls() {
    loadSettings();
    createAudioPanel();
    updateUI();
    setupAudioUnlock();

    if (enabled) {
        enabled = false;
        saveSettings();
        updateUI();
    }
    console.log('VeloRider Audio System (Fixed) initialized');
}

window.addEventListener('beforeunload', saveSettings);
