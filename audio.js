// ============================================
// VELORIDER AUDIO SYSTEM
// Browser + Telegram Mini App
// ============================================

const AUDIO_STORAGE_KEY = 'velorider_audio_settings_v3';

const THEMES = {
    garage: {
        bpm: 92,
        root: 48,

        bass: [36, 36, 38, 36],

        chords: [
            [48, 55, 60],
            [45, 52, 57],
            [43, 50, 55],
            [40, 47, 52]
        ],

        melody: [
            [0, 2, 3, 5, 3, 2, null, 0],
            [0, null, 2, 3, 5, 3, 2, null],
            [0, 0, 3, 5, 7, 5, 3, 2],
            [2, 3, 5, 7, 5, 3, 2, null]
        ],

        melodyWave: 'triangle',
        bassVolume: 0.12,
        melodyVolume: 0.08,
        chordVolume: 0.06,
        drumVolume: 0.08
    },

    race: {
        bpm: 132,
        root: 52,

        bass: [40, 40, 43, 38],

        chords: [
            [52, 59, 64],
            [50, 57, 62],
            [47, 55, 59],
            [45, 52, 57]
        ],

        melody: [
            [0, 3, 5, 7, 10, 7, 5, 3],
            [0, 2, 5, 7, 9, 7, 5, 2],
            [0, 3, 5, 10, 12, 10, 7, 5],
            [2, 5, 7, 9, 10, 9, 7, 5]
        ],

        melodyWave: 'square',
        bassVolume: 0.15,
        melodyVolume: 0.09,
        chordVolume: 0.07,
        drumVolume: 0.10
    }
};


// ============================================
// СОСТОЯНИЕ
// ============================================

let audioContext = null;

let masterGain = null;
let musicGain = null;
let sfxGain = null;

let noiseBuffer = null;

let enabled = false;
let volume = 0.65;
let panelHidden = false;

let currentScene = 'garage';
let currentStep = 0;
let nextStepTime = 0;

let sequencerTimer = null;
let resultTimer = null;

let audioUnlocked = false;
let uiReady = false;
let listenersReady = false;


// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}


// ============================================
// ЗАГРУЗКА НАСТРОЕК
// ============================================

function loadSettings() {
    try {
        const raw = localStorage.getItem(AUDIO_STORAGE_KEY);

        if (!raw) return;

        const data = JSON.parse(raw);

        if (typeof data.enabled === 'boolean') {
            enabled = data.enabled;
        }

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
            JSON.stringify({
                enabled,
                volume,
                panelHidden
            })
        );

    } catch (error) {
        console.warn('Ошибка сохранения аудионастроек:', error);
    }
}


// ============================================
// СОЗДАНИЕ ШУМОВОГО БУФЕРА
// ============================================

function createNoiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.5);

    const buffer = ctx.createBuffer(
        1,
        length,
        ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    return buffer;
}


// ============================================
// СОЗДАНИЕ AUDIO CONTEXT
// ============================================

function ensureAudioContext() {
    if (audioContext) {
        return audioContext;
    }

    const AudioCtx =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioCtx) {
        console.warn('Web Audio API не поддерживается.');
        return null;
    }

    try {
        audioContext = new AudioCtx();

        masterGain = audioContext.createGain();
        musicGain = audioContext.createGain();
        sfxGain = audioContext.createGain();

        masterGain.gain.value = 0;
        musicGain.gain.value = 0;
        sfxGain.gain.value = 0.8;

        musicGain.connect(masterGain);
        sfxGain.connect(masterGain);

        masterGain.connect(audioContext.destination);

        noiseBuffer = createNoiseBuffer(audioContext);

        return audioContext;

    } catch (error) {
        console.error('Ошибка создания аудиосистемы:', error);

        audioContext = null;
        masterGain = null;
        musicGain = null;
        sfxGain = null;

        return null;
    }
}


// ============================================
// РАЗБЛОКИРОВКА ЗВУКА
// Вызывается после действия пользователя
// ============================================

async function unlockAudio() {
    const ctx = ensureAudioContext();

    if (!ctx) return false;

    try {
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        if (ctx.state !== 'running') {
            return false;
        }

        audioUnlocked = true;

        applyVolume();

        if (enabled) {
            startMusic();
        }

        return true;

    } catch (error) {
        console.warn('Не удалось разблокировать звук:', error);

        return false;
    }
}


// ============================================
// ГРОМКОСТЬ
// ============================================

function applyVolume() {
    if (!audioContext || !masterGain) return;

    const now = audioContext.currentTime;

    const target = enabled ? volume : 0;

    try {
        masterGain.gain.cancelScheduledValues(now);

        masterGain.gain.setValueAtTime(
            masterGain.gain.value,
            now
        );

        masterGain.gain.linearRampToValueAtTime(
            target,
            now + 0.08
        );

    } catch {
        masterGain.gain.value = target;
    }
}


function setVolume(value) {
    volume = clamp(
        Number(value) || 0,
        0,
        1
    );

    applyVolume();

    saveSettings();
    updateUI();
}


// ============================================
// ВКЛЮЧЕНИЕ / ВЫКЛЮЧЕНИЕ ЗВУКА
// ============================================

async function setEnabled(value) {
    enabled = Boolean(value);

    saveSettings();
    updateUI();

    if (enabled) {
        const success = await unlockAudio();

        if (!success) {
            enabled = false;

            stopMusic();
            applyVolume();

            saveSettings();
            updateUI();

            console.warn(
                'Telegram не разрешил воспроизведение звука.'
            );
        }

    } else {
        stopMusic();
        applyVolume();
    }
}


// ============================================
// СКРЫТИЕ ПАНЕЛИ
// ============================================

function setPanelHidden(value) {
    panelHidden = Boolean(value);

    saveSettings();
    updateUI();
}


// ============================================
// ГЕНЕРАЦИЯ ЗВУКОВ
// ============================================

function scheduleTone(
    frequency,
    time,
    duration,
    options = {},
    destination = musicGain
) {
    if (
        !audioContext ||
        !enabled ||
        !audioUnlocked ||
        !destination
    ) {
        return;
    }

    try {
        const oscillator = audioContext.createOscillator();
        const envelope = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();

        oscillator.type = options.type || 'sine';

        oscillator.frequency.setValueAtTime(
            Math.max(1, frequency),
            time
        );

        filter.type = 'lowpass';

        filter.frequency.setValueAtTime(
            options.cutoff || 3000,
            time
        );

        filter.Q.value = 0.8;

        const gain = Math.max(
            0.0001,
            options.gain ?? 0.08
        );

        const attack = Math.max(
            0.001,
            options.attack ?? 0.01
        );

        const release = Math.max(
            0.02,
            options.release ?? 0.05
        );

        envelope.gain.setValueAtTime(
            0.0001,
            time
        );

        envelope.gain.linearRampToValueAtTime(
            gain,
            time + attack
        );

        envelope.gain.exponentialRampToValueAtTime(
            0.0001,
            time + duration + release
        );

        oscillator.connect(filter);
        filter.connect(envelope);
        envelope.connect(destination);

        oscillator.start(time);

        oscillator.stop(
            time + duration + release + 0.03
        );

    } catch (error) {
        console.warn('Ошибка генерации звука:', error);
    }
}


// ============================================
// БАС
// ============================================

function playBass(note, time, theme) {
    scheduleTone(
        midiToFrequency(note),
        time,
        0.35,
        {
            type: 'triangle',
            gain: theme.bassVolume,
            attack: 0.01,
            release: 0.12,
            cutoff: 1400
        }
    );
}


// ============================================
// УДАРНЫЕ
// ============================================

function playKick(time, gain = 0.1) {
    scheduleTone(
        145,
        time,
        0.12,
        {
            type: 'sine',
            gain,
            attack: 0.005,
            release: 0.06,
            cutoff: 500
        }
    );
}


function playNoise(time, duration, cutoff, gainValue) {
    if (
        !audioContext ||
        !noiseBuffer ||
        !enabled ||
        !audioUnlocked
    ) {
        return;
    }

    try {
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const envelope = audioContext.createGain();

        source.buffer = noiseBuffer;

        filter.type = 'highpass';

        filter.frequency.setValueAtTime(
            cutoff,
            time
        );

        envelope.gain.setValueAtTime(
            0.0001,
            time
        );

        envelope.gain.linearRampToValueAtTime(
            gainValue,
            time + 0.005
        );

        envelope.gain.exponentialRampToValueAtTime(
            0.0001,
            time + duration
        );

        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(musicGain);

        source.start(time);
        source.stop(time + duration + 0.02);

    } catch (error) {
        console.warn('Ошибка генерации шума:', error);
    }
}


// ============================================
// АККОРДЫ
// ============================================

function playChord(notes, time, duration, theme) {
    notes.forEach((note, index) => {
        scheduleTone(
            midiToFrequency(note),
            time,
            duration,
            {
                type: index === 0 ? 'triangle' : 'sine',

                gain: theme.chordVolume *
                    (index === 0 ? 1 : 0.7),

                attack: 0.025,
                release: 0.15,
                cutoff: 1500 + index * 300
            }
        );
    });
}


// ============================================
// МУЗЫКАЛЬНЫЙ ШАГ
// ============================================

function playMusicStep(time) {
    if (
        !audioContext ||
        !enabled ||
        !audioUnlocked
    ) {
        return;
    }

    const theme = THEMES[currentScene] || THEMES.garage;

    const localStep = currentStep % 8;

    const bar = Math.floor(currentStep / 8) % 4;

    const beatSeconds = 60 / theme.bpm;

    const stepSeconds = beatSeconds / 2;

    // Аккорды.

    if (localStep === 0) {
        playChord(
            theme.chords[bar],
            time,
            beatSeconds * 3.5,
            theme
        );
    }

    // Бас.

    if (localStep === 0 || localStep === 4) {
        playBass(
            theme.bass[bar],
            time,
            theme
        );
    }

    // Мелодия.

    const melodyNote = theme.melody[bar][localStep];

    if (
        melodyNote !== null &&
        melodyNote !== undefined
    ) {
        scheduleTone(
            midiToFrequency(theme.root + melodyNote),
            time,
            stepSeconds * 0.8,
            {
                type: theme.melodyWave,
                gain: theme.melodyVolume,
                attack: 0.015,
                release: 0.08,
                cutoff: 2800
            }
        );
    }

    // Ударные.

    if (localStep === 0 || localStep === 4) {
        playKick(
            time,
            theme.drumVolume
        );
    }

    if (localStep === 2 || localStep === 6) {
        playNoise(
            time,
            0.09,
            1000,
            theme.drumVolume * 0.5
        );
    }

    // Хай-хэт.

    playNoise(
        time,
        0.025,
        6500,
        theme.drumVolume * 0.13
    );

    currentStep = (currentStep + 1) % 32;
}


// ============================================
// ПЛАНИРОВЩИК
// ============================================

function scheduleMusic() {
    if (
        !audioContext ||
        !enabled ||
        !audioUnlocked ||
        sequencerTimer === null
    ) {
        return;
    }

    const now = audioContext.currentTime;

    const theme = THEMES[currentScene] || THEMES.garage;

    const stepSeconds = (60 / theme.bpm) / 2;

    const scheduleAhead = 0.12;

    // Не воспроизводим пропущенные шаги после паузы.

    if (nextStepTime < now - 0.2) {
        nextStepTime = now + 0.03;
    }

    while (nextStepTime < now + scheduleAhead) {
        playMusicStep(nextStepTime);

        nextStepTime += stepSeconds;
    }
}


// ============================================
// ЗАПУСК МУЗЫКИ
// ============================================

function startMusic() {
    if (
        !audioContext ||
        !enabled ||
        !audioUnlocked ||
        audioContext.state !== 'running'
    ) {
        return;
    }

    stopMusic();

    currentStep = 0;

    nextStepTime = audioContext.currentTime + 0.04;

    const now = audioContext.currentTime;

    try {
        musicGain.gain.cancelScheduledValues(now);

        musicGain.gain.setValueAtTime(
            musicGain.gain.value,
            now
        );

        musicGain.gain.linearRampToValueAtTime(
            0.72,
            now + 0.3
        );

    } catch {
        musicGain.gain.value = 0.72;
    }

    sequencerTimer = window.setInterval(
        scheduleMusic,
        25
    );

    scheduleMusic();
}


// ============================================
// ОСТАНОВКА МУЗЫКИ
// ============================================

function stopMusic() {
    if (sequencerTimer !== null) {
        window.clearInterval(sequencerTimer);
        sequencerTimer = null;
    }

    if (!audioContext || !musicGain) return;

    const now = audioContext.currentTime;

    try {
        musicGain.gain.cancelScheduledValues(now);

        musicGain.gain.setValueAtTime(
            musicGain.gain.value,
            now
        );

        musicGain.gain.linearRampToValueAtTime(
            0,
            now + 0.08
        );

    } catch {
        musicGain.gain.value = 0;
    }
}


// ============================================
// СМЕНА СЦЕНЫ
// ============================================

export function setAudioScene(scene) {
    const nextScene = scene === 'race'
        ? 'race'
        : 'garage';

    if (currentScene === nextScene) return;

    currentScene = nextScene;

    if (enabled && audioUnlocked) {
        startMusic();
    }
}


// ============================================
// ЗВУК ПОБЕДЫ
// ============================================

function playSuccessJingle() {
    if (
        !audioContext ||
        !audioUnlocked ||
        !enabled
    ) {
        return;
    }

    const now = audioContext.currentTime;

    const notes = [72, 76, 79, 84];

    notes.forEach((note, index) => {
        scheduleTone(
            midiToFrequency(note),
            now + index * 0.09,
            0.16,
            {
                type: 'triangle',
                gain: 0.12,
                attack: 0.005,
                release: 0.08,
                cutoff: 4000
            },
            sfxGain
        );
    });
}


// ============================================
// ЗВУК ПОРАЖЕНИЯ
// ============================================

function playFailureBuzz() {
    if (
        !audioContext ||
        !audioUnlocked ||
        !enabled
    ) {
        return;
    }

    const now = audioContext.currentTime;

    scheduleTone(
        midiToFrequency(48),
        now,
        0.18,
        {
            type: 'sawtooth',
            gain: 0.09,
            attack: 0.01,
            release: 0.08,
            cutoff: 1200
        },
        sfxGain
    );

    scheduleTone(
        midiToFrequency(43),
        now + 0.15,
        0.22,
        {
            type: 'sawtooth',
            gain: 0.08,
            attack: 0.01,
            release: 0.08,
            cutoff: 1100
        },
        sfxGain
    );
}


// ============================================
// РЕЗУЛЬТАТ ГОНКИ
// ============================================

export function playRaceResult(win) {
    if (
        !audioContext ||
        !audioUnlocked ||
        !enabled
    ) {
        return;
    }

    if (win) {
        playSuccessJingle();
    } else {
        playFailureBuzz();
    }
}


// ============================================
// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
// ============================================

function updateUI() {
    const panel = document.getElementById('audio-panel');

    const toggle = document.getElementById('audio-panel-toggle');

    const enabledButton = document.getElementById('audio-enabled');

    const volumeInput = document.getElementById('audio-volume');

    const volumeValue = document.getElementById('audio-volume-value');

    if (enabledButton) {
        enabledButton.textContent = enabled
            ? '🔊 Звук: вкл'
            : '🔇 Включить звук';
    }

    if (volumeInput) {
        volumeInput.value = String(
            Math.round(volume * 100)
        );
    }

    if (volumeValue) {
        volumeValue.textContent =
            `${Math.round(volume * 100)}%`;
    }

    if (panel) {
        panel.style.display = panelHidden ? 'none' : 'flex';
    }

    if (toggle) {
        toggle.style.display = panelHidden ? 'flex' : 'none';
    }
}


// ============================================
// СОЗДАНИЕ ПАНЕЛИ
// ============================================

function injectUI() {
    if (uiReady) {
        updateUI();
        return;
    }

    const style = document.createElement('style');

    style.textContent = `
        #audio-panel {
            position:fixed;
            top:12px;
            left:50%;
            transform:translateX(-50%);
            z-index:999;
            display:flex;
            align-items:center;
            gap:10px;
            padding:10px 14px;
            border-radius:999px;
            background:rgba(17,24,39,.96);
            border:1px solid rgba(75,85,99,.9);
            box-shadow:0 10px 30px rgba(0,0,0,.3);
            backdrop-filter:blur(10px);
            color:white;
        }

        #audio-panel button {
            border:0;
            border-radius:999px;
            padding:8px 12px;
            font-weight:700;
            background:#1f2937;
            color:white;
            cursor:pointer;
        }

        #audio-panel button:hover {
            background:#374151;
        }

        #audio-panel input[type="range"] {
            width:130px;
            accent-color:#22c55e;
        }

        #audio-panel-toggle {
            position:fixed;
            top:12px;
            left:50%;
            transform:translateX(-50%);
            z-index:1000;
            display:none;
            align-items:center;
            justify-content:center;
            width:44px;
            height:44px;
            border-radius:50%;
            background:rgba(17,24,39,.96);
            border:1px solid #475569;
            color:white;
            font-size:22px;
            cursor:pointer;
        }

        @media(max-width:600px) {
            #audio-panel {
                gap:6px;
                padding:7px 9px;
                max-width:calc(100vw - 16px);
                flex-wrap:wrap;
                justify-content:center;
            }

            #audio-panel input[type="range"] {
                width:85px;
            }

            #audio-panel button {
                padding:8px 10px;
                font-size:11px;
            }
        }
    `;

    document.head.appendChild(style);

    const panel = document.createElement('div');

    panel.id = 'audio-panel';

    panel.innerHTML = `
        <button type="button" id="audio-enabled">
            🔇 Включить звук
        </button>

        <button type="button" id="audio-hide-button">
            Скрыть
        </button>

        <label style="display:flex;align-items:center;gap:7px;">
            <span style="font-size:11px;opacity:.8;">
                Громкость
            </span>

            <input
                type="range"
                id="audio-volume"
                min="0"
                max="100"
                value="65"
            >

            <span
                id="audio-volume-value"
                style="font-size:11px;min-width:32px;"
            >
                65%
            </span>
        </label>
    `;

    const toggle = document.createElement('button');

    toggle.id = 'audio-panel-toggle';
    toggle.type = 'button';
    toggle.textContent = '♫';

    toggle.setAttribute(
        'aria-label',
        'Настройки звука'
    );

    document.body.appendChild(panel);
    document.body.appendChild(toggle);

    // Кнопка включения звука.
    panel.querySelector('#audio-enabled')?.addEventListener(
        'click',
        () => {
            void setEnabled(!enabled);
        }
    );

    // Скрытие панели.
    panel.querySelector('#audio-hide-button')?.addEventListener(
        'click',
        () => {
            setPanelHidden(true);
        }
    );

    // Громкость.
    panel.querySelector('#audio-volume')?.addEventListener(
        'input',
        event => {
            setVolume(
                Number(event.target.value) / 100
            );
        }
    );

    // Возвращение панели.
    toggle.addEventListener('click', () => {
        setPanelHidden(false);
    });

    uiReady = true;

    updateUI();
}


// ============================================
// ПЕРВОЕ ВЗАИМОДЕЙСТВИЕ
// ============================================

function setupAudioUnlock() {
    if (listenersReady) return;

    listenersReady = true;

    const unlock = () => {
        // Если контекст уже работает, ничего не делаем.
        if (audioUnlocked) return;

        void unlockAudio();
    };

    const removeListeners = () => {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
    };

    const unlockOnce = () => {
        removeListeners();
        unlock();
    };

    window.addEventListener(
        'pointerdown',
        unlockOnce,
        { once: true }
    );

    window.addEventListener(
        'touchstart',
        unlockOnce,
        {
            once: true,
            passive: true
        }
    );

    window.addEventListener(
        'keydown',
        unlockOnce,
        { once: true }
    );
}


// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

export function initAudioControls() {
    loadSettings();

    injectUI();

    updateUI();

    setupAudioUnlock();

    // Автоматического запуска музыки нет.
    // Первый запуск выполняется после взаимодействия.
}


// ============================================
// ВОЗВРАЩЕНИЕ В ПРИЛОЖЕНИЕ
// ============================================

document.addEventListener(
    'visibilitychange',
    async () => {
        if (document.hidden) {
            stopMusic();
            return;
        }

        if (
            enabled &&
            audioUnlocked &&
            audioContext
        ) {
            try {
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                startMusic();

            } catch (error) {
                console.warn(
                    'Ошибка возобновления музыки:',
                    error
                );
            }
        }
    }
);


// ============================================
// СОХРАНЕНИЕ НАСТРОЕК
// ============================================

window.addEventListener('beforeunload', () => {
    saveSettings();
});