const SAVE_KEY = 'velorider_progress_v1';

// Telegram WebView может закрыться без надёжного beforeunload/pagehide.
const AUTOSAVE_DELAY_MS = 350;
const AUTOSAVE_RETRY_DELAY_MS = 5000;
const AUTOSAVE_INTERVAL_MS = 10000;

// === НАСТРОЙКИ SUPABASE ===
const SUPABASE_URL = 'https://qtyokehvvcoswkhdzscz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LcslQx_fXGEeRkR96jooDQ_tnf2V7rA';

let supabaseClient = null;
let supabaseSaveQueue = Promise.resolve();
let playerSaveNeedsMigration = false;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function getPlayerKey() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    // Telegram ID не меняется при смене или удалении username.
    if (tgUser && tgUser.id) {
        return `tgid:${tgUser.id}`;
    }

    if (tgUser && tgUser.username) {
        return tgUser.username.trim().toLowerCase();
    }

    // 3. Запасной вариант для обычного браузера (вне Telegram)
    let devId = localStorage.getItem('velorider_dev_id');
    if (!devId) {
        devId = 'dev_' + Math.floor(Math.random() * 1000000);
        localStorage.setItem('velorider_dev_id', devId);
    }
    return devId;
}

function getLegacyTelegramPlayerKeys() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!tgUser) return [];

    const legacyKeys = [];
    if (tgUser.username) legacyKeys.push(tgUser.username.trim().toLowerCase());
    if (tgUser.id) legacyKeys.push(`tg_${tgUser.id}`);
    return [...new Set(legacyKeys)].filter(key => key && key !== getPlayerKey());
}

async function loadFromSupabase() {
    playerSaveNeedsMigration = false;
    if (!supabaseClient) return null;
    const identifier = getPlayerKey();
    const identifiersToTry = [identifier, ...getLegacyTelegramPlayerKeys()];

    try {
        for (const candidate of identifiersToTry) {
            const { data, error } = await supabaseClient
                .from('player_saves')
                .select('save_data')
                .eq('player_identifier', candidate)
                .maybeSingle();
            if (error) throw error;
            if (!data) continue;

            playerSaveNeedsMigration = candidate !== identifier;
            return data.save_data;
        }
        return null;
    } catch (e) {
        console.warn('Ошибка загрузки из Supabase:', e);
        return null;
    }
}

export async function getServerTime() {
    if (!supabaseClient) {
        throw new Error('Supabase не подключён.');
    }

    const { data, error } = await supabaseClient.rpc('get_server_time');
    if (error) throw error;

    const serverDate = new Date(data);
    if (!data || Number.isNaN(serverDate.getTime())) {
        throw new Error('Supabase вернул некорректное время.');
    }

    return serverDate;
}

async function saveToSupabase(playerData) {
    if (!supabaseClient) {
        console.error('Supabase не подключён.');
        return false;
    }

    const identifier = getPlayerKey();

    try {
        const { error } = await supabaseClient
            .from('player_saves')
            .upsert(
                {
                    player_identifier: identifier,
                    save_data: playerData,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'player_identifier' }
            );

        if (error) {
            console.error('Ошибка записи Supabase:', error.message);
            return false;
        }

        return true;
    } catch (e) {
        console.error('Сбой Supabase:', e.message);
        return false;
    }
}

function enqueueSupabaseSave(playerData) {
    const snapshot = JSON.parse(JSON.stringify(playerData));
    const operation = supabaseSaveQueue
        .catch(() => undefined)
        .then(() => saveToSupabase(snapshot));
    supabaseSaveQueue = operation.then(() => undefined, () => undefined);
    return operation;
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
            'suspension:s1', // Бесплатный стартовый пружинный амортизатор для DH.
            'chains:ch1',
            'drivetrain:d1',
            'bottomBrackets:bb1',
            'cranks:cr1',
            'wheels:w1',
            'brakes:b1',
            'electronics:e1',
            'riders:r1'
        ],

        // =====================================
        // ПРОГРЕССИЯ ТРАСС
        // =====================================
        unlockedTracks: ['t1'],
        selectedTrack: 't1',
        completedTracks: [],
        trackRewardsClaimed: [],
        historyUnlockedStages: ['h1'],
        historyCompletedStages: [],
        track4BonusClaimed: false,
        track1RewardClaimed: false,

        // =====================================
        // ПРОГРЕССИЯ КОМПОНЕНТОВ
        // =====================================
        unlockedComponentRarities: ['common'],

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

        totalWins: 0,
        bestSprintTime: 0, // <--- ДОБАВЛЕН РЕКОРД СПРИНТА
        lastSprintCouponWindow: '',

        // =====================================
        // УСТАНОВЛЕННЫЕ ДЕТАЛИ
        // =====================================
        equipped: {
            frames: 'f1',
            forks: 'fk1',
            suspension: '', // На хардтейле задний амортизатор не устанавливается.
            chains: 'ch1',
            drivetrain: 'd1',
            bottomBrackets: 'bb1',
            cranks: 'cr1',
            wheels: 'w1',
            brakes: 'b1',
            electronics: 'e1',
            riders: 'r1'
        },

        // =====================================
        // ХАРАКТЕРИСТИКИ ВЕЛОСИПЕДА
        // =====================================
        totalSpeed: 0,
        totalAccel: 0,
        totalJump: 0,
        totalBrake: 0,
        totalPower: 0,
        totalStability: 0
    };
}

let suppressAutoSave = false;
let autosaveTimer = null;
let autosaveInFlight = false;
let autosaveDirty = false;
let autosaveHeartbeatStarted = false;
let autosaveBatchDepth = 0;

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
            cloud.setItem(key, value, error => resolve(!error));
        } catch {
            resolve(false);
        }
    });
}

function withTimeout(promise, timeoutMs = 1500) {
    let timeoutId;
    return Promise.race([
        Promise.resolve(promise).catch(() => false),
        new Promise(resolve => {
            timeoutId = setTimeout(() => resolve(false), timeoutMs);
        })
    ]).finally(() => clearTimeout(timeoutId));
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
    merged.bestSprintTime = Number(merged.bestSprintTime) || 0; // <--- ОБРАБОТКА РЕКОРДА ПРИ ЗАГРУЗКЕ
    merged.lastSprintCouponWindow =
        typeof merged.lastSprintCouponWindow === 'string' &&
        /^\d{4}-\d{2}-\d{2}T(?:00|06|12|18)Z$/.test(merged.lastSprintCouponWindow)
            ? merged.lastSprintCouponWindow
            : '';

    if (!Array.isArray(merged.inventory)) merged.inventory = deepClone(base.inventory);
    if (!merged.inventory.includes('suspension:s1')) merged.inventory.push('suspension:s1');
    if (!Array.isArray(merged.unlockedTracks)) merged.unlockedTracks = deepClone(base.unlockedTracks);
    if (!Array.isArray(merged.completedTracks)) merged.completedTracks = [];
    if (!Array.isArray(merged.trackRewardsClaimed)) merged.trackRewardsClaimed = [];
    if (!Array.isArray(merged.historyUnlockedStages)) merged.historyUnlockedStages = ['h1'];
    if (!Array.isArray(merged.historyCompletedStages)) merged.historyCompletedStages = [];
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
    merged.totalPower = Number(merged.totalPower) || 0;
    merged.totalStability = Number(merged.totalStability) || 0;
    if (!merged.equipped.riders) merged.equipped.riders = 'r1';
    if (!merged.inventory.includes('riders:r1')) merged.inventory.push('riders:r1');
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
            const oldValue = Reflect.get(target, prop, receiver);
            const wrappedValue = wrapReactiveState(newValue);
            const result = Reflect.set(target, prop, wrappedValue, receiver);
            if (!suppressAutoSave && !Object.is(oldValue, wrappedValue)) {
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
    if (autosaveBatchDepth > 0) return;
    resetAutosaveTimer();

    autosaveTimer = setTimeout(() => {
        void flushAutosave();
    }, AUTOSAVE_DELAY_MS);
}

async function flushAutosave() {
    if (autosaveBatchDepth > 0) {
        if (autosaveDirty) writeLocalSave(getPlayerSaveData());
        return;
    }

    if (autosaveInFlight || !autosaveDirty) {
        return;
    }

    autosaveInFlight = true;
    resetAutosaveTimer();
    let nextDelay = AUTOSAVE_DELAY_MS;

    try {
        autosaveDirty = false;
        const result = await savePlayerState();
        if (!result.dbSaved) {
            autosaveDirty = true;
            nextDelay = AUTOSAVE_RETRY_DELAY_MS;
        }
    } catch (error) {
        autosaveDirty = true;
        nextDelay = AUTOSAVE_RETRY_DELAY_MS;
    } finally {
        autosaveInFlight = false;

        if (autosaveDirty && !suppressAutoSave && autosaveBatchDepth === 0) {
            resetAutosaveTimer();
            autosaveTimer = setTimeout(() => {
                void flushAutosave();
            }, nextDelay);
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
            const saveData = getPlayerSaveData();
            if (autosaveDirty) {
                const payload = JSON.stringify(saveData);
                writeLocalSave(saveData);

                const cloud = getCloudStorage();
                if (cloud && typeof cloud.setItem === 'function') {
                    try {
                        cloud.setItem(SAVE_KEY, payload, () => {});
                    } catch {}
                }
            } else {
                writeLocalSave(saveData);
            }
        } catch {}
    });
}

export let player = wrapReactiveState(createDefaultPlayer());

// During a race, defer cloud serialization until the end rather than saving
// the complete player state for every collected coin.
export function beginAutosaveBatch() {
    if (autosaveBatchDepth === 0 && autosaveDirty) {
        void flushAutosave();
    }
    autosaveBatchDepth++;
    resetAutosaveTimer();
}

export function endAutosaveBatch() {
    if (autosaveBatchDepth === 0) return;
    autosaveBatchDepth--;
    if (autosaveBatchDepth === 0 && autosaveDirty && !suppressAutoSave) {
        resetAutosaveTimer();
        autosaveTimer = setTimeout(() => {
            void flushAutosave();
        }, AUTOSAVE_DELAY_MS);
    }
}

// =====================================
// ДАННЫЕ ДЛЯ СОХРАНЕНИЯ
// =====================================

function toPlayerSaveData(source) {
    return {
        coins: source.coins,
        coupons: source.coupons,
        inventory: source.inventory,
        unlockedTracks: source.unlockedTracks,
        selectedTrack: source.selectedTrack,
        completedTracks: source.completedTracks,
        trackRewardsClaimed: source.trackRewardsClaimed,
        historyUnlockedStages: source.historyUnlockedStages,
        historyCompletedStages: source.historyCompletedStages,
        track4BonusClaimed: source.track4BonusClaimed,
        track1RewardClaimed: source.track1RewardClaimed,
        unlockedComponentRarities: source.unlockedComponentRarities,
        componentProgression: source.componentProgression,
        totalWins: source.totalWins,
        bestSprintTime: source.bestSprintTime, // <--- УПАКОВКА РЕКОРДА ДЛЯ ОТПРАВКИ
        lastSprintCouponWindow: source.lastSprintCouponWindow,
        equipped: source.equipped,
        totalSpeed: source.totalSpeed,
        totalAccel: source.totalAccel,
        totalJump: source.totalJump,
        totalBrake: source.totalBrake,
        totalPower: source.totalPower,
        totalStability: source.totalStability
    };
}

export function getPlayerSaveData() {
    return toPlayerSaveData(player);
}

// =====================================
// СОХРАНЕНИЕ / ЗАГРУЗКА
// =====================================

export async function savePlayerState() {
    const data = getPlayerSaveData();
    const payload = JSON.stringify(data);

    const localSaved = writeLocalSave(data);
    const cloudSavedPromise = withTimeout(cloudStorageSet(SAVE_KEY, payload));
    const [cloudSaved, dbSaved] = await Promise.all([
        cloudSavedPromise,
        enqueueSupabaseSave(JSON.parse(payload))
    ]);
    if (!dbSaved) autosaveDirty = true;

    return { localSaved, cloudSaved, dbSaved };
}

export async function forceSavePlayerState() {
    autosaveDirty = false;
    resetAutosaveTimer();
    const result = await savePlayerState();
    if (!result.dbSaved) {
        autosaveDirty = true;
        resetAutosaveTimer();
        autosaveTimer = setTimeout(() => {
            void flushAutosave();
        }, AUTOSAVE_RETRY_DELAY_MS);
    }
    return result;
}

export async function loadPlayerState() {
    let raw = null;
    let isNewPlayer = false;

    try {
        raw = await loadFromSupabase();
    } catch {}

    if (!raw) {
        try {
            const cloudValue = await cloudStorageGet(SAVE_KEY);
            if (cloudValue) raw = JSON.parse(cloudValue);
        } catch {}
    }

    if (!raw) {
        raw = readLocalSave();
    }

    if (!raw) {
        isNewPlayer = true;
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

    // Принудительное создание пустого профиля для новых игроков
    if (isNewPlayer || playerSaveNeedsMigration) {
        setTimeout(() => {
            void forceSavePlayerState();
        }, 1000);
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
    const defaults = createDefaultPlayer();
    const defaultSave = toPlayerSaveData(defaults);
    suppressAutoSave = true;
    resetAutosaveTimer();
    autosaveDirty = false;
    try {
        const dbSaved = await enqueueSupabaseSave(defaultSave);
        if (!dbSaved) {
            throw new Error('Supabase не подтвердил сброс прогресса.');
        }

        player = wrapReactiveState(defaults);
        writeLocalSave(defaultSave);
        await withTimeout(cloudStorageSet(SAVE_KEY, JSON.stringify(defaultSave)));
        autosaveDirty = false;
        resetAutosaveTimer();
    } catch (error) {
        autosaveDirty = true;
        resetAutosaveTimer();
        autosaveTimer = setTimeout(() => {
            void flushAutosave();
        }, AUTOSAVE_RETRY_DELAY_MS);
        throw error;
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
    } catch {}

    return true;
}

startAutosaveHeartbeat();
