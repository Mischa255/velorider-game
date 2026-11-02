// ============================================
// VELORIDER — PLAYER STATE
// Telegram CloudStorage + LocalStorage
// ============================================

const SAVE_KEY = 'velorider_progress_v1';
const SAVE_VERSION = 1;
const MAX_CLOUD_VALUE_LENGTH = 4096;

// Очередь сохранений.
let saveQueue = Promise.resolve();

// Защита от сохранения во время сброса.
let isClearing = false;

// Версия текущего состояния сохранения.
let saveRevision = 0;


// ============================================
// СОЗДАНИЕ НОВОГО ИГРОКА
// ============================================

function createDefaultPlayer() {
    return {
        // ЭКОНОМИКА

        coins: 1000,
        coupons: 0,

        // ИНВЕНТАРЬ

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

        // ТРАССЫ

        unlockedTracks: ['t1'],
        selectedTrack: 't1',

        completedTracks: [],
        trackRewardsClaimed: [],

        track1RewardClaimed: false,

        // РЕДКОСТИ КОМПОНЕНТОВ

        unlockedComponentRarities: [
            'common'
        ],

        componentProgression: {
            rare: {
                unlocked: false,
                requiredTrack: 't1',
                title: 'Редкие компоненты'
            },

            legendary: {
                unlocked: false,
                requiredTrack: 't4',
                title: 'Легендарные компоненты'
            }
        },

        // ПОБЕДЫ

        totalWins: 0,

        // УСТАНОВЛЕННЫЕ ДЕТАЛИ

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

        // ХАРАКТЕРИСТИКИ

        totalSpeed: 0,
        totalAccel: 0,
        totalJump: 0,
        totalBrake: 0
    };
}


// ============================================
// ИГРОК
// ============================================

export let player = createDefaultPlayer();


// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getTelegramWebApp() {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.Telegram?.WebApp || null;
}

function getCloudStorage() {
    return getTelegramWebApp()?.CloudStorage || null;
}

function parseJSON(value) {
    try {
        if (typeof value !== 'string') return null;

        return JSON.parse(value);
    } catch {
        return null;
    }
}


// ============================================
// TELEGRAM CLOUD STORAGE
// ============================================

// Чтение сохранения.

function cloudStorageGet(key) {
    const cloud = getCloudStorage();

    if (
        !cloud ||
        typeof cloud.getItem !== 'function'
    ) {
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        try {
            cloud.getItem(key, (error, value) => {
                if (error) {
                    console.warn(
                        'Telegram CloudStorage: ошибка чтения',
                        error
                    );

                    resolve(null);
                    return;
                }

                resolve(value ?? null);
            });

        } catch (error) {
            console.warn(error);
            resolve(null);
        }
    });
}


// Запись сохранения.

function cloudStorageSet(key, value) {
    const cloud = getCloudStorage();

    if (
        !cloud ||
        typeof cloud.setItem !== 'function'
    ) {
        return Promise.resolve(false);
    }

    if (value.length > MAX_CLOUD_VALUE_LENGTH) {
        console.warn(
            'Сохранение превышает лимит Telegram CloudStorage.'
        );

        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        try {
            cloud.setItem(key, value, (error, stored) => {
                if (error) {
                    console.warn(
                        'Telegram CloudStorage: ошибка записи',
                        error
                    );

                    resolve(false);
                    return;
                }

                resolve(stored === true);
            });

        } catch (error) {
            console.warn(error);
            resolve(false);
        }
    });
}


// Удаление сохранения.

function cloudStorageDelete(key) {
    const cloud = getCloudStorage();

    if (
        !cloud ||
        typeof cloud.removeItem !== 'function'
    ) {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        try {
            cloud.removeItem(key, (error, removed) => {
                if (error) {
                    console.warn(
                        'Telegram CloudStorage: ошибка удаления',
                        error
                    );

                    resolve(false);
                    return;
                }

                resolve(removed === true);
            });

        } catch (error) {
            console.warn(error);
            resolve(false);
        }
    });
}


// ============================================
// ЛОКАЛЬНОЕ СОХРАНЕНИЕ
// ============================================

function readLocalSave() {
    try {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        const raw = localStorage.getItem(SAVE_KEY);

        return parseJSON(raw);

    } catch (error) {
        console.warn(
            'Ошибка чтения локального сохранения:',
            error
        );

        return null;
    }
}


function writeLocalSave(data) {
    try {
        if (typeof localStorage === 'undefined') {
            return false;
        }

        localStorage.setItem(
            SAVE_KEY,
            JSON.stringify(data)
        );

        return true;

    } catch (error) {
        console.warn(
            'Ошибка локального сохранения:',
            error
        );

        return false;
    }
}


function removeLocalSave() {
    try {
        if (typeof localStorage === 'undefined') {
            return false;
        }

        localStorage.removeItem(SAVE_KEY);

        return true;

    } catch (error) {
        console.warn(error);
        return false;
    }
}


// ============================================
// ПОДГОТОВКА ДАННЫХ ИГРОКА
// ============================================

export function getPlayerSaveData() {
    return {
        coins: player.coins,
        coupons: player.coupons,

        inventory: player.inventory,

        unlockedTracks: player.unlockedTracks,
        selectedTrack: player.selectedTrack,

        completedTracks: player.completedTracks,
        trackRewardsClaimed: player.trackRewardsClaimed,

        track1RewardClaimed: player.track1RewardClaimed,

        unlockedComponentRarities:
            player.unlockedComponentRarities,

        componentProgression:
            player.componentProgression,

        totalWins: player.totalWins,

        equipped: player.equipped,

        totalSpeed: player.totalSpeed,
        totalAccel: player.totalAccel,
        totalJump: player.totalJump,
        totalBrake: player.totalBrake
    };
}


// ============================================
// ПРОВЕРКА СОХРАНЕНИЯ
// ============================================

function getSaveTimestamp(data) {
    return Number(data?.savedAt) || 0;
}

function getSavePlayerData(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    // Новый формат сохранения.
    if (
        data.player &&
        typeof data.player === 'object'
    ) {
        return data.player;
    }

    // Поддержка старого формата.
    return data;
}


// ============================================
// ПРОВЕРКА И ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ
// ============================================

function sanitizeLoadedState(raw) {
    const base = createDefaultPlayer();

    if (!raw || typeof raw !== 'object') {
        return base;
    }

    const merged = {
        ...base,
        ...raw
    };

    // ЭКОНОМИКА

    merged.coins = Math.max(
        0,
        Number(merged.coins) || 0
    );

    merged.coupons = Math.max(
        0,
        Number(merged.coupons) || 0
    );

    merged.totalWins = Math.max(
        0,
        Number(merged.totalWins) || 0
    );

    // ИНВЕНТАРЬ

    if (!Array.isArray(merged.inventory)) {
        merged.inventory = deepClone(base.inventory);
    }

    // ТРАССЫ

    if (!Array.isArray(merged.unlockedTracks)) {
        merged.unlockedTracks = ['t1'];
    }

    if (!Array.isArray(merged.completedTracks)) {
        merged.completedTracks = [];
    }

    if (!Array.isArray(merged.trackRewardsClaimed)) {
        merged.trackRewardsClaimed = [];
    }

    merged.unlockedTracks = [
        ...new Set(merged.unlockedTracks.filter(
            item => typeof item === 'string'
        ))
    ];

    merged.completedTracks = [
        ...new Set(merged.completedTracks.filter(
            item => typeof item === 'string'
        ))
    ];

    merged.trackRewardsClaimed = [
        ...new Set(merged.trackRewardsClaimed.filter(
            item => typeof item === 'string'
        ))
    ];

    if (!merged.unlockedTracks.includes('t1')) {
        merged.unlockedTracks.unshift('t1');
    }

    if (
        typeof merged.selectedTrack !== 'string' ||
        !merged.unlockedTracks.includes(merged.selectedTrack)
    ) {
        merged.selectedTrack = 't1';
    }

    merged.track1RewardClaimed =
        Boolean(merged.track1RewardClaimed);

    // РЕДКОСТИ

    if (!Array.isArray(merged.unlockedComponentRarities)) {
        merged.unlockedComponentRarities = ['common'];
    }

    merged.unlockedComponentRarities = [
        ...new Set(merged.unlockedComponentRarities.filter(
            item => typeof item === 'string'
        ))
    ];

    if (
        !merged.unlockedComponentRarities.includes('common')
    ) {
        merged.unlockedComponentRarities.unshift('common');
    }

    // ПРОГРЕССИЯ КОМПОНЕНТОВ

    if (
        !merged.componentProgression ||
        typeof merged.componentProgression !== 'object'
    ) {
        merged.componentProgression =
            deepClone(base.componentProgression);

    } else {
        merged.componentProgression = {
            ...deepClone(base.componentProgression),
            ...merged.componentProgression
        };

        merged.componentProgression.rare = {
            ...base.componentProgression.rare,
            ...merged.componentProgression.rare
        };

        merged.componentProgression.legendary = {
            ...base.componentProgression.legendary,
            ...merged.componentProgression.legendary
        };
    }

    // УСТАНОВЛЕННЫЕ ДЕТАЛИ

    if (
        !merged.equipped ||
        typeof merged.equipped !== 'object' ||
        Array.isArray(merged.equipped)
    ) {
        merged.equipped = deepClone(base.equipped);

    } else {
        merged.equipped = {
            ...base.equipped,
            ...merged.equipped
        };
    }

    // ХАРАКТЕРИСТИКИ

    merged.totalSpeed = Number(merged.totalSpeed) || 0;
    merged.totalAccel = Number(merged.totalAccel) || 0;
    merged.totalJump = Number(merged.totalJump) || 0;
    merged.totalBrake = Number(merged.totalBrake) || 0;

    return merged;
}


// ============================================
// СОХРАНЕНИЕ ПРОГРЕССА
// ============================================

export async function savePlayerState() {
    if (isClearing) {
        return false;
    }

    const currentRevision = saveRevision;

    // Создаём отдельную копию данных на момент вызова.
    const snapshot = deepClone(getPlayerSaveData());

    const saveEnvelope = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        player: snapshot
    };

    const payload = JSON.stringify(saveEnvelope);

    const operation = saveQueue.then(async () => {
        // Проверяем, не был ли прогресс уже сброшен.
        if (
            isClearing ||
            currentRevision !== saveRevision
        ) {
            return false;
        }

        // Сначала локальная копия.
        const localSaved = writeLocalSave(saveEnvelope);

        // Затем облачная копия Telegram.
        const cloudSaved = await cloudStorageSet(
            SAVE_KEY,
            payload
        );

        return localSaved || cloudSaved;
    });

    // Ошибка одного сохранения не ломает очередь остальных.
    saveQueue = operation.catch(error => {
        console.error('Ошибка очереди сохранений:', error);
    });

    return operation;
}


// ============================================
// ЗАГРУЗКА ПРОГРЕССА
// ============================================

export async function loadPlayerState() {
    let cloudData = null;

    let localData = null;

    // Читаем облачное сохранение.
    try {
        const cloudValue = await cloudStorageGet(SAVE_KEY);

        if (cloudValue) {
            cloudData = parseJSON(cloudValue);
        }

    } catch (error) {
        console.warn(
            'Не удалось загрузить облачное сохранение:',
            error
        );
    }

    // Читаем локальное сохранение.
    localData = readLocalSave();

    // Выбираем наиболее свежее сохранение.
    let selectedData = null;

    const cloudTime = getSaveTimestamp(cloudData);
    const localTime = getSaveTimestamp(localData);

    if (
        cloudData &&
        localData &&
        getSavePlayerData(cloudData) &&
        getSavePlayerData(localData)
    ) {
        selectedData = cloudTime >= localTime
            ? cloudData
            : localData;

    } else if (
        cloudData &&
        getSavePlayerData(cloudData)
    ) {
        selectedData = cloudData;

    } else if (
        localData &&
        getSavePlayerData(localData)
    ) {
        selectedData = localData;
    }

    const playerData = getSavePlayerData(selectedData);

    const restoredState = sanitizeLoadedState(playerData);

    // Обновляем существующий объект player,
    // чтобы остальные модули сохранили ссылку на него.
    Object.keys(player).forEach(key => {
        delete player[key];
    });

    Object.assign(player, restoredState);

    return player;
}


// ============================================
// СБРОС СОСТОЯНИЯ ИГРОКА
// ============================================

export function resetPlayerState() {
    const freshPlayer = createDefaultPlayer();

    Object.keys(player).forEach(key => {
        delete player[key];
    });

    Object.assign(player, freshPlayer);

    return player;
}


// ============================================
// ПОЛНЫЙ СБРОС СОХРАНЕНИЙ
// ============================================

export async function clearSavedProgress() {
    if (isClearing) {
        return false;
    }

    isClearing = true;

    // Инвалидируем все ранее созданные запросы сохранения.
    saveRevision++;

    try {
        // Ждём окончания уже выполняющегося сохранения.
        await saveQueue;

        // Возвращаем начальный велосипед и прогресс.
        resetPlayerState();

        // Удаляем облачное сохранение.
        const cloudDeleted = await cloudStorageDelete(SAVE_KEY);

        // Удаляем локальное сохранение.
        const localDeleted = removeLocalSave();

        return cloudDeleted || localDeleted;

    } catch (error) {
        console.error('Ошибка сброса прогресса:', error);
        return false;

    } finally {
        isClearing = false;
    }
}


// ============================================
// ПРОВЕРКА TELEGRAM
// ============================================

export function isTelegramApp() {
    return Boolean(getTelegramWebApp());
}


// ============================================
// ИНИЦИАЛИЗАЦИЯ TELEGRAM MINI APP
// ============================================

export function initTelegramApp() {
    const tg = getTelegramWebApp();

    if (!tg) {
        console.log('VeloRider запущен в обычном браузере.');
        return false;
    }

    try {
        tg.ready();
        tg.expand();

        console.log('VeloRider запущен внутри Telegram.');

        return true;

    } catch (error) {
        console.warn(
            'Ошибка инициализации Telegram:',
            error
        );

        return false;
    }
}