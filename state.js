const SAVE_KEY = 'velorider_progress_v1';

// Telegram WebView может закрыться без надёжного beforeunload/pagehide.
const AUTOSAVE_DELAY_MS = 350;
const AUTOSAVE_INTERVAL_MS = 10000;

// === НАСТРОЙКИ SUPABASE ===
const SUPABASE_URL = 'https://qtyokehvvcoswkhdzscz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LcslQx_fXGEeRkR96jooDQ_tnf2V7rA';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Основной ключ — Telegram username: он совпадает с player_identifier
// существующих записей в Supabase и позволяет обновлять их на месте.
function getPlayerKey() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser && tgUser.username) {
        return tgUser.username.trim().toLowerCase();
    }

    // Если у аккаунта нет username, используем неизменяемый Telegram ID.
    if (tgUser && tgUser.id) {
        return `tg_${tgUser.id}`;
    }

    // Запасной вариант для обычного браузера.
    
    // 3. Запасной вариант для обычного браузера (вне Telegram)
    let devId = localStorage.getItem('velorider_dev_id');
    if (!devId) {
        devId = 'dev_' + Math.floor(Math.random() * 1000000);
        localStorage.setItem('velorider_dev_id', devId);
    }
    return devId;
}

async function loadFromSupabase() {
    if (!supabaseClient) return null;
    const identifier = getPlayerKey();
    try {
        const { data, error } = await supabaseClient
            .from('player_saves')
            .select('save_data')
            .eq('player_identifier', identifier)
            .maybeSingle();
        if (error) throw error;
        return data ? data.save_data : null;
    } catch (e) {
        console.warn('Ошибка загрузки из Supabase:', e);
        return null;
    }
}

// Если сохранение было создано старой версией по Telegram username,
// забираем его при первом входе после перехода на постоянный Telegram ID.
async function loadLegacyUsernameSave() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!supabaseClient || !tgUser?.id || !tgUser?.username) return null;

    try {
        const { data, error } = await supabaseClient
            .from('player_saves')
            .select('save_data')
            .eq('player_identifier', tgUser.username.trim().toLowerCase())
            .maybeSingle();
        if (error) throw error;
        return data ? data.save_data : null;
    } catch (e) {
        console.warn('Ошибка загрузки старого сохранения:', e);
        return null;
    }
}

async function saveToSupabase(playerData) {
    if (!supabaseClient) return false;
    const identifier = getPlayerKey();

    try {
        const { error } = await supabaseClient
            .from('player_saves')
            .upsert({
                player_identifier: identifier,
                save_data: playerData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'player_identifier' });
        if (error) throw error;
        return true;
    } catch (e) {
        console.warn('Ошибка сохранения в Supabase:', e);
        return false;
    }
}
// ==========================

function createDefaultPlayer() {
    return {
        // =====================================
        // ЭКОНОМИКА
        // =====================================

        coins: 1000,
        coupons: 0,

        // =====================================
        // ИНВЕНТАРЬ КОМПОНЕНТОВ
        // Формат: категория:id
        // =====================================

        inventory: [
            'frames:f1',
            'forks:fk1',
            'chains:ch1',
            'drivetrain:d1',
            'bottomBrackets:bb1',
            'cranks:cr1',
            'wheels:w1',
            'brakes:b1',
            'electronics:e1'
        ],

        // =====================================
        // ПРОГРЕССИЯ ТРАСС
        // =====================================

        unlockedTracks: ['t1'],

        selectedTrack: 't1',

        // Пройденные трассы
        completedTracks: [],

        // Защита от повторного получения наград
        trackRewardsClaimed: [],
        track4BonusClaimed: false,

        // Совместимость со старым main.js
        track1RewardClaimed: false,

        // =====================================
        // ПРОГРЕССИЯ КОМПОНЕНТОВ
        // =====================================

        // В начале доступны только обычные детали
        unlockedComponentRarities: ['common'],

        /*
            common:
            Доступны с самого начала.

            rare:
            Открываются после победы на t2.

            legendary:
            Открываются после победы на t4.
        */

        componentProgression: {
            rare: {
                unlocked: false,
                requiredTrack: 't2',
                title: 'Редкие компоненты'
            },

            legendary: {
                unlocked: false,
                requiredTrack: 't4',
                title: 'Легендарные компоненты'
            }
        },

        // Количество побед
        totalWins: 0,

        // =====================================
        // УСТАНОВЛЕННЫЕ ДЕТАЛИ
        // =====================================

        equipped: {
            frames: 'f1',
            forks: 'fk1',
            chains: 'ch1',
            drivetrain: 'd1',
            bottomBrackets: 'bb1',
            cranks: 'cr1',
            wheels: 'w1',
            brakes: 'b1',
            electronics: 'e1'
        },

        // =====================================
        // ХАРАКТЕРИСТИКИ ВЕЛОСИПЕДА
        // =====================================

        totalSpeed: 0,
        totalAccel: 0,
        totalJump: 0,
        totalBrake: 0
    };
}

let suppressAutoSave = false;
let autosaveTimer = null;
let autosaveInFlight = false;
let autosaveDirty = false;
let autosaveHeartbeatStarted = false;

const proxyCache = new WeakMap();

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getTelegramWebApp() {
    return window.Telegram?.WebApp || null;
}

function getCloudStorage() {
    return getTelegramWebApp()?.CloudStorage || null;
}

function cloudStorageGet(key) {
    const cloud = getCloudStorage();

    if (!cloud || typeof cloud.getItem !== 'function') {
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        try {
        cloud.getItem(key, (error, value) => {
            resolve(error ? null : value ?? null);
            });
        } catch {
            resolve(null);
        }
    });
}

function cloudStorageSet(key, value) {
    const cloud = getCloudStorage();

    if (!cloud || typeof cloud.setItem !== 'function') {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        try {
        cloud.setItem(key, error => resolve(!error));
        } catch {
            resolve(false);
        }
    });
}

function cloudStorageDelete(key) {
    const cloud = getCloudStorage();

    if (!cloud || typeof cloud.deleteItem !== 'function') {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        try {
        cloud.deleteItem(key, error => resolve(!error));
        } catch {
            resolve(false);
        }
    });
}

function readLocalSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeLocalSave(data) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

function sanitizeLoadedState(raw) {
    const base = createDefaultPlayer();

    if (!raw || typeof raw !== 'object') {
        return base;
    }

    const merged = {
        ...base,
        ...raw
    };

    merged.coins = Math.max(0, Number(merged.coins) || 0);
    merged.coupons = Math.max(0, Number(merged.coupons) || 0);
    merged.totalWins = Math.max(0, Number(merged.totalWins) || 0);

    if (!Array.isArray(merged.inventory)) merged.inventory = deepClone(base.inventory);
    if (!Array.isArray(merged.unlockedTracks)) merged.unlockedTracks = deepClone(base.unlockedTracks);
    if (!Array.isArray(merged.completedTracks)) merged.completedTracks = [];
    if (!Array.isArray(merged.trackRewardsClaimed)) merged.trackRewardsClaimed = [];
    merged.track4BonusClaimed = Boolean(merged.track4BonusClaimed);
    if (!Array.isArray(merged.unlockedComponentRarities)) merged.unlockedComponentRarities = ['common'];

    if (!merged.componentProgression || typeof merged.componentProgression !== 'object') {
        merged.componentProgression = deepClone(base.componentProgression);
    } else {
        merged.componentProgression.rare = {
            unlocked: Boolean(merged.componentProgression.rare?.unlocked),
            requiredTrack: String(merged.componentProgression.rare?.requiredTrack || 't2'),
            title: String(merged.componentProgression.rare?.title || 'Редкие компоненты')
        };

        merged.componentProgression.legendary = {
            unlocked: Boolean(merged.componentProgression.legendary?.unlocked),
            requiredTrack: String(merged.componentProgression.legendary?.requiredTrack || 't4'),
            title: String(merged.componentProgression.legendary?.title || 'Легендарные компоненты')
        };
    }

    if (!merged.equipped || typeof merged.equipped !== 'object') {
        merged.equipped = deepClone(base.equipped);
    } else {
        merged.equipped = {
            ...base.equipped,
            ...merged.equipped
        };
    }

    merged.totalSpeed = Number(merged.totalSpeed) || 0;
    merged.totalAccel = Number(merged.totalAccel) || 0;
    merged.totalJump = Number(merged.totalJump) || 0;
    merged.totalBrake = Number(merged.totalBrake) || 0;
    merged.selectedTrack = String(merged.selectedTrack || 't1');
    merged.track1RewardClaimed = Boolean(merged.track1RewardClaimed);

    if (!merged.unlockedTracks.includes('t1')) {
        merged.unlockedTracks.unshift('t1');
    }

    if (!merged.unlockedComponentRarities.includes('common')) {
        merged.unlockedComponentRarities.unshift('common');
    }

    return merged;
}

function wrapReactiveState(value) {
    if (!value || typeof value !== 'object') {
        return value;
    }

    if (proxyCache.has(value)) {
        return proxyCache.get(value);
    }

    const proxy = new Proxy(value, {
        get(target, prop, receiver) {
            const result = Reflect.get(target, prop, receiver);
            return wrapReactiveState(result);
        },

        set(target, prop, newValue, receiver) {
            const wrappedValue = wrapReactiveState(newValue);
            const result = Reflect.set(target, prop, wrappedValue, receiver);

            if (!suppressAutoSave) {
                markAutosaveDirty();
            }

            return result;
        },

        deleteProperty(target, prop) {
            const result = Reflect.deleteProperty(target, prop);

            if (!suppressAutoSave) {
                markAutosaveDirty();
            }

            return result;
        }
    });

    proxyCache.set(value, proxy);
    return proxy;
}

function resetAutosaveTimer() {
    if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
}

function markAutosaveDirty() {
    autosaveDirty = true;
    resetAutosaveTimer();

    autosaveTimer = setTimeout(() => {
        void flushAutosave();
    }, AUTOSAVE_DELAY_MS);
}

async function flushAutosave() {
    if (autosaveInFlight || !autosaveDirty) {
        return;
    }

    autosaveInFlight = true;
    resetAutosaveTimer();

    try {
        autosaveDirty = false;
        await savePlayerState();
    } catch (error) {
        console.warn('Ошибка автосохранения:', error);
        autosaveDirty = true;
    } finally {
        autosaveInFlight = false;

        if (autosaveDirty && !suppressAutoSave) {
            resetAutosaveTimer();
            autosaveTimer = setTimeout(() => {
                void flushAutosave();
            }, AUTOSAVE_DELAY_MS);
        }
    }
}

function startAutosaveHeartbeat() {
    if (autosaveHeartbeatStarted) {
        return;
    }

    autosaveHeartbeatStarted = true;

    setInterval(() => {
        if (autosaveDirty && !suppressAutoSave) {
            void flushAutosave();
        }
    }, AUTOSAVE_INTERVAL_MS);

    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            void flushAutosave();
        }
    });

    window.addEventListener('pagehide', () => {
        void flushAutosave();
    });

    window.addEventListener('beforeunload', () => {
        try {
            if (autosaveDirty) {
                const payload = JSON.stringify(getPlayerSaveData());
                writeLocalSave(getPlayerSaveData());

                const cloud = getCloudStorage();
                if (cloud && typeof cloud.setItem === 'function') {
                    try {
                        cloud.setItem(SAVE_KEY, payload, () => {});
                    } catch {
                        // ignore
                    }
                }
            } else {
                writeLocalSave(getPlayerSaveData());
            }
        } catch {
            // ignore
        }
    });
}

export let player = wrapReactiveState(createDefaultPlayer());

// =====================================
// ДАННЫЕ ДЛЯ СОХРАНЕНИЯ
// =====================================

export function getPlayerSaveData() {
    return {
        coins: player.coins,
        coupons: player.coupons,
        inventory: player.inventory,
        unlockedTracks: player.unlockedTracks,
        selectedTrack: player.selectedTrack,
        completedTracks: player.completedTracks,
        trackRewardsClaimed: player.trackRewardsClaimed,
        track4BonusClaimed: player.track4BonusClaimed,
        track1RewardClaimed: player.track1RewardClaimed,
        unlockedComponentRarities: player.unlockedComponentRarities,
        componentProgression: player.componentProgression,
        totalWins: player.totalWins,
        equipped: player.equipped,
        totalSpeed: player.totalSpeed,
        totalAccel: player.totalAccel,
        totalJump: player.totalJump,
        totalBrake: player.totalBrake
    };
}

// =====================================
// СОХРАНЕНИЕ / ЗАГРУЗКА
// =====================================

export async function savePlayerState() {
    const data = getPlayerSaveData();
    const payload = JSON.stringify(data);

    const localSaved = writeLocalSave(data);
    const [cloudSaved, dbSaved] = await Promise.all([
        cloudStorageSet(SAVE_KEY, payload),
        saveToSupabase(data)
    ]);

    return localSaved || cloudSaved || dbSaved;
}

export async function forceSavePlayerState() {
    autosaveDirty = false;
    resetAutosaveTimer();
    return savePlayerState();
}

export async function loadPlayerState() {
    let raw = null;
    let loadedLegacySave = false;

    try {
        raw = await loadFromSupabase();
    } catch {
        raw = null;
    }

    if (!raw) {
        raw = await loadLegacyUsernameSave();
        loadedLegacySave = Boolean(raw);
    }

    if (!raw) {
        try {
            const cloudValue = await cloudStorageGet(SAVE_KEY);
            if (cloudValue) {
                raw = JSON.parse(cloudValue);
            }
        } catch {
            raw = null;
        }
    }

    if (!raw) {
        raw = readLocalSave();
    }

    const merged = sanitizeLoadedState(raw);

    suppressAutoSave = true;
    try {
        player = wrapReactiveState(merged);
    } finally {
        suppressAutoSave = false;
    }

    autosaveDirty = false;
    resetAutosaveTimer();

    startAutosaveHeartbeat();

    if (loadedLegacySave) {
        // Переносим найденную старую запись под стабильный ключ tg_<id>.
        await savePlayerState();
    }

    return player;
}

// =====================================
// СБРОС
// =====================================

export function resetPlayerState() {
    suppressAutoSave = true;

    try {
        player = wrapReactiveState(createDefaultPlayer());
    } finally {
        suppressAutoSave = false;
    }

    autosaveDirty = true;
    resetAutosaveTimer();

    return player;
}

export async function clearSavedProgress() {
    suppressAutoSave = true;

    try {
        player = wrapReactiveState(createDefaultPlayer());
        autosaveDirty = false;
        resetAutosaveTimer();

        await cloudStorageDelete(SAVE_KEY);

        if (supabaseClient) {
            const identifier = getPlayerKey(); // Используем наш надежный идентификатор
            await supabaseClient
                .from('player_saves')
                .delete()
                .eq('player_identifier', identifier); // Удаляем по правильной колонке
        }

        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {
            // ignore
        }
    } finally {
        suppressAutoSave = false;
    }

    return true;
}

// =====================================
// TELEGRAM
// =====================================

export function isTelegramApp() {
    return Boolean(getTelegramWebApp());
}

export function initTelegramApp() {
    const tg = getTelegramWebApp();

    if (!tg) return false;

    try {
        tg.ready();
        tg.expand();
    } catch {
        // ignore
    }

    return true;
}

// Стартуем heartbeat сразу
startAutosaveHeartbeat();
