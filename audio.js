const AUDIO_STORAGE_KEY = 'velorider_audio_settings_v8';

// ============================================================
// VeloRider — Audio System
// Совместимость: Telegram Mini Apps, iPhone, Android, Desktop
// ============================================================

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

// ------------------------------------------------------------
// Вспомогательные функции
// ------------------------------------------------------------

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setStatus(message) {
    const status = document.getElementById('audio-status');
    if (status) {
        status.textContent = message;
    }
}

function hasRunningContext() {
    return Boolean(audioContext && audioContext.state === 'running');
}

// ------------------------------------------------------------
// Настройки
// ------------------------------------------------------------

function loadSettings() {
    // На iPhone и в Telegram звук включаем только руками.
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
            JSON.stringify({
                volume,
                panelHidden
            })
        );
    } catch (error) {
        console.warn('Ошибка сохранения аудионастроек:', error);
    }
}

// ------------------------------------------------------------
// Создание AudioContext
// ------------------------------------------------------------

function ensureAudioContext() {
    if (audioContext && audioContext.state !== 'closed') {
        return audioContext;
    }

    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        console.error('Web Audio API не поддерживается');
        setStatus('Аудио не поддерживается этим браузером');
        return null;
    }

    try {
        audioContext = new AudioContextClass({
            latencyHint: 'interactive'
        });

        masterGain = audioContext.createGain();
        musicGain = audioContext.createGain();
        sfxGain = audioContext.createGain();

        musicGain.gain.value = 0.7;
        sfxGain.gain.value = 0.8;
        masterGain.gain.value = 0;

        musicGain.connect(masterGain);
        sfxGain.connect(masterGain);
        masterGain.connect(audioContext.destination);

        audioContext.addEventListener('statechange', () => {
            if (!audioContext) return;

            if (audioContext.state === 'running') {
                audioUnlocked = true;
                applyVolume();

                if (enabled) {
                    startMusic(true);
                }

                setStatus('Звук работает');
            } else {
                audioUnlocked = false;
                stopMusic();

                if (enabled && audioContext.state !== 'suspended') {
                    enabled = false;
                    applyVolume();
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

// ------------------------------------------------------------
// Громкость
// ------------------------------------------------------------

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
        console.warn('Ошибка изменения громкости:', error);
        masterGain.gain.value = targetVolume;
    }
}

function setVolume(value) {
    volume = clamp(Number(value) || 0, 0, 1);
    applyVolume();
    saveSettings();
    updateUI();
}

// ------------------------------------------------------------
// Разблокировка аудио
// ------------------------------------------------------------

async function unlockAudio() {
    if (resumePromise) {
        return resumePromise;
    }

    resumePromise = (async () => {
        const ctx = ensureAudioContext();
        if (!ctx) return false;

        try {
            if (ctx.state !== 'running') {
                await ctx.resume();
            }

            if (ctx.state !== 'running') {
                console.warn('AudioContext не запущен. Текущее состояние:', ctx.state);
                return false;
            }

            audioUnlocked = true;
            applyVolume();

            if (enabled) {
                startMusic(true);
            }

            console.log('VeloRider AudioContext:', ctx.state);
            setStatus('Звук работает');

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

// ------------------------------------------------------------
// Включение и выключение
// ------------------------------------------------------------

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
    applyVolume();

    const success = await unlockAudio();

    if (!success) {
        enabled = false;
        stopMusic();
        applyVolume();
        updateUI();
        setStatus('iPhone не запустил аудио. Попробуй нажать ещё раз.');
        return false;
    }

    enabled = true;
    applyVolume();
    startMusic(true);

    saveSettings();
    updateUI();
    setStatus('Звук работает');

    return true;
}

export function setAudioEnabled(value) {
    return setEnabled(Boolean(value));
}

// ------------------------------------------------------------
// Генерация отдельных звуков
// ------------------------------------------------------------

function scheduleTone(
    frequency,
    startTime,
    duration,
    options = {},
    destination = musicGain
) {
    if (!audioContext || !destination) return;
    if (!enabled || !audioUnlocked) return;
    if (audioContext.state !== 'running') return;

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
        envelope.connect(destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + release + 0.03);
    } catch (error) {
        console.warn('Ошибка генерации звука:', error);
    }
}

// ------------------------------------------------------------
// Музыкальные темы
// ------------------------------------------------------------

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


const TRACK_MUSIC_PROFILES = {
 t1:{bpm:104,root:48,wave:'triangle',motif:[0,3,5,7,5,3,2,0],mode:'minor'},
 t2:{bpm:112,root:50,wave:'sine',motif:[0,2,5,7,9,7,5,2],mode:'major'},
 t3:{bpm:118,root:52,wave:'triangle',motif:[0,3,7,10,7,5,3,0],mode:'minor'},
 t4:{bpm:124,root:53,wave:'square',motif:[0,2,4,7,9,7,4,2],mode:'major'},
 t5:{bpm:108,root:55,wave:'sine',motif:[0,4,7,9,7,4,2,0],mode:'major'},
 t6:{bpm:128,root:45,wave:'sawtooth',motif:[0,5,7,10,12,10,7,5],mode:'minor'},
 t7:{bpm:116,root:47,wave:'triangle',motif:[0,3,5,8,10,8,5,3],mode:'minor'},
 t8:{bpm:136,root:50,wave:'square',motif:[0,2,7,9,12,9,7,2],mode:'minor'},
 t9:{bpm:120,root:52,wave:'sine',motif:[0,4,7,11,12,11,7,4],mode:'major'},
 t10:{bpm:144,root:48,wave:'sawtooth',motif:[0,3,7,10,12,15,12,10],mode:'minor'}
};
function createTrackTheme(p){
 const third=p.mode==='major'?4:3, steps=[0,5,3,7];
 return {bpm:p.bpm,root:p.root,bass:steps.map(x=>p.root+x-12),
 chords:steps.map((x,i)=>{const r=p.root+x;return [r,r+((i===1||i===3)?3:third),r+7]}),
 melody:[0,1,2,3].map(bar=>p.motif.map(n=>n+(bar===2?2:0))),
 melodyWave:p.wave,bassVolume:.14,melodyVolume:.085,chordVolume:.065,drumVolume:p.bpm>=130?.105:.085};
}
for(const [id,p] of Object.entries(TRACK_MUSIC_PROFILES)) THEMES[id]=createTrackTheme(p);

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
    const buffer = ensureNoiseBuffer();
    if (!audioContext || !buffer || !enabled || !audioUnlocked) {
        return;
    }

    try {
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const envelope = audioContext.createGain();

        source.buffer = noiseBuffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(cutoff, time);

        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.linearRampToValueAtTime(gainValue, time + 0.005);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(musicGain);

        source.start(time);
        source.stop(time + duration + 0.02);
    } catch (error) {
        console.warn('Ошибка генерации шума:', error);
    }
}

function playChord(notes, time, duration, theme) {
    notes.forEach((note, index) => {
        scheduleTone(
            midiToFrequency(note),
            time,
            duration,
            {
                type: index === 0 ? 'triangle' : 'sine',
                gain: theme.chordVolume * (index === 0 ? 1 : 0.7),
                attack: 0.025,
                release: 0.15,
                cutoff: 1500 + index * 300
            }
        );
    });
}

function playMusicStep(time) {
    if (!audioContext || !enabled || !audioUnlocked) return;

    const theme = THEMES[currentScene] || THEMES.garage;
    const localStep = currentStep % 8;
    const bar = Math.floor(currentStep / 8) % 4;
    const beatSeconds = 60 / theme.bpm;
    const stepSeconds = beatSeconds / 2;

    if (localStep === 0) {
        playChord(theme.chords[bar], time, beatSeconds * 3.5, theme);
    }

    if (localStep === 0 || localStep === 4) {
        playBass(theme.bass[bar], time, theme);
    }

    const melodyNote = theme.melody[bar][localStep];

    if (melodyNote !== null && melodyNote !== undefined) {
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

    if (localStep === 0 || localStep === 4) {
        playKick(time, theme.drumVolume);
    }

    if (localStep === 2 || localStep === 6) {
        playNoise(time, 0.09, 1000, theme.drumVolume * 0.5);
    }

    playNoise(time, 0.025, 6500, theme.drumVolume * 0.13);

    currentStep = (currentStep + 1) % 32;
}

function scheduleMusic() {
    if (!audioContext || !enabled || !audioUnlocked || musicTimer === null) {
        return;
    }

    if (audioContext.state !== 'running') return;

    const now = audioContext.currentTime;
    const theme = THEMES[currentScene] || THEMES.garage;
    const stepSeconds = (60 / theme.bpm) / 2;
    const scheduleAhead = 0.12;

    if (nextStepTime < now - 0.2) {
        nextStepTime = now + 0.03;
    }

    while (nextStepTime < now + scheduleAhead) {
        playMusicStep(nextStepTime);
        nextStepTime += stepSeconds;
    }
}

function startMusic(forceRestart = false) {
    if (!audioContext || !enabled || !audioUnlocked || audioContext.state !== 'running') {
        return;
    }

    if (musicTimer && !forceRestart) {
        return;
    }

    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }

    currentStep = 0;
    nextStepTime = audioContext.currentTime + 0.04;

    const now = audioContext.currentTime;

    try {
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.setValueAtTime(musicGain.gain.value, now);
        musicGain.gain.linearRampToValueAtTime(0.72, now + 0.3);
    } catch {
        musicGain.gain.value = 0.72;
    }

    musicTimer = setInterval(scheduleMusic, 25);
    scheduleMusic();
}

function stopMusic() {
    if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
    }

    if (!audioContext || !musicGain) return;

    const now = audioContext.currentTime;

    try {
        musicGain.gain.cancelScheduledValues(now);
        musicGain.gain.setValueAtTime(musicGain.gain.value, now);
        musicGain.gain.linearRampToValueAtTime(0, now + 0.08);
    } catch {
        musicGain.gain.value = 0;
    }
}

function midiToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function createNoiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    return buffer;
}

let noiseBuffer = null;

function ensureNoiseBuffer() {
    if (!audioContext) return null;
    if (noiseBuffer) return noiseBuffer;

    noiseBuffer = createNoiseBuffer(audioContext);
    return noiseBuffer;
}

// ------------------------------------------------------------
// Смена сцены
// ------------------------------------------------------------

export function setAudioScene(scene) {
    const nextScene = Object.prototype.hasOwnProperty.call(THEMES, scene)
        ? scene
        : scene === 'race' ? 'race' : 'garage';

    if (currentScene === nextScene) return;

    currentScene = nextScene;

    if (enabled && audioUnlocked) {
        startMusic(true);
    }
}

// ------------------------------------------------------------
// Звук результата гонки
// ------------------------------------------------------------

function playSuccessJingle() {
    if (!audioContext || !audioUnlocked || !enabled) return;

    const now = audioContext.currentTime;

    [72, 76, 79, 84].forEach((note, index) => {
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

function playFailureBuzz() {
    if (!audioContext || !audioUnlocked || !enabled) return;

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

export function playRaceResult(win) {
    if (!audioContext || !audioUnlocked || !enabled) return;

    if (win) {
        playSuccessJingle();
    } else {
        playFailureBuzz();
    }
}

// ------------------------------------------------------------
// Интерфейс управления звуком
// ------------------------------------------------------------

function injectAudioStyles() {
    if (document.getElementById('velorider-audio-style')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'velorider-audio-style';

    style.textContent = `
        #audio-panel {
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;

            width: 205px;
            padding: 10px;

            color: #ffffff;
            background: rgba(20, 25, 35, 0.94);

            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 12px;

            font-family: Arial, sans-serif;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.35);

            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
        }

        #audio-panel .audio-row {
            display: flex;
            align-items: center;
            gap: 7px;
        }

        #audio-panel button {
            border: none;
            border-radius: 8px;
            padding: 9px 10px;

            color: white;
            background: #333d50;

            font-size: 12px;
            font-weight: bold;

            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        #audio-panel button:active {
            transform: scale(0.97);
        }

        #audio-enabled {
            flex: 1;
            background: #256b45 !important;
        }

        #audio-enabled.audio-off {
            background: #8a3940 !important;
        }

        #audio-hide {
            width: 32px;
            min-width: 32px;
            font-size: 15px !important;
        }

        #audio-panel .audio-volume-row {
            display: flex;
            align-items: center;
            gap: 7px;

            margin-top: 10px;

            font-size: 11px;
        }

        #audio-volume {
            flex: 1;
            min-width: 0;
            accent-color: #55c889;
        }

        #audio-volume-value {
            width: 32px;
            text-align: right;
        }

        #audio-status {
            margin-top: 8px;

            font-size: 10px;
            line-height: 1.4;

            color: #b8c5d8;
        }

        #audio-show {
            display: none;

            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%;
            transform: translateX(-50%);

            z-index: 99999;

            width: 42px;
            height: 42px;

            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 50%;

            color: white;
            background: rgba(20,25,35,0.95);

            font-size: 19px;
            cursor: pointer;
        }

        #audio-show.visible {
            display: block;
        }

        @media (max-width: 480px) {
            #audio-panel {
                width: 190px;
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
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    if (volumeInput) {
        volumeInput.value = String(Math.round(volume * 100));
    }

    if (volumeLabel) {
        volumeLabel.textContent = `${Math.round(volume * 100)}%`;
    }

    if (panel) {
        panel.style.display = panelHidden ? 'none' : 'block';
    }

    if (showButton) {
        showButton.classList.toggle('visible', panelHidden);
    }
}

function createAudioPanel() {
    if (document.getElementById('audio-panel')) {
        return;
    }

    injectAudioStyles();

    const panel = document.createElement('div');
    panel.id = 'audio-panel';

    panel.innerHTML = `
        <div class="audio-row">
            <button id="audio-enabled" type="button">
                Звук: выкл
            </button>

            <button id="audio-hide" type="button">
                ×
            </button>
        </div>

        <div class="audio-volume-row">
            <span>Громкость</span>

            <input
                id="audio-volume"
                type="range"
                min="0"
                max="100"
                value="65"
                step="1"
            >

            <span id="audio-volume-value">65%</span>
        </div>

        <div id="audio-status" aria-live="polite">
            Нажми «Звук: выкл», чтобы включить музыку
        </div>
    `;

    const showButton = document.createElement('button');
    showButton.id = 'audio-show';
    showButton.type = 'button';
    showButton.textContent = '♫';
    showButton.setAttribute('aria-label', 'Показать настройки звука');

    document.body.appendChild(panel);
    document.body.appendChild(showButton);

    const toggle = document.getElementById('audio-enabled');
    toggle.addEventListener('click', () => {
        void setEnabled(!enabled);
    });

    const volumeInput = document.getElementById('audio-volume');
    volumeInput.addEventListener('input', event => {
        volume = clamp(Number(event.target.value) / 100, 0, 1);
        applyVolume();
        saveSettings();
        updateUI();
    });

    document.getElementById('audio-hide')?.addEventListener('click', () => {
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

function setupAudioUnlock() {
    const unlock = () => {
        if (audioUnlocked) return;
        void unlockAudio();
    };

    document.addEventListener('pointerdown', unlock, { passive: true, once: true });
    document.addEventListener('keydown', unlock, { once: true });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && enabled) {
            void unlockAudio();
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

    console.log('VeloRider Audio System initialized');
}

// ------------------------------------------------------------
// Сохранение настроек
// ------------------------------------------------------------

window.addEventListener('beforeunload', () => {
    saveSettings();
});