import { beginAutosaveBatch, endAutosaveBatch, player } from './state.js';
import { TRACKS_DB, HISTORY_TRACKS_DB, OBSTACLE_TYPES, ITEMS_DB } from './db.js';
import { clamp, randomItem, MIN_SPRINT_RECORD_IMPROVEMENT_MS, getRarityAccent } from './utils.js';
import { playCoinSound, playBoostSound } from './audio.js';
import {
    createBotBrain,
    getBotAbilities,
    getBotAirLeanInput,
    getBotDifficultyStats,
    getTimedObstaclePulse,
    isTimedObstacleActive,
    shouldBotHoldRampForGap,
    updateBotAbilities,
    updateBotDrivingDecision
} from './bot-ai.js';

// =========================================
// VELOCITY RACE ENGINE
// Игрок и боты едут по одной общей трассе
// и встречают одни и те же препятствия.
// =========================================

const GRAVITY = 0.42;
const SPEED_ACCEL_STAT_FACTOR = 0.84; // +5% к прежнему влиянию: 0.8 × 1.05.
const JUMP_STAT_FACTOR = 0.715; // На 10% выше прежнего влияния очков прыжка (0.65 × 1.1).
const PLAYER_STABILITY_EFFECT_FACTOR = 1.05;
const SIMULATION_STEP_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 100;
const SPRINT_GHOST_ACCELERATION_SECONDS = 1.2;
const BIKE_WIDTH = 46;
const BIKE_HEIGHT = 24;
const TRACK_DISTANCE_SCALE = 0.5;
const TRACK_MULTIPLIER = 3;
const GAME_WORLD_UNITS_PER_METER = 45;
const OBSTACLE_MULTIPLIER = 3 * TRACK_DISTANCE_SCALE;
const OBSTACLE_LEVEL_STEP = 0.07 * TRACK_DISTANCE_SCALE;
const MACMILLAN_PEDAL_CADENCE = 0.22;
const RACE_ZOOM_DESKTOP = 0.86;
const RACE_ZOOM_MOBILE_PORTRAIT = 0.60;
const RACE_ZOOM_MOBILE_LANDSCAPE = 0.56;
const ROAD_DASH_PATTERN = Object.freeze([16, 12]);
const PLAYER_LANE_OFFSET = 0;
const BOT_LANE_OFFSET = 0;
const REPEATING_GROUND_HAZARDS = new Set([
    'mud', 'water_splash', 'ice_patch', 'wind_fan', 'forge_slag', 'ford_stones',
    'cobblestones', 'plank_bridge', 'metal_grate', 'smith_hammer', 'mill_paddle', 'crank_rack'
]);
const GROUND_HAZARD_REHIT_FRAMES = 30;

function getCameraZoom() {
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (coarsePointer && w > h && h <= 820) return RACE_ZOOM_MOBILE_LANDSCAPE;
    if (coarsePointer && h >= w && w <= 520) return RACE_ZOOM_MOBILE_PORTRAIT;
    if (w <= 520) return RACE_ZOOM_MOBILE_PORTRAIT;
    if (w <= 920 && h <= 540) return RACE_ZOOM_MOBILE_LANDSCAPE;
    if (w <= 768) return 0.68;
    return RACE_ZOOM_DESKTOP;
}

// Плавное насыщение оставляет бонусы полезными за верхним ориентиром,
// но не позволяет нормализованным физическим коэффициентам выйти за 1.
function getSoftStatRatio(value, reference) {
    const points = Math.max(0, Number(value) || 0);
    const scale = Math.max(1, Number(reference) || 1);
    return 1 - Math.exp(-3 * Math.pow(points / scale, 1.58));
}

function getStabilityRatio(value, effectFactor = 1) {
    const points = Math.max(0, Number(value) || 0);
    return 1 - Math.exp(
        -3 * effectFactor * Math.pow(points / 100, 1.58)
    );
}

function getBikeStabilityRatio(bike) {
    return getStabilityRatio(
        bike?.stability,
        bike && !bike.isBot ? PLAYER_STABILITY_EFFECT_FACTOR : 1
    );
}

function getBrakeQualityRatio(value) {
    return getSoftStatRatio(value, 15);
}

function easeOutCubic(progress) {
    const t = clamp(Number(progress) || 0, 0, 1);
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(progress) {
    const t = clamp(Number(progress) || 0, 0, 1);
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const TRACK_BALANCE = {
    t1:  { speed: 0.70, accel: 0.65, jumpForce: 10.5, power: 10 },
    // Базовые значения соперников растут вместе с трассами, а эти множители
    // распределяют ускорение между этапами без резкого скачка на t3.
    t2:  { speed: 0.60, accel: 0.675, jumpForce: 10.5, power: 15 },
    t3:  { speed: 0.48, accel: 0.592, jumpForce: 10.7, power: 21 },
    t4:  { speed: 0.43, accel: 0.517, jumpForce: 10.7, power: 27 },
    t5:  { speed: 0.431, accel: 0.610, jumpForce: 10.8, power: 32 },
    t6:  { speed: 0.417, accel: 0.687, jumpForce: 11.0, power: 39 },
    t7:  { speed: 0.40, accel: 0.75, jumpForce: 11.0, power: 46 },
    t8:  { speed: 0.386, accel: 0.80, jumpForce: 11.2, power: 53 },
    t9:  { speed: 0.368, accel: 0.844, jumpForce: 11.3, power: 60 },
    t10: { speed: 0.35, accel: 0.833, jumpForce: 11.5, power: 68 }
};

// =========================================
// РЕЛЬЕФ ТРАСС
// =========================================

const TRACK_TERRAIN = {
    h1:  { amplitude: 6, longFrequency: 0.0032, shortFrequency: 0.0075, micro: 0.8, phase: 0.1, ridge: 0.03, chop: 0.015 },
    h2:  { amplitude: 8, longFrequency: 0.0035, shortFrequency: 0.008, micro: 1, phase: 0.4, ridge: 0.04, chop: 0.02 },
    h3:  { amplitude: 10, longFrequency: 0.0038, shortFrequency: 0.009, micro: 1.2, phase: 0.8, ridge: 0.05, chop: 0.025 },
    h4:  { amplitude: 12, longFrequency: 0.004, shortFrequency: 0.0095, micro: 1.4, phase: 1.1, ridge: 0.06, chop: 0.03 },
    h5:  { amplitude: 15, longFrequency: 0.0042, shortFrequency: 0.01, micro: 1.5, phase: 1.4, ridge: 0.07, chop: 0.035 },
    m1:  { amplitude: 10, longFrequency: 0.0034, shortFrequency: 0.008, micro: 1.1, phase: 0.25, ridge: 0.045, chop: 0.02 },
    m2:  { amplitude: 17, longFrequency: 0.0038, shortFrequency: 0.009, micro: 1.5, phase: 1.1, ridge: 0.08, chop: 0.035 },
    m3:  { amplitude: 22, longFrequency: 0.0041, shortFrequency: 0.011, micro: 2.4, phase: 2.2, ridge: 0.14, chop: 0.07 },
    m4:  { amplitude: 25, longFrequency: 0.0043, shortFrequency: 0.012, micro: 2.3, phase: 0.85, ridge: 0.18, chop: 0.08 },
    m5:  { amplitude: 31, longFrequency: 0.0045, shortFrequency: 0.013, micro: 2.8, phase: 2.75, ridge: 0.22, chop: 0.09 },
    l1:  { amplitude: 12, longFrequency: 0.0038, shortFrequency: 0.009, micro: 1.2, phase: 0.35, ridge: 0.055, chop: 0.025 },
    l2:  { amplitude: 18, longFrequency: 0.0042, shortFrequency: 0.011, micro: 1.8, phase: 1.1, ridge: 0.095, chop: 0.045 },
    l3:  { amplitude: 0, longFrequency: 0, shortFrequency: 0, micro: 0, phase: 0, ridge: 0, chop: 0 },
    l4:  { amplitude: 25, longFrequency: 0.0046, shortFrequency: 0.0125, micro: 2.4, phase: 0.7, ridge: 0.18, chop: 0.07 },
    l5:  { amplitude: 34, longFrequency: 0.005, shortFrequency: 0.014, micro: 3, phase: 1.85, ridge: 0.24, chop: 0.09 },
    l6:  { amplitude: 42, longFrequency: 0.0054, shortFrequency: 0.016, micro: 3.5, phase: 2.45, ridge: 0.32, chop: 0.11 },
    t1:  { amplitude: 8,  longFrequency: 0.0034, shortFrequency: 0.0080, micro: 1.0, phase: 0.2, ridge: 0.04, chop: 0.02 },
    t2:  { amplitude: 15, longFrequency: 0.0038, shortFrequency: 0.0095, micro: 1.5, phase: 0.5, ridge: 0.07, chop: 0.035 },
    t3:  { amplitude: 21, longFrequency: 0.0042, shortFrequency: 0.0110, micro: 2.0, phase: 0.8, ridge: 0.11, chop: 0.05 },
    t4:  { amplitude: 28, longFrequency: 0.0046, shortFrequency: 0.0125, micro: 2.5, phase: 1.1, ridge: 0.17, chop: 0.065 },
    t5:  { amplitude: 36, longFrequency: 0.0050, shortFrequency: 0.0140, micro: 3.0, phase: 1.4, ridge: 0.24, chop: 0.08 },
    t6:  { amplitude: 45, longFrequency: 0.0054, shortFrequency: 0.0160, micro: 3.5, phase: 1.7, ridge: 0.32, chop: 0.10 },
    t7:  { amplitude: 54, longFrequency: 0.0058, shortFrequency: 0.0180, micro: 4.0, phase: 2.0, ridge: 0.40, chop: 0.12 },
    t8:  { amplitude: 64, longFrequency: 0.0062, shortFrequency: 0.0200, micro: 4.5, phase: 2.3, ridge: 0.50, chop: 0.14 },
    t9:  { amplitude: 74, longFrequency: 0.0068, shortFrequency: 0.0220, micro: 5.0, phase: 2.6, ridge: 0.60, chop: 0.17 },
    t10: { amplitude: 88, longFrequency: 0.0074, shortFrequency: 0.0250, micro: 5.5, phase: 2.9, ridge: 0.74, chop: 0.20 }
};

// =========================================
// ЦВЕТОВЫЕ ТЕМЫ
// =========================================

const TRACK_PALETTES = {
    h1:  { skyTop: '#302a2b', skyMid: '#92755c', skyBottom: '#d4b483', far: '#75634d', near: '#514331', road: '#6f6252', edge: '#d2b284', accent: '#f0d6a5' },
    h2:  { skyTop: '#19313a', skyMid: '#668a79', skyBottom: '#c9c69c', far: '#657957', near: '#3d563e', road: '#575b4b', edge: '#c7c59a', accent: '#d8d5a5' },
    h3:  { skyTop: '#273643', skyMid: '#8d8870', skyBottom: '#d8c99a', far: '#796b4f', near: '#534b37', road: '#655b47', edge: '#d7bd88', accent: '#eed5a1' },
    h4:  { skyTop: '#3c3441', skyMid: '#a7756a', skyBottom: '#e1c19a', far: '#84695b', near: '#59453d', road: '#665447', edge: '#dfbf95', accent: '#f1d5aa' },
    h5:  { skyTop: '#292c3b', skyMid: '#9a7061', skyBottom: '#e0bd8c', far: '#765e53', near: '#4c4038', road: '#60534a', edge: '#d6b37e', accent: '#f1d4a1' },
    m1:  { skyTop: '#382b2a', skyMid: '#bd7951', skyBottom: '#f1c47e', far: '#86634c', near: '#594239', road: '#695243', edge: '#e2b978', accent: '#ffd38a' },
    m2:  { skyTop: '#183440', skyMid: '#4b8a88', skyBottom: '#c6d8b2', far: '#4d7770', near: '#34554e', road: '#536256', edge: '#b6d1b1', accent: '#b9eee5' },
    m3:  { skyTop: '#303b45', skyMid: '#9c9883', skyBottom: '#dfd0a9', far: '#77786a', near: '#514f45', road: '#62594b', edge: '#c5b697', accent: '#eee0b6' },
    m4:  { skyTop: '#33404a', skyMid: '#b18b72', skyBottom: '#e5c99d', far: '#736c5b', near: '#4d493f', road: '#665747', edge: '#c6a77f', accent: '#ead1a6' },
    m5:  { skyTop: '#302c3c', skyMid: '#aa6448', skyBottom: '#f0bd75', far: '#745348', near: '#4e3933', road: '#625044', edge: '#d5a76e', accent: '#ffe0a1' },
    l1:  { skyTop: '#2d3540', skyMid: '#a08b70', skyBottom: '#dcc69d', far: '#766c5b', near: '#51493d', road: '#5c554c', edge: '#c6ad7c', accent: '#e6d1a5' },
    l2:  { skyTop: '#283848', skyMid: '#8796a0', skyBottom: '#d5c39c', far: '#69767a', near: '#414c50', road: '#55565a', edge: '#c4ad7d', accent: '#e5d3a2' },
    l3:  { skyTop: '#5d93b2', skyMid: '#b9d7dc', skyBottom: '#ead6a7', far: '#9eac94', near: '#72806a', road: '#565d62', edge: '#e4d5b5', accent: '#fff0bd' },
    l4:  { skyTop: '#3e3d43', skyMid: '#af7954', skyBottom: '#e1bd85', far: '#766451', near: '#4d4439', road: '#57514a', edge: '#d6b278', accent: '#ffc981' },
    l5:  { skyTop: '#39434d', skyMid: '#9da5a0', skyBottom: '#e2d2ac', far: '#7f8c82', near: '#4e5b54', road: '#535b5e', edge: '#d4c192', accent: '#f5dfa6' },
    l6:  { skyTop: '#30313b', skyMid: '#b47d59', skyBottom: '#edc986', far: '#88745d', near: '#55483b', road: '#55504b', edge: '#d9b578', accent: '#ffe0a1' },
    t1:  { skyTop: '#102b3d', skyMid: '#397b88', skyBottom: '#b8d4bc', far: '#345b59', near: '#1d3938', road: '#475569', edge: '#a8b7bd', accent: '#bbf7d0' },
    t2:  { skyTop: '#392b43', skyMid: '#bd7952', skyBottom: '#f2c78b', far: '#8e5b4c', near: '#583b3c', road: '#51434a', edge: '#e8b98a', accent: '#fed7aa' },
    t3:  { skyTop: '#112d36', skyMid: '#39756a', skyBottom: '#b5c98d', far: '#456b50', near: '#294b39', road: '#46564b', edge: '#a3b18a', accent: '#bbf7d0' },
    t4:  { skyTop: '#1d233f', skyMid: '#5c557c', skyBottom: '#d1a58e', far: '#514c70', near: '#30314e', road: '#4b4b61', edge: '#c4b5fd', accent: '#ddd6fe' },
    t5:  { skyTop: '#092d49', skyMid: '#3b7eaa', skyBottom: '#d1e9ef', far: '#a7c8d8', near: '#567f99', road: '#526a7c', edge: '#dbeafe', accent: '#bae6fd' },
    t6:  { skyTop: '#19364c', skyMid: '#76a7ae', skyBottom: '#f3d49a', far: '#9e9a6c', near: '#59654e', road: '#555b52', edge: '#fcdba5', accent: '#fde68a' },
    t7:  { skyTop: '#242b3a', skyMid: '#67727d', skyBottom: '#c2b8a4', far: '#77766c', near: '#454943', road: '#494b48', edge: '#d6d3d1', accent: '#d6d3d1' },
    t8:  { skyTop: '#090f2b', skyMid: '#263d66', skyBottom: '#7d7394', far: '#343e68', near: '#202747', road: '#343b55', edge: '#a5b4fc', accent: '#c4b5fd' },
    t9:  { skyTop: '#1a263c', skyMid: '#6b6680', skyBottom: '#d3b2a4', far: '#666078', near: '#3d4157', road: '#4a4b5b', edge: '#d8b4fe', accent: '#e9d5ff' },
    t10: { skyTop: '#281b2c', skyMid: '#9b4b42', skyBottom: '#f0a36d', far: '#8e4944', near: '#4c3039', road: '#4b3b40', edge: '#fdba74', accent: '#fed7aa' }
};

// =========================================
// СОСТОЯНИЕ ИГРЫ
// =========================================

let canvas = null;
let ctx = null;
let viewWidth = 0;
let viewHeight = 0;
let baseRaceZoom = RACE_ZOOM_DESKTOP;
let cameraVerticalOffset = 0;
let terrainVisibility = 1;
let canvasDpr = 1;
let mobilePerformanceMode = false;
const backgroundGradientCache = new Map();
let canvasCssWidth = 800;
let canvasCssHeight = 420;
let animationId = null;
let lastFrameTime = 0;
let frameAccumulator = 0;
let resizeHandlerAttached = false;
let callbackOnRaceEnd = null;
let currentTrack = null;
let finishX = 0;
let cameraX = 0;
let obstacles = [];
let trackSurfaceSamples = [];
let frameCounter = 0;
let raceFinished = false;
let raceRunning = false;
let raceStarted = false;
let raceTimeMs = 0;
let timerStarted = false;
let raceAutosaveBatchActive = false;
let historyVictoryOutro = null;

let input = {
    accelerating: false,
    braking: false,
    reversing: false,
    jumpRequested: false
};

let playerBike = null;
let botBike = null;
let additionalBots = [];
let activeBots = [];
let collectedRaceCoins = 0;
let collectibles = [];
let floatingTexts = [];
let powerWarningCooldown = 0;

let currentTrackLevel = 1;

// =========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================

function isMobileScreen() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function getTrackBalance(trackId) {
    return TRACK_BALANCE[trackId] || {
        speed: 0.5,
        accel: 0.7,
        jumpForce: 10.5,
        power: 12
    };
}

function getTrackLevel() {
    if (currentTrack?.isHistory) return Math.max(1, Number(currentTrack.historyStage) || 1);
    const storyTracks = TRACKS_DB.filter(track => !track.alwaysUnlocked);
    const index = storyTracks.findIndex(track => track.id === currentTrack?.id);

    return Math.max(1, index + 1);
}

export function getTrackObstacleCount(track, level = 1) {
    if (!track || track.id === 'sprint' || track.id === 'l3' || Number(track.obstacles) === 0) return 0;
    const configuredCount = Math.max(1, Number(track.obstacles) || 1);
    const trackLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(
        1,
        Math.floor(configuredCount * (OBSTACLE_MULTIPLIER + (trackLevel - 1) * OBSTACLE_LEVEL_STEP))
    );
}

// =========================================
// НОВАЯ СИСТЕМА СЛОЖНОСТИ БОТОВ
// =========================================

function getBotDifficultyTrack(botIndex) {
    if (currentTrack?.isHistory) {
        return TRACKS_DB.find(track => track.id === currentTrack.botDifficultyTrackId) || currentTrack;
    }

    const storyTracks = TRACKS_DB.filter(track => !track.alwaysUnlocked);
    const currentIndex = storyTracks.findIndex(
        track => track.id === currentTrack?.id
    );

    if (currentIndex < 0) {
        return currentTrack;
    }

    if (botIndex === 1) {
        return storyTracks[currentIndex];
    }

    if (botIndex === 2) {
        // Лера получает ту же трассу сложности, что и Макс, для честной борьбы!
        return storyTracks[currentIndex];
    }

    return storyTracks[currentIndex];
}

function addFloatingText(x, y, text, color = '#facc15') {
    floatingTexts.push({
        x,
        y,
        text,
        color,
        opacity: 1.0,
        vy: -1.2,
        life: 45
    });
}

function updateFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const item = floatingTexts[i];
        item.y += item.vy;
        item.life--;
        item.opacity = Math.max(0, item.life / 45);
        if (item.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

function drawFloatingTexts() {
    if (!floatingTexts.length) return;
    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    floatingTexts.forEach(item => {
        const sx = item.x - cameraX;
        if (sx < -80 || sx > viewWidth + 80) return;
        ctx.globalAlpha = item.opacity;
        ctx.fillStyle = '#000000';
        ctx.fillText(item.text, sx + 1, item.y + 1);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, sx, item.y);
    });
    ctx.restore();
}

// =========================================
// РЕЛЬЕФ
// =========================================

function getTrackTerrain() {
    if (currentTrack?.id === 'sprint') {
        return {
            amplitude: 0,
            longFrequency: 0,
            shortFrequency: 0,
            micro: 0,
            phase: 0,
            ridge: 0,
            chop: 0
        };
    }

    const fallbackHills = Math.max(
        1,
        Number(currentTrack?.hills) || 15
    );

    return TRACK_TERRAIN[currentTrack?.id] || {
        amplitude: 10 + fallbackHills * 0.9,
        longFrequency: 0.0011,
        shortFrequency: 0.0035,
        micro: 2.5,
        phase: 0.5,
        ridge: 0.18
    };
}

function getTrackPalette() {
    return TRACK_PALETTES[currentTrack?.id] || TRACK_PALETTES.t1;
}

function getGroundY(worldX, laneOffset = 0) {
    const base = viewHeight * 0.72 + laneOffset;
    const profile = getTrackTerrain();
    const amplitude = profile.amplitude;

    const longWave =
        Math.sin(worldX * profile.longFrequency + profile.phase) *
        amplitude;

    const shortWave =
        Math.sin(worldX * profile.shortFrequency + profile.phase * 1.7) *
        (amplitude * 0.28);

    const ridgeWave =
        Math.sin(worldX * profile.longFrequency * 2.3 + profile.phase);

    const sharperRidges =
        Math.sign(ridgeWave) *
        Math.pow(Math.abs(ridgeWave), 2.2) *
        amplitude *
        profile.ridge;

    const tinyWave =
        Math.sin(worldX * 0.008 + profile.phase) *
        profile.micro;

    const trailChop =
        Math.sin(worldX * profile.shortFrequency * 1.9 + profile.phase * 2.4) *
        amplitude * (profile.chop || 0);

    return clamp(
        base + longWave + shortWave + sharperRidges + tinyWave + trailChop,
        viewHeight * 0.45,
        viewHeight * 0.88
    );
}

// =========================================
// ПРЕПЯТСТВИЯ
// =========================================

function getBikeObstacleHalfWidth(bike) {
    const visuals = bike.visuals || {};
    const draisine = Boolean(visuals.draisine);
    // Полный исторический велосипед нужен только сопернику главы II.
    // У игрока рама Макмиллана остаётся частью обычной индивидуальной сборки.
    const macmillan = Boolean(visuals.macmillan && bike.isBot);
    const highWheeler = Boolean(visuals.highWheelerFrame || visuals.highWheelerBoss);
    const renderScale = draisine || macmillan || highWheeler ? 1 : 1.16;
    const rearRadius = macmillan
        ? 19
        : draisine && bike.isBot
            ? 17
            : clamp((Number(visuals.rearWheelRadius) || Number(visuals.wheelRadius) || 9.5) * 1.24, highWheeler ? 7 : 11.5, highWheeler ? 25.5 : 19.5);
    const frontRadius = macmillan
        ? 12.5
        : draisine && bike.isBot
            ? 12.5
            : clamp((Number(visuals.frontWheelRadius) || Number(visuals.wheelRadius) || 9.5) * 1.24, highWheeler ? 7 : 11.5, highWheeler ? 25.5 : 19.5);
    const rearOffset = highWheeler ? 39 : draisine || macmillan ? 34 : 25;
    const frontOffset = highWheeler ? 25 : draisine || macmillan ? 36 : 25;

    return Math.ceil(Math.max(
        (rearOffset + rearRadius) * renderScale,
        (frontOffset + frontRadius) * renderScale,
        BIKE_WIDTH * 0.35
    ));
}

export function getTrackDistanceMeters(track) {
    if (track?.id === 'sprint' || track?.id === 'l3') return 100;
    const worldLength = Math.max(
        6000,
        ((Number(track?.length) || 15000) * TRACK_MULTIPLIER - 1500) * TRACK_DISTANCE_SCALE
    );
    return Math.round(worldLength / GAME_WORLD_UNITS_PER_METER);
}

function isTouchingObstacle(bike, obstacle) {
    const halfWidth = getBikeObstacleHalfWidth(bike);
    const bikeLeft = bike.x - halfWidth;
    const bikeRight = bike.x + halfWidth;

    return bikeRight >= obstacle.x &&
        bikeLeft <= obstacle.x + obstacle.width;
}

function ensureBotHitMap(obstacle) {
    if (obstacle.botHitBy instanceof Map) return obstacle.botHitBy;

    const previousHits = obstacle.botHitBy instanceof Set
        ? [...obstacle.botHitBy]
        : [];
    obstacle.botHitBy = new Map(previousHits.map(botIndex => [botIndex, frameCounter]));
    return obstacle.botHitBy;
}

function getGapClearanceHeight(obstacle) {
    return Math.max(22, Number(obstacle?.height) * 0.75 || 0);
}

function createObstacles() {
    if (!currentTrack || currentTrack.id === 'sprint' || currentTrack.id === 'l3') return [];

    const typePool = Array.isArray(currentTrack.obstacleTypes)
        ? currentTrack.obstacleTypes.filter(type => OBSTACLE_TYPES[type])
        : Object.keys(OBSTACLE_TYPES);
    if (!typePool.length) return [];

    const obstacleCount = getTrackObstacleCount(currentTrack, currentTrackLevel);
    // На сюжетных трассах ямы размещаются гарантированно. Глава II использует
    // плотность ям обычных трасс 2–3 уровня, остальные истории — мягкую прогрессию.
    const historyDifficultyLevel = Number(currentTrack.historyChapter) === 2
        ? (Number(currentTrack.historyStage) <= 2 ? 2 : 3)
        : Number(currentTrack.historyDifficultyLevel) || currentTrackLevel;
    const configuredPitCount = currentTrack.isHistory
        ? currentTrack.historyChapter === 2
            ? Math.round((historyDifficultyLevel * 2 + 1) * TRACK_DISTANCE_SCALE)
            : Math.round(Math.ceil(historyDifficultyLevel / 2) * TRACK_DISTANCE_SCALE)
        : Math.round((currentTrackLevel * 2 + 1) * TRACK_DISTANCE_SCALE);
    const pitCount = currentTrack.isHistory
        ? (typePool.includes('pit') ? Math.min(obstacleCount, configuredPitCount) : 0)
        : Math.min(obstacleCount, configuredPitCount);
    const pitIndices = new Set();
    for (let pitIndex = 0; pitIndex < pitCount; pitIndex++) {
        const targetIndex = Math.round(
            ((pitIndex + 1) / (pitCount + 1)) * Math.max(0, obstacleCount - 1)
        );
        let index = targetIndex;
        while (pitIndices.has(index) && index < obstacleCount - 1) index++;
        while (pitIndices.has(index) && index > 0) index--;
        pitIndices.add(index);
    }

    // Глава II использует собственный чередующийся сценарий препятствий,
    // чтобы у каждого испытания был узнаваемый ритм, а ключевые элементы
    // не зависели от случайной выборки.
    const historyPattern = Number(currentTrack.historyChapter) >= 2 && Array.isArray(currentTrack.historyObstaclePattern)
        ? currentTrack.historyObstaclePattern.filter(type => typePool.includes(type))
        : [];
    const signatureTypes = Number(currentTrack.historyChapter) >= 2 && !historyPattern.length && Array.isArray(currentTrack.signatureObstacleTypes)
        ? currentTrack.signatureObstacleTypes.filter(type => typePool.includes(type) && type !== 'pit')
        : [];
    const signatureAssignments = new Map();
    signatureTypes.forEach((type, signatureIndex) => {
        const target = Math.round(((signatureIndex + 1) / (signatureTypes.length + 1)) * Math.max(0, obstacleCount - 1));
        let index = target;
        while ((pitIndices.has(index) || signatureAssignments.has(index)) && index < obstacleCount - 1) index++;
        while ((pitIndices.has(index) || signatureAssignments.has(index)) && index > 0) index--;
        if (!pitIndices.has(index) && !signatureAssignments.has(index)) signatureAssignments.set(index, type);
    });

    const nonPitTypePool = typePool.filter(type => type !== 'pit');
    const randomTypePool = nonPitTypePool.length
        ? nonPitTypePool
        : Object.keys(OBSTACLE_TYPES).filter(type => type !== 'pit');
    const firstObstacleX = 900;
    const lastObstacleX = Math.max(firstObstacleX, finishX - 1200);
    const usableLength = Math.max(1, lastObstacleX - firstObstacleX);
    const spacing = obstacleCount > 1
        ? usableLength / (obstacleCount - 1)
        : usableLength;
    const generated = [];
    let previousRight = firstObstacleX - 120;

    for (let index = 0; index < obstacleCount; index++) {
        const patternType = historyPattern.length
            ? historyPattern[index % historyPattern.length]
            : null;
        const type = pitIndices.has(index)
            ? 'pit'
            : signatureAssignments.get(index) || patternType || randomItem(randomTypePool);
        const definition = OBSTACLE_TYPES[type];
        if (!definition) continue;

        const jitter = (Math.random() - 0.5) * Math.min(260, spacing * 0.32);
        const targetX = firstObstacleX + spacing * index + jitter;
        const x = Math.max(
            targetX,
            previousRight + 90,
            firstObstacleX
        );
        if (x > finishX - definition.width - 500) break;

        generated.push({
            id: `${currentTrack.id}-obstacle-${index}`,
            type,
            x,
            width: definition.width,
            height: definition.height,
            color: definition.color,
            phase: Math.random() * Math.PI * 2,
            playerHit: false,
            botHitBy: new Map(),
            botJumpAttemptedBy: new Set(),
            playerRampUsed: false,
            botRampUsedBy: new Set()
        });
        previousRight = x + definition.width;
    }

    // На последних двух исторических этапах обрыв стоит гарантированно
    // прямо перед финишем, отдельно от случайного набора препятствий.
    if (currentTrack.isHistory && (
        ([1, 2].includes(Number(currentTrack.historyChapter)) && [4, 5].includes(Number(currentTrack.historyStage))) ||
        (Number(currentTrack.historyChapter) === 3 && Number(currentTrack.historyStage) === 6)
    )) {
        const cliff = OBSTACLE_TYPES.cliff;
        generated.push({
            id: `${currentTrack.id}-finish-cliff`,
            type: 'cliff',
            x: Math.max(firstObstacleX, finishX - cliff.width - 300),
            width: cliff.width,
            height: cliff.height,
            color: cliff.color,
            playerHit: false,
            botHitBy: new Map(),
            botJumpAttemptedBy: new Set(),
            playerRampUsed: false,
            botRampUsedBy: new Set()
        });
    }

    return generated.sort((a, b) => a.x - b.x);
}

// =========================================
// СПОСОБНОСТИ БОТОВ
// =========================================

function getEquippedPart(category) {
    const equippedId = player.equipped?.[category];
    const categoryItems = ITEMS_DB?.[category];
    if (!equippedId || !Array.isArray(categoryItems)) return null;
    return categoryItems.find(item => item.id === equippedId) || null;
}

function getPlayerPartAbilities() {
    const equippedParts = Object.entries(player.equipped || {})
        .map(([category, equippedId]) => {
            const categoryItems = ITEMS_DB?.[category];
            return Array.isArray(categoryItems)
                ? categoryItems.find(item => item.id === equippedId)
                : null;
        })
        .filter(Boolean);
    const abilityIds = new Set(
        equippedParts.map(item => item.ability?.id).filter(Boolean)
    );

    return {
        flowFrame: abilityIds.has('flowFrame'),
        landingFrame: abilityIds.has('landingFrame'),
        nitroUnlocked: abilityIds.has('nitro'),
        superJumpUnlocked: abilityIds.has('superJump'),
        fallResistance: abilityIds.has('fallResistance'),
        mudGrip: abilityIds.has('mudGrip'),
        impactBrake: abilityIds.has('impactBrake'),
        macmillanBurst: abilityIds.has('macmillanBurst'),
        shieldCharges: abilityIds.has('jekyllShield') ? 1 : 0
    };
}

function getBikeVisualProfile() {
    const frame = getEquippedPart('frames');
    const fork = getEquippedPart('forks');
    const shock = getEquippedPart('suspension');
    const wheel = getEquippedPart('wheels');
    const tire = getEquippedPart('tires');
    const brakes = getEquippedPart('brakes');
    const rider = getEquippedPart('riders');
    const chain = getEquippedPart('chains');
    const drivetrain = getEquippedPart('drivetrain');
    const derailleur = getEquippedPart('derailleurs');
    const crank = getEquippedPart('cranks');
    const seatpost = getEquippedPart('seatposts');
    const saddle = getEquippedPart('saddles');
    const handlebar = getEquippedPart('handlebars');
    const stem = getEquippedPart('stems');
    const pedals = getEquippedPart('pedals');
    const electronics = getEquippedPart('electronics'); // Добавили электронику
    const fullSuspension = frame?.visuals?.type === 'dh';
    const stability = Math.max(0,
        (Number(frame?.stability) || 0) +
        (Number(fork?.stability) || 0) +
        (fullSuspension ? Number(shock?.stability) || 0 : 0) +
        (Number(wheel?.stability) || 0) +
        (Number(rider?.stability) || 0)
    );
    const frameTubeSize = Number(frame?.visuals?.width) || 0;

    return {
        riderId: rider?.id || 'r1',
        riderVisuals: rider?.visuals || {},
        
        // --- РАМА ---
        frameColor: frame?.visuals?.color || getRarityAccent(frame?.rarity),
        // Ширина в базе рассчитана для SVG гаража (10–16 условных единиц),
        // в Canvas матча переводим её в реальную толщину труб в пикселях.
        frameWidth: frameTubeSize ? clamp(frameTubeSize / 4, 2.5, 4) : (frame?.rarity === 'legendary' ? 3.5 : frame?.rarity === 'rare' ? 3 : 2.5),
        frameType: frame?.visuals?.type || 'normal',
        draisine: Boolean(frame?.visuals?.specialHistoryFrame),
        macmillanFrame: Boolean(frame?.visuals?.specialMacmillanFrame),
        highWheelerFrame: Boolean(frame?.visuals?.specialHighWheelerFrame),
        frontWheelDrivePedals: Boolean(frame?.visuals?.specialHighWheelerFrame),
        frontWheelDriveColor: pedals?.visuals?.color || '#64748b',
        macmillanTreadles: Boolean(pedals?.visuals?.macmillanTreadles),
        macmillanTreadleColor: pedals?.visuals?.color || '#8b5a2b',
        fullSuspension,
        rearSuspension: Boolean(fullSuspension && shock),
        rearShockColor: shock?.visuals?.color || getRarityAccent(shock?.rarity),
        stability,
        hasBrakes: Boolean(brakes),
        brakeStrength: Math.max(0, Number(brakes?.brake) || 0),
        
        // --- ВИЛКА ---
        forkColor: fork?.visuals?.color || getRarityAccent(fork?.rarity),
        
        // --- ТРАНСМИССИЯ И ПОСАДКА ---
        chainColor: chain?.visuals?.color || getRarityAccent(chain?.rarity),
        gearColor: getRarityAccent(derailleur?.rarity),
        chainringCount: ['d1', 'd2', 'd3'].includes(drivetrain?.id) &&
            !(electronics && electronics.id !== 'e1') ? 3 : 1,
        crankColor: crank?.visuals?.color || getRarityAccent(crank?.rarity),
        seatpostColor: seatpost?.visuals?.color || getRarityAccent(seatpost?.rarity),
        saddleColor: saddle?.visuals?.color || getRarityAccent(saddle?.rarity),
        stemColor: stem?.visuals?.color || getRarityAccent(stem?.rarity),
        
        // --- РУЛЬ ---
        handlebarColor: handlebar?.visuals?.color || getRarityAccent(handlebar?.rarity),
        handlebarWidth: handlebar?.visuals?.width || (handlebar?.rarity === 'legendary' ? 2.4 : handlebar?.rarity === 'rare' ? 2.1 : 1.8),
        
        // --- КОЛЕСА ---
        rimColor: wheel?.visuals?.rimColor || (wheel?.rarity === 'legendary' ? '#fbbf24' : wheel?.rarity === 'rare' ? '#38bdf8' : '#64748b'),
        hubColor: wheel?.visuals?.hubColor || '#e2e8f0',
        wheelRadius: wheel?.visuals?.radius || (9.5 + Math.min(1.2, Math.max(0, Number(wheel?.speed) || 0) * 0.08)),
        rearWheelRadius: wheel?.visuals?.rearRadius || 0,
        frontWheelRadius: wheel?.visuals?.frontRadius || 0,
        tireWidth: tire?.visuals?.width || (tire?.rarity === 'legendary' ? 4.2 : tire?.rarity === 'rare' ? 3.7 : 3.2),
        
        // --- МОДИФИКАТОРЫ ---
        discBrakes: Boolean(brakes && !['b1', 'b2'].includes(brakes.id)),
        suspension: Boolean(fork && fork.id !== 'fk1'),
        frontSuspension: Boolean(fork && fork.id !== 'fk1'),
        motor: Boolean(electronics && electronics.id !== 'e1')
    };
}

function getBotVisualProfile(botIndex) {
    const fullSuspension = botIndex === 2;
    return {
        riderId: 'r1',
        frameColor: botIndex === 1 ? '#ef4444' : '#a855f7',
        frameWidth: 3.2,
        frameType: fullSuspension ? 'dh' : 'hardtail',
        fullSuspension,
        rearSuspension: fullSuspension,
        rearShockColor: fullSuspension ? '#fbbf24' : '#94a3b8',
        forkColor: botIndex === 1 ? '#cbd5e1' : '#d8b4fe',
        stability: fullSuspension ? 78 : 43,
        hasBrakes: true,
        brakeStrength: fullSuspension ? 14 : 8,
        chainColor: '#cbd5e1',
        gearColor: '#94a3b8',
        chainringCount: 1,
        crankColor: '#e2e8f0',
        seatpostColor: '#cbd5e1',
        saddleColor: '#f8fafc',
        stemColor: '#cbd5e1',
        handlebarColor: '#e2e8f0',
        handlebarWidth: 2,
        rimColor: botIndex === 1 ? '#fecaca' : '#e9d5ff',
        hubColor: '#f8fafc',
        wheelRadius: 9.5,
        tireWidth: 3.8,
        discBrakes: true,
        suspension: true,
        frontSuspension: true,
        motor: false
    };
}

function createBike(isBot = false, botIndex = 1) {
    const botDifficultyTrack = isBot ? getBotDifficultyTrack(botIndex) : null;
    const difficulty = isBot
        ? getBotDifficultyStats(botIndex, botDifficultyTrack, currentTrack, getTrackBalance)
        : null;
    const botColor = botIndex === 1 ? '#ef4444' : '#a855f7';
    const visuals = isBot ? getBotVisualProfile(botIndex) : getBikeVisualProfile();
    const abilities = isBot
        ? getBotAbilities(botIndex, currentTrack, currentTrackLevel)
        : getPlayerPartAbilities();
    // Оставляем место за задним колесом, чтобы стартовый велосипед не обрезался краем Canvas.
    const startX = 50;

    return {
        id: isBot ? `bot-${botIndex}` : 'player',
        displayName: isBot ? (botIndex === 1 ? 'Макс' : 'Лера') : 'Игрок',
        visuals,
        stability: Math.max(0, Number(visuals?.stability) || 0),
        hasBrakes: Boolean(visuals?.hasBrakes),
        brakeStrength: Math.max(0, Number(visuals?.brakeStrength) || 0),
        frontSuspension: Boolean(visuals?.frontSuspension),
        rearSuspension: Boolean(visuals?.rearSuspension),

        x: startX,
        previousX: startX,
        velocityX: 0,

        jumpHeight: 0,
        jumpVelocity: 0,
        jumpGravity: GRAVITY,
        airY: null,
        grounded: true,
        pitchAngle: 0,
        pitchVelocity: 0,
        flippedTimer: 0,
        flipDirection: 1,
        bumpCooldown: 0,
        previousGroundDelta: 0,
        frontCompression: 0,
        frontCompressionVelocity: 0,
        rearCompression: 0,
        rearCompressionVelocity: 0,

        rampLift: 0,
        currentRamp: null,
        impactSlowTimer: 0,
        impactSpeedLimit: 0,
        collidedObstacles: new Map(),

        isBot,
        botIndex: isBot ? botIndex : 0,
        botBrain: isBot ? createBotBrain(botIndex, difficulty?.personality) : null,
        color: isBot ? botColor : (visuals?.frameColor || getRarityAccent()),
        abilities,
        macmillanBurstCharges: abilities.macmillanBurst ? 3 : 0,
        macmillanBurstRequested: false,
        macmillanBurstTimer: 0,

        botDifficultyTrackId: difficulty?.trackId || null,
        botBaseMaxSpeed: difficulty?.maxSpeed || 0,
        botBaseAcceleration: difficulty?.acceleration || 0,
        botBasePower: difficulty?.power || 0,
        botJumpForce: difficulty?.jumpForce || 0,

        nitroTimer: 0,
        padBoostTimer: 0,
        padBoostSpeed: 0,
        springBoostTimer: 0,
        nitroCooldown: isBot ? 120 + Math.floor(Math.random() * 100) : 0,
        landingBoostCooldown: 0,
        shieldActiveTimer: 0,
        jumpBufferFrames: 0,
        finishFrame: null,
        wheelRotation: 0,
        pedalPhase: 0
    };
}

// =========================================
// ФИЗИКА ПРЫЖКА
// =========================================

function hasFallResistance(bike) {
    return Boolean(bike?.abilities?.fallResistance || bike?.visuals?.draisine);
}

function stabilizeFallResistantBike(bike, candidatePitch = bike?.pitchAngle) {
    if (!bike || !hasFallResistance(bike)) return;

    const groundPitch = Math.atan2(
        getGroundY(bike.x + 25, 0) - getGroundY(bike.x - 25, 0),
        50
    );
    if (bike.grounded) {
        bike.pitchAngle = clamp(groundPitch, -0.8, 0.8);
        bike.pitchVelocity = 0;
        bike.flippedTimer = 0;
        return;
    }

    const relativePitch = Math.atan2(
        Math.sin((Number(candidatePitch) || 0) - groundPitch),
        Math.cos((Number(candidatePitch) || 0) - groundPitch)
    );
    const protectedPitch = groundPitch + clamp(relativePitch, -0.82, 0.82);
    bike.pitchAngle = clamp(protectedPitch, -1.2, 1.2);
    bike.pitchVelocity = clamp(Number(bike.pitchVelocity) || 0, -0.012, 0.012);
    bike.flippedTimer = 0;
}

function startBikeFlip(bike, direction = 1, message = 'ПЕРЕВОРОТ! Низкая стабильность') {
    if (!bike || bike.flippedTimer > 0) return false;
    if (hasFallResistance(bike)) {
        stabilizeFallResistantBike(bike);
        return false;
    }
    bike.flippedTimer = 74;
    bike.macmillanBurstRequested = false;
    bike.flipDirection = direction < 0 ? -1 : 1;
    const instability = 1 - getBikeStabilityRatio(bike);
    bike.pitchVelocity = clamp(
        (Number(bike.pitchVelocity) || 0) + bike.flipDirection * (0.055 + instability * 0.04),
        -0.14,
        0.14
    );
    bike.velocityX = Math.max(0.7, bike.velocityX * 0.42);
    bike.impactSlowTimer = Math.max(bike.impactSlowTimer || 0, 54);
    bike.impactSpeedLimit = 1.1;
    bike.bumpCooldown = 105;
    if (!bike.isBot) {
        addFloatingText(bike.x, getGroundY(bike.x, 0) - 58, message, '#fb7185');
    }
    return true;
}

function queuePlayerCrash(bike, reason) {
    if (!bike || bike.isBot || bike.crashPending) return false;
    if (hasFallResistance(bike)) return false;

    bike.crashPending = true;
    bike.macmillanBurstRequested = false;
    bike.crashReason = reason;
    bike.crashFrames = 42;
    return true;
}

function maybeFlipFromImpact(bike, impactForce, direction = 1, message = 'КОЧКА! Низкая стабильность') {
    if (!bike || bike.flippedTimer > 0 || bike.bumpCooldown > 0) return false;

    const stabilityRatio = getBikeStabilityRatio(bike);
    const instability = 1 - stabilityRatio;
    const minimumSpeed = 4.4 + stabilityRatio * 1.6;
    if (bike.velocityX < minimumSpeed) return false;

    // На низкой стабильности даже средняя кочка может выбить байк из равновесия;
    // большая скорость и резкий перепад рельефа усиливают риск.
    const speedFactor = clamp((bike.velocityX - minimumSpeed) / 7, 0, 1);
    const impactThreshold = 1.55 + stabilityRatio * 0.75;
    const impactFactor = clamp((Number(impactForce) - impactThreshold) / 3.5, 0, 1);
    if (impactFactor <= 0 || speedFactor <= 0) return false;

    let chance = impactFactor * speedFactor * (0.004 + instability * instability * 0.35);
    if (impactForce > 5.2 && bike.velocityX > 11) {
        chance += instability * 0.04;
    }

    const flipped = Math.random() < chance && startBikeFlip(bike, direction, message);
    if (flipped) queuePlayerCrash(bike, 'stability-flip');
    return flipped;
}

function getBikePitchInertia(bike) {
    const wheelbase = 50;
    const bodyHeight = 32;
    const mass = bike?.visuals?.fullSuspension ? 1.12 : 1;
    return mass * (wheelbase * wheelbase + bodyHeight * bodyHeight) / 12;
}

function applyPitchImpulseAtContact(bike, impactForce, contactX, verticalDirection = -1, scale = 1) {
    if (!bike) return;

    const stabilityRatio = getBikeStabilityRatio(bike);
    const instability = 1 - stabilityRatio;
    const leverArm = Number(contactX) - bike.x;
    const verticalImpulse = Math.abs(Number(impactForce) || 0) * 0.064 * Math.sign(verticalDirection) * scale;
    const angularImpulse = leverArm * verticalImpulse;
    const deltaPitchVelocity = angularImpulse / getBikePitchInertia(bike) * (0.35 + instability * 1.25);

    bike.pitchVelocity = clamp(
        (Number(bike.pitchVelocity) || 0) + deltaPitchVelocity,
        -0.24,
        0.24
    );
}

function applyImpactPitchImpulse(bike, impactForce, direction = 1) {
    if (!bike) return;

    // Удар спереди поднимает переднее колесо, задний удар вращает раму в обратную сторону.
    const frontContact = direction < 0;
    const contactX = bike.x + (frontContact ? 25 : -25);
    applyPitchImpulseAtContact(bike, impactForce, contactX, -1);
}

function updateBikeFlipRecovery(bike) {
    if (bike.bumpCooldown > 0) bike.bumpCooldown--;
    if (hasFallResistance(bike)) {
        stabilizeFallResistantBike(bike);
        if (bike.crashPending) {
            bike.crashPending = false;
            bike.crashReason = null;
            bike.crashFrames = 0;
        }
    }
    if (!(bike.flippedTimer > 0)) return false;

    bike.flippedTimer--;
    bike.previousX = bike.x;
    bike.x = Math.max(0, bike.x + Math.max(0, bike.velocityX) * 0.28);
    bike.velocityX = Math.max(0.2, bike.velocityX * 0.955);

    const stabilityRatio = getBikeStabilityRatio(bike);
    const stillFalling = Boolean(bike.crashPending) || bike.flippedTimer > 36;
    let restingAngle = 0;
    if (!stillFalling && bike.grounded) {
        const frontY = getGroundY(bike.x + 25, 0);
        const rearY = getGroundY(bike.x - 25, 0);
        restingAngle = Math.atan2(frontY - rearY, 50);
    }
    const targetAngle = stillFalling ? bike.flipDirection * 2.2 : restingAngle;
    const springStrength = stillFalling ? 0.028 : 0.019 + stabilityRatio * 0.012;
    bike.pitchVelocity = (bike.pitchVelocity + (targetAngle - bike.pitchAngle) * springStrength) *
        (stillFalling ? 0.84 : 0.83 - stabilityRatio * 0.08);
    bike.pitchAngle = clamp(bike.pitchAngle + bike.pitchVelocity, -2.55, 2.55);

    if (bike.impactSlowTimer > 0) bike.impactSlowTimer--;
    bike.frontCompression *= 0.72;
    bike.rearCompression *= 0.72;
    if (bike.flippedTimer === 0) {
        bike.bumpCooldown = 75;
    }
    return true;
}

function advanceSuspension(compression, velocity, relativeTravel, enabled, quality, maxTravel) {
    if (!enabled) return { compression: 0, velocity: 0, residual: Math.abs(relativeTravel) };

    const springResponse = 0.62 + quality * 0.18;
    const springRate = 0.12 + quality * 0.08;
    const reboundDamping = 0.66 + quality * 0.14;
    velocity += -relativeTravel * springResponse;
    velocity = (velocity - compression * springRate) * reboundDamping;

    const nextCompression = clamp(compression + velocity, 0, maxTravel);
    if (nextCompression <= 0 || nextCompression >= maxTravel) velocity *= 0.25;

    const remainingImpact = Math.abs(relativeTravel) * (0.42 - quality * 0.22);
    const nearBottomOut = Math.max(0, nextCompression / maxTravel - 0.88) * Math.abs(relativeTravel);
    return {
        compression: nextCompression,
        velocity,
        residual: remainingImpact + nearBottomOut
    };
}

function updateSuspensionResponse(bike) {
    if (!bike.grounded) {
        bike.frontCompression *= 0.72;
        bike.frontCompressionVelocity *= 0.72;
        bike.rearCompression *= 0.72;
        bike.rearCompressionVelocity *= 0.72;
        return;
    }

    const previousX = Number.isFinite(bike.previousX) ? bike.previousX : bike.x;
    const frontDelta = getGroundY(bike.x + 25, 0) - getGroundY(previousX + 25, 0);
    const rearDelta = getGroundY(bike.x - 25, 0) - getGroundY(previousX - 25, 0);
    const averageDelta = (frontDelta + rearDelta) / 2;
    const surfaceKick = Math.abs(averageDelta - (bike.previousGroundDelta || 0));
    const frontRelativeTravel = frontDelta - averageDelta;
    const rearRelativeTravel = rearDelta - averageDelta;
    bike.previousGroundDelta = averageDelta;

    const suspensionQuality = Math.max(0.15, getBikeStabilityRatio(bike));
    const front = advanceSuspension(
        bike.frontCompression,
        bike.frontCompressionVelocity,
        frontRelativeTravel,
        bike.frontSuspension,
        suspensionQuality,
        5
    );
    const rear = advanceSuspension(
        bike.rearCompression,
        bike.rearCompressionVelocity,
        rearRelativeTravel,
        bike.rearSuspension,
        suspensionQuality,
        5.5
    );
    bike.frontCompression = front.compression;
    bike.frontCompressionVelocity = front.velocity;
    bike.rearCompression = rear.compression;
    bike.rearCompressionVelocity = rear.velocity;

    const stabilityRatio = getBikeStabilityRatio(bike);
    const instability = 1 - stabilityRatio;
    const suspensionSupport = (
        (bike.frontSuspension ? 1 : 0) +
        (bike.rearSuspension ? 1 : 0)
    ) / 2;
    const chassisKick = surfaceKick * (1 - suspensionSupport * 0.48) * (0.92 + instability * 0.16);
    const bodyKick = Math.max(front.residual, rear.residual, chassisKick);
    const roughTerrainThreshold = 2.2 - instability * 0.6;
    const wobbleSpeedThreshold = 6 - instability * 1.6;
    if (bike.velocityX > wobbleSpeedThreshold && bodyKick > roughTerrainThreshold) {
        bike.velocityX *= 1 - Math.min(0.15, bodyKick * (0.002 + instability * 0.006));

        const naturalWobble = (Math.random() - 0.5) * Math.max(0, bodyKick - 1.5) * instability * 0.022;
        const frontImpulseDirection = frontRelativeTravel <= 0 ? -1 : 1;
        const rearImpulseDirection = rearRelativeTravel <= 0 ? -1 : 1;
        applyPitchImpulseAtContact(
            bike,
            front.residual * 3,
            bike.x + 25,
            frontImpulseDirection
        );
        applyPitchImpulseAtContact(
            bike,
            rear.residual * 3,
            bike.x - 25,
            rearImpulseDirection
        );
        bike.pitchVelocity = clamp(bike.pitchVelocity + naturalWobble, -0.095, 0.095);

        maybeFlipFromImpact(bike, bodyKick, frontDelta - rearDelta, 'КОЧКА! Низкая стабильность');
    }
}

function updateJumpPhysics(bike) {
    if (!bike.isBot && bike.landingBoostCooldown > 0) bike.landingBoostCooldown--;

    const stabilityRatio = getBikeStabilityRatio(bike);
    bike.pitchAngle = Number(bike.pitchAngle) || 0;
    bike.pitchVelocity = Number(bike.pitchVelocity) || 0;

    if (bike.grounded) {
        const frontY = getGroundY(bike.x + 25, 0);
        const rearY = getGroundY(bike.x - 25, 0);
        const targetPitch = bike.currentRamp ? -0.16 : Math.atan2(frontY - rearY, 50);
        bike.pitchVelocity += (targetPitch - bike.pitchAngle) * (0.09 + stabilityRatio * 0.035);
        bike.pitchVelocity *= 0.76 - stabilityRatio * 0.12;
    } else {
        // Газ и «назад» наклоняют байк игрока. Бот рассчитывает такой же
        // ограниченный импульс по углу предполагаемой посадки.
        const leanInput = bike.isBot
            ? getBotAirLeanInput(bike, getGroundY)
            : (input.reversing ? 1 : 0) - (input.accelerating ? 1 : 0);
        bike.pitchVelocity += leanInput * 0.00065 * (0.85 + stabilityRatio * 0.15);

        // Тормоз не вращает байк в воздухе: он только гасит лишнее вращение.
        // Сила эффекта зависит от установленной тормозной системы.
        const braking = bike.isBot
            ? Math.abs(bike.pitchVelocity) > 0.022
            : input.braking;
        if (braking && bike.hasBrakes) {
            const brakeRatio = getBrakeQualityRatio(bike.brakeStrength);
            bike.pitchVelocity *= 1 - (0.01 + brakeRatio * 0.05);
        }
        bike.pitchVelocity *= 0.965 - stabilityRatio * 0.055;
        bike.pitchVelocity = clamp(bike.pitchVelocity, -0.045, 0.045);
    }
    const nextPitch = bike.pitchAngle + bike.pitchVelocity;
    if (hasFallResistance(bike)) {
        stabilizeFallResistantBike(bike, nextPitch);
    } else {
        bike.pitchAngle = clamp(nextPitch, -2.35, 2.35);
    }

    if (bike.grounded) {
        bike.airY = null;
        return;
    }

    const groundY = getGroundY(bike.x, 0);

    if (!Number.isFinite(bike.airY)) {
        bike.airY = groundY - bike.jumpHeight;
    }

    // Двигаем байк по честной баллистической параболе в мировых координатах
    bike.airY -= bike.jumpVelocity;
    bike.jumpVelocity -= bike.jumpGravity || GRAVITY;

    // Высота над текущей точкой рельефа (используется для коллизий и отрисовки)
    bike.jumpHeight = groundY - bike.airY;

    // Приземление, когда траектория пересекла линию рельефа
    if (bike.jumpHeight <= 0) {
        const landingSpeed = Math.max(0, -bike.jumpVelocity);
        const frontY = getGroundY(bike.x + 25, 0);
        const rearY = getGroundY(bike.x - 25, 0);
        const groundPitch = Math.atan2(frontY - rearY, 50);
        const landingAngle = Math.atan2(
            Math.sin(bike.pitchAngle - groundPitch),
            Math.cos(bike.pitchAngle - groundPitch)
        );
        const absoluteLandingAngle = Math.abs(landingAngle);
        const upsideDown = absoluteLandingAngle >= Math.PI / 2;
        const safeLandingAngle = 0.72 + stabilityRatio * 0.48;
        const landingSpeedTolerance = 2.5 + stabilityRatio * 3;
        const failedLanding = !hasFallResistance(bike) && (upsideDown || (
            landingSpeed > landingSpeedTolerance &&
            absoluteLandingAngle > safeLandingAngle
        ));
        const shieldSavedLanding = failedLanding && !bike.isBot &&
            bike.abilities?.shieldCharges > 0;

        bike.jumpHeight = 0;
        bike.jumpVelocity = 0;
        bike.jumpGravity = GRAVITY;
        bike.grounded = true;
        bike.airY = null;
        bike.rampLift = 0;
        bike.currentRamp = null;
        if (shieldSavedLanding) {
            bike.abilities.shieldCharges--;
            bike.shieldActiveTimer = 52;
            bike.pitchAngle = groundPitch + clamp(
                landingAngle,
                -safeLandingAngle * 0.72,
                safeLandingAngle * 0.72
            );
            bike.pitchVelocity *= 0.35;
            bike.impactSlowTimer = Math.max(bike.impactSlowTimer || 0, 18);
            bike.impactSpeedLimit = Math.max(1.2, bike.velocityX * 0.78);
            bike.bumpCooldown = Math.max(bike.bumpCooldown || 0, 75);
        }
        if (failedLanding && !shieldSavedLanding) {
            startBikeFlip(
                bike,
                landingAngle < 0 ? -1 : 1,
                'ЖЁСТКОЕ ПРИЗЕМЛЕНИЕ!'
            );
            queuePlayerCrash(bike, 'hard-landing');
        } else {
            bike.pitchVelocity *= 0.72;
            if (!bike.isBot && bike.abilities?.landingFrame && bike.landingBoostCooldown <= 0) {
                bike.velocityX += 0.45;
                bike.springBoostTimer = Math.max(bike.springBoostTimer || 0, 24);
                bike.landingBoostCooldown = 300;
            }
        }
    }
}

function startJump(bike, force, gravity = GRAVITY) {
    if (!bike || !bike.grounded) return false;

    const groundY = getGroundY(bike.x, 0);
    const travelDirection = Math.abs(Number(bike.velocityX) || 0) > 0.1
        ? Math.sign(bike.velocityX)
        : (!bike.isBot && input.reversing ? -1 : 1);
    const forwardGroundY = getGroundY(bike.x + travelDirection * 18, 0);

    // Оцениваем уклон прямо впереди, чтобы медленный разгон в подъём не
    // обнулял помощь при отрыве. На спуске поправка остаётся ограниченной.
    const terrainSlopeVy = clamp((groundY - forwardGroundY) * 0.22, -1.2, 3.2);

    bike.grounded = false;

    bike.jumpVelocity = Math.max(
        4,
        Number(force) || 9
    ) + terrainSlopeVy;
    // Прыжок сохраняет текущий наклон; сам отрыв не добавляет резкого переворота.
    bike.pitchVelocity = clamp(Number(bike.pitchVelocity) || 0, -0.045, 0.045);

    // Callers provide a gravity derived from equipment or the bot profile;
    // retain a broad physical guard without clipping player stats at a score cap.
    bike.jumpGravity = clamp(Number(gravity) || GRAVITY, 0.36, GRAVITY);

    bike.jumpHeight = 1 + (bike.rampLift || 0);
    bike.airY = groundY - bike.jumpHeight;
    bike.rampLift = 0;
    bike.currentRamp = null;

    return true;
}

// =========================================
// РАМПА
// =========================================

function updateRamp(bike, isBot) {
    const rampAlreadyUsed = ramp => isBot
        ? ramp.botRampUsedBy.has(bike.botIndex)
        : ramp.playerRampUsed;

    if (!bike.grounded) {
        bike.rampLift = 0;
        return;
    }

    // Не запускаем бота с трамплина прямо перед обязательным разрывом:
    // он должен остаться на земле и выполнить отдельный прыжок через яму.
    if (isBot && shouldBotHoldRampForGap(bike, obstacles, BIKE_WIDTH)) {
        bike.rampLift = 0;
        bike.currentRamp = null;
        return;
    }

    const previousX = Number.isFinite(bike.previousX)
        ? bike.previousX
        : bike.x;

    let ramp = bike.currentRamp
        ? obstacles.find(obstacle =>
            obstacle.id === bike.currentRamp &&
            obstacle.type === 'ramp' &&
            !rampAlreadyUsed(obstacle)
        )
        : null;

    if (!ramp) {
        ramp = obstacles.find(obstacle => {
            if (obstacle.type !== 'ramp') return false;
            if (rampAlreadyUsed(obstacle)) return false;
            if (bike.velocityX <= 0) return false;

            const rampStart = obstacle.x;
            const rampEnd = obstacle.x + obstacle.width;

            return bike.x >= rampStart - 4 &&
                previousX <= rampEnd;
        }) || null;
    }

    if (!ramp) {
        bike.rampLift = 0;
        bike.currentRamp = null;
        return;
    }

    bike.currentRamp = ramp.id;

    const progress = clamp(
        (bike.x - ramp.x) / Math.max(1, ramp.width),
        0,
        1
    );

    bike.rampLift = ramp.height * progress;

    const rampEnd = ramp.x + ramp.width;

    const crossedRampEnd =
        previousX < rampEnd &&
        bike.x >= rampEnd;

    const reachedRampEnd = progress >= 1;

    if (
        bike.velocityX > 0.4 &&
        (crossedRampEnd || reachedRampEnd)
    ) {
        if (isBot) {
            ramp.botRampUsedBy.add(bike.botIndex);
        } else {
            ramp.playerRampUsed = true;
        }

        const jumpStat = isBot
            ? clamp(
                (Number(bike.botJumpForce) || 10.5) - 10.5,
                0,
                3
            ) * 4 + (bike.abilities?.superJumpUnlocked ? 6 : 0)
            : Math.max(0, Number(player.totalJump) || 0);

        const extraJump = jumpStat * 0.045 * JUMP_STAT_FACTOR;

        bike.jumpHeight = Math.max(
            bike.rampLift,
            ramp.height * 0.85
        );
        bike.airY = getGroundY(bike.x, 0) - bike.jumpHeight;
        const launchAngle = Math.atan2(ramp.height * 0.4, Math.max(1, ramp.width));
        bike.pitchVelocity = clamp(
            (Number(bike.pitchVelocity) || 0) + launchAngle * 0.035,
            -0.045,
            0.045
        );

        bike.rampLift = 0;
        bike.grounded = false;
        bike.jumpVelocity = 12 + extraJump;

        bike.jumpGravity = isBot && bike.abilities?.superJumpUnlocked
            ? 0.355
            : isBot
                ? clamp(
                    0.38 - (Number(bike.botJumpForce) - 10.5) * 0.002,
                    0.36,
                    0.38
                )
                : 0.36 + 0.02 * Math.exp(-(jumpStat * JUMP_STAT_FACTOR) / 7);

        bike.currentRamp = null;
    }

    if (bike.velocityX <= 0.05 && progress < 1) {
        bike.rampLift = 0;
        bike.currentRamp = null;
    }
}

const REVERSE_STOP_THRESHOLD = 0.06;

function getBrakeDeceleration(bike, totalBrake, speed) {
    if (!bike?.hasBrakes) return 0;

    const brakeQuality = getBrakeQualityRatio(bike.brakeStrength);
    const ratedPower = 0.08 + Math.max(0, Number(totalBrake) || 0) * 0.0045;
    const brakeTierFactor = 0.4 + brakeQuality * 0.6;
    const speedPenalty = 1 + Math.abs(Number(speed) || 0) * 0.03;

    return ratedPower * brakeTierFactor / speedPenalty;
}

function updateReverseButtonLabel() {
    const label = document.querySelector('#btn-reverse [data-reverse-label]');
    if (!label) return;

    const isBrakingBeforeReverse = Boolean(
        input.reversing && playerBike?.grounded && playerBike.velocityX > REVERSE_STOP_THRESHOLD
    );
    const nextLabel = isBrakingBeforeReverse ? '🛑 ТОРМОЗ' : '⏪ НАЗАД';
    if (label.textContent.trim() !== nextLabel) label.textContent = nextLabel;
}

function syncAbilityButtons() {
    const controls = document.getElementById('race-ability-controls');
    const motorButton = document.getElementById('btn-motor-boost');
    const pedalButton = document.getElementById('btn-pedal-burst');
    if (!controls || !motorButton || !pedalButton) return;

    const hasMotor = Boolean(playerBike?.abilities?.nitroUnlocked);
    const hasPedalBurst = Boolean(playerBike?.abilities?.macmillanBurst);
    const charges = Math.max(0, Number(playerBike?.macmillanBurstCharges) || 0);
    const cooldown = Math.max(0, Number(playerBike?.nitroCooldown) || 0);
    const motorReady = hasMotor && cooldown <= 0;

    const hideControls = !hasMotor && !hasPedalBurst;
    if (controls.hidden !== hideControls) controls.hidden = hideControls;
    if (motorButton.hidden !== !hasMotor) motorButton.hidden = !hasMotor;
    if (motorButton.disabled !== !motorReady) motorButton.disabled = !motorReady;
    if (motorButton.getAttribute('aria-disabled') !== String(!motorReady)) {
        motorButton.setAttribute('aria-disabled', String(!motorReady));
    }
    motorButton.classList.toggle('is-active', Number(playerBike?.nitroTimer) > 0);
    const cooldownSeconds = Math.ceil(cooldown / 60);
    const motorTitle = motorReady
        ? 'Импульсный разгон готов. Клавиша G.'
        : `Импульсный разгон перезаряжается: ${cooldownSeconds} сек.`;
    if (motorButton.title !== motorTitle) motorButton.title = motorTitle;
    const motorLabel = motorReady ? 'G' : `G · ${cooldownSeconds}`;
    if (motorButton.textContent !== motorLabel) motorButton.textContent = motorLabel;

    if (pedalButton.hidden !== !hasPedalBurst) pedalButton.hidden = !hasPedalBurst;
    const pedalDisabled = !hasPedalBurst || charges <= 0;
    if (pedalButton.disabled !== pedalDisabled) pedalButton.disabled = pedalDisabled;
    if (pedalButton.getAttribute('aria-disabled') !== String(pedalDisabled)) {
        pedalButton.setAttribute('aria-disabled', String(pedalDisabled));
    }
    const pedalAriaLabel = `Рычажный рывок, зарядов: ${charges}. Клавиша E`;
    if (pedalButton.getAttribute('aria-label') !== pedalAriaLabel) {
        pedalButton.setAttribute('aria-label', pedalAriaLabel);
    }
    const pedalTitle = `Рычажный рывок: нажми на земле. Клавиша E. Зарядов: ${charges}`;
    if (pedalButton.title !== pedalTitle) pedalButton.title = pedalTitle;
    const pedalLabel = `E · ${charges}`;
    if (pedalButton.textContent !== pedalLabel) pedalButton.textContent = pedalLabel;
}

// =========================================
// ФИЗИКА ИГРОКА
// =========================================

function updatePlayerPhysics() {
    if (updateBikeFlipRecovery(playerBike)) {
        updateReverseButtonLabel();
        return;
    }

    if (playerBike.shieldActiveTimer > 0) playerBike.shieldActiveTimer--;
    if (playerBike.macmillanBurstTimer > 0) playerBike.macmillanBurstTimer--;
    if (playerBike.padBoostTimer > 0) playerBike.padBoostTimer--;

    const speed = Math.max(
        0,
        Number(player.totalSpeed) || 0
    );

    const accel = Math.max(
        0,
        Number(player.totalAccel) || 0
    );

    const jump = Math.max(0, Number(player.totalJump) || 0);

    const brake = Math.max(0, Number(player.totalBrake) || 0);

    const maxSpeed = 3.2 + speed * 0.12 * SPEED_ACCEL_STAT_FACTOR;

    if (playerBike.nitroTimer > 0) playerBike.nitroTimer--;
    if (playerBike.nitroCooldown > 0) playerBike.nitroCooldown--;
    syncAbilityButtons();
    const nitroMultiplier = playerBike.nitroTimer > 0 ? 1.32 : 1;

    const acceleration = 0.05 + accel * 0.002 * SPEED_ACCEL_STAT_FACTOR;

    // Задний ход заметно слабее педалирования вперёд. Его тяга и скорость
    // растут от характеристик сборки, включая бонусы райдера.
    const reversePower = Math.max(0, Number(player.totalPower) || 0);
    const reverseAcceleration = acceleration * (0.2 + reversePower * 0.0015);
    const reverseSpeedPotential = 0.65 + speed * 0.035 * SPEED_ACCEL_STAT_FACTOR + reversePower * 0.008;
    const reverseMaxSpeed = maxSpeed * (
        1 - Math.exp(-1.17 * reverseSpeedPotential / Math.max(0.1, maxSpeed))
    );

    const brakeApplied = input.braking && playerBike.hasBrakes;
    const driveInput = Number(input.accelerating) - Number(input.reversing);
    const draisinePush = playerBike.visuals?.draisine && playerBike.grounded
        ? 0.55 + (Math.sin(frameCounter * 0.13) + 1) * 0.38
        : 1;

    const jumpForce =
        8.5 + jump * 0.12 * JUMP_STAT_FACTOR;

    const jumpGravity = 0.39 + (GRAVITY - 0.39) * Math.exp(-(jump * JUMP_STAT_FACTOR) / 5);

    if (driveInput > 0 && playerBike.grounded) {
        playerBike.velocityX += acceleration * draisinePush;
    }

    if (driveInput < 0 && playerBike.grounded && !brakeApplied) {
        if (playerBike.velocityX > REVERSE_STOP_THRESHOLD) {
            const speed = Math.abs(playerBike.velocityX);
            const brakeForce = playerBike.hasBrakes
                ? getBrakeDeceleration(playerBike, brake, speed)
                : Math.max(0.02, acceleration * 0.25) / (1 + speed * 0.03);
            playerBike.velocityX = Math.max(0, playerBike.velocityX - brakeForce);
        } else {
            // После полной остановки та же кнопка действительно включает задний ход.
            if (playerBike.velocityX > 0) playerBike.velocityX = 0;
            playerBike.velocityX -= reverseAcceleration;
        }
    }

    if (brakeApplied && playerBike.grounded) {
        const brakePower = getBrakeDeceleration(playerBike, brake, playerBike.velocityX);
        if (playerBike.velocityX > 0) {
            playerBike.velocityX = Math.max(
                0,
                playerBike.velocityX - brakePower
            );
        } else if (playerBike.velocityX < 0) {
            playerBike.velocityX = Math.min(
                0,
                playerBike.velocityX + brakePower
            );
        }
    }

    if (!playerBike.grounded) {
        // В воздухе педали не цепляют землю: сохраняется инерция с легким сопротивлением воздуха
        playerBike.velocityX *= 0.998;
    } else if (
        driveInput === 0 &&
        !brakeApplied
    ) {
        // Пассивное сопротивление качению остаётся даже без установленных тормозов.
        playerBike.velocityX *= 1 - 0.005;
    }

    const regularAllowedSpeed = maxSpeed * nitroMultiplier;
    const padBoostFraction = playerBike.padBoostTimer > 0
        ? playerBike.padBoostTimer / 50
        : 0;
    const padBoostCeiling = Math.max(
        regularAllowedSpeed,
        Number(playerBike.padBoostSpeed) || 0
    );
    let allowedSpeed = regularAllowedSpeed +
        (padBoostCeiling - regularAllowedSpeed) * padBoostFraction;
    if (playerBike.nitroTimer > 0 && driveInput > 0) {
        playerBike.velocityX += acceleration * 0.55;
    }

    if (playerBike.springBoostTimer > 0) {
        playerBike.springBoostTimer--;
        allowedSpeed *= 1.18;
    }

    // ----------------------------------------------------
    // МЕХАНИКА МОЩНОСТИ (POWER) И ПОДЪЁМОВ В ГОРУ
    // Мощность непосредственно определяет возможность преодолевать уклоны.
    // Ограничение действует и на земле, и в прыжке: прыжок не сбрасывает лимит
    // тяги и не позволяет «перепрыгивать» гору без начальной скорости!
    // ----------------------------------------------------
    const wheelBase = 25;
    const frontY = getGroundY(playerBike.x + wheelBase, 0);
    const backY = getGroundY(playerBike.x - wheelBase, 0);
    // frontY < backY означает, что впереди земля выше (Y меньше) -> подъем!
    const slope = (backY - frontY) / (wheelBase * 2);
    const totalPower = Math.max(0, Number(player.totalPower) || 0);

    const travelDirection = playerBike.velocityX < -0.1
        ? -1
        : playerBike.velocityX > 0.1
            ? 1
            : driveInput < 0 ? -1 : 1;
    const travelSlope = slope * travelDirection;

    if (travelSlope > 0.04) {
        // Требуемая мощность в зависимости от крутизны склона
        const requiredPower = travelSlope * 165;
        const powerRatio = (totalPower + 6) / Math.max(10, requiredPower);

        if (powerRatio < 1.0) {
            // Какая бы ни была максимальная скорость на прямой (speed),
            // предел скорости в гору непосредственно срезается дефицитом мощности!
            // В воздухе лимит сохраняется — нельзя прыжком развить скорость выше допустимой!
            const hillSpeedCap = Math.max(0.35, maxSpeed * Math.pow(Math.max(0.08, powerRatio), 1.25));
            allowedSpeed = Math.min(allowedSpeed, hillSpeedCap);

            // На земле недостаток мощности режет разгон от педалей
            if (playerBike.grounded) {
                const lostAccel = acceleration * (1 - Math.min(1, powerRatio));
                playerBike.velocityX -= travelDirection * lostAccel;
            }

            // Гравитационное сопротивление крутого склона действует и на земле, и при полете против склона
            const gravityDrag = travelSlope * 0.18 * (1 - powerRatio);
            playerBike.velocityX -= travelDirection * gravityDrag;

            if (powerRatio < 0.45) {
                // Мощность критически мала: велосипед не вытягивает гору и откатывается назад!
                if (playerBike.velocityX * travelDirection < 0.5) {
                    playerBike.velocityX = clamp(
                        playerBike.velocityX - travelDirection * 0.05,
                        -0.8,
                        0.8
                    );
                    if (powerWarningCooldown <= 0 && playerBike.grounded) {
                        addFloatingText(playerBike.x, getGroundY(playerBike.x, 0) - 65, '⚠️ Мало мощности! 🔋', '#ef4444');
                        powerWarningCooldown = 90;
                    }
                }
            }
        } else {
            // Высокая мощность: уверенный заезд в гору и небольшая помощь тяги
            if (driveInput !== 0 && Math.sign(driveInput) === travelDirection && playerBike.grounded) {
                const uphillAssist = 0.04 * (1 - Math.exp(-(powerRatio - 1) * 0.25));
                playerBike.velocityX += travelDirection * uphillAssist;
            }
        }
    } else if (travelSlope < -0.04) {
        // Гравитация помогает в направлении фактического движения, в том числе задним ходом.
        const downhillBoost = Math.min(0.06, Math.abs(travelSlope) * 0.05);
        playerBike.velocityX += travelDirection * downhillBoost;
    }

    if (playerBike.impactSlowTimer > 0) {
        playerBike.impactSlowTimer--;

        allowedSpeed = Math.min(
            allowedSpeed,
            playerBike.impactSpeedLimit
        );
    }

    if (playerBike.macmillanBurstRequested) {
        // Рывок доводит скорость до предела, разрешённого текущим рельефом,
        // но не отменяет штрафы за нехватку мощности или столкновение.
        if (
            playerBike.grounded && !brakeApplied && !input.reversing &&
            playerBike.impactSlowTimer <= 0 && playerBike.velocityX < allowedSpeed - 0.05
        ) {
            playerBike.velocityX = Math.max(0, allowedSpeed);
            playerBike.macmillanBurstCharges--;
            playerBike.macmillanBurstTimer = 32;
            syncAbilityButtons();
            addFloatingText(
                playerBike.x,
                getGroundY(playerBike.x, 0) - 60,
                `РЫЧАЖНЫЙ РЫВОК · ${playerBike.macmillanBurstCharges}`,
                '#c084fc'
            );
        }
        playerBike.macmillanBurstRequested = false;
    }

    playerBike.velocityX = clamp(
        playerBike.velocityX,
        -reverseMaxSpeed,
        allowedSpeed
    );

    playerBike.previousX = playerBike.x;

    playerBike.x = Math.max(
        0,
        playerBike.x + playerBike.velocityX
    );

    if (input.jumpRequested) {
        playerBike.jumpBufferFrames = Math.max(playerBike.jumpBufferFrames || 0, 8);
        input.jumpRequested = false;
    }
    if (playerBike.jumpBufferFrames > 0) {
        const superJumpMultiplier = playerBike.abilities?.superJumpUnlocked ? 1.15 : 1;
        const jumped = playerBike.grounded && startJump(
            playerBike,
            jumpForce * superJumpMultiplier,
            jumpGravity * (playerBike.abilities?.superJumpUnlocked ? 0.98 : 1)
        );
        if (jumped) playerBike.jumpBufferFrames = 0;
        else playerBike.jumpBufferFrames--;
    }

    updateJumpPhysics(playerBike);
    updateRamp(playerBike, false);
    updateSuspensionResponse(playerBike);
    updateReverseButtonLabel();
}

// =========================================
// ФИЗИКА БОТА И ВЫПОЛНЕНИЕ РЕШЕНИЙ ИЗ bot-ai.js
// =========================================
function updateBotPhysics(bike) {
    if (updateBikeFlipRecovery(bike)) return;

    updateBotAbilities(bike, obstacles, BIKE_WIDTH, [playerBike, ...activeBots]);
    if (bike.padBoostTimer > 0) bike.padBoostTimer--;
    if (bike.springBoostTimer > 0) bike.springBoostTimer--;

    const baseMaxSpeed = Math.max(
        1.5,
        Number(bike.botBaseMaxSpeed) ||
        3
    );

    const nitroMultiplier =
        bike.nitroTimer > 0
            ? 1.28
            : 1;

    const springBoostMultiplier = bike.springBoostTimer > 0 ? 1.18 : 1;
    const maxSpeed =
        baseMaxSpeed * nitroMultiplier * springBoostMultiplier;

    const baseAcceleration = Math.max(
        0.012,
        Number(bike.botBaseAcceleration) || 0.02
    ) * (
        bike.nitroTimer > 0
            ? 1.55
            : 1
    );

    if (bike.grounded) {
        const legPush = bike.visuals?.draisine
            ? 0.55 + (Math.sin(frameCounter * 0.13) + 1) * 0.38
            : 1;
        bike.velocityX += baseAcceleration * legPush;
    }

    // Соревновательный азарт: бот активнее крутит педали (драфтинг), если отстает от лидера или соперника
    if (bike.grounded && !bike.isGhost) {
        const competitors = [playerBike, ...activeBots.filter(b => b !== bike && !b.isGhost)];
        const ahead = competitors.find(c => c && (c.x - bike.x) > 50 && (c.x - bike.x) < 450);
        if (ahead) {
            bike.velocityX += baseAcceleration * 0.28;
        }
    }

    const padBoostFraction = bike.padBoostTimer > 0
        ? bike.padBoostTimer / 50
        : 0;
    const boostCeiling = Math.max(maxSpeed, Number(bike.padBoostSpeed) || 0);
    let allowedSpeed = maxSpeed + (boostCeiling - maxSpeed) * padBoostFraction;

    const botWheelBase = 25;
    const botFrontY = getGroundY(bike.x + botWheelBase, 0);
    const botBackY = getGroundY(bike.x - botWheelBase, 0);
    const botSlope = (botBackY - botFrontY) / (botWheelBase * 2);
    if (bike.grounded && botSlope > 0.04) {
        const requiredPower = botSlope * 165;
        const powerRatio = (Math.max(0, Number(bike.botBasePower) || 0) + 6) /
            Math.max(10, requiredPower);
        const powerDeficit = clamp(1 - powerRatio, 0, 0.5);
        const powerSpeedPenalty = powerDeficit * 0.035;
        const hillDrag = botSlope * 0.08 + baseAcceleration * powerDeficit * 0.18;

        // Возвращаем базовое сопротивление склону; мощность добавляет лишь
        // небольшой штраф при нехватке тяги, не меняя общий темп ботов резко.
        bike.velocityX = Math.max(0.4, bike.velocityX - hillDrag);
        const slopeSpeedLimit = Math.max(
            0.6,
            maxSpeed * (1 - botSlope * 1.5 - powerSpeedPenalty)
        );
        allowedSpeed = Math.min(allowedSpeed, slopeSpeedLimit);
    } else if (bike.grounded && botSlope < -0.04) {
        bike.velocityX += Math.min(0.05, Math.abs(botSlope) * 0.04);
    }

    if (bike.impactSlowTimer > 0) {
        bike.impactSlowTimer--;

        allowedSpeed = Math.min(
            allowedSpeed,
            bike.impactSpeedLimit
        );
    }

    bike.velocityX = Math.min(
        bike.velocityX,
        allowedSpeed
    );

    updateBotDrivingDecision(bike, {
        obstacles,
        frameCounter,
        currentTrackId: currentTrack.id,
        getTrackBalance,
        startJump,
        gravity: GRAVITY,
        bikeWidth: BIKE_WIDTH,
        competitors: [playerBike, ...activeBots],
        maxSpeed
    });

    bike.previousX = bike.x;

    bike.x = Math.max(
        0,
        bike.x + bike.velocityX
    );

    if (
        bike.x >= finishX &&
        bike.finishFrame === null
    ) {
        bike.finishFrame = frameCounter;
    }

    updateJumpPhysics(bike);
    updateRamp(bike, true);
    updateSuspensionResponse(bike);
}

// =========================================
// СТОЛКНОВЕНИЯ ИГРОКА
// =========================================

function applyPlayerImpact(obstacle, speedLimit = 1.0) {
    const previousHitFrame = playerBike.collidedObstacles.get(obstacle.id);
    if (REPEATING_GROUND_HAZARDS.has(obstacle.type)) {
        if (previousHitFrame !== undefined &&
            frameCounter - previousHitFrame < GROUND_HAZARD_REHIT_FRAMES) return;
        playerBike.collidedObstacles.set(obstacle.id, frameCounter);
    } else {
        if (previousHitFrame !== undefined) return;
        playerBike.collidedObstacles.set(obstacle.id, frameCounter);
    }

    let impactDuration = 42;
    if (playerBike.abilities?.impactBrake) impactDuration = Math.round(impactDuration * 0.85);
    if (playerBike.abilities?.flowFrame && ['ice_patch', 'wind_fan'].includes(obstacle.type)) {
        speedLimit = Math.max(speedLimit, Math.min(playerBike.velocityX, speedLimit * 1.15));
    }

    const roughObstacle = ['rock', 'rolling_boulder', 'rolling_wheel', 'log', 'fallen_branch', 'crank_rack'].includes(obstacle.type);
        const stability = getBikeStabilityRatio(playerBike);
    if (roughObstacle) {
        const retainedSpeed = (playerBike.velocityX - speedLimit) * stability * 0.18;
        speedLimit += retainedSpeed;
        impactDuration = Math.round(impactDuration * (1 - stability * 0.20));

        const severity = ['rolling_boulder', 'rolling_wheel'].includes(obstacle.type) ? 1.35 : obstacle.type === 'rock' ? 1.2 : 1;
        const impactForce = playerBike.velocityX * severity / 3;
        const impactDirection = obstacle.type === 'rock' ? -1 : 1;
        applyImpactPitchImpulse(playerBike, impactForce, impactDirection);
        if (!(playerBike.abilities?.shieldCharges > 0)) {
            maybeFlipFromImpact(
                playerBike,
                impactForce,
                impactDirection,
                'УДАР! Низкая стабильность'
            );
        }
    }

    if (playerBike.abilities?.shieldCharges > 0) {
        playerBike.abilities.shieldCharges--;
        playerBike.shieldActiveTimer = 52;
        speedLimit = Math.max(speedLimit, playerBike.velocityX * 0.78);
        impactDuration = Math.min(impactDuration, 18);
    }

    playerBike.impactSlowTimer = impactDuration;
    playerBike.impactSpeedLimit = speedLimit;

    playerBike.velocityX = Math.min(
        playerBike.velocityX,
        speedLimit
    );
}

function updatePlayerCollisions() {
    const collisionHalfWidth = getBikeObstacleHalfWidth(playerBike);
    for (const obstacle of obstacles) {
        if (playerBike.collidedObstacles.has(obstacle.id) &&
            !isTouchingObstacle(playerBike, obstacle)) {
            playerBike.collidedObstacles.delete(obstacle.id);
        }
        if (
            obstacle.x + obstacle.width <
            playerBike.x - collisionHalfWidth
        ) {
            continue;
        }

        if (
            obstacle.x >
            playerBike.x + collisionHalfWidth
        ) {
            break;
        }

        if (!isTouchingObstacle(playerBike, obstacle)) {
            continue;
        }

        if (obstacle.type === 'pit' || obstacle.type === 'bridge_gap' || obstacle.type === 'cliff' || obstacle.type === 'loose_planks') {
            if (playerBike.jumpHeight < getGapClearanceHeight(obstacle)) {
                finishRace(false, 'pit');
                return;
            }

            continue;
        }

        if (obstacle.type === 'pulse_gate') {
            if (Math.sin(frameCounter * 0.045 + obstacle.x) > 0.15) continue;
            if (playerBike.jumpHeight < obstacle.height + 8) applyPlayerImpact(obstacle, 0.9);
            continue;
        }
        if (['smith_hammer', 'mill_paddle', 'crank_rack'].includes(obstacle.type)) {
            const clearHeight = obstacle.type === 'smith_hammer' ? 28 : obstacle.type === 'mill_paddle' ? 32 : 23;
            if (isTimedObstacleActive(obstacle, frameCounter) && playerBike.jumpHeight < clearHeight) {
                applyPlayerImpact(obstacle, Math.max(0.65, playerBike.velocityX * 0.48));
            }
            continue;
        }
        if (obstacle.type === 'mud' || obstacle.type === 'water_splash' || obstacle.type === 'ice_patch' || obstacle.type === 'wind_fan' || obstacle.type === 'forge_slag' || obstacle.type === 'ford_stones' || obstacle.type === 'metal_grate') {
            if (playerBike.grounded) {
                if (playerBike.abilities?.mudGrip && ['mud', 'water_splash'].includes(obstacle.type)) {
                    applyPlayerImpact(obstacle, Math.max(0.8, playerBike.velocityX * 0.82));
                } else if (obstacle.type === 'metal_grate') {
                    applyPlayerImpact(obstacle, Math.max(0.7, playerBike.velocityX * 0.72));
                } else if (obstacle.type === 'ice_patch') {
                    applyPlayerImpact(obstacle, Math.max(0.8, playerBike.velocityX * 0.58));
                } else if (obstacle.type === 'wind_fan') {
                    applyPlayerImpact(obstacle, Math.max(0.6, playerBike.velocityX * 0.42));
                } else if (obstacle.type === 'forge_slag') {
                    applyPlayerImpact(obstacle, Math.max(0.55, playerBike.velocityX * 0.52));
                } else if (obstacle.type === 'ford_stones') {
                    applyPlayerImpact(obstacle, Math.max(0.65, playerBike.velocityX * 0.62));
                } else {
                    applyPlayerImpact(obstacle, obstacle.type === 'water_splash' ? 0.8 : 1.05);
                }
            }
            continue;
        }
        if (obstacle.type === 'cobblestones' || obstacle.type === 'plank_bridge') {
            if (playerBike.grounded) {
                const speedFactor = obstacle.type === 'cobblestones' ? 0.64 : 0.76;
                applyPlayerImpact(obstacle, Math.max(0.6, playerBike.velocityX * speedFactor));
            }
            continue;
        }
        if (obstacle.type === 'ramp') continue;

        if (obstacle.type === 'rolling_wheel') {
            if (playerBike.jumpHeight < Math.max(10, obstacle.height * 0.65)) {
                applyPlayerImpact(obstacle, Math.max(0.7, playerBike.velocityX * 0.42));
            }
            continue;
        }
        if (obstacle.type === 'rock' || obstacle.type === 'rolling_boulder') {
            if (
                playerBike.jumpHeight <
                obstacle.height * 0.65
            ) {
                applyPlayerImpact(obstacle, 1.15);
            }

            continue;
        }
        if (
            obstacle.type === 'log' ||
            obstacle.type === 'barrier' || obstacle.type === 'wooden_gate' || obstacle.type === 'iron_gate' || obstacle.type === 'cone' || obstacle.type === 'fallen_branch'
        ) {
            const requiredJump =
                obstacle.height + 9;

            if (
                playerBike.jumpHeight < requiredJump
            ) {
                applyPlayerImpact(obstacle, 0.85);
            }
            continue;
        }

        // Резервное столкновение для новых декораций-препятствий: новый тип
        // из OBSTACLE_TYPES не останется чисто визуальным до добавления особых правил.
        if (OBSTACLE_TYPES[obstacle.type] && playerBike.grounded) {
            applyPlayerImpact(obstacle, Math.max(0.65, playerBike.velocityX * 0.68));
        }
    }
}

// =========================================
// СТОЛКНОВЕНИЯ БОТОВ
// =========================================

function applyBotImpact(
    bike,
    obstacle,
    speedFactor = 0.5,
    duration = 34
) {
    const botHitBy = ensureBotHitMap(obstacle);
    const previousHitFrame = botHitBy.get(bike.botIndex);
    if (REPEATING_GROUND_HAZARDS.has(obstacle.type)) {
        if (previousHitFrame !== undefined &&
            frameCounter - previousHitFrame < GROUND_HAZARD_REHIT_FRAMES) return;
        botHitBy.set(bike.botIndex, frameCounter);
    } else {
        if (previousHitFrame !== undefined) return;
        botHitBy.set(bike.botIndex, frameCounter);
    }

    bike.impactSlowTimer = duration;

    if (
        bike.abilities?.shieldCharges > 0
    ) {
        bike.abilities.shieldCharges--;

        bike.shieldActiveTimer = 52;

        speedFactor = Math.max(
            speedFactor,
            0.78
        );

        duration = Math.min(
            duration,
            18
        );

        bike.impactSlowTimer = duration;
    }

    const roughObstacle = ['rock', 'rolling_boulder', 'rolling_wheel', 'log', 'fallen_branch', 'crank_rack'].includes(obstacle.type);
    if (roughObstacle) {
        const stability = Math.max(0, Number(bike.stability) || 0);
        speedFactor = 1 - (1 - speedFactor) * Math.exp(-stability / 110);
        duration = Math.round(duration * Math.exp(-stability / 450));
        bike.impactSlowTimer = duration;
        const severity = ['rolling_boulder', 'rolling_wheel'].includes(obstacle.type) ? 1.35 : obstacle.type === 'rock' ? 1.2 : 1;
        const impactForce = bike.velocityX * severity / 3;
        const impactDirection = obstacle.type === 'rock' ? -1 : 1;
        applyImpactPitchImpulse(bike, impactForce, impactDirection);
        maybeFlipFromImpact(bike, impactForce, impactDirection);
    }

    const reducedSpeed = Math.max(
        0.35,
        bike.velocityX * speedFactor
    );

    bike.impactSpeedLimit = reducedSpeed;

    bike.velocityX = Math.min(
        bike.velocityX,
        reducedSpeed
    );
}

function updateBotCollisions(bike) {
    const collisionHalfWidth = getBikeObstacleHalfWidth(bike);
    for (const obstacle of obstacles) {
        const botHitBy = ensureBotHitMap(obstacle);
        if (botHitBy.has(bike.botIndex) &&
            !isTouchingObstacle(bike, obstacle)) {
            botHitBy.delete(bike.botIndex);
        }
        if (
            obstacle.x + obstacle.width <
            bike.x - collisionHalfWidth
        ) {
            continue;
        }

        if (
            obstacle.x >
            bike.x + collisionHalfWidth
        ) {
            break;
        }

        if (!isTouchingObstacle(bike, obstacle)) {
            continue;
        }

        if (obstacle.type === 'pit' || obstacle.type === 'bridge_gap' || obstacle.type === 'cliff' || obstacle.type === 'loose_planks') {
            // Боты планируют прыжок через каждый разрыв заранее. Даже если
            // прыжок не добрал высоту, пропасть не выводит соперника из гонки.
            continue;
        }

        if (obstacle.type === 'pulse_gate') {
            if (Math.sin(frameCounter * 0.045 + obstacle.x) > 0.15) continue;
            if (bike.jumpHeight < obstacle.height + 8) applyBotImpact(bike, obstacle, 0.5, 38);
            continue;
        }
        if (['smith_hammer', 'mill_paddle', 'crank_rack'].includes(obstacle.type)) {
            const clearHeight = obstacle.type === 'smith_hammer' ? 28 : obstacle.type === 'mill_paddle' ? 32 : 23;
            if (isTimedObstacleActive(obstacle, frameCounter) && bike.jumpHeight < clearHeight) {
                applyBotImpact(bike, obstacle, 0.48, 40);
            }
            continue;
        }
        if (obstacle.type === 'mud' || obstacle.type === 'water_splash' || obstacle.type === 'ice_patch' || obstacle.type === 'wind_fan' || obstacle.type === 'forge_slag' || obstacle.type === 'ford_stones' || obstacle.type === 'metal_grate') {
            if (bike.grounded) {
                const factor = obstacle.type === 'metal_grate' ? 0.72 : obstacle.type === 'wind_fan' ? 0.28 : obstacle.type === 'ice_patch' ? 0.52 : obstacle.type === 'water_splash' ? 0.42 : obstacle.type === 'forge_slag' ? 0.48 : obstacle.type === 'ford_stones' ? 0.62 : 0.58;
                applyBotImpact(bike, obstacle, factor, obstacle.type === 'metal_grate' ? 42 : obstacle.type === 'ice_patch' ? 24 : 48);
            }
            continue;
        }
        if (obstacle.type === 'cobblestones' || obstacle.type === 'plank_bridge') {
            if (bike.grounded) {
                const factor = obstacle.type === 'cobblestones' ? 0.6 : 0.74;
                applyBotImpact(bike, obstacle, factor, 36);
            }
            continue;
        }
        if (obstacle.type === 'ramp') continue;

        if (obstacle.type === 'rolling_wheel') {
            if (bike.jumpHeight < Math.max(10, obstacle.height * 0.65)) {
                applyBotImpact(bike, obstacle, 0.42, 46);
            }
            continue;
        }
        if (obstacle.type === 'rock' || obstacle.type === 'rolling_boulder') {
            if (
                bike.jumpHeight <
                Math.max(10, obstacle.height * 0.65)
            ) {
                applyBotImpact(
                    bike,
                    obstacle,
                    0.38,
                    46
                );
            }

            continue;
        }

        if (
            obstacle.type === 'log' ||
            obstacle.type === 'barrier' || obstacle.type === 'wooden_gate' || obstacle.type === 'iron_gate' || obstacle.type === 'cone' || obstacle.type === 'fallen_branch'
        ) {
            if (
                bike.jumpHeight <
                obstacle.height + 9
            ) {
                applyBotImpact(
                    bike,
                    obstacle,
                    0.45,
                    38
                );
            }
            continue;
        }

        // Новые добавленные в OBSTACLE_TYPES объекты тоже должны иметь эффект,
        // даже если для их типа ещё не задана отдельная настройка столкновения.
        if (OBSTACLE_TYPES[obstacle.type] && bike.grounded) {
            applyBotImpact(bike, obstacle, 0.62, 36);
        }
    }
}

// =========================================
// ПРОВЕРКА ФИНИША
// =========================================

function setHistoryCinematicMode(active) {
    document.documentElement?.classList.toggle('history-cinematic', Boolean(active));
}

function finishRace(playerWon, reason = 'finish') {
    if (raceFinished) return;

    setHistoryCinematicMode(false);
    raceFinished = true;
    raceRunning = false;
    animationId = null;
    input = {
        accelerating: false,
        braking: false,
        reversing: false,
        jumpRequested: false
    };
    if (raceAutosaveBatchActive) {
        endAutosaveBatch();
        raceAutosaveBatchActive = false;
    }

    if (typeof callbackOnRaceEnd !== 'function') {
        console.error('Не задан обработчик завершения гонки.');
        return;
    }

    try {
        const result = callbackOnRaceEnd(
            Boolean(playerWon),
            reason,
            raceTimeMs,
            collectedRaceCoins
        );
        if (result && typeof result.catch === 'function') {
            result.catch(error => {
                console.error('Ошибка обработки результата гонки:', error);
            });
        }
    } catch (error) {
        console.error('Ошибка обработки результата гонки:', error);
    }
}

export function stopRace() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
    }
    animationId = null;
    raceRunning = false;
    raceFinished = true;
    raceStarted = false;
    historyVictoryOutro = null;
    setHistoryCinematicMode(false);
    input = { accelerating: false, braking: false, reversing: false, jumpRequested: false };
    if (raceAutosaveBatchActive) {
        endAutosaveBatch();
        raceAutosaveBatchActive = false;
    }
}

function completeHistoryVictoryOutro() {
    if (!historyVictoryOutro || raceFinished) return;
    historyVictoryOutro = null;
    finishRace(true, 'finish');
}

function startHistoryVictoryOutro() {
    const chapter = Number(currentTrack?.historyChapter) || 0;
    const chapterLength = HISTORY_TRACKS_DB.filter(track => Number(track.historyChapter) === chapter).length;
    if (
        !currentTrack?.isHistory ||
        Number(currentTrack.historyStage) !== chapterLength ||
        !(botBike?.visuals?.draisine || botBike?.visuals?.macmillan || botBike?.visuals?.highWheelerBoss) ||
        !playerBike
    ) {
        return false;
    }
    if (historyVictoryOutro) return true;

    const finishCliff = obstacles.find(obstacle => obstacle.id === `${currentTrack.id}-finish-cliff`);
    const targetX = finishCliff
        ? Math.max(0, finishCliff.x - 105)
        : Math.max(0, playerBike.x - Math.max(90, Math.min(150, viewWidth * 0.15)));
    const approachStartX = Math.max(
        0,
        targetX - Math.max(260, Math.min(viewWidth * 0.65, 650))
    );
    // Соперник должен подъехать к обрыву с безопасной стороны, даже если
    // обычная гонка уже успела провести его дальше точки финальной сцены.
    botBike.x = Math.max(approachStartX, Math.min(targetX, botBike.x));
    botBike.previousX = botBike.x;
    botBike.velocityX = 0;
    botBike.grounded = true;
    botBike.jumpHeight = 0;
    botBike.rampLift = 0;
    botBike.pitchAngle = 0;
    botBike.pitchVelocity = 0;
    botBike.historyVictoryPhase = 'approach';
    botBike.historyVictoryPhaseFrame = 0;
    // Останавливаем игрока на месте финиша; кадр центрируется между ним и Карлом.
    playerBike.previousX = playerBike.x;
    playerBike.velocityX = 0;
    playerBike.grounded = true;
    playerBike.jumpHeight = 0;
    playerBike.jumpVelocity = 0;
    playerBike.rampLift = 0;
    playerBike.airY = null;
    playerBike.currentRamp = null;
    playerBike.pitchAngle = Math.atan2(
        getGroundY(playerBike.x + 25, 0) - getGroundY(playerBike.x - 25, 0),
        50
    );
    playerBike.pitchVelocity = 0;
    playerBike.historyVictoryPhase = 'approach';
    playerBike.historyVictoryPhaseFrame = 0;
    playerBike.historyVictoryRunnerX = playerBike.x - 10;
    input = { accelerating: false, braking: false, reversing: false, jumpRequested: false };
    const approachDistance = Math.max(0, targetX - botBike.x);
    historyVictoryOutro = {
        phase: 'approach',
        phaseFrame: 0,
        targetX,
        approachStartX: botBike.x,
        approachFrames: clamp(Math.round(approachDistance / 7.5), 22, 92),
        runnerX: null,
        isLallement: chapter === 3,
        elapsed: 0
    };
    setHistoryCinematicMode(true);
    cameraX = Math.max(0, (playerBike.x + botBike.x) * 0.5 - viewWidth * 0.5);
    return true;
}

function updateHistoryVictoryOutro() {
    const outro = historyVictoryOutro;
    if (!outro) return;
    if (!botBike || !playerBike) {
        completeHistoryVictoryOutro();
        return;
    }

    frameCounter++;
    outro.elapsed++;
    // Даже если камера или рендер сцены дали сбой, гонка завершится и
    // обработчик выдаст награды за победу.
    if (outro.elapsed >= 540) {
        completeHistoryVictoryOutro();
        return;
    }
    const sceneCenter = ['rideAway', 'endFade'].includes(outro.phase)
        ? playerBike.x
        : (playerBike.x + botBike.x) * 0.5;
    const cameraTarget = Math.max(0, sceneCenter - viewWidth * 0.5);
    cameraX += (cameraTarget - cameraX) * (outro.phase === 'approach' ? 0.095 : 0.065);

    const oldX = botBike.x;
    botBike.previousX = oldX;
    botBike.grounded = true;
    botBike.jumpHeight = 0;
    botBike.rampLift = 0;
    botBike.pitchAngle = 0;
    botBike.pitchVelocity = 0;

    const enterPhase = phase => {
        outro.phase = phase;
        outro.phaseFrame = 0;
    };

    if (outro.phase === 'approach') {
        const previousX = botBike.x;
        const progress = (outro.phaseFrame + 1) / outro.approachFrames;
        botBike.x = outro.approachStartX +
            (outro.targetX - outro.approachStartX) * easeOutCubic(progress);
        botBike.velocityX = botBike.x - previousX;
        if (progress >= 1) {
            botBike.x = outro.targetX;
            botBike.velocityX = 0;
            enterPhase('brake');
        } else {
            outro.phaseFrame++;
        }
    } else if (outro.phase === 'brake') {
        botBike.velocityX = 0;
        if (outro.phaseFrame >= 13) {
            enterPhase('settle');
        } else {
            outro.phaseFrame++;
        }
    } else if (outro.phase === 'settle') {
        botBike.velocityX = 0;
        if (outro.phaseFrame >= 17) {
            outro.runnerX = botBike.x - 7;
            enterPhase('dismount');
        } else {
            outro.phaseFrame++;
        }
    } else if (outro.phase === 'dismount') {
        botBike.velocityX = 0;
        const dismountProgress = easeOutCubic((outro.phaseFrame + 1) / 28);
        outro.runnerX = botBike.x - 7 - 20 * dismountProgress;
        if (outro.phaseFrame >= 27) enterPhase('look');
        else outro.phaseFrame++;
    } else if (outro.phase === 'look') {
        botBike.velocityX = 0;
        outro.runnerX = botBike.x - 27;
        if (outro.phaseFrame >= 31) enterPhase(outro.isLallement ? 'showcase' : 'wave');
        else outro.phaseFrame++;
    } else if (outro.phase === 'showcase') {
        botBike.velocityX = 0;
        outro.runnerX = botBike.x - 27;
        if (outro.phaseFrame >= 43) enterPhase('wave');
        else outro.phaseFrame++;
    } else if (outro.phase === 'wave') {
        botBike.velocityX = 0;
        outro.runnerX = botBike.x - 27;
        if (outro.phaseFrame >= 57) enterPhase('mount');
        else outro.phaseFrame++;
    } else if (outro.phase === 'mount') {
        botBike.velocityX = 0;
        const mountProgress = easeInOutCubic((outro.phaseFrame + 1) / 28);
        outro.runnerX = botBike.x - 27 + mountProgress * 20;
        if (outro.phaseFrame >= 27) enterPhase('turn');
        else outro.phaseFrame++;
    } else if (outro.phase === 'turn') {
        botBike.velocityX = 0;
        if (outro.phaseFrame >= 31) enterPhase('rideAway');
        else outro.phaseFrame++;
    } else if (outro.phase === 'rideAway') {
        const rideProgress = clamp((outro.phaseFrame + 1) / 24, 0, 1);
        const rideSpeed = 0.35 + 5.15 * easeInOutCubic(rideProgress);
        botBike.x -= rideSpeed;
        botBike.velocityX = botBike.x - oldX;
        if (botBike.x < cameraX - 65 || outro.phaseFrame >= 150) {
            enterPhase('endFade');
            botBike.velocityX = 0;
        } else {
            outro.phaseFrame++;
        }
    } else if (outro.phase === 'endFade') {
        botBike.velocityX = 0;
        if (outro.phaseFrame >= 19) {
            completeHistoryVictoryOutro();
            return;
        }
        outro.phaseFrame++;
    }

    if (outro.phase === 'dismount') {
        playerBike.historyVictoryPhase = outro.phaseFrame < 22 ? 'dismount' : 'watch';
        playerBike.historyVictoryPhaseFrame = outro.phaseFrame;
    } else if (['look', 'showcase', 'wave', 'mount', 'turn', 'rideAway', 'endFade'].includes(outro.phase)) {
        playerBike.historyVictoryPhase = 'watch';
        playerBike.historyVictoryPhaseFrame = outro.phaseFrame;
    }
    playerBike.historyVictoryRunnerX = playerBike.x - 10;

    botBike.historyVictoryPhase = outro.phase;
    botBike.historyVictoryPhaseFrame = outro.phaseFrame;
    botBike.historyVictoryRunnerX = outro.runnerX;
}

function checkFinish() {
    const playerFinished =
        playerBike.x >= finishX;

    // В спринте призрак показывает рекорд, но не завершает гонку за игрока.
    // Игрок всегда доезжает до финиша, а результат сверяется со временем рекорда.
    if (currentTrack?.id === 'sprint') {
        if (playerFinished) {
            const bestTime = Number(player.bestSprintTime) || 0;
            const isRecordBeaten =
                !bestTime ||
                raceTimeMs <= bestTime - MIN_SPRINT_RECORD_IMPROVEMENT_MS;
            finishRace(isRecordBeaten, 'finish');
        }
        return;
    }

    const finishedBots = activeBots.filter(
        bike => bike.x >= finishX
    );

    if (
        !playerFinished &&
        finishedBots.length === 0
    ) {
        return;
    }

    if (
        playerFinished &&
        finishedBots.length === 0
    ) {
        if (startHistoryVictoryOutro()) return;
        finishRace(true, 'finish');
        return;
    }

    if (
        !playerFinished &&
        finishedBots.length > 0
    ) {
        finishRace(false, 'bot-finish');
        return;
    }

    // Сравниваем момент пересечения финиша, а не координату через кадр:
    // бот мог ехать дальше после финиша и ошибочно считаться победителем.
    const playerFinishFrame = Number.isFinite(playerBike.finishFrame)
        ? playerBike.finishFrame
        : frameCounter;
    const earliestBotFinishFrame = Math.min(...finishedBots.map(bike =>
        Number.isFinite(bike.finishFrame) ? bike.finishFrame : frameCounter
    ));
    const playerWon = playerFinishFrame <= earliestBotFinishFrame;
    if (playerWon && startHistoryVictoryOutro()) return;
    finishRace(playerWon, 'photo-finish');
}

function getSprintGhostProgress(elapsedMs, bestTimeMs) {
    const durationSeconds = Math.max(0.001, (Number(bestTimeMs) || 0) / 1000);
    const elapsedSeconds = clamp(
        (Number(elapsedMs) || 0) / 1000,
        0,
        durationSeconds
    );
    const accelerationSeconds = Math.min(
        SPRINT_GHOST_ACCELERATION_SECONDS,
        durationSeconds * 0.2
    );
    const totalDistanceTime = Math.max(
        0.001,
        durationSeconds - accelerationSeconds / 2
    );

    // Призрак разгоняется с нуля, затем держит темп и достигает финиша
    // ровно в момент личного рекорда.
    const traveledDistanceTime = elapsedSeconds < accelerationSeconds
        ? elapsedSeconds * elapsedSeconds / (2 * accelerationSeconds)
        : elapsedSeconds - accelerationSeconds / 2;

    return clamp(traveledDistanceTime / totalDistanceTime, 0, 1);
}

// =========================================
// ОТРИСОВКА ФОНА
// =========================================

function drawMacmillanHistoryLandmarks() {
    if (!currentTrack?.isHistory || Number(currentTrack.historyChapter) !== 2) return;

    const stage = Number(currentTrack.historyStage) || 1;
    const scale = clamp(viewHeight / 420, 0.72, 1.15);
    const spacing = 390 * scale;
    const cycle = viewWidth + spacing;
    const baseY = viewHeight * 0.645;
    const buildingColor = ['#574234', '#4c5b4e', '#6d6658', '#625044', '#4d3a35'][stage - 1] || '#574234';

    for (let i = -1; i < Math.ceil(viewWidth / spacing) + 2; i++) {
        const rawX = i * spacing - cameraX * 0.14;
        const x = ((rawX % cycle) + cycle) % cycle - spacing * 0.35;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = buildingColor;
        ctx.strokeStyle = 'rgba(35, 29, 25, .7)';
        ctx.lineWidth = 3 * scale;

        if (stage === 1 || stage === 5) {
            const width = 88 * scale;
            const height = (stage === 5 ? 62 : 54) * scale;
            ctx.fillRect(x, baseY - height, width, height);
            ctx.beginPath();
            ctx.moveTo(x - 8 * scale, baseY - height);
            ctx.lineTo(x + width * 0.5, baseY - height - 28 * scale);
            ctx.lineTo(x + width + 8 * scale, baseY - height);
            ctx.closePath();
            ctx.fillStyle = stage === 5 ? '#3d302c' : '#46332b';
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#2b2726';
            ctx.fillRect(x + width * 0.72, baseY - height - 35 * scale, 11 * scale, 34 * scale);
            const glow = 0.55 + Math.sin(frameCounter * 0.045 + i) * 0.18;
            ctx.fillStyle = `rgba(251, 146, 60, ${glow})`;
            ctx.fillRect(x + width * 0.17, baseY - height * 0.48, 17 * scale, 14 * scale);
            ctx.fillStyle = '#352922';
            ctx.fillRect(x + width * 0.52, baseY - 27 * scale, 13 * scale, 27 * scale);

            if (stage === 5) {
                for (let flag = 0; flag < 2; flag++) {
                    const flagX = x + (flag ? width + 18 * scale : -15 * scale);
                    ctx.strokeStyle = '#5a4434';
                    ctx.lineWidth = 2 * scale;
                    ctx.beginPath();
                    ctx.moveTo(flagX, baseY - 58 * scale);
                    ctx.lineTo(flagX, baseY + 3 * scale);
                    ctx.stroke();
                    ctx.fillStyle = flag ? '#d6a85f' : '#8e6245';
                    ctx.beginPath();
                    ctx.moveTo(flagX, baseY - 56 * scale);
                    ctx.lineTo(flagX + 25 * scale, baseY - 49 * scale);
                    ctx.lineTo(flagX, baseY - 41 * scale);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        } else if (stage === 2) {
            const cx = x + 48 * scale;
            const cy = baseY - 30 * scale;
            const radius = 30 * scale;
            ctx.fillStyle = 'rgba(42, 91, 91, .48)';
            ctx.fillRect(x - 18 * scale, baseY - 9 * scale, 132 * scale, 18 * scale);
            ctx.strokeStyle = '#493b2c';
            ctx.lineWidth = 5 * scale;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(frameCounter * 0.008 + i * 0.4);
            for (let spoke = 0; spoke < 8; spoke++) {
                ctx.rotate(Math.PI / 4);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -radius);
                ctx.stroke();
                ctx.fillStyle = '#8b5a2b';
                ctx.fillRect(-4 * scale, -radius - 7 * scale, 8 * scale, 14 * scale);
            }
            ctx.restore();
            ctx.fillStyle = '#d8c39a';
            ctx.beginPath();
            ctx.arc(cx, cy, 5 * scale, 0, Math.PI * 2);
            ctx.fill();
        } else if (stage === 3) {
            const wallY = baseY - 22 * scale;
            for (let stone = 0; stone < 5; stone++) {
                const stoneX = x + stone * 21 * scale;
                ctx.fillStyle = stone % 2 ? '#77766a' : '#8a8170';
                ctx.fillRect(stoneX, wallY - (stone % 2) * 7 * scale, 20 * scale, 19 * scale);
                ctx.strokeRect(stoneX, wallY - (stone % 2) * 7 * scale, 20 * scale, 19 * scale);
            }
            ctx.fillStyle = '#6b5238';
            ctx.fillRect(x + 112 * scale, baseY - 62 * scale, 5 * scale, 62 * scale);
            ctx.fillStyle = '#bca77f';
            ctx.beginPath();
            ctx.moveTo(x + 96 * scale, baseY - 58 * scale);
            ctx.lineTo(x + 115 * scale, baseY - 75 * scale);
            ctx.lineTo(x + 134 * scale, baseY - 58 * scale);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(x + 98 * scale, baseY - 58 * scale, 34 * scale, 21 * scale);
            ctx.fillStyle = '#4b4034';
            ctx.font = `bold ${9 * scale}px serif`;
            ctx.textAlign = 'center';
            ctx.fillText('1840', x + 115 * scale, baseY - 44 * scale);
        } else {
            const postX = x + 20 * scale;
            const postTop = baseY - 76 * scale;
            ctx.strokeStyle = '#5a3a27';
            ctx.lineWidth = 7 * scale;
            for (let post = 0; post < 4; post++) {
                const px = postX + post * 34 * scale;
                ctx.beginPath();
                ctx.moveTo(px, postTop + (post % 2) * 8 * scale);
                ctx.lineTo(px, baseY + 4 * scale);
                ctx.stroke();
            }
            ctx.lineWidth = 4 * scale;
            ctx.beginPath();
            ctx.moveTo(postX, postTop + 11 * scale);
            ctx.quadraticCurveTo(postX + 50 * scale, postTop + 28 * scale, postX + 102 * scale, postTop + 11 * scale);
            ctx.moveTo(postX, postTop + 32 * scale);
            ctx.quadraticCurveTo(postX + 50 * scale, postTop + 48 * scale, postX + 102 * scale, postTop + 32 * scale);
            ctx.stroke();
            ctx.fillStyle = '#8d6745';
            ctx.fillRect(postX + 4 * scale, baseY - 13 * scale, 100 * scale, 10 * scale);
        }
        ctx.restore();
    }
}

function drawLallementHistoryLandmarks() {
    if (!currentTrack?.isHistory || Number(currentTrack.historyChapter) !== 3) return;
    const stage = Number(currentTrack.historyStage) || 1;
    const scale = clamp(viewHeight / 420, 0.72, 1.12);
    const spacing = 460 * scale;
    const cycle = viewWidth + spacing;
    const baseY = viewHeight * 0.646;
    for (let i = -1; i < Math.ceil(viewWidth / spacing) + 2; i++) {
        const rawX = i * spacing - cameraX * 0.12;
        const x = ((rawX % cycle) + cycle) % cycle - spacing * 0.25;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = stage === 3 ? '#738598' : '#4b5661';
        ctx.fillStyle = stage === 3 ? '#718294' : '#3d4852';
        ctx.lineWidth = 2.2 * scale;
        if (stage === 1 || stage === 4 || stage === 6) {
            ctx.fillRect(x + 8 * scale, baseY - 54 * scale, 78 * scale, 54 * scale);
            ctx.beginPath();
            ctx.moveTo(x, baseY - 54 * scale);
            ctx.lineTo(x + 47 * scale, baseY - 78 * scale);
            ctx.lineTo(x + 94 * scale, baseY - 54 * scale);
            ctx.stroke();
            // Taller chimneys and a faint smoke trail distinguish the forge
            // stages from the ordinary village backdrop.
            if (stage === 1 || stage === 4 || stage === 6) {
                ctx.fillRect(x + 68 * scale, baseY - 76 * scale, 10 * scale, 27 * scale);
                ctx.strokeStyle = '#7b6d61';
                ctx.beginPath();
                for (let puff = 0; puff < 3; puff++) {
                    const smokeX = x + (72 + puff * 7) * scale + Math.sin(frameCounter * 0.018 + i + puff) * 3 * scale;
                    const smokeY = baseY - (88 + puff * 9) * scale;
                    ctx.moveTo(smokeX + 4 * scale, smokeY);
                    ctx.arc(smokeX, smokeY, (4 + puff) * scale, 0, Math.PI * 2);
                }
                ctx.stroke();
            }
            for (let windowIndex = 0; windowIndex < 3; windowIndex++) {
                ctx.fillStyle = '#d4a86b';
                ctx.fillRect(x + (20 + windowIndex * 22) * scale, baseY - 36 * scale, 8 * scale, 10 * scale);
            }
            if (stage === 4 || stage === 6) {
                ctx.fillStyle = stage === 6 ? '#d9b578' : '#8b5a2b';
                ctx.fillRect(x + 38 * scale, baseY - 27 * scale, 18 * scale, 27 * scale);
                ctx.strokeStyle = '#d1b58b';
                ctx.beginPath();
                ctx.moveTo(x + 47 * scale, baseY - 27 * scale);
                ctx.lineTo(x + 47 * scale, baseY - 4 * scale);
                ctx.stroke();
            }
        } else if (stage === 2 || stage === 5) {
            const cx = x + 48 * scale;
            const cy = baseY - 42 * scale;
            const r = (stage === 5 ? 38 : 29) * scale;
            ctx.strokeStyle = '#25313a';
            ctx.beginPath();
            ctx.arc(cx, cy, r + 4 * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            for (let spoke = 0; spoke < 8; spoke++) {
                const angle = spoke * Math.PI / 4;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                ctx.stroke();
            }
            ctx.fillRect(cx - 2 * scale, cy, 4 * scale, baseY - cy);
            if (stage === 5) {
                // A small pennant next to the tall-wheel workshop signals
                // the risky high-wheel era without adding a collision object.
                ctx.strokeStyle = '#5c6670';
                ctx.beginPath();
                ctx.moveTo(x + 99 * scale, baseY - 62 * scale);
                ctx.lineTo(x + 99 * scale, baseY);
                ctx.stroke();
                ctx.fillStyle = '#a64f43';
                ctx.beginPath();
                ctx.moveTo(x + 100 * scale, baseY - 62 * scale);
                ctx.lineTo(x + 121 * scale, baseY - 55 * scale);
                ctx.lineTo(x + 100 * scale, baseY - 48 * scale);
                ctx.closePath();
                ctx.fill();
            }
        } else {
            ctx.fillRect(x + 8 * scale, baseY - 34 * scale, 86 * scale, 34 * scale);
            ctx.fillRect(x + 23 * scale, baseY - 54 * scale, 8 * scale, 20 * scale);
            ctx.fillRect(x + 63 * scale, baseY - 54 * scale, 8 * scale, 20 * scale);
            ctx.beginPath();
            ctx.moveTo(x + 8 * scale, baseY - 34 * scale);
            ctx.lineTo(x + 48 * scale, baseY - 54 * scale);
            ctx.lineTo(x + 94 * scale, baseY - 34 * scale);
            ctx.stroke();
            // Flat 100 m stage gets distance boards and bunting in the
            // background; these remain purely decorative and never collide.
            ctx.fillStyle = '#e7d9b8';
            ctx.fillRect(x + 56 * scale, baseY - 31 * scale, 32 * scale, 17 * scale);
            ctx.fillStyle = '#46515b';
            ctx.font = `bold ${9 * scale}px sans-serif`;
            ctx.textAlign = 'center';
            const distanceMarker = [25, 50, 75, 100][Math.abs(i) % 4];
            ctx.fillText(`${distanceMarker} m`, x + 72 * scale, baseY - 19 * scale);
            ctx.strokeStyle = '#81584b';
            ctx.lineWidth = 1.5 * scale;
            for (let flag = 0; flag < 4; flag++) {
                const flagX = x + (14 + flag * 24) * scale;
                const flagY = baseY - (60 - (flag % 2) * 4) * scale;
                ctx.beginPath();
                ctx.moveTo(flagX, flagY);
                ctx.lineTo(flagX + 10 * scale, flagY + 5 * scale);
                ctx.lineTo(flagX, flagY + 10 * scale);
                ctx.closePath();
                ctx.fillStyle = flag % 2 ? '#a64f43' : '#e5d3a2';
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function getBackgroundGradient(cacheKey, x0, y0, x1, y1, stops) {
    // The gradient geometry and palette remain unchanged during a race. Reuse
    // these CanvasGradient objects instead of allocating them on every frame.
    // The victory camera zoom is animated, so gradients are built fresh there.
    const key = `${cacheKey}:${viewHeight.toFixed(3)}:${baseRaceZoom}`;
    if (!historyVictoryOutro && backgroundGradientCache.has(key)) {
        return backgroundGradientCache.get(key);
    }

    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    if (!historyVictoryOutro) backgroundGradientCache.set(key, gradient);
    return gradient;
}

function drawBackground() {
    const palette = getTrackPalette();

    // 1. Градиент неба
    const gradient = getBackgroundGradient(
        `sky:${palette.skyTop}:${palette.skyMid}:${palette.skyBottom}`,
        0,
        0,
        0,
        viewHeight,
        [[0, palette.skyTop], [0.58, palette.skyMid], [1, palette.skyBottom]]
    );

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // 2. Солнце или Луна со свечением вдали
    const isNight = ['#1d233f', '#090f2b', '#1a263c', '#281b2c'].includes(palette.skyTop);
    ctx.save();
    ctx.beginPath();
    const celestialRadius = viewWidth * 0.08;
    const celestialCycle = viewWidth + celestialRadius * 2;
    const celestialTravel = cameraX * 0.015;
    // Полный цикл идёт от позиции за правым краем до позиции за левым.
    // Поэтому при повторе солнце снова входит справа, а не возникает в кадре.
    const celestialOffset = ((celestialTravel % celestialCycle) + celestialCycle) % celestialCycle;
    const celestialX = viewWidth + celestialRadius - celestialOffset;
    const celestialY = viewHeight * 0.35;
    ctx.arc(celestialX, celestialY, celestialRadius, 0, Math.PI * 2);
    ctx.fillStyle = isNight ? 'rgba(226, 232, 240, 0.9)' : 'rgba(253, 224, 71, 0.95)';
    ctx.shadowColor = isNight ? 'rgba(148, 163, 184, 0.6)' : 'rgba(250, 204, 21, 0.6)';
    ctx.shadowBlur = 60;
    ctx.fill();
    ctx.restore();

    // 3. Многослойные горы с вертикальным градиентом (туманом)
    const drawMountainLayer = (
        color,
        parallax,
        heightFactor,
        phase,
        hasOutline
    ) => {
        ctx.beginPath();
        ctx.moveTo(0, viewHeight * 0.58);

        for (let x = 0; x <= viewWidth + 24; x += 18) {
            const wx = x + cameraX * parallax;

            const y =
                viewHeight * 0.52 +
                Math.sin(wx * 0.0021 + phase) * heightFactor +
                Math.sin(wx * 0.0053 + phase * 1.8) * heightFactor * 0.28 +
                Math.sin(wx * 0.0008 + phase) * heightFactor * 0.45;

            ctx.lineTo(x, y);
        }

        ctx.lineTo(viewWidth, viewHeight);
        ctx.lineTo(0, viewHeight);

        ctx.closePath();

        // Градиент для тумана у основания гор
        const mGrad = getBackgroundGradient(
            `mountain:${color}:${palette.skyBottom}`,
            0,
            viewHeight * 0.4,
            0,
            viewHeight,
            [[0, color], [1, palette.skyBottom]]
        );
        
        ctx.fillStyle = mGrad;
        ctx.fill();

        // Подсветка хребта для объема
        if (hasOutline) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.stroke();
        }
    };

    drawMountainLayer(
        palette.far,
        0.12,
        34 + getTrackTerrain().amplitude * 0.22,
        0.6,
        false
    );

    drawMountainLayer(
        palette.near,
        0.22,
        22 + getTrackTerrain().amplitude * 0.16,
        2.1,
        true
    );

    drawMacmillanHistoryLandmarks();
    drawLallementHistoryLandmarks();

    if (!currentTrack?.isHistory && [5, 8, 10].includes(currentTrackLevel)) {
        ctx.fillStyle = currentTrackLevel === 5
            ? 'rgba(235,248,255,0.48)'
            : currentTrackLevel === 8
                ? 'rgba(190,190,225,0.28)'
                : 'rgba(255,190,140,0.25)';

        for (let i = 0; i < 5; i++) {
            const x =
                (
                    (i * 190 - cameraX * 0.16) %
                    (viewWidth + 220) +
                    viewWidth +
                    220
                ) %
                (viewWidth + 220) - 100;

            const peakY =
                viewHeight * 0.42 +
                Math.sin(i * 2.4 + currentTrackLevel) * 18;

            const peakHeight =
                32 +
                (i % 3) * 13 +
                currentTrackLevel * 1.2;

            ctx.beginPath();
            ctx.moveTo(x - 42, peakY + peakHeight);
            ctx.lineTo(x, peakY - peakHeight * 0.35);
            ctx.lineTo(x + 48, peakY + peakHeight);

            ctx.closePath();
            ctx.fill();
        }
    }
}


// =========================================
// БОНУСЫ И МОНЕТЫ НА ТРАССЕ (2-е ОБНОВЛЕНИЕ)
// =========================================

function isObstacleNear(x, margin = 60) {
    return obstacles.some(obs => {
        const left = obs.x - margin;
        const right = obs.x + obs.width + margin;
        return x >= left && x <= right;
    });
}

function findFreeTrackSpot(startX, minSpacing = 120, maxAttempts = 15) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const offset = (attempt === 0 ? 0 : (attempt % 2 === 1 ? attempt * 85 : -attempt * 85));
        const testX = startX + offset;
        if (testX > 1100 && testX < finishX - 700 && !isObstacleNear(testX, minSpacing)) {
            return testX;
        }
    }
    return null;
}

function createCollectibles() {
    if (currentTrack?.id === 'sprint') {
        return [];
    }

    const items = [];
    const usableLength = Math.max(1000, finishX - 1500);

    // 1. Монетки высоко в воздухе над трамплинами (гарантированно выше рампы и препятствий)
    let rampIndex = 0;
    obstacles.forEach(obstacle => {
        if (obstacle.type === 'ramp') {
            rampIndex++;
            if (rampIndex % 2 !== 1) return; // Каждый второй трамплин

            const rampTopX = obstacle.x + obstacle.width;
            const baseY = getGroundY(rampTopX, 0);
            const rampH = Number(obstacle.height) || 35;
            const coinCount = 3;

            for (let i = 0; i < coinCount; i++) {
                const t = (i + 1) / (coinCount + 1); // 0.25, 0.5, 0.75
                const arcX = obstacle.x + obstacle.width * 0.4 + t * 130;
                // Монетки висят на 25-70px ВЫШЕ вершины трамплина в воздухе
                const arcY = baseY - rampH - 24 - Math.sin(t * Math.PI) * 45;

                items.push({
                    id: `coin-ramp-${obstacle.id}-${i}`,
                    type: 'coin',
                    x: arcX,
                    y: arcY,
                    value: 10,
                    collected: false
                });
            }
        }
    });

    // 2. Турбо-ускорители (Nitro Boost Pads) — только на гарантированно чистых участках!
    const boosterSpacing = 8500;
    const boosterCount = Math.floor(usableLength / boosterSpacing);
    for (let i = 0; i < boosterCount; i++) {
        const targetX = 2200 + i * boosterSpacing + (Math.random() - 0.5) * 500;
        const bx = findFreeTrackSpot(targetX, 130);
        if (bx !== null && bx < finishX - 800) {
            items.push({
                id: `booster-${i}`,
                type: 'booster',
                x: bx,
                y: 0,
                cooldown: 0
            });
        }
    }

    // 3. Цепочки монеток на дороге — строго там, где нет камней, ям и брёвен!
    const clusterSpacing = 5200;
    const clusterCount = Math.floor(usableLength / clusterSpacing);
    for (let i = 0; i < clusterCount; i++) {
        const targetX = 1500 + i * clusterSpacing + (Math.random() - 0.5) * 500;
        const cx = findFreeTrackSpot(targetX, 100);
        if (cx !== null && cx < finishX - 700) {
            const count = 2 + Math.floor(Math.random() * 2);
            for (let j = 0; j < count; j++) {
                const coinX = cx + j * 45;
                if (!isObstacleNear(coinX, 50)) {
                    items.push({
                        id: `coin-line-${i}-${j}`,
                        type: 'coin',
                        x: coinX,
                        y: null, // вычисляется по рельефу
                        value: 10,
                        collected: false
                    });
                }
            }
        }
    }

    return items;
}

function updateCollectibles() {
    if (!playerBike || raceFinished) return;

    if (powerWarningCooldown > 0) {
        powerWarningCooldown--;
    }

    // Все участники заезда: игрок и боты
    const allBikes = [playerBike, ...activeBots.filter(b => !b.isGhost)];

    collectibles.forEach(item => {
        if (item.type === 'coin') {
            if (item.collected) return;
            const itemY = item.y !== null ? item.y : getGroundY(item.x, 0) - 22;

            for (const bike of allBikes) {
                if (item.collected) break;
                const bx = bike.x;
                const by = bike.grounded
                    ? getGroundY(bike.x, 0)
                    : (bike.airY ?? getGroundY(bike.x, 0) - bike.jumpHeight);
                const dist = Math.hypot(bx - item.x, by - itemY);

                if (dist < 32) {
                    item.collected = true;
                    if (!bike.isBot) {
                        // Игрок собрал монетку — сразу начисляем на баланс!
                        collectedRaceCoins += item.value;
                        player.coins = (Number(player.coins) || 0) + item.value;
                        const coinsEl = document.getElementById('coins-count');
                        if (coinsEl) coinsEl.innerText = Math.floor(player.coins).toLocaleString('ru-RU');
                        const upgradeCoinsEl = document.getElementById('upgrade-coins');
                        if (upgradeCoinsEl) upgradeCoinsEl.innerText = Math.floor(player.coins).toLocaleString('ru-RU');

                        if (typeof playCoinSound === 'function') {
                            try { playCoinSound(); } catch (e) {}
                        }
                        addFloatingText(item.x, itemY - 10, `+${item.value} 🪙`, '#facc15');
                    } else {
                        // Бот перехватил монетку первым!
                        if (typeof playCoinSound === 'function' && Math.abs(bike.x - playerBike.x) < 550) {
                            try { playCoinSound(); } catch (e) {}
                        }
                        addFloatingText(item.x, itemY - 10, `${bike.displayName}: +${item.value} 🪙`, bike.color);
                    }
                }
            }
        } else if (item.type === 'booster') {
            if (item.cooldown > 0) {
                item.cooldown--;
                return;
            }
            const itemY = getGroundY(item.x, 0);

            for (const bike of allBikes) {
                const bx = bike.x;
                const by = bike.grounded
                    ? getGroundY(bike.x, 0)
                    : (bike.airY ?? getGroundY(bike.x, 0) - bike.jumpHeight);

                if (Math.abs(bx - item.x) < 38 && Math.abs(by - itemY) < 32) {
                    item.cooldown = 90;
                    if (!bike.isBot) {
                        playerBike.padBoostSpeed = Math.max(playerBike.velocityX + 3.2, 11);
                        playerBike.padBoostTimer = 50;
                        playerBike.velocityX = playerBike.padBoostSpeed;
                        playerBike.nitroTimer = Math.max(playerBike.nitroTimer, 50);
                        if (typeof playBoostSound === 'function') {
                            try { playBoostSound(); } catch (e) {}
                        }
                        addFloatingText(playerBike.x, by - 40, '⚡ ТУРБО БУСТ! ⚡', '#38bdf8');
                    } else {
                        // Бот наехал на турбо-ускоритель и рванул вперед!
                        bike.padBoostSpeed = Math.max(bike.velocityX + 3.0, (bike.botBaseMaxSpeed || 4) * 1.35);
                        bike.padBoostTimer = 50;
                        bike.velocityX = bike.padBoostSpeed;
                        bike.nitroTimer = Math.max(bike.nitroTimer, 50);
                        if (typeof playBoostSound === 'function' && Math.abs(bike.x - playerBike.x) < 650) {
                            try { playBoostSound(); } catch (e) {}
                        }
                        addFloatingText(bike.x, by - 40, `⚡ ${bike.displayName}: ТУРБО! ⚡`, bike.color);
                    }
                    break;
                }
            }
        }
    });

    updateFloatingTexts();
}

function drawCollectibles() {
    collectibles.forEach(item => {
        const sx = item.x - cameraX;
        if (sx < -80 || sx > viewWidth + 80) return;

        if (item.type === 'coin') {
            if (item.collected) return;
            const sy = item.y !== null ? item.y : getGroundY(item.x, 0) - 22;
            const pulse = Math.sin(frameCounter * 0.12 + item.x * 0.05);
            const scaleX = Math.cos(frameCounter * 0.08 + item.x * 0.03);

            ctx.save();
            ctx.translate(sx, sy + pulse * 2);
            ctx.scale(Math.max(0.2, Math.abs(scaleX)), 1);

            // Золотая сияющая монетка
            ctx.beginPath();
            ctx.arc(0, 0, 11, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 10;
            ctx.fill();

            ctx.lineWidth = 1.8;
            ctx.strokeStyle = '#fef08a';
            ctx.stroke();

            // Внутренний кант
            ctx.beginPath();
            ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
            ctx.strokeStyle = '#b45309';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Знак монетки
            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', 0, 0.5);

            ctx.restore();
        } else if (item.type === 'booster') {
            const halfWidth = 28;
            const backY = getGroundY(item.x - halfWidth, 0);
            const frontY = getGroundY(item.x + halfWidth, 0);
            const trackAngle = Math.atan2(frontY - backY, halfWidth * 2);
            const sy = getGroundY(item.x, 0);

            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(trackAngle);

            // Неоновая стрелка ускорителя, точно уложенная по траектории трассы
            const isReady = (item.cooldown || 0) <= 0;
            const activePulse = (frameCounter * 0.1) % (Math.PI * 2);

            ctx.shadowColor = isReady ? '#38bdf8' : 'transparent';
            ctx.shadowBlur = isReady ? 12 : 0;

            // Разгонная полоса на полотне дороги
            ctx.fillStyle = isReady ? '#0284c7' : 'rgba(71, 85, 105, 0.6)';
            ctx.fillRect(-28, -3, 56, 6);

            // Шевроны >>> вдоль траектории движения
            for (let c = -1; c <= 1; c++) {
                const cx = c * 16;
                const alpha = isReady ? (0.55 + 0.45 * Math.sin(activePulse + c)) : 0.35;
                ctx.strokeStyle = isReady ? `rgba(224, 242, 254, ${alpha})` : 'rgba(148, 163, 184, 0.5)';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(cx - 5, -6);
                ctx.lineTo(cx + 4, 0);
                ctx.lineTo(cx - 5, 6);
                ctx.stroke();
            }

            ctx.restore();
        }
    });
}

// =========================================
// ОБЩАЯ ЛИНИЯ ТРАССЫ
// =========================================

function drawTrack() {
    const palette = getTrackPalette();
    let sampleCount = 0;

    // Reuse the numeric buffer and avoid allocating a point object at every
    // sample on every frame. Sampling positions and precision stay unchanged.
    for (let x = 0; x <= viewWidth + 10; x += 8) {
        trackSurfaceSamples[sampleCount++] = getGroundY(cameraX + x, 0);
    }
    trackSurfaceSamples.length = sampleCount;

    // 1. РИСУЕМ ПОДЗЕМЕЛЬЕ (Сплошная заливка грунта до низа экрана)
    ctx.beginPath();
    ctx.moveTo(0, trackSurfaceSamples[0]);
    for (let i = 1; i < sampleCount; i++) {
        ctx.lineTo(i * 8, trackSurfaceSamples[i]);
    }
    // Замыкаем контур по нижнему краю экрана
    ctx.lineTo(viewWidth + 10, viewHeight);
    ctx.lineTo(0, viewHeight);
    ctx.closePath();

    // Градиент грунта (сверху цвет земли трассы, снизу уходит в темноту)
    const groundGradient = getBackgroundGradient(
        `ground:${palette.near}`,
        0,
        viewHeight * 0.5,
        0,
        viewHeight,
        [[0, palette.near], [1, '#020617']]
    );
    ctx.fillStyle = groundGradient;
    ctx.fill();

    // 2. РИСУЕМ САМУ ДОРОГУ (Широкая полоса по поверхности)
    ctx.beginPath();
    ctx.moveTo(0, trackSurfaceSamples[0]);
    for (let i = 1; i < sampleCount; i++) {
        ctx.lineTo(i * 8, trackSurfaceSamples[i]);
    }

    // Основная толстая линия дороги
    ctx.strokeStyle = palette.road;
    ctx.lineWidth = 32; 
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Яркая верхняя кромка дороги (для красивого контраста)
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Пунктирная разметка посередине дороги
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 2;
    ctx.setLineDash(ROAD_DASH_PATTERN);
    ctx.stroke();
    ctx.setLineDash([]);
}

// =========================================
// ОТРИСОВКА ПРЕПЯТСТВИЙ
// =========================================

function drawObstacle(obstacle) {
    const screenX = obstacle.x - cameraX;

    if (
        screenX < -100 ||
        screenX > viewWidth + 100
    ) {
        return;
    }

    const groundY = getGroundY(obstacle.x, 0);

    const width = obstacle.width;
    const height = obstacle.height;

    if (obstacle.type === 'cobblestones') {
        const stoneColors = ['#8f8271', '#a29480', '#71695e', '#b0a08a'];
        for (let i = 0; i < 6; i++) {
            const stoneWidth = width / 7;
            ctx.fillStyle = stoneColors[i % stoneColors.length];
            ctx.beginPath();
            ctx.ellipse(
                screenX + stoneWidth * (i + 0.65),
                groundY - 2 + (i % 2) * 1.5,
                stoneWidth * 0.42,
                Math.max(3, height * 0.46),
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        return;
    }

    if (obstacle.type === 'metal_grate') {
        ctx.fillStyle = 'rgba(30, 41, 59, .9)';
        ctx.fillRect(screenX, groundY - 7, width, 12);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX, groundY - 8);
        ctx.lineTo(screenX + width, groundY - 8);
        ctx.moveTo(screenX, groundY + 4);
        ctx.lineTo(screenX + width, groundY + 4);
        for (let bar = 0; bar <= 7; bar++) {
            const barX = screenX + bar * width / 7;
            ctx.moveTo(barX, groundY - 8);
            ctx.lineTo(barX, groundY + 4);
        }
        ctx.stroke();
        ctx.fillStyle = '#e2c68b';
        for (const rivetX of [screenX + 5, screenX + width - 5]) {
            ctx.beginPath();
            ctx.arc(rivetX, groundY - 2, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        return;
    }

    if (obstacle.type === 'plank_bridge') {
        ctx.fillStyle = '#4b3020';
        ctx.fillRect(screenX, groundY - height * 0.4, width, height * 0.8);
        for (let i = 0; i < 6; i++) {
            const plankX = screenX + i * width / 6;
            ctx.fillStyle = i % 2 ? '#a97843' : '#8b5a2b';
            ctx.fillRect(plankX + 1, groundY - height, width / 6 - 2, height * 0.64);
            ctx.strokeStyle = '#56371f';
            ctx.lineWidth = 1;
            ctx.strokeRect(plankX + 1, groundY - height, width / 6 - 2, height * 0.64);
        }
        ctx.strokeStyle = '#d0a166';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX, groundY - height);
        ctx.lineTo(screenX + width, groundY - height);
        ctx.stroke();
        return;
    }

    if (obstacle.type === 'forge_slag') {
        ctx.fillStyle = 'rgba(124, 45, 18, .9)';
        ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY + 2, width / 2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY - 1, width * 0.39, 4 + Math.sin(frameCounter * 0.12 + obstacle.phase) * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let spark = 0; spark < 4; spark++) {
            const sparkX = screenX + 8 + ((spark * 23 + frameCounter * (0.4 + spark * 0.08)) % Math.max(12, width - 16));
            const sparkY = groundY - 5 - ((frameCounter * 0.9 + spark * 11) % 18);
            ctx.fillStyle = spark % 2 ? '#fde047' : '#fdba74';
            ctx.fillRect(sparkX, sparkY, 2, 4);
        }
        return;
    }

    if (obstacle.type === 'smith_hammer') {
        const pulse = (getTimedObstaclePulse(obstacle, frameCounter) + 1) * 0.5;
        const striking = isTimedObstacleActive(obstacle, frameCounter);
        const postX = screenX + 8;
        const topY = groundY - height;
        const headY = groundY - (18 + (1 - pulse) * 31);
        ctx.fillStyle = '#60452f';
        ctx.fillRect(postX, topY + 4, 6, height - 4);
        ctx.fillRect(screenX + width - 14, topY + 4, 6, height - 4);
        ctx.fillRect(postX, topY + 2, width - 16, 7);
        ctx.strokeStyle = '#47382c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(screenX + width / 2, topY + 8);
        ctx.lineTo(screenX + width / 2, headY);
        ctx.stroke();
        ctx.fillStyle = striking ? '#f97316' : '#64748b';
        ctx.fillRect(screenX + width / 2 - 14, headY - 5, 28, 12);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(screenX + width / 2 - 9, headY - 8, 18, 5);
        if (striking) {
            ctx.fillStyle = '#fde047';
            for (let spark = 0; spark < 3; spark++) {
                ctx.fillRect(screenX + width / 2 - 17 + spark * 16, groundY - 5 - (spark % 2) * 4, 3, 3);
            }
        }
        return;
    }

    if (obstacle.type === 'ford_stones') {
        ctx.fillStyle = 'rgba(14, 116, 144, .78)';
        ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY + 5, width / 2, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let stone = 0; stone < 5; stone++) {
            const stoneX = screenX + 9 + stone * (width - 30) / 4;
            const stoneY = groundY - 3 - (stone % 2) * 3;
            ctx.fillStyle = stone % 2 ? '#a8a29e' : '#78716c';
            ctx.beginPath();
            ctx.ellipse(stoneX + 9, stoneY, 10, 5, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(226, 232, 240, .7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stoneX + 2, stoneY - 1);
            ctx.lineTo(stoneX + 8, stoneY - 3);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(186, 230, 253, .8)';
        ctx.lineWidth = 2;
        const rippleX = screenX + ((frameCounter * 1.7) % width);
        ctx.beginPath();
        ctx.ellipse(rippleX, groundY + 2, 9, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        return;
    }

    if (obstacle.type === 'mill_paddle') {
        const cx = screenX + width / 2;
        const cy = groundY - height * 0.48;
        const radius = Math.min(width, height) * 0.38;
        const active = isTimedObstacleActive(obstacle, frameCounter);
        ctx.strokeStyle = '#56391f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(screenX + 8, groundY);
        ctx.lineTo(cx, cy);
        ctx.lineTo(screenX + width - 8, groundY);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(frameCounter * 0.045 + obstacle.phase);
        ctx.strokeStyle = active ? '#f97316' : '#8b5a2b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        for (let spoke = 0; spoke < 6; spoke++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -radius);
            ctx.stroke();
            ctx.fillStyle = active ? '#fb923c' : '#a87949';
            ctx.fillRect(-4, -radius - 7, 8, 13);
        }
        ctx.fillStyle = '#d6c29b';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
    }

    if (obstacle.type === 'crank_rack') {
        const active = isTimedObstacleActive(obstacle, frameCounter);
        ctx.fillStyle = '#5b3b26';
        ctx.fillRect(screenX + 4, groundY - 8, width - 8, 8);
        ctx.strokeStyle = active ? '#f59e0b' : '#8b5a2b';
        ctx.lineWidth = 5;
        ctx.save();
        ctx.translate(screenX + width / 2, groundY - height * 0.48);
        ctx.rotate(frameCounter * 0.075 + obstacle.phase);
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.moveTo(-27, 0);
        ctx.lineTo(27, 0);
        ctx.moveTo(0, -27);
        ctx.lineTo(0, 27);
        ctx.stroke();
        ctx.fillStyle = active ? '#fbbf24' : '#a87949';
        ctx.fillRect(-3, -31, 6, 11);
        ctx.fillRect(-3, 20, 6, 11);
        ctx.fillRect(-31, -3, 11, 6);
        ctx.fillRect(20, -3, 11, 6);
        ctx.restore();
        return;
    }

    if (obstacle.type === 'loose_planks') {
        ctx.fillStyle = 'rgba(2, 6, 23, .9)';
        ctx.fillRect(screenX, groundY - 5, width, 18);
        ctx.fillStyle = '#704522';
        ctx.fillRect(screenX, groundY - 8, 20, 5);
        ctx.fillRect(screenX + width - 20, groundY - 8, 20, 5);
        const plankWidth = width / 7;
        for (let plank = 0; plank < 7; plank++) {
            if (plank === 3 || plank === 4) continue;
            const plankY = groundY - 9 + (plank % 2 ? 3 : 0);
            ctx.save();
            ctx.translate(screenX + plank * plankWidth + plankWidth / 2, plankY);
            ctx.rotate(plank % 2 ? -0.08 : 0.06);
            ctx.fillStyle = plank % 2 ? '#a97843' : '#80532f';
            ctx.fillRect(-plankWidth * 0.46, -4, plankWidth * 0.92, 7);
            ctx.strokeStyle = '#4b3020';
            ctx.lineWidth = 1;
            ctx.strokeRect(-plankWidth * 0.46, -4, plankWidth * 0.92, 7);
            ctx.restore();
        }
        ctx.fillStyle = '#c4b5a5';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ПРЫЖОК', screenX + width / 2, groundY - 16);
        return;
    }

    if (obstacle.type === 'wooden_gate') {
        ctx.strokeStyle = '#57361f';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(screenX + 5, groundY);
        ctx.lineTo(screenX + 5, groundY - height);
        ctx.lineTo(screenX + width - 5, groundY - height);
        ctx.lineTo(screenX + width - 5, groundY);
        ctx.moveTo(screenX + 5, groundY - height * 0.5);
        ctx.lineTo(screenX + width - 5, groundY - height * 0.5);
        ctx.stroke();
        ctx.strokeStyle = '#b98249';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX + 8, groundY - height + 4);
        ctx.lineTo(screenX + width - 8, groundY - height + 4);
        ctx.stroke();
        return;
    }

    if (obstacle.type === 'iron_gate') {
        ctx.strokeStyle = '#26323d';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(screenX + 5, groundY);
        ctx.lineTo(screenX + 5, groundY - height);
        ctx.moveTo(screenX + width - 5, groundY);
        ctx.lineTo(screenX + width - 5, groundY - height);
        ctx.moveTo(screenX + 5, groundY - height + 5);
        ctx.lineTo(screenX + width - 5, groundY - height + 5);
        ctx.moveTo(screenX + 5, groundY - height * 0.52);
        ctx.lineTo(screenX + width - 5, groundY - height * 0.52);
        ctx.stroke();
        ctx.strokeStyle = '#aebac4';
        ctx.lineWidth = 2;
        for (let bar = 0; bar < 4; bar++) {
            const barX = screenX + 14 + bar * ((width - 28) / 3);
            ctx.beginPath();
            ctx.moveTo(barX, groundY - height + 6);
            ctx.lineTo(barX, groundY - 2);
            ctx.stroke();
        }
        return;
    }

    if (obstacle.type === 'mud' || obstacle.type === 'ice_patch' || obstacle.type === 'water_splash') {
        ctx.fillStyle = obstacle.color; ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY + 1, width / 2, Math.max(5, height / 2), 0, 0, Math.PI * 2); ctx.fill();
        if (obstacle.type === 'ice_patch') { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(screenX + 10, groundY - 3); ctx.lineTo(screenX + width - 10, groundY - 3); ctx.stroke(); }
        return;
    }
    if (obstacle.type === 'cone') {
        ctx.fillStyle = obstacle.color; ctx.beginPath(); ctx.moveTo(screenX + width / 2, groundY - height); ctx.lineTo(screenX + width, groundY); ctx.lineTo(screenX, groundY); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff7ed'; ctx.fillRect(screenX + width * .2, groundY - height * .38, width * .6, 4); return;
    }
    if (obstacle.type === 'fallen_branch') {
        ctx.strokeStyle = obstacle.color; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(screenX, groundY - height); ctx.lineTo(screenX + width, groundY - height * .65); ctx.stroke(); return;
    }
    if (obstacle.type === 'wind_fan') {
        const cx = screenX + width / 2, cy = groundY - height * .55; ctx.strokeStyle = obstacle.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, groundY); ctx.lineTo(cx, cy); ctx.stroke(); ctx.save(); ctx.translate(cx, cy); ctx.rotate(frameCounter * .16); ctx.fillStyle = obstacle.color;
        for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.ellipse(0, -height * .28, 5, height * .25, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); return;
    }
    if (obstacle.type === 'pulse_gate') {
        const open = Math.sin(frameCounter * .045 + obstacle.x) > 0.15; ctx.strokeStyle = open ? '#4ade80' : obstacle.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(screenX + 5, groundY); ctx.lineTo(screenX + 5, groundY - height); ctx.lineTo(screenX + width - 5, groundY - height); ctx.lineTo(screenX + width - 5, groundY); ctx.stroke();
        if (!open) { ctx.fillStyle = obstacle.color; ctx.fillRect(screenX, groundY - height * .55, width, 8); } return;
    }
    if (obstacle.type === 'cliff') {
        const bottom = Math.max(viewHeight + 60, groundY + height + 30);
        ctx.fillStyle = '#020617';
        ctx.fillRect(screenX, groundY - 18, width, bottom - groundY + 18);

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(screenX, groundY - 15);
        ctx.lineTo(screenX + 18, groundY + 4);
        ctx.lineTo(screenX + 26, groundY + 27);
        ctx.lineTo(screenX + 42, groundY + 38);
        ctx.lineTo(screenX + 42, bottom);
        ctx.lineTo(screenX, bottom);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(screenX + width, groundY - 15);
        ctx.lineTo(screenX + width - 17, groundY + 6);
        ctx.lineTo(screenX + width - 31, groundY + 20);
        ctx.lineTo(screenX + width - 45, groundY + 42);
        ctx.lineTo(screenX + width - 45, bottom);
        ctx.lineTo(screenX + width, bottom);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 5, groundY - 15);
        ctx.lineTo(screenX + 16, groundY - 11);
        ctx.moveTo(screenX + width - 16, groundY - 11);
        ctx.lineTo(screenX + width + 5, groundY - 15);
        ctx.stroke();
        return;
    }
    if (obstacle.type === 'bridge_gap') { ctx.fillStyle = '#020617'; ctx.fillRect(screenX, groundY - 2, width, 12); ctx.strokeStyle = '#a16207'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(screenX, groundY - 5); ctx.lineTo(screenX + width, groundY - 5); ctx.stroke(); return; }
    if (obstacle.type === 'rolling_wheel') {
        const radius = Math.min(height, width) * 0.48;
        const cx = screenX + width / 2;
        const cy = groundY - radius;
        ctx.fillStyle = 'rgba(15, 23, 42, .24)';
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 2, radius * 1.05, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#c0a875';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(frameCounter * 0.11 + (Number(obstacle.phase) || 0));
        for (let spoke = 0; spoke < 10; spoke++) {
            const angle = spoke * Math.PI / 5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * (radius - 5), Math.sin(angle) * (radius - 5));
            ctx.stroke();
        }
        ctx.fillStyle = '#e7d9b8';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
    }
    if (obstacle.type === 'rolling_boulder') {
        ctx.fillStyle = obstacle.color; ctx.beginPath(); ctx.arc(screenX + width / 2, groundY - height / 2, height / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(screenX + width / 2, groundY - height / 2); ctx.lineTo(screenX + width / 2 + Math.cos(frameCounter * .12) * height * .35, groundY - height / 2 + Math.sin(frameCounter * .12) * height * .35); ctx.stroke(); return;
    }

    if (obstacle.type === 'pit') {
        ctx.fillStyle = '#020617';

        ctx.beginPath();

        ctx.ellipse(
            screenX + width / 2,
            groundY + 2,
            width / 2,
            10,
            0,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;

        ctx.beginPath();

        ctx.moveTo(screenX, groundY - 1);
        ctx.lineTo(screenX + 8, groundY + 7);

        ctx.moveTo(screenX + width - 8, groundY + 7);
        ctx.lineTo(screenX + width, groundY - 1);

        ctx.stroke();

        return;
    }

    if (obstacle.type === 'ramp') {
        ctx.fillStyle = obstacle.color;

        ctx.beginPath();

        ctx.moveTo(screenX, groundY);
        ctx.lineTo(screenX + width, groundY - height);
        ctx.lineTo(screenX + width, groundY);

        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();

        return;
    }

    if (obstacle.type === 'rock') {
        ctx.fillStyle = obstacle.color;

        ctx.beginPath();

        ctx.moveTo(screenX, groundY);
        ctx.lineTo(screenX + width * 0.18, groundY - height * 0.7);
        ctx.lineTo(screenX + width * 0.55, groundY - height);
        ctx.lineTo(screenX + width * 0.92, groundY - height * 0.6);
        ctx.lineTo(screenX + width, groundY);

        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#a8a29e';
        ctx.lineWidth = 1;
        ctx.stroke();

        return;
    }

    if (obstacle.type === 'log') {
        const frontY = getGroundY(obstacle.x + width, 0);
        const backY = getGroundY(obstacle.x, 0);
        const logAngle = Math.atan2(frontY - backY, width);
        
        ctx.save();
        ctx.translate(screenX + width/2, groundY);
        ctx.rotate(logAngle);
        
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(-width/2, -height, width, height);

        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.strokeRect(-width/2, -height, width, height);

        ctx.strokeStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(-width/2 + 5, -height/2, 5, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        return;
    }

    if (obstacle.type === 'barrier') {
        ctx.fillStyle = obstacle.color;

        ctx.fillRect(
            screenX,
            groundY - height,
            width,
            height
        );

        ctx.fillStyle = '#fecaca';

        for (let i = 0; i < 3; i++) {
            ctx.fillRect(
                screenX + 5 + i * 14,
                groundY - height + 6,
                7,
                height - 12
            );
        }

        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 2;

        ctx.strokeRect(
            screenX,
            groundY - height,
            width,
            height
        );
    }
}

function drawObstacles() {
    obstacles.forEach(obstacle => {
        const screenX = obstacle.x - cameraX;
        
        // Не тратим ресурсы на просчет того, что за экраном
        if (screenX < -150 || screenX > viewWidth + 150) return;
        
        // Вычисляем высоту земли в начале и в конце препятствия
        const groundY = getGroundY(obstacle.x, 0);
        const frontY = getGroundY(obstacle.x + obstacle.width, 0);
        
        // Находим угол наклона рельефа именно под этим объектом
        const obstacleAngle = Math.atan2(frontY - groundY, obstacle.width);
        
        ctx.save();
        
        // Переносим точку вращения в левый нижний угол препятствия (ровно на землю)
        ctx.translate(screenX, groundY);
        ctx.rotate(obstacleAngle);
        ctx.translate(-screenX, -groundY);
        
        // Теперь рисуем препятствие — оно автоматически "ляжет" на склон!
        drawObstacle(obstacle);
        
        ctx.restore();
    });
}

// =========================================
// ОТРИСОВКА ВЕЛОСИПЕДА
// =========================================

function drawHistoryVictoryRider(x, groundY, phase, phaseFrame, riseProgress = 1, historicalStyle = '') {
    const transition = clamp(riseProgress, 0, 1);
    if (['dismount', 'mount'].includes(phase) && transition <= 0.02) return;

    const alpha = phase === 'dismount' || phase === 'mount' ? transition : 1;
    const mountProgress = phase === 'mount' ? 1 - transition : 0;
    const dismountProgress = phase === 'dismount'
        ? easeOutCubic((phaseFrame + 1) / 28)
        : 0;
    const wave = phase === 'wave' && phaseFrame > 12
        ? Math.sin((phaseFrame - 12) * 0.28) * 8
        : 0;
    const waveLift = phase === 'wave' && phaseFrame > 12
        ? Math.cos((phaseFrame - 12) * 0.28) * 1.2
        : 0;
    const greetingProgress = phase === 'wave'
        ? easeInOutCubic((phaseFrame + 1) / 12)
        : 0;
    const hatTipProgress = phase === 'look'
        ? easeInOutCubic((phaseFrame + 1) / 9)
        : 0;
    const mountReach = phase === 'mount'
        ? easeInOutCubic(clamp(mountProgress * 3, 0, 1))
        : 0;
    const breath = Math.sin(phaseFrame * 0.075) * 0.55;
    const walk = phase === 'dismount'
        ? Math.sin(phaseFrame * 0.23) * (1 - easeOutCubic(phaseFrame / 28))
        : 0;
    const stepNear = walk * 4;
    const stepFar = -walk * 3;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = `rgba(16, 13, 10, ${0.2 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(x + 1, groundY - 1, 9 + mountProgress * 2, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x + mountProgress * 4, groundY - breath - mountProgress * 2);
    const dismountLean = phase === 'dismount' ? Math.sin(phaseFrame * 0.11) * 0.035 : 0;
    ctx.rotate((phase === 'mount' ? 0.1 * mountProgress : 0) + dismountLean);
    ctx.scale(1, 1 - mountProgress * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Вес переносится с ноги на ногу, пока Карл сходит с машины.
    const kneeNear = phase === 'mount'
        ? { x: -6, y: -12 - mountProgress * 2 }
        : { x: -8 + stepNear, y: -11 - Math.max(0, walk) * 1.4 };
    const kneeFar = phase === 'mount'
        ? { x: 7, y: -13 }
        : { x: 8 + stepFar, y: -12 - Math.max(0, -walk) * 1.4 };
    const coatColor = historicalStyle === 'lallement' ? '#43566b' : '#4b3b2a';
    const trouserColor = historicalStyle === 'lallement' ? '#283443' : '#39342d';
    ctx.strokeStyle = trouserColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-3, -22);
    ctx.lineTo(kneeNear.x, kneeNear.y);
    ctx.lineTo(-8 + stepNear * 1.6, 0);
    ctx.moveTo(3, -22);
    ctx.lineTo(kneeFar.x, kneeFar.y);
    ctx.lineTo(8 + stepFar * 1.6, 0);
    ctx.stroke();
    ctx.fillStyle = '#211a14';
    ctx.fillRect(-12 + stepNear * 1.6, -1.5, 8, 2.5);
    ctx.fillRect(4 + stepFar * 1.6, -1.5, 8, 2.5);

    // Сюртук с полами, жилет и тонкие пуговицы дают костюму объём в масштабе гонки.
    ctx.fillStyle = coatColor;
    ctx.beginPath();
    ctx.moveTo(-6, -40);
    ctx.lineTo(5, -40);
    ctx.lineTo(7, -24);
    ctx.lineTo(4, -21);
    ctx.lineTo(1, -25);
    ctx.lineTo(-3, -21);
    ctx.lineTo(-6, -24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c6a06b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(1, -25);
    ctx.stroke();
    ctx.fillStyle = '#d1b180';
    for (let buttonY = -35; buttonY <= -28; buttonY += 4) {
        ctx.beginPath();
        ctx.arc(0.5, buttonY, 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    // Дальняя рука помогает удержать Laufmaschine при сходе; после этого рука
    // спокойно опускается, а во время прощания поднимается в короткое приветствие.
    ctx.strokeStyle = '#554c40';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    if (phase === 'wave') {
        ctx.moveTo(3, -37);
        ctx.lineTo(-8 + greetingProgress * 19, -41 - greetingProgress * 5);
        ctx.lineTo(-5 + greetingProgress * (23 + wave), -45 - greetingProgress * 12 + waveLift * greetingProgress);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-10, -31);
        ctx.lineTo(-12, -26);
    } else if (phase === 'dismount') {
        ctx.moveTo(3, -37);
        ctx.lineTo(8, -48);
        ctx.lineTo(-1 + dismountProgress * 20, -66);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-11, -31);
        ctx.lineTo(-13, -25);
    } else if (phase === 'mount') {
        ctx.moveTo(3, -37);
        ctx.lineTo(8 + mountProgress * 3, -46 - mountReach * 2);
        ctx.lineTo(19 - mountProgress * 20, -57 - mountReach * 9);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-9, -31);
        ctx.lineTo(-11, -26);
    } else if (phase === 'look') {
        ctx.moveTo(3, -37);
        ctx.lineTo(8 - hatTipProgress * 16, -48 + hatTipProgress * 7);
        ctx.lineTo(19 - hatTipProgress * 24, -66 + hatTipProgress * 21);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-8, -41);
        ctx.lineTo(-5, -45);
    } else if (phase === 'showcase') {
        const pointProgress = easeInOutCubic((phaseFrame + 1) / 14);
        ctx.moveTo(3, -37);
        ctx.lineTo(11 + pointProgress * 8, -41 + pointProgress * 5);
        ctx.lineTo(18 + pointProgress * 9, -33 + pointProgress * 4);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-10, -31);
        ctx.lineTo(-12, -26);
    } else {
        ctx.moveTo(3, -37);
        ctx.lineTo(10, -30);
        ctx.lineTo(12, -26);
        ctx.moveTo(-3, -37);
        ctx.lineTo(-10, -30);
        ctx.lineTo(-12, -26);
    }
    ctx.stroke();

    if (phase === 'wave') {
        const handX = -5 + greetingProgress * (23 + wave);
        const handY = -45 - greetingProgress * 12 + waveLift * greetingProgress;
        ctx.fillStyle = '#d8b58b';
        ctx.beginPath();
        ctx.ellipse(handX, handY, 2.5, 3.2, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d8b58b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(handX + 1, handY - 2);
        ctx.lineTo(handX + 2, handY - 5);
        ctx.moveTo(handX - 1, handY - 2);
        ctx.lineTo(handX - 1, handY - 5);
        ctx.stroke();
    } else if (phase === 'dismount' || phase === 'mount') {
        const handX = phase === 'dismount'
            ? -1 + dismountProgress * 20
            : 19 - mountProgress * 20;
        const handY = phase === 'dismount' ? -66 : -57 - mountReach * 9;
        ctx.fillStyle = '#d8b58b';
        ctx.beginPath();
        ctx.arc(handX, handY, 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (phase === 'look') {
        const handX = 19 - hatTipProgress * 24;
        const handY = -66 + hatTipProgress * 21;
        ctx.fillStyle = '#d8b58b';
        ctx.beginPath();
        ctx.arc(handX, handY, 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (phase === 'showcase') {
        const pointProgress = easeInOutCubic((phaseFrame + 1) / 14);
        const handX = 18 + pointProgress * 9;
        const handY = -33 + pointProgress * 4;
        ctx.fillStyle = '#d8b58b';
        ctx.beginPath();
        ctx.arc(handX, handY, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(214, 189, 130, .9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(handX + 2, handY);
        ctx.lineTo(handX + 8, handY - 3);
        ctx.stroke();
    }

    // Лицо повернуто к игроку; небольшой нос задает направление взгляда.
    ctx.fillStyle = '#d8b58b';
    ctx.beginPath();
    ctx.arc(2, -49, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, -49);
    ctx.lineTo(8, -47.5);
    ctx.lineTo(5, -46.5);
    ctx.fill();
    ctx.fillStyle = '#35271d';
    ctx.fillRect(-3, -56, 10, 2.5);
    ctx.fillRect(-1.5, -63, 7, 8);
    ctx.fillStyle = '#201a14';
    ctx.fillRect(5.2, -50, 1.2, 1.2);
    ctx.restore();
}

function drawPlayerHistoryObserver(x, groundY, phaseFrame, riseProgress, visuals = {}, historicalStyle = '') {
    if (riseProgress <= 0.02) return;

    const riderId = visuals.riderId || 'r1';
    const palette = {
        r1: { shirt: '#2563eb', pants: '#1e293b', helmet: '#ef4444' },
        r2: { shirt: '#16a34a', pants: '#0f172a', helmet: '#f97316' },
        r3: { shirt: '#ea580c', pants: '#334155', helmet: '#eab308' },
        r4: { shirt: '#0f172a', pants: '#020617', helmet: '#06b6d4' },
        r5: { shirt: '#18181b', pants: '#09090b', helmet: '#d97706' },
        r6: { shirt: '#6b4d31', pants: '#332c24', helmet: '#30251e' }
    }[riderId] || { shirt: '#2563eb', pants: '#1e293b', helmet: '#ef4444' };
    const shirt = historicalStyle === 'macmillan' ? '#67503a' : visuals.riderVisuals?.jerseyColor || palette.shirt;
    const pants = historicalStyle === 'macmillan' ? '#352b22' : visuals.riderVisuals?.pantsColor || palette.pants;
    const helmet = historicalStyle === 'macmillan' ? '#3a2b20' : visuals.riderVisuals?.hatColor || palette.helmet;
    const idle = Math.sin(phaseFrame * 0.08) * 0.8;

    ctx.save();
    const visibility = clamp(riseProgress, 0, 1);
    ctx.globalAlpha *= visibility;
    ctx.translate(x, groundY - (1 - visibility) * 2 - idle * 0.25);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = pants;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-3, -22);
    ctx.lineTo(-7, -11);
    ctx.lineTo(-8, 0);
    ctx.moveTo(3, -22);
    ctx.lineTo(7, -11);
    ctx.lineTo(8, 0);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-12, -2, 8, 2);
    ctx.fillRect(4, -2, 8, 2);

    // У курьера сумка остаётся видна и после спешивания в исторической сцене.
    if (riderId === 'r4') {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(4, -41, 13, 17);
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(4, -38, 13, 3);
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(4, -41, 13, 17);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(6, -32, 10, 3);
    }

    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(-6, -40);
    ctx.lineTo(5, -40);
    ctx.lineTo(7, -22);
    ctx.lineTo(-5, -22);
    ctx.closePath();
    ctx.fill();

    if (riderId === 'r4') {
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(3, -38);
        ctx.lineTo(-4, -32);
        ctx.stroke();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(3, -38);
        ctx.lineTo(-4, -32);
        ctx.stroke();
    }

    // Поворачивает голову влево, в сторону Карла Дреза.
    ctx.fillStyle = '#f1c9a5';
    ctx.beginPath();
    ctx.arc(-2, -48, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, -48);
    ctx.lineTo(-8, -47);
    ctx.lineTo(-5, -46);
    ctx.fill();

    if (riderId === 'r6') {
        ctx.fillStyle = helmet;
        ctx.fillRect(-7, -56, 10, 2.5);
        ctx.fillRect(-5.5, -64, 7, 8);
    } else if (riderId === 'r1') {
        ctx.fillStyle = helmet;
        ctx.beginPath();
        ctx.ellipse(-2, -51, 4.4, 2.2, 0, Math.PI, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = helmet;
        ctx.beginPath();
        ctx.ellipse(-2, -51, 4.6, 2.5, 0, Math.PI, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = shirt;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-3, -37);
    ctx.lineTo(-10, -31 + idle);
    ctx.lineTo(-13, -31 + idle);
    ctx.moveTo(3, -37);
    ctx.lineTo(10, -30 - idle);
    ctx.lineTo(13, -31 - idle);
    ctx.stroke();
    ctx.restore();
}

function getDraisineFramePoints(x, bodyY, rear, front) {
    return {
        rearJoint: { x: x - 15, y: bodyY - 18 },
        upperRear: { x: x - 11, y: bodyY - 56 },
        upperHead: { x: x + 14, y: bodyY - 46 },
        middleHead: { x: x + 6, y: bodyY - 35 },
        lowerJoint: { x: x + 7, y: bodyY - 17 },
        seat: { x: x - 8, y: bodyY - 64 },
        seatBrace: { x: x - 11, y: bodyY - 56 },
        rear,
        front
    };
}

function drawDraisineFrame(points, frameColor = '#9a6538') {
    const strokeWood = (drawPath, outlineWidth, fillWidth) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#3d2818';
        ctx.lineWidth = outlineWidth;
        ctx.beginPath();
        drawPath();
        ctx.stroke();
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = fillWidth;
        ctx.beginPath();
        drawPath();
        ctx.stroke();
        ctx.globalAlpha *= 0.48;
        ctx.strokeStyle = '#f0c98b';
        ctx.lineWidth = Math.max(0.8, fillWidth * 0.18);
        ctx.beginPath();
        drawPath();
        ctx.stroke();
        ctx.restore();
    };

    strokeWood(() => {
        ctx.moveTo(points.rear.x, points.rear.y - 1);
        ctx.quadraticCurveTo(points.upperRear.x, points.upperRear.y, points.upperHead.x, points.upperHead.y);
        ctx.lineTo(points.front.x, points.front.y - 1);
    }, 13, 7);

    strokeWood(() => {
        ctx.moveTo(points.rear.x, points.rear.y - 1);
        ctx.lineTo(points.rearJoint.x, points.rearJoint.y);
        ctx.lineTo(points.middleHead.x, points.middleHead.y);
        ctx.lineTo(points.upperHead.x, points.upperHead.y);
        ctx.moveTo(points.rearJoint.x, points.rearJoint.y);
        ctx.lineTo(points.lowerJoint.x, points.lowerJoint.y);
        ctx.lineTo(points.front.x, points.front.y - 1);
        ctx.moveTo(points.seatBrace.x, points.seatBrace.y);
        ctx.lineTo(points.seat.x, points.seat.y + 7);
    }, 10, 5.5);
}

function drawDraisineSeatAndCockpit(points, visuals = {}) {
    const x = points.seat.x + 8;
    const bodyY = points.upperHead.y + 46;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = visuals.seatpostColor || '#704522';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(points.seat.x, bodyY - 56);
    ctx.lineTo(points.seat.x, points.seat.y + 1);
    ctx.stroke();
    ctx.strokeStyle = visuals.saddleColor || '#342319';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 26, bodyY - 65);
    ctx.quadraticCurveTo(x - 8, bodyY - 71, x + 7, bodyY - 64);
    ctx.stroke();

    ctx.strokeStyle = visuals.stemColor || visuals.handlebarColor || '#704522';
    ctx.lineWidth = Math.max(2.5, Number(visuals.handlebarWidth) || 4);
    ctx.beginPath();
    ctx.moveTo(points.upperHead.x, points.upperHead.y);
    ctx.lineTo(x + 20, bodyY - 73);
    ctx.stroke();
    ctx.strokeStyle = visuals.handlebarColor || '#704522';
    ctx.lineWidth = Math.max(2, Number(visuals.handlebarWidth) || 3);
    ctx.beginPath();
    ctx.moveTo(x + 13, bodyY - 76);
    ctx.lineTo(x + 39, bodyY - 76);
    ctx.moveTo(x + 19, bodyY - 73);
    ctx.lineTo(x + 21, bodyY - 76);
    ctx.stroke();
}

function drawDraisineBike(bike, label, variant = 'draisine') {
    const macmillan = variant === 'macmillan';
    const highWheeler = variant === 'highWheeler';
    ctx.save();
    if (bike.isGhost) ctx.globalAlpha = 0.4;

    const x = bike.x - cameraX;
    const groundY = getGroundY(bike.x, 0);
    const bodyY = groundY - (Number(bike.jumpHeight) || 0) - (Number(bike.rampLift) || 0);
    const outroPhase = bike.historyVictoryPhase;
    const outroPhaseFrame = Number(bike.historyVictoryPhaseFrame) || 0;
    const turnProgress = outroPhase === 'turn'
        ? easeInOutCubic(outroPhaseFrame / 32)
        : 0;
    const projectedTurn = Math.cos(Math.PI * turnProgress);
    const facingScale = outroPhase === 'turn'
        ? Math.sign(projectedTurn || 1) * Math.max(0.34, Math.abs(projectedTurn))
        : ['rideAway', 'endFade'].includes(outroPhase) ? -1 : 1;
    const turnOffset = outroPhase === 'turn' ? Math.sin(Math.PI * turnProgress) * 5 : 0;
    const brakeProgress = outroPhase === 'brake' ? clamp(outroPhaseFrame / 13, 0, 1) : 0;
    const settleJolt = outroPhase === 'settle'
        ? Math.sin(outroPhaseFrame * 0.62) * Math.exp(-outroPhaseFrame * 0.17) * 0.035
        : 0;
    const actionPitch = outroPhase === 'brake'
        ? Math.sin(Math.PI * brakeProgress) * 0.12
        : outroPhase === 'turn'
            ? Math.sin(Math.PI * turnProgress) * -0.07
            : settleJolt;
    const rearRadius = highWheeler
        ? clamp((Number(bike.visuals?.rearWheelRadius) || 8) * 1.24, 7, 12)
        : macmillan ? 19 : 17;
    const frontRadius = highWheeler
        ? clamp((Number(bike.visuals?.frontWheelRadius) || 20) * 1.24, 18, 28)
        : macmillan ? 12 : 12.5;
    const rear = { x: x - (highWheeler ? 45 : 34), y: bodyY - rearRadius + 1 };
    const front = { x: x + (highWheeler ? 25 : 36), y: bodyY - frontRadius + 1 };
    const travel = Number(bike.x) - (Number(bike.previousX) || Number(bike.x));
    bike.wheelRotation = (Number(bike.wheelRotation) || 0) + travel / 17;
    const wheelAngle = Number(bike.wheelRotation) || 0;

    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(x, groundY - 1, 47, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const stopDust = outroPhase === 'brake' ? Math.sin(Math.PI * brakeProgress) * 0.55 : 0;
    const pivotDust = outroPhase === 'turn' ? Math.sin(Math.PI * turnProgress) * 0.25 : 0;
    const rideDust = ['rideAway', 'endFade'].includes(outroPhase)
        ? 0.14 + (Math.sin(outroPhaseFrame * 0.31) + 1) * 0.08
        : 0;
    const dustAlpha = Math.max(stopDust, pivotDust, rideDust);
    if (dustAlpha > 0.02) {
        ctx.save();
        const inheritedAlpha = ctx.globalAlpha;
        ctx.fillStyle = '#b8a184';
        for (let i = 0; i < 4; i++) {
            const drift = (outroPhaseFrame * (outroPhase === 'brake' ? 0.9 : 0.45) + i * 9) % 28;
            const behindX = ['rideAway', 'endFade'].includes(outroPhase)
                ? x + 39 + drift
                : x - 37 - drift;
            ctx.globalAlpha = inheritedAlpha * dustAlpha * (0.75 - i * 0.12);
            ctx.beginPath();
            ctx.ellipse(
                behindX,
                groundY - 2 - drift * 0.08,
                3 + i * 0.45,
                1.4 + i * 0.18,
                -0.08,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        ctx.restore();
    }

    ctx.save();
    ctx.translate(x + turnOffset, bodyY - 19);
    ctx.scale(facingScale, 1);
    ctx.rotate((Number(bike.pitchAngle) || 0) + actionPitch);
    ctx.translate(-(x + turnOffset), -(bodyY - 19));

    const drawWoodWheel = (wheel, radius) => {
        ctx.save();
        ctx.translate(wheel.x, wheel.y);
        ctx.rotate(wheelAngle);
        ctx.strokeStyle = '#211a14';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = bike.visuals?.rimColor || '#8a6742';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = bike.visuals?.rimColor || '#5e4a35';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * (radius - 3), Math.sin(angle) * (radius - 3));
            ctx.stroke();
        }
        ctx.fillStyle = bike.visuals?.hubColor || '#ba8a53';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
    drawWoodWheel(rear, rearRadius);
    drawWoodWheel(front, frontRadius);

    if (bike.macmillanBurstTimer > 0) {
        ctx.save();
        ctx.globalAlpha *= clamp(bike.macmillanBurstTimer / 18, 0.25, 1);
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(rear.x - rearRadius - 2, rear.y - 1);
        ctx.lineTo(rear.x - rearRadius - 20, rear.y - 6);
        ctx.lineTo(rear.x - rearRadius - 12, rear.y + 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    const framePoints = highWheeler
        ? {
            rearJoint: { x: rear.x + 9, y: rear.y - 4 },
            upperRear: { x: front.x - 25, y: front.y - frontRadius - 4 },
            upperHead: { x: front.x - 12, y: front.y - frontRadius - 12 },
            middleHead: { x: front.x - 16, y: front.y - frontRadius + 1 },
            lowerJoint: { x: front.x - 15, y: front.y - frontRadius + 14 },
            seat: { x: front.x - 6, y: front.y - frontRadius - 7 },
            seatBrace: { x: front.x - 25, y: front.y - frontRadius - 4 },
            rear,
            front
        }
        : macmillan
        ? {
            rearJoint: { x: x - 15, y: bodyY - 28 },
            upperRear: { x: x - 24, y: bodyY - 65 },
            upperHead: { x: x + 19, y: bodyY - 47 },
            middleHead: { x: x + 10, y: bodyY - 35 },
            lowerJoint: { x: x + 14, y: bodyY - 18 },
            seat: { x: x - 5, y: bodyY - 58 },
            seatBrace: { x: x - 15, y: bodyY - 28 },
            rear,
            front
        }
        : getDraisineFramePoints(x, bodyY, rear, front);
    drawDraisineFrame(framePoints, bike.visuals?.frameColor || (highWheeler ? '#536579' : macmillan ? '#8b5a2b' : '#9a6538'));
    drawDraisineSeatAndCockpit(framePoints, {
        stemColor: bike.visuals?.stemColor || '#704522',
        handlebarColor: bike.visuals?.handlebarColor || '#704522',
        handlebarWidth: bike.visuals?.handlebarWidth ? bike.visuals.handlebarWidth * 2 : 4,
        seatpostColor: bike.visuals?.seatpostColor || '#704522',
        saddleColor: bike.visuals?.saddleColor || '#342319'
    });

    const macmillanDrivePhase = bike.grounded
        ? frameCounter * MACMILLAN_PEDAL_CADENCE
        : 0;
    if (macmillan && bike.visuals?.macmillanTreadles) {
        const crank = { x: x + 2, y: bodyY - 17 };
        const phase = macmillanDrivePhase;
        const pedalNear = { x: crank.x + Math.cos(phase) * 10, y: crank.y + Math.sin(phase) * 10 };
        const pedalFar = { x: crank.x + Math.cos(phase + Math.PI) * 10, y: crank.y + Math.sin(phase + Math.PI) * 10 };
        ctx.strokeStyle = bike.visuals?.macmillanTreadleColor || '#57391f';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(crank.x, crank.y, 3.5, 0, Math.PI * 2);
        ctx.moveTo(pedalNear.x, pedalNear.y);
        ctx.lineTo(rear.x + 3, rear.y - 1);
        ctx.moveTo(pedalFar.x, pedalFar.y);
        ctx.lineTo(rear.x + 4, rear.y + 1);
        ctx.moveTo(crank.x, crank.y);
        ctx.lineTo(pedalNear.x, pedalNear.y);
        ctx.moveTo(crank.x, crank.y);
        ctx.lineTo(pedalFar.x, pedalFar.y);
        ctx.stroke();
        ctx.fillStyle = bike.visuals?.macmillanTreadleColor || '#d0a166';
        [pedalNear, pedalFar].forEach(pedal => {
            ctx.beginPath();
            ctx.arc(pedal.x, pedal.y, 2.1, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    const highWheelDrivePhase = bike.grounded ? frameCounter * MACMILLAN_PEDAL_CADENCE : 0;
    if (highWheeler) {
        const crank = { x: front.x, y: front.y };
        const pedalNear = { x: crank.x + Math.cos(highWheelDrivePhase) * 12, y: crank.y + Math.sin(highWheelDrivePhase) * 12 };
        const pedalFar = { x: crank.x + Math.cos(highWheelDrivePhase + Math.PI) * 12, y: crank.y + Math.sin(highWheelDrivePhase + Math.PI) * 12 };
        ctx.strokeStyle = bike.visuals?.frontWheelDriveColor || '#d6bd82';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(crank.x, crank.y, 3.5, 0, Math.PI * 2);
        ctx.moveTo(crank.x, crank.y);
        ctx.lineTo(pedalNear.x, pedalNear.y);
        ctx.moveTo(crank.x, crank.y);
        ctx.lineTo(pedalFar.x, pedalFar.y);
        ctx.stroke();
        ctx.fillStyle = bike.visuals?.frontWheelDriveColor || '#d6bd82';
        [pedalNear, pedalFar].forEach(pedal => {
            ctx.beginPath();
            ctx.arc(pedal.x, pedal.y, 2.3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    const seatedOpacity = outroPhase === 'dismount'
        ? 1 - easeInOutCubic((outroPhaseFrame - 3) / 21)
        : ['look', 'showcase', 'wave'].includes(outroPhase) ? 0
            : outroPhase === 'mount' ? easeInOutCubic((outroPhaseFrame - 4) / 22)
                : 1;
    if (seatedOpacity > 0.01) {
        ctx.save();
        ctx.globalAlpha *= seatedOpacity;
        // Дрез отталкивается ногами от земли; Макмиллан сидит и качает рычажные педали.
        const push = macmillan ? macmillanDrivePhase : highWheeler ? highWheelDrivePhase : (bike.grounded ? Math.sin(frameCounter * 0.13) : 0);
        const hip = highWheeler
            ? { x: front.x - 7, y: front.y - frontRadius - 7 }
            : { x: x - 5, y: bodyY - (macmillan ? 58 : 66) };
        const shoulder = highWheeler
            ? { x: front.x - 8, y: hip.y - 18 }
            : { x: x + 1, y: bodyY - (macmillan ? 76 : 81) };
        const head = highWheeler
            ? { x: front.x - 9, y: hip.y - 29 }
            : { x: x + 3, y: bodyY - (macmillan ? 86 : 91) };
        const legNear = highWheeler
            ? { knee: { x: (hip.x + front.x + Math.cos(push) * 12) / 2 - 4, y: (hip.y + front.y + Math.sin(push) * 12) / 2 }, foot: { x: front.x + Math.cos(push) * 12, y: front.y + Math.sin(push) * 12 } }
            : macmillan
            ? { knee: { x: x - 1 + Math.cos(push) * 4, y: bodyY - 38 + Math.sin(push) * 5 }, foot: { x: x + 2 + Math.cos(push) * 10, y: bodyY - 17 + Math.sin(push) * 10 } }
            : { knee: { x: x - 11 + push * 5, y: bodyY - 38 + Math.abs(push) * 5 }, foot: { x: x - 15 + push * 12, y: bodyY - 2 } };
        const legFar = highWheeler
            ? { knee: { x: (hip.x + front.x + Math.cos(push + Math.PI) * 12) / 2 + 4, y: (hip.y + front.y + Math.sin(push + Math.PI) * 12) / 2 }, foot: { x: front.x + Math.cos(push + Math.PI) * 12, y: front.y + Math.sin(push + Math.PI) * 12 } }
            : macmillan
            ? { knee: { x: x + 6 - Math.cos(push) * 4, y: bodyY - 38 - Math.sin(push) * 5 }, foot: { x: x + 2 - Math.cos(push) * 10, y: bodyY - 17 - Math.sin(push) * 10 } }
            : { knee: { x: x - 1 - push * 4, y: bodyY - 39 + Math.abs(push) * 4 }, foot: { x: x - 4 - push * 10, y: bodyY - 2 } };

        ctx.strokeStyle = macmillan ? '#342a20' : '#39342d';
        ctx.lineWidth = 4.1;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(legFar.knee.x, legFar.knee.y);
        ctx.lineTo(legFar.foot.x, legFar.foot.y);
        ctx.stroke();
        ctx.strokeStyle = macmillan ? '#403329' : '#554c40';
        ctx.lineWidth = 4.4;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(legNear.knee.x, legNear.knee.y);
        ctx.lineTo(legNear.foot.x, legNear.foot.y);
        ctx.stroke();
        ctx.strokeStyle = '#211a14';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(legNear.foot.x - 2, legNear.foot.y);
        ctx.lineTo(legNear.foot.x + 5, legNear.foot.y);
        ctx.moveTo(legFar.foot.x - 2, legFar.foot.y);
        ctx.lineTo(legFar.foot.x + 5, legFar.foot.y);
        ctx.stroke();

        ctx.fillStyle = '#4b3b2a';
        ctx.beginPath();
        ctx.moveTo(shoulder.x - 5, shoulder.y);
        ctx.lineTo(shoulder.x + 4, shoulder.y - 1);
        ctx.lineTo(hip.x + 5, hip.y + 2);
        ctx.lineTo(hip.x - 5, hip.y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#32271c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(shoulder.x + 2, shoulder.y + 1);
        ctx.lineTo(x + 15, bodyY - (macmillan ? 71 : 77));
        ctx.lineTo(x + 34, bodyY - (macmillan ? 69 : 75));
        ctx.stroke();
        ctx.fillStyle = '#d8b58b';
        ctx.beginPath();
        ctx.arc(head.x, head.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#35271d';
        if (macmillan || highWheeler) {
            ctx.beginPath();
            ctx.ellipse(head.x, head.y - 5, 5, 2.3, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(head.x - 4, head.y - 6.5, 8, 2);
        } else {
            ctx.fillRect(head.x - 5, head.y - 7, 10, 2.5);
            ctx.fillRect(head.x - 3.5, head.y - 14, 7, 8);
        }
        ctx.restore();
    }

    ctx.restore();
    if (['dismount', 'look', 'showcase', 'wave', 'mount'].includes(outroPhase)) {
        const riderX = Number.isFinite(Number(bike.historyVictoryRunnerX))
            ? Number(bike.historyVictoryRunnerX) - cameraX
            : x - 10;
        const riderWorldX = Number.isFinite(Number(bike.historyVictoryRunnerX))
            ? Number(bike.historyVictoryRunnerX)
            : bike.x - 10;
        const riderGroundY = getGroundY(riderWorldX, 0);
        const riseProgress = outroPhase === 'dismount'
            ? easeOutCubic((outroPhaseFrame - 3) / 22)
            : outroPhase === 'mount'
                ? 1 - easeInOutCubic(outroPhaseFrame / 28)
                : 1;
        drawHistoryVictoryRider(riderX, riderGroundY, outroPhase, outroPhaseFrame, riseProgress, macmillan ? 'macmillan' : highWheeler ? 'lallement' : '');
    }

    if (!outroPhase) {
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff7e8';
        ctx.fillText(label, x, bodyY - 119);
    }
    ctx.restore();
}

function drawBike(bike, label, color) {
    if (bike.visuals?.draisine && bike.isBot) {
        drawDraisineBike(bike, label);
        return;
    }
    if (bike.visuals?.macmillan && bike.isBot) {
        drawDraisineBike(bike, label, 'macmillan');
        return;
    }
    if (bike.visuals?.highWheelerBoss && bike.isBot) {
        drawDraisineBike(bike, label, 'highWheeler');
        return;
    }

    ctx.save();
    if (bike.isGhost) {
        ctx.globalAlpha = 0.4;
    }

    const x = bike.x - cameraX;
    const groundY = getGroundY(bike.x, 0);
    const y = groundY - bike.jumpHeight - bike.rampLift;
    const visuals = bike.visuals || {};
    const macmillanFrame = Boolean(visuals.macmillanFrame);
    const highWheelerFrame = Boolean(visuals.highWheelerFrame);
    // В каталоге радиус задан в игровых единицах; матчевую модель немного
    // увеличиваем, чтобы колёса и рама читались, а не слипались в тонкие линии.
    const rearRadius = clamp((Number(visuals.rearWheelRadius) || Number(visuals.wheelRadius) || 9.5) * 1.24, highWheelerFrame ? 7 : 11.5, highWheelerFrame ? 25.5 : 19.5);
    const frontRadius = clamp((Number(visuals.frontWheelRadius) || Number(visuals.wheelRadius) || 9.5) * 1.24, highWheelerFrame ? 7 : 11.5, highWheelerFrame ? 25.5 : 19.5);
    const radius = (rearRadius + frontRadius) / 2;
    const wheelY = y - radius + 1;
    const draisineFrame = Boolean(visuals.draisine);
    const rearWheelX = x - (highWheelerFrame ? 38 : draisineFrame ? 31 : 25);
    const frontWheelX = x + (highWheelerFrame ? 25 : draisineFrame ? 34 : 25);
    const rearWheelY = y - rearRadius + 1;
    const frontWheelY = y - frontRadius + 1;
    const framePoints = draisineFrame
        ? getDraisineFramePoints(
            x,
            y,
            { x: rearWheelX, y: rearWheelY },
            { x: frontWheelX, y: frontWheelY }
        )
        : null;
    const bottomX = highWheelerFrame ? frontWheelX : x - 3;
    const bottomY = highWheelerFrame ? frontWheelY : wheelY - radius * 0.42;
    const seatX = highWheelerFrame ? frontWheelX - 7 : draisineFrame ? x - 8 : x - 10;
    const seatBaseY = highWheelerFrame ? frontWheelY - frontRadius - 6 : draisineFrame ? y - 56 : wheelY - 27;
    const saddleY = highWheelerFrame ? seatBaseY - 5 : draisineFrame ? y - 64 : wheelY - 33;
    const headX = highWheelerFrame ? frontWheelX - 16 : x + 11;
    const travel = Number.isFinite(bike.previousX)
        ? bike.x - bike.previousX
        : 0;

    bike.wheelRotation = (bike.wheelRotation || 0) + travel / radius;
    bike.pedalPhase = (draisineFrame || macmillanFrame || highWheelerFrame)
        ? 0
        : (bike.pedalPhase || 0) + travel / radius * 0.42;
    const wheelAngle = bike.wheelRotation;
    // У рамы Макмиллана рычажный привод заметно работает даже на малой
    // скорости — как у исторического соперника, независимо от выбранного райдера.
    const pedalAngle = macmillanFrame || highWheelerFrame
        ? (bike.grounded ? frameCounter * MACMILLAN_PEDAL_CADENCE : 0)
        : bike.pedalPhase;

    // Тень остаётся на земле и не поворачивается вместе с рамой.
    const airHeight = Math.max(0, Number(bike.jumpHeight) || 0) + Math.max(0, Number(bike.rampLift) || 0);
    const shadowLift = clamp(airHeight / 180, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${(0.28 * (1 - shadowLift * 0.55)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(
        x,
        groundY - 1,
        44 * (1 - shadowLift * 0.2),
        5 * (1 - shadowLift * 0.6),
        0,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Увеличиваем только рисунок: физика и позиции колёс на трассе не меняются.
    const bikeRenderScale = draisineFrame || highWheelerFrame ? 1 : 1.16;
    ctx.save();
    ctx.translate(x, wheelY);
    ctx.scale(bikeRenderScale, bikeRenderScale);
    ctx.translate(-x, -wheelY);

    // --- НАКЛОНЯЕМ ХОЛСТ ---
    ctx.save();
    const pitchPivotY = highWheelerFrame ? frontWheelY : draisineFrame ? y - 19 : wheelY - 15;
    ctx.translate(x, pitchPivotY);
    ctx.rotate(bike.pitchAngle || 0);
    ctx.translate(-x, -pitchPivotY);
    // -----------------------

    function drawWheel(cx, cy, wheelRadius) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(wheelAngle);

        const tireWidth = clamp((Number(visuals.tireWidth) || 3.2) * 1.18, 3.8, 5.2);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = tireWidth + 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = tireWidth * 0.42;
        ctx.beginPath();
        ctx.arc(0, 0, wheelRadius - tireWidth * 0.42, 0, Math.PI * 2);
        ctx.stroke();

        // Чёткая окантовка обода и равномерные спицы вместо хаотичной сетки.
        ctx.strokeStyle = visuals.rimColor || '#64748b';
        ctx.lineWidth = 1.55;
        ctx.beginPath();
        ctx.arc(0, 0, wheelRadius * 0.76, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(203,213,225,0.82)';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * wheelRadius * 0.72, Math.sin(angle) * wheelRadius * 0.72);
        }
        ctx.stroke();

        // Небольшие насечки протектора помогают колесу отделяться от фона.
        ctx.strokeStyle = 'rgba(226,232,240,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
            const angle = i * Math.PI / 9;
            const inner = wheelRadius - tireWidth * 0.36;
            const outer = wheelRadius + tireWidth * 0.34;
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = visuals.hubColor || '#cbd5e1';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, 1.9, 0, Math.PI * 2);
        ctx.stroke();
        if (visuals.discBrakes) {
            ctx.strokeStyle = 'rgba(148,163,184,0.9)';
            ctx.lineWidth = 1.15;
            ctx.beginPath();
            ctx.arc(0, 0, wheelRadius * 0.43, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#0f172a';
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3;
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * wheelRadius * 0.43, Math.sin(angle) * wheelRadius * 0.43, 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    drawWheel(rearWheelX, rearWheelY, rearRadius);
    drawWheel(frontWheelX, frontWheelY, frontRadius);

    if (!bike.isBot && input.braking && bike.hasBrakes && bike.velocityX > 0.15) {
        ctx.save();
        ctx.shadowColor = '#fb384f';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fb384f';
        ctx.beginPath();
        ctx.arc(rearWheelX, rearWheelY, rearRadius * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const frameColor = visuals.frameColor || color;
    const frameWidth = clamp(Number(visuals.frameWidth) || 3, 2.5, 4.4);
    const drawTube = (x1, y1, x2, y2, tubeColor = frameColor, tubeWidth = frameWidth) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(2,6,23,0.95)';
        ctx.lineWidth = tubeWidth + 2.1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = tubeColor;
        ctx.lineWidth = tubeWidth;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha *= 0.34;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.65, tubeWidth * 0.18);
        ctx.beginPath();
        ctx.moveTo(x1, y1 - 0.55);
        ctx.lineTo(x2, y2 - 0.55);
        ctx.stroke();
        ctx.restore();
    };

    const drawMacmillanFrame = () => {
        const upperRear = { x: rearWheelX + 2, y: wheelY - 43 };
        const upperHead = { x: headX + 2, y: wheelY - 31 };
        const rearJoint = { x: bottomX - 12, y: wheelY - 10 };
        const lowerJoint = { x: bottomX + 12, y: bottomY + 2 };
        const strokeWoodPath = drawPath => {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(31, 23, 16, .98)';
            ctx.lineWidth = frameWidth + 2.2;
            ctx.beginPath();
            drawPath();
            ctx.stroke();
            ctx.strokeStyle = frameColor;
            ctx.lineWidth = frameWidth;
            ctx.beginPath();
            drawPath();
            ctx.stroke();
            ctx.globalAlpha *= 0.42;
            ctx.strokeStyle = '#f2d1a0';
            ctx.lineWidth = Math.max(0.7, frameWidth * 0.2);
            ctx.beginPath();
            drawPath();
            ctx.stroke();
            ctx.restore();
        };

        // Сохраняем узнаваемую длинную деревянную геометрию именно рамы,
        // используя оси колёс и размеры остальных деталей из текущей сборки.
        strokeWoodPath(() => {
            ctx.moveTo(rearWheelX, rearWheelY);
            ctx.quadraticCurveTo(upperRear.x, upperRear.y, upperHead.x, upperHead.y);
            ctx.quadraticCurveTo(headX + 16, wheelY - 26, frontWheelX, frontWheelY);
        });
        strokeWoodPath(() => {
            ctx.moveTo(rearWheelX, rearWheelY);
            ctx.lineTo(rearJoint.x, rearJoint.y);
            ctx.lineTo(seatX, seatBaseY);
            ctx.moveTo(rearJoint.x, rearJoint.y);
            ctx.lineTo(lowerJoint.x, lowerJoint.y);
            ctx.lineTo(frontWheelX, frontWheelY);
            ctx.moveTo(upperRear.x, upperRear.y);
            ctx.lineTo(seatX, seatBaseY);
            ctx.moveTo(upperHead.x, upperHead.y);
            ctx.lineTo(bottomX + 7, bottomY);
        });
    };

    const drawHighWheelerFrame = () => {
        const seat = { x: seatX, y: seatBaseY };
        const upperHead = { x: headX + 5, y: frontWheelY - frontRadius - 11 };
        const rearBrace = { x: rearWheelX + 8, y: rearWheelY - 5 };
        drawTube(rearWheelX, rearWheelY, seat.x, seat.y, frameColor, frameWidth + 1.2);
        drawTube(seat.x, seat.y, upperHead.x, upperHead.y, frameColor, frameWidth + 1.2);
        drawTube(upperHead.x, upperHead.y, frontWheelX, frontWheelY, frameColor, frameWidth + 1.2);
        drawTube(rearWheelX, rearWheelY, rearBrace.x, rearBrace.y, '#9aa8b4', frameWidth * 0.75);
        drawTube(rearBrace.x, rearBrace.y, frontWheelX, frontWheelY, frameColor, frameWidth);
        drawTube(seat.x, seat.y, frontWheelX, frontWheelY, frameColor, frameWidth);
        ctx.fillStyle = '#d6bd82';
        ctx.beginPath();
        ctx.arc(frontWheelX, frontWheelY, 3.1, 0, Math.PI * 2);
        ctx.fill();
    };

    if (draisineFrame) {
        // Наградная рама использует тот же контур, что и Laufmaschine Карла.
        drawDraisineFrame(framePoints, frameColor);
    } else if (macmillanFrame) {
        drawMacmillanFrame();
    } else if (highWheelerFrame) {
        drawHighWheelerFrame();
    } else if (visuals.fullSuspension) {
        drawTube(bottomX, bottomY, seatX, wheelY - 27);
        drawTube(seatX, wheelY - 27, headX, wheelY - 19);
        drawTube(headX, wheelY - 19, bottomX, bottomY);
    } else {
        drawTube(rearWheelX, rearWheelY, bottomX, bottomY);
        drawTube(bottomX, bottomY, seatX, wheelY - 27);
        drawTube(seatX, wheelY - 27, rearWheelX, rearWheelY);
        drawTube(seatX, wheelY - 27, headX, wheelY - 19);
        drawTube(headX, wheelY - 19, bottomX, bottomY);
    }

    if (visuals.fullSuspension) {
        const swingPivot = { x: rearWheelX + 11, y: rearWheelY - 4 };
        const rocker = { x: seatX - 7, y: wheelY - 15 };
        drawTube(rearWheelX, rearWheelY, swingPivot.x, swingPivot.y, frameColor, frameWidth * 0.8);
        drawTube(swingPivot.x, swingPivot.y, bottomX, bottomY, frameColor, frameWidth * 0.8);
        drawTube(rearWheelX, rearWheelY, rocker.x, rocker.y, frameColor, frameWidth * 0.8);
        drawTube(rocker.x, rocker.y, seatX, wheelY - 27, frameColor, frameWidth * 0.8);
        drawTube(rocker.x, rocker.y, swingPivot.x, swingPivot.y, frameColor, frameWidth * 0.8);
        ctx.fillStyle = '#e2e8f0';
        for (const joint of [swingPivot, rocker]) {
            ctx.beginPath();
            ctx.arc(joint.x, joint.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        if (visuals.rearSuspension) {
            const upper = { x: rocker.x + 1, y: rocker.y + 1 };
            const lower = { x: bottomX + 7, y: bottomY - 1 + (bike.rearCompression || 0) * 0.45 };
            drawTube(upper.x, upper.y, lower.x, lower.y, visuals.rearShockColor || '#fbbf24', 2.4);

            // Видимая витая пружина вдоль заднего амортизатора.
            const shockDx = lower.x - upper.x;
            const shockDy = lower.y - upper.y;
            const shockLength = Math.hypot(shockDx, shockDy) || 1;
            const normalX = -shockDy / shockLength;
            const normalY = shockDx / shockLength;
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) {
                const t = 0.18 + i * 0.075;
                const side = i % 2 === 0 ? -2.3 : 2.3;
                const px = upper.x + shockDx * t + normalX * side;
                const py = upper.y + shockDy * t + normalY * side;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
    }

    // Вилка начинается у рулевого стакана и доходит до оси переднего колеса.
    // Раньше верхняя точка была сдвинута вправо, из-за чего вилка выглядела отдельной деталью.
    const forkTop = draisineFrame
        ? framePoints.upperHead
        : highWheelerFrame
            ? { x: headX + 4, y: frontWheelY - frontRadius - 11 }
            : { x: headX + 1, y: wheelY - 19 };
    drawTube(forkTop.x, forkTop.y, frontWheelX - 1, frontWheelY, visuals.forkColor || '#cbd5e1', 4);
    if (visuals.suspension) {
        const forkCompression = bike.frontCompression || 0;
        drawTube(
            forkTop.x + 2,
            forkTop.y + (draisineFrame ? 3 : 2),
            frontWheelX - 3,
            frontWheelY - 5 + forkCompression * 0.35,
            '#fbbf24',
            1.5
        );
    }

    if (!highWheelerFrame) {
    ctx.strokeStyle = visuals.gearColor || '#94a3b8';
    ctx.lineWidth = 0.8;
    for (const gearRadius of [2.4, 3.4, 4.2]) {
        ctx.beginPath();
        ctx.arc(rearWheelX, rearWheelY, gearRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rearWheelX + 1, rearWheelY + 3);
    ctx.lineTo(rearWheelX + 5, rearWheelY + 7);
    ctx.lineTo(rearWheelX + 9, rearWheelY + 4);
    ctx.arc(rearWheelX + 9, rearWheelY + 2, 2, 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.strokeStyle = visuals.chainColor || '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(rearWheelX + 3, rearWheelY - 2.6);
    ctx.lineTo(bottomX - 4, bottomY - 3.5);
    ctx.moveTo(bottomX - 4, bottomY + 3.5);
    ctx.lineTo(rearWheelX + 3, rearWheelY + 2.6);
    ctx.arc(bottomX, bottomY, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    }

    const pedalRadius = highWheelerFrame ? clamp(frontRadius * 0.48, 8, 14) : macmillanFrame ? 10 : 7;
    const pedalPivot = highWheelerFrame ? { x: frontWheelX, y: frontWheelY } : { x: bottomX, y: bottomY };
    const leftPedal = macmillanFrame
        ? { x: x + 2 + Math.cos(pedalAngle) * pedalRadius, y: y - 17 + Math.sin(pedalAngle) * pedalRadius }
        : { x: pedalPivot.x + Math.cos(pedalAngle) * pedalRadius, y: pedalPivot.y + Math.sin(pedalAngle) * pedalRadius };
    const rightPedal = macmillanFrame
        ? { x: x + 2 + Math.cos(pedalAngle + Math.PI) * pedalRadius, y: y - 17 + Math.sin(pedalAngle + Math.PI) * pedalRadius }
        : { x: pedalPivot.x + Math.cos(pedalAngle + Math.PI) * pedalRadius, y: pedalPivot.y + Math.sin(pedalAngle + Math.PI) * pedalRadius };
    ctx.strokeStyle = visuals.crankColor || '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bottomX, bottomY, 4.5, 0, Math.PI * 2);
    if (visuals.chainringCount > 1) {
        ctx.moveTo(bottomX + 6, bottomY);
        ctx.arc(bottomX, bottomY, 6, 0, Math.PI * 2);
        ctx.moveTo(bottomX + 7.5, bottomY);
        ctx.arc(bottomX, bottomY, 7.5, 0, Math.PI * 2);
    }
    if (!macmillanFrame) {
        ctx.moveTo(bottomX, bottomY);
        ctx.lineTo(leftPedal.x, leftPedal.y);
        ctx.moveTo(bottomX, bottomY);
        ctx.lineTo(rightPedal.x, rightPedal.y);
    }
    ctx.stroke();
    if (macmillanFrame) {
        // Кинематика рычажного привода совпадает с велосипедом Макмиллана.
        const drivePivot = { x: x + 2, y: y - 17 };
        ctx.strokeStyle = visuals.macmillanTreadleColor || frameColor || '#8b5a2b';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(drivePivot.x, drivePivot.y, 3.5, 0, Math.PI * 2);
        ctx.moveTo(drivePivot.x, drivePivot.y);
        ctx.lineTo(leftPedal.x, leftPedal.y);
        ctx.moveTo(drivePivot.x, drivePivot.y);
        ctx.lineTo(rightPedal.x, rightPedal.y);
        ctx.moveTo(rearWheelX + 3, rearWheelY + 1);
        ctx.lineTo(leftPedal.x, leftPedal.y);
        ctx.moveTo(rearWheelX + 3, rearWheelY + 1);
        ctx.lineTo(rightPedal.x, rightPedal.y);
        ctx.stroke();
    }
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(leftPedal.x - 3, leftPedal.y);
    ctx.lineTo(leftPedal.x + 3, leftPedal.y);
    ctx.moveTo(rightPedal.x - 3, rightPedal.y);
    ctx.lineTo(rightPedal.x + 3, rightPedal.y);
    ctx.stroke();

    if (draisineFrame) {
        drawDraisineSeatAndCockpit(framePoints, visuals);
    } else {
        ctx.strokeStyle = visuals.seatpostColor || '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(seatX, seatBaseY);
        ctx.lineTo(seatX - 1, saddleY);
        ctx.stroke();
        ctx.strokeStyle = visuals.saddleColor || '#f8fafc';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(seatX - 8, saddleY);
        ctx.lineTo(seatX + 6, saddleY);
        ctx.stroke();
    }

    const hip = draisineFrame
        ? { x: seatX + 1, y: y - 66 }
        : macmillanFrame
            ? { x: x - 5, y: y - 58 }
            : highWheelerFrame
                ? { x: seatX, y: seatBaseY + 1 }
            : { x: seatX + 1, y: wheelY - 35 };
    const shoulder = draisineFrame
        ? { x: x + 1, y: y - 81 }
        : macmillanFrame
            ? { x: x + 1, y: y - 76 }
            : highWheelerFrame
                ? { x: seatX - 2, y: seatBaseY - 18 }
            : { x: x + 1, y: wheelY - 46 };
    const head = draisineFrame
        ? { x: x + 3, y: y - 91 }
        : macmillanFrame
            ? { x: x + 3, y: y - 86 }
            : highWheelerFrame
                ? { x: seatX - 1, y: seatBaseY - 30 }
            : { x: x + 4, y: wheelY - 53 };
    const kneeA = { x: (hip.x + leftPedal.x) / 2 + 3, y: (hip.y + leftPedal.y) / 2 - 3 };
    const kneeB = { x: (hip.x + rightPedal.x) / 2 - 3, y: (hip.y + rightPedal.y) / 2 - 3 };

    const riderFallProgress = !bike.isBot && bike.crashPending
        ? clamp(1 - (Number(bike.crashFrames) || 0) / 42, 0, 1)
        : 0;
    ctx.save();
    const historyPhase = !bike.isBot ? bike.historyVictoryPhase : null;
    const historyPhaseFrame = Number(bike.historyVictoryPhaseFrame) || 0;
    if (historyPhase === 'dismount') {
        ctx.globalAlpha *= 1 - clamp(historyPhaseFrame / 17, 0, 1);
    } else if (historyPhase === 'watch') {
        ctx.globalAlpha = 0;
    }
    if (riderFallProgress > 0) {
        ctx.translate(hip.x, hip.y);
        ctx.rotate(-riderFallProgress * 0.95);
        ctx.translate(
            -hip.x - riderFallProgress * 22,
            -hip.y - riderFallProgress * 4
        );
    }

    // Стиль текущего райдера
    const riderId = (!bike.isBot && visuals?.riderId) ? visuals.riderId : 'r1';
    let jersey = '#16a34a';
    let helmetColor = '#16a34a';
    let pantsColor = '#172033';

    if (bike.isBot) {
        jersey = color;
        helmetColor = color;
    } else {
        if (riderId === 'r1') {
            // Школьник: синяя худи, красная кепка
            jersey = '#2563eb';
            helmetColor = '#ef4444';
            pantsColor = '#1e293b';
        } else if (riderId === 'r2') {
            // Велолюбитель: зеленое велоджерси, оранжевый шлем
            jersey = '#16a34a';
            helmetColor = '#f97316';
            pantsColor = '#0f172a';
        } else if (riderId === 'r3') {
            // Дорожник: оранжевый сигнальный жилет, желтая каска
            jersey = '#ea580c';
            helmetColor = '#eab308';
            pantsColor = '#334155';
        } else if (riderId === 'r4') {
            // Велокурьер: темный технологичный костюм, бирюзовый акцент
            jersey = '#0f172a';
            helmetColor = '#06b6d4';
            pantsColor = '#020617';
        } else if (riderId === 'r5') {
            // Джон: черно-золотой чемпионский даунхилл-костюм
            jersey = '#18181b';
            helmetColor = '#d97706';
            pantsColor = '#09090b';
        } else if (riderId === 'r6') {
            // Карл Дрез: тёмный сюртук, жилет и цилиндр начала XIX века.
            jersey = visuals.riderVisuals?.jerseyColor || '#6b4d31';
            helmetColor = visuals.riderVisuals?.hatColor || '#30251e';
            pantsColor = visuals.riderVisuals?.pantsColor || '#332c24';
        }
    }

    ctx.lineCap = 'round';
    if (draisineFrame) {
        const pushing = bike.grounded && !bike.isBot && input.accelerating;
        const step = pushing ? Math.sin(frameCounter * 0.13) * 9 : 0;
        const footY = bike.grounded ? groundY - 1 : y - 6;
        const nearKnee = {
            x: x - 14 + step * 0.52,
            y: bike.grounded ? groundY - 20 - Math.max(0, step) * 0.22 : y - 20
        };
        const farKnee = {
            x: x - 2 - step * 0.46,
            y: bike.grounded ? groundY - 24 - Math.max(0, -step) * 0.2 : y - 23
        };
        const nearFootX = x - 17 + step;
        const farFootX = x - 4 - step * 0.9;

        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(farKnee.x, farKnee.y);
        ctx.lineTo(farFootX, footY);
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(nearKnee.x, nearKnee.y);
        ctx.lineTo(nearFootX, footY);
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(nearKnee.x, nearKnee.y, 1.8, 0, Math.PI * 2);
        ctx.arc(farKnee.x, farKnee.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#211a14';
        ctx.fillRect(nearFootX - 3, footY - 1, 7, 2.5);
        ctx.fillRect(farFootX - 3, footY - 1, 7, 2.5);
    } else if (macmillanFrame) {
        const phaseSin = Math.sin(pedalAngle);
        const phaseCos = Math.cos(pedalAngle);
        const nearKnee = { x: x - 1 + phaseCos * 4, y: y - 38 + phaseSin * 5 };
        const farKnee = { x: x + 6 - phaseCos * 4, y: y - 38 - phaseSin * 5 };
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(farKnee.x, farKnee.y);
        ctx.lineTo(rightPedal.x, rightPedal.y);
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(nearKnee.x, nearKnee.y);
        ctx.lineTo(leftPedal.x, leftPedal.y);
        ctx.stroke();
        ctx.fillStyle = '#211a14';
        ctx.fillRect(leftPedal.x - 3, leftPedal.y - 1, 7, 2.5);
        ctx.fillRect(rightPedal.x - 3, rightPedal.y - 1, 7, 2.5);
    } else {
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(kneeB.x, kneeB.y);
        ctx.lineTo(rightPedal.x, rightPedal.y);
        ctx.stroke();
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(kneeA.x, kneeA.y);
        ctx.lineTo(leftPedal.x, leftPedal.y);
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(kneeA.x, kneeA.y, 1.8, 0, Math.PI * 2);
        ctx.arc(kneeB.x, kneeB.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(leftPedal.x - 2, leftPedal.y - 1.2, 5, 2.4);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(rightPedal.x - 2, rightPedal.y - 1.2, 5, 2.4);
    }

    // Яркая сумка выступает за силуэт спины и остаётся заметной в небольшом
    // масштабе гонки; рисуем её до корпуса, чтобы она выглядела надетой.
    if (riderId === 'r4') {
        const bagX = hip.x - 20;
        const bagY = shoulder.y + 1;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(bagX + 2, bagY);
        ctx.lineTo(bagX + 15, bagY);
        ctx.lineTo(bagX + 17, bagY + 3);
        ctx.lineTo(bagX + 16, bagY + 19);
        ctx.lineTo(bagX, bagY + 19);
        ctx.lineTo(bagX - 1, bagY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(bagX, bagY + 3, 16, 3.5);
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(bagX + 2, bagY + 10, 12, 3);
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(bagX + 6, bagY + 1, 4, 2);
    }

    // Торс / Джерси
    ctx.fillStyle = jersey;
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 4, shoulder.y - 1);
    ctx.lineTo(shoulder.x + 3, shoulder.y - 2);
    ctx.lineTo(hip.x + 5, hip.y + 1);
    ctx.lineTo(hip.x - 4, hip.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Особые детали одежды райдеров
    if (!bike.isBot) {
        if (riderId === 'r1') {
            // Школьный рюкзак за спиной!
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(hip.x - 8, shoulder.y + 2, 7, 10);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(hip.x - 8, shoulder.y + 7);
            ctx.lineTo(hip.x - 1, shoulder.y + 7);
            ctx.stroke();
        } else if (riderId === 'r3') {
            // Сигнальные светоотражающие полосы дорожника
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(shoulder.x - 3, shoulder.y + 3);
            ctx.lineTo(hip.x + 3, hip.y - 4);
            ctx.moveTo(shoulder.x + 1, shoulder.y + 3);
            ctx.lineTo(hip.x - 2, hip.y - 4);
            ctx.stroke();
        } else if (riderId === 'r5') {
            // Джон: золотые полосы чемпиона
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(shoulder.x - 2, shoulder.y + 1);
            ctx.lineTo(hip.x + 1, hip.y);
            ctx.stroke();
        } else if (riderId === 'r6') {
            // Светлая линия жилета делает исторический костюм читаемым в масштабе гонки.
            ctx.strokeStyle = '#c6a06b';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(shoulder.x, shoulder.y + 1);
            ctx.lineTo(hip.x, hip.y);
            ctx.stroke();
        }
    }

    if (riderId === 'r4') {
        // Контрастная лямка перекинута через плечо к сумке на спине.
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(shoulder.x + 2, shoulder.y + 1);
        ctx.lineTo(hip.x - 13, hip.y - 1);
        ctx.stroke();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shoulder.x + 2, shoulder.y + 1);
        ctx.lineTo(hip.x - 13, hip.y - 1);
        ctx.stroke();
    }

    const elbow = draisineFrame
        ? { x: x + 9, y: y - 72 }
        : { x: x + 10, y: wheelY - 42 };
    const hand = draisineFrame
        ? { x: x + 25, y: y - 73 }
        : { x: headX + 13, y: wheelY - 37 };
    ctx.strokeStyle = jersey;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(shoulder.x + 1, shoulder.y + 1);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.stroke();
    ctx.strokeStyle = '#f1c9a5';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = '#f1c9a5';
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Шея и голова
    ctx.strokeStyle = '#f1c9a5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shoulder.x + 1, shoulder.y - 1);
    ctx.lineTo(head.x - 1, head.y + 2);
    ctx.stroke();
    ctx.fillStyle = '#f1c9a5';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // Головной убор / шлем
    ctx.fillStyle = helmetColor;
    if (!bike.isBot && riderId === 'r1') {
        // Кепка козырьком назад
        ctx.beginPath();
        ctx.ellipse(head.x - 0.2, head.y - 2.5, 4.3, 2.2, -0.08, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(head.x - 4, head.y - 2);
        ctx.lineTo(head.x - 7, head.y - 1); // козырек назад
        ctx.stroke();
    } else if (!bike.isBot && riderId === 'r5') {
        // Джон: крутой фуллфейс-шлем с визором
        ctx.beginPath();
        ctx.arc(head.x, head.y - 1, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a'; // черный зеркальный визор
        ctx.fillRect(head.x - 0.5, head.y - 2.5, 5, 2.8);
    } else if (!bike.isBot && riderId === 'r6') {
        // Небольшой цилиндр вместо современного шлема.
        ctx.fillStyle = visuals.riderVisuals?.hatColor || '#30251e';
        ctx.fillRect(head.x - 4.5, head.y - 2.6, 9, 2.2);
        ctx.fillRect(head.x - 3.1, head.y - 8.2, 6.2, 6);
    } else {
        // Стандартный велошлем или каска
        ctx.beginPath();
        ctx.ellipse(head.x - 0.3, head.y - 2.5, 4.6, 2.3, -0.08, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(head.x - 4.5, head.y - 2.2);
        ctx.lineTo(head.x + 4, head.y - 2.2);
        ctx.stroke();
    }

    ctx.restore(); // Райдер отделяется от рамы при падении.

    if (!draisineFrame) {
        const handlebarStemTopY = highWheelerFrame ? y - 75 : wheelY - 19;
        const handlebarY = highWheelerFrame ? y - 74 : wheelY - 35;
        ctx.strokeStyle = visuals.stemColor || visuals.handlebarColor || '#f8fafc';
        ctx.lineWidth = Math.max(2.2, (visuals.handlebarWidth || 2) + 0.4);
        ctx.beginPath();
        ctx.moveTo(headX, handlebarStemTopY + 15);
        ctx.lineTo(headX + 2, handlebarY);
        ctx.stroke();

        ctx.strokeStyle = visuals.handlebarColor || '#f8fafc';
        ctx.lineWidth = visuals.handlebarWidth || 2;
        ctx.beginPath();
        ctx.moveTo(headX + 2, handlebarY);
        ctx.lineTo(headX + 14, handlebarY);
        ctx.moveTo(headX - 3, handlebarY - 2);
        ctx.lineTo(headX + 19, handlebarY - 2);
        ctx.stroke();
    }

    if (visuals.motor) {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(bottomX - 3, bottomY - 5, 10, 8);
        ctx.fill();
        ctx.stroke();
    }

    if (bike.macmillanBurstTimer > 0) {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(rearWheelX - 4, wheelY - 2);
        ctx.lineTo(rearWheelX - 20 - Math.random() * 3, wheelY - 6);
        ctx.lineTo(rearWheelX - 11, wheelY + 2);
        ctx.closePath();
        ctx.fill();
    }

    if (bike.springBoostTimer > 0) {
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.moveTo(rearWheelX - 4, wheelY - 2);
        ctx.lineTo(rearWheelX - 14 - Math.random() * 4, wheelY - 5);
        ctx.lineTo(rearWheelX - 10, wheelY + 2);
        ctx.closePath();
        ctx.fill();
    }

    if (bike.nitroTimer > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(rearWheelX - 8, wheelY - 2);
        ctx.lineTo(rearWheelX - 25 - Math.random() * 7, wheelY - 7);
        ctx.lineTo(rearWheelX - 17, wheelY + 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.moveTo(rearWheelX - 8, wheelY - 1);
        ctx.lineTo(rearWheelX - 18, wheelY - 4);
        ctx.lineTo(rearWheelX - 12, wheelY + 2);
        ctx.closePath();
        ctx.fill();
    }

    if (bike.shieldActiveTimer > 0) {
        ctx.strokeStyle = 'rgba(56,189,248,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, wheelY - 4, 42, 31, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore(); // Возвращаем наклон холста после отрисовки велосипеда.
    ctx.restore(); // Убираем только визуальное увеличение велосипеда.

    if (!bike.isBot && ['dismount', 'watch'].includes(historyPhase)) {
        const runnerWorldX = Number.isFinite(Number(bike.historyVictoryRunnerX))
            ? Number(bike.historyVictoryRunnerX)
            : bike.x - 10;
        const riseProgress = historyPhase === 'dismount'
            ? easeOutCubic((historyPhaseFrame + 1) / 22)
            : 1;
        drawPlayerHistoryObserver(
            runnerWorldX - cameraX,
            getGroundY(runnerWorldX, 0),
            historyPhaseFrame,
            riseProgress,
            visuals,
            visuals.macmillanFrame || visuals.macmillan ? 'macmillan' : ''
        );
    }

    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, x, highWheelerFrame ? seatBaseY - 45 : wheelY - (draisineFrame ? 108 : 63));
    ctx.restore();
}

function drawRaceHUD() {
    if (currentTrack?.isHistory) {
        ctx.save();
        const badgeWidth = Math.min(270, Math.max(185, viewWidth * 0.46));
        ctx.fillStyle = 'rgba(31, 24, 18, .78)';
        ctx.strokeStyle = 'rgba(230, 180, 108, .7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(12, 12, badgeWidth, 34, 8);
        else ctx.rect(12, 12, badgeWidth, 34);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f2d5a5';
        ctx.font = '900 11px Arial';
        const chapterLength = Number(currentTrack.historyChapter) === 3 ? 6 : 5;
        ctx.fillText(`ИСТОРИЯ · ГЛАВА ${Number(currentTrack.historyChapter) || 1} · ${currentTrack.historyStage}/${chapterLength} · ${currentTrack.year}`, 22, 29);
        ctx.restore();
    }

    if (currentTrack?.id === 'sprint') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f8fafc';
        ctx.font = '900 32px Arial';
        ctx.fillText(`${(raceTimeMs / 1000).toFixed(2)} сек`, viewWidth / 2, 45);

        if (Number(player.bestSprintTime) > 0) {
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(
                `Рекорд: ${(Number(player.bestSprintTime) / 1000).toFixed(2)} сек`,
                viewWidth / 2,
                65
            );
        }
        ctx.restore();
    }

    const racers = [
        {
            bike: playerBike,
            // Число рывков уже показано на кнопке E; не дублируем его в HUD.
            label: `🚴 ТЫ${playerBike.abilities?.shieldCharges > 0 || playerBike.shieldActiveTimer > 0 ? ' 🛡️' : ''}`,
            color: '#22c55e'
        },

        ...activeBots.map((bike, index) => {
            const icon = bike.nitroTimer > 0
                ? ' ⚡'
                : bike.springBoostTimer > 0
                    ? ' ↗'
                    : bike.abilities?.superJumpUnlocked
                    ? ' ✦'
                    : bike.abilities?.shieldCharges > 0 ||
                      bike.shieldActiveTimer > 0
                        ? ' 🛡'
                        : '';

            return {
                bike,
                label: `${bike.displayName}${icon}${bike.abilities?.macmillanBurst ? ` ⏩${bike.macmillanBurstCharges}` : ''}`,
                color: bike.color
            };
        })
    ];

    const mobileLayout =
    window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(pointer: coarse)').matches;
    const landscapePhone = mobileLayout &&
        window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    // The progress comparison HUD was taking too much of the playfield on
    // landscape phones. Scale its complete layout while still cancelling the
    // camera zoom so the HUD remains fixed-size relative to the screen.
    const hudScale = landscapePhone ? 0.72 : 1;
    const uiScale = mobileLayout ? hudScale / getCameraZoom() : 1;
    const panelWidth = mobileLayout
        ? Math.min((landscapePhone ? 360 : 390) * uiScale, viewWidth - 20 * uiScale)
        : Math.min(390, viewWidth - 28);
    const rowHeight = mobileLayout ? (landscapePhone ? 22 : 29) * uiScale : 19;
    const panelHeight = mobileLayout
        ? ((landscapePhone ? 28 : 42) + racers.length * (landscapePhone ? 22 : 29)) * uiScale
        : 35 + racers.length * rowHeight;
    const panelX = mobileLayout ? 12 * uiScale : 14;
    const panelY = mobileLayout ? (landscapePhone ? 32 : 52) * uiScale : 12;
    const pad = mobileLayout ? 11 * uiScale : 11;
    const titleHeight = mobileLayout ? (landscapePhone ? 18 : 24) * uiScale : 18;
    const rowOffset = mobileLayout ? (landscapePhone ? 22 : 34) * uiScale : 31;
    const rowBarHeight = mobileLayout ? (landscapePhone ? 8 : 11) * uiScale : 7;

    ctx.fillStyle = mobileLayout ? 'rgba(15,23,42,0.94)' : 'rgba(15,23,42,0.84)';
    ctx.strokeStyle = 'rgba(148,163,184,0.42)';
    ctx.lineWidth = mobileLayout ? 1.5 * uiScale : 1;

    ctx.fillRect(
        panelX,
        panelY,
        panelWidth,
        panelHeight
    );
    if (mobileLayout) ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.font = `bold ${mobileLayout ? (landscapePhone ? 12 : 15) * uiScale : 13}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';

    ctx.fillText(
        currentTrack.name,
        panelX + pad,
        panelY + titleHeight
    );

    const labelWidth = mobileLayout ? Math.min((landscapePhone ? 88 : 105) * uiScale, panelWidth * 0.34) : 53;
    const percentWidth = mobileLayout ? (landscapePhone ? 36 : 42) * uiScale : 38;

    const barX = panelX + pad + labelWidth;

    const barWidth = Math.max(
        mobileLayout ? (landscapePhone ? 60 : 70) * uiScale : 55,
        panelWidth - labelWidth - percentWidth - (mobileLayout ? 24 * uiScale : 24)
    );

    racers.forEach((racer, index) => {
        const progress = clamp(
            racer.bike.x / finishX,
            0,
            1
        );

        const y = panelY + rowOffset + index * rowHeight;

        ctx.font = `bold ${mobileLayout ? (landscapePhone ? 11 : 13) * uiScale : 10}px Arial`;
        ctx.textAlign = 'left';
        ctx.fillStyle = racer.color;

        ctx.fillText(
            racer.label,
            panelX + pad,
            y + rowBarHeight
        );

        ctx.fillStyle = '#334155';

        ctx.fillRect(
            barX,
            y,
            barWidth,
            rowBarHeight
        );

        ctx.fillStyle = racer.color;

        ctx.fillRect(
            barX,
            y,
            barWidth * progress,
            rowBarHeight
        );

        ctx.textAlign = 'right';
        ctx.fillStyle = '#e2e8f0';

        ctx.fillText(
            `${Math.round(progress * 100)}%`,
            panelX + panelWidth - pad,
            y + rowBarHeight
        );
    });
}

// =========================================
// ФИНИШНАЯ ЛИНИЯ
// =========================================

function drawFinishLine() {
    const screenX = finishX - cameraX;

    if (
        screenX < -30 ||
        screenX > viewWidth + 40
    ) {
        return;
    }

    const ground = getGroundY(finishX, 0);
    const topY = ground - 65;

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.moveTo(screenX, topY);
    ctx.lineTo(screenX, ground);

    ctx.stroke();

    const tile = 10;

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 2; col++) {
            ctx.fillStyle = (row + col) % 2 === 0
                ? '#f8fafc'
                : '#0f172a';

            ctx.fillRect(
                screenX + col * tile,
                topY + row * tile,
                tile,
                tile
            );
        }
    }
}

// =========================================
// ОТРИСОВКА КАДРА
// =========================================

function render() {
    if (
        !ctx ||
        !canvas ||
        !playerBike
    ) {
        return;
    }

    updateRaceViewportTransform();

    drawBackground();
    ctx.save();
    ctx.translate(0, cameraVerticalOffset);
    ctx.globalAlpha = terrainVisibility;
    drawTrack();
    drawObstacles();
    drawCollectibles();
    drawFinishLine();
    ctx.restore();

    const drawBot = bike => {
        const label = bike.nitroTimer > 0
            ? `${bike.displayName} ⚡`
            : bike.springBoostTimer > 0
                ? `${bike.displayName} ↗`
                : bike.abilities?.superJumpUnlocked
                ? `${bike.displayName} ✦`
                : bike.abilities?.shieldCharges > 0 ||
                  bike.shieldActiveTimer > 0
                    ? `${bike.displayName} 🛡`
                    : bike.displayName;

        drawBike(
            bike,
            label,
            bike.color
        );
    };

    ctx.save();
    ctx.translate(0, cameraVerticalOffset);
    activeBots.filter(bike => !bike.isGhost).forEach(drawBot);

    drawBike(
        playerBike,
        `ТЫ${playerBike.abilities?.shieldCharges > 0 || playerBike.shieldActiveTimer > 0 ? ' 🛡️' : ''}`,
        playerBike.color
    );

    // Рисуем призрака поверх игрока, чтобы он оставался заметен при совпадении позиций.
    activeBots.filter(bike => bike.isGhost).forEach(drawBot);
    ctx.restore();

    if (!historyVictoryOutro) {
        ctx.save();
        ctx.translate(0, cameraVerticalOffset);
        drawFloatingTexts();
        ctx.restore();
        drawRaceHUD();
    } else {
        drawHistoryCinematicOverlay();
    }
}

function updateRaceViewportTransform() {
    if (!ctx || !canvas) return;

    // In the goodbye scene the riders need to remain readable on a phone.
    // A slow optical push gives the scene intimacy without changing gameplay zoom.
    const zoomIn = historyVictoryOutro
        ? 1 + 0.22 * easeOutCubic(historyVictoryOutro.elapsed / 84)
        : 1;
    // Масштаб во время прыжка не меняется. Вместо "уменьшения" велосипеда
    // камера плавно сопровождает его по вертикали, а трасса уходит вниз.
    const zoom = baseRaceZoom * zoomIn;
    viewWidth = canvasCssWidth / zoom;
    viewHeight = canvasCssHeight / zoom;
    ctx.setTransform(canvasDpr * zoom, 0, 0, canvasDpr * zoom, 0, 0);

    const groundY = playerBike ? getGroundY(playerBike.x, 0) : viewHeight * 0.72;
    const jumpHeight = playerBike && !historyVictoryOutro
        ? Math.max(0, Number(playerBike.jumpHeight) || 0) + Math.max(0, Number(playerBike.rampLift) || 0)
        : 0;
    const riderTopY = groundY - jumpHeight - 124;
    const safeTopY = Math.max(34, canvasCssHeight * 0.18) / zoom;
    const targetVerticalOffset = Math.max(0, safeTopY - riderTopY);
    const followRate = targetVerticalOffset > cameraVerticalOffset ? 0.12 : 0.075;
    cameraVerticalOffset += (targetVerticalOffset - cameraVerticalOffset) * followRate;
    if (Math.abs(targetVerticalOffset - cameraVerticalOffset) < 0.15) {
        cameraVerticalOffset = targetVerticalOffset;
    }

    const altitudeProgress = clamp(cameraVerticalOffset / Math.max(1, viewHeight * 0.72), 0, 1);
    terrainVisibility = 1 - 0.94 * easeOutCubic(altitudeProgress);
}

function drawHistoryCinematicOverlay() {
    const outro = historyVictoryOutro;
    if (!outro) return;

    const openingFade = 1 - easeOutCubic(outro.elapsed / 28);
    const closingFade = outro.phase === 'endFade'
        ? easeInOutCubic(outro.phaseFrame / 20) * 0.94
        : 0;
    const transitionFade = Math.max(openingFade, closingFade);
    const barHeight = 22 * easeOutCubic(outro.elapsed / 18);

    ctx.save();
    ctx.fillStyle = 'rgba(80, 53, 28, 0.055)';
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const vignetteRadius = Math.max(viewWidth, viewHeight) * 0.78;
    const vignette = ctx.createRadialGradient(
        viewWidth * 0.5,
        viewHeight * 0.46,
        Math.min(viewWidth, viewHeight) * 0.18,
        viewWidth * 0.5,
        viewHeight * 0.46,
        vignetteRadius
    );
    vignette.addColorStop(0, 'rgba(3, 7, 12, 0)');
    vignette.addColorStop(1, `rgba(3, 7, 12, ${0.34 + transitionFade * 0.5})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    if (transitionFade > 0.005) {
        ctx.fillStyle = `rgba(2, 4, 8, ${transitionFade})`;
        ctx.fillRect(0, 0, viewWidth, viewHeight);
    }

    ctx.fillStyle = 'rgba(4, 7, 12, 0.92)';
    ctx.fillRect(0, 0, viewWidth, barHeight);
    ctx.fillRect(0, viewHeight - barHeight, viewWidth, barHeight);
    if (barHeight > 15) {
        ctx.font = '600 12px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(239, 224, 192, 0.82)';
        const location = currentTrack?.historyCinematicLocation || currentTrack?.name || 'ИСТОРИЯ';
        const year = currentTrack?.year ? ` · ${currentTrack.year}` : '';
        ctx.fillText(`${location}${year}`, 28, barHeight * 0.5);
    }
    ctx.restore();
}

// =========================================
// ОБНОВЛЕНИЕ ГОНКИ
// =========================================

function update() {
    if (!raceRunning || raceFinished) return;

    if (historyVictoryOutro) {
        updateHistoryVictoryOutro();
        return;
    }

    if (playerBike?.crashPending) {
        frameCounter++;
        updateBikeFlipRecovery(playerBike);
        playerBike.crashFrames = Math.max(
            0,
            (Number(playerBike.crashFrames) || 0) - 1
        );
        if (playerBike.crashFrames === 0) {
            finishRace(false, playerBike.crashReason || 'hard-landing');
        }
        return;
    }

    // Боты не разгоняются, пока игрок сам не начнёт заезд.
    if (!raceStarted) {
        if (!input.accelerating && !input.reversing && !input.jumpRequested) {
            return;
        }
        raceStarted = true;
    }

    // Запускаем секундомер на том же шаге, что и первое ускорение.
    // Время считается симуляционными кадрами, чтобы лаги браузера не
    // ускоряли призрака относительно физики игрока.
    if (!timerStarted && (input.accelerating || input.reversing || Math.abs(playerBike.velocityX) > 0.05)) {
        timerStarted = true;
        raceTimeMs = 0;
    }

    frameCounter++;

    updatePlayerPhysics();
    updateCollectibles();

    if (raceFinished) return;

    if (timerStarted) {
        raceTimeMs += SIMULATION_STEP_MS;
    }

    if (
        playerBike.x >= finishX &&
        playerBike.finishFrame === null
    ) {
        playerBike.finishFrame = frameCounter;
    }

    if (currentTrack?.id === 'sprint') {
        activeBots.forEach(bike => {
            if (!bike.isGhost || !timerStarted) return;

            const previousX = bike.x;
            // Координата 0 — корректная линия старта, её нельзя заменять
            // текущей позицией игрока через проверку на ложное значение.
            const ghostStartX = Number(bike.ghostStartX ?? playerBike.x);
            const progress = getSprintGhostProgress(
                raceTimeMs,
                player.bestSprintTime
            );

            bike.previousX = previousX;
            bike.x = Math.min(
                finishX,
                ghostStartX + progress * (finishX - ghostStartX)
            );
            bike.grounded = true;
            bike.jumpHeight = 0;
            bike.rampLift = 0;

            if (bike.x >= finishX && bike.finishFrame === null) {
                bike.finishFrame = frameCounter;
            }
        });
    } else {
        activeBots.forEach(bike => updateBotPhysics(bike));
    }

    updatePlayerCollisions();

    if (raceFinished) return;

    activeBots.forEach(bike => {
        updateBotCollisions(bike);
    });

    const isMobileScreen = (window.innerWidth || 800) <= 768;
    const cameraLead = isMobileScreen ? 0.24 : 0.34;

    const targetCamera = Math.max(
        0,
        playerBike.x - viewWidth * cameraLead
    );

    cameraX +=
        (targetCamera - cameraX) * 0.12;

    checkFinish();
}

function gameLoop(timestamp = performance.now()) {
    if (!raceRunning || raceFinished) {
        lastFrameTime = 0;
        frameAccumulator = 0;
        return;
    }

    if (lastFrameTime === 0) {
        lastFrameTime = timestamp - SIMULATION_STEP_MS;
    }

    const elapsedMs = Math.min(
        Math.max(0, timestamp - lastFrameTime),
        MAX_FRAME_DELTA_MS
    );
    lastFrameTime = timestamp;
    frameAccumulator = Math.min(
        frameAccumulator + elapsedMs,
        MAX_FRAME_DELTA_MS
    );

    while (
        frameAccumulator >= SIMULATION_STEP_MS &&
        raceRunning &&
        !raceFinished
    ) {
        update();
        frameAccumulator -= SIMULATION_STEP_MS;
    }

    render();

    if (raceRunning && !raceFinished) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// =========================================
// РАЗМЕР CANVAS
// =========================================

function resizeCanvas() {
    if (!canvas || canvas.offsetParent === null) return;

    const rect = canvas.getBoundingClientRect();

    mobilePerformanceMode = document.documentElement.classList.contains('touch-device')
        || window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.max(
        1,
        Math.min(2, window.devicePixelRatio || 1)
    );

    const canvasWidth = Math.max(320, rect.width || canvas.clientWidth || 800);
    const canvasHeight = Math.max(220, rect.height || canvas.clientHeight || 420);
    const zoom = getCameraZoom();
    canvasCssWidth = canvasWidth;
    canvasCssHeight = canvasHeight;
    canvasDpr = dpr;
    baseRaceZoom = zoom;
    viewWidth = canvasWidth / zoom;
    viewHeight = canvasHeight / zoom;

    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    backgroundGradientCache.clear();

    ctx = canvas.getContext('2d', mobilePerformanceMode
        ? { desynchronized: true }
        : undefined);

    if (ctx) {
        ctx.setTransform(
            dpr * zoom,
            0,
            0,
            dpr * zoom,
            0,
            0
        );
    }
}

// =========================================
// ЗАПУСК / ПЕРЕЗАПУСК ГОНКИ
// =========================================

export function initRace(onRaceEnd) {
    setHistoryCinematicMode(false);
    if (raceAutosaveBatchActive) {
        endAutosaveBatch();
        raceAutosaveBatchActive = false;
    }
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    canvas = document.getElementById('raceCanvas');

    if (!canvas) {
        console.error(
            'Не найден canvas с id="raceCanvas".'
        );

        return;
    }

    callbackOnRaceEnd = onRaceEnd;

    currentTrack = [...TRACKS_DB, ...HISTORY_TRACKS_DB].find(
        track => track.id === player.selectedTrack
    ) || TRACKS_DB[0];

    if (!currentTrack) {
        console.error(
            'В TRACKS_DB нет ни одной трассы.'
        );

        return;
    }

    beginAutosaveBatch();
    raceAutosaveBatchActive = true;

    currentTrackLevel = getTrackLevel();
    timerStarted = false;
    raceTimeMs = 0;
    lastFrameTime = 0;
    frameAccumulator = 0;

    resizeCanvas();
    setTimeout(resizeCanvas, 50);

    finishX = (currentTrack.id === 'sprint' || currentTrack.id === 'l3')
        ? 4500
        : Math.max(
            6000,
            ((Number(currentTrack.length) || 15000) *
            TRACK_MULTIPLIER - 1500) * TRACK_DISTANCE_SCALE
        );

    playerBike = createBike(false);
    syncAbilityButtons();
    const brakeButton = document.getElementById('btn-brake');
    if (brakeButton) {
        brakeButton.disabled = !playerBike.hasBrakes;
        brakeButton.setAttribute('aria-disabled', String(!playerBike.hasBrakes));
        brakeButton.title = playerBike.hasBrakes ? 'Тормоз установлен' : 'Установи тормоз, чтобы тормозить';
        brakeButton.classList.toggle('opacity-50', !playerBike.hasBrakes);
        brakeButton.classList.toggle('cursor-not-allowed', !playerBike.hasBrakes);
    }
    botBike = null;
    additionalBots = [];
    activeBots = [];

    if (currentTrack.id === 'sprint') {
        if (Number(player.bestSprintTime) > 0) {
            botBike = createBike(true, 1);
            botBike.displayName = 'Твой рекорд';
            botBike.color = '#94a3b8';
            botBike.visuals.frameColor = '#94a3b8';
            botBike.visuals.forkColor = '#cbd5e1';
            botBike.visuals.rimColor = '#cbd5e1';
            botBike.isGhost = true;
            botBike.ghostStartX = playerBike.x;
            botBike.x = playerBike.x;
            botBike.previousX = playerBike.x;
            activeBots.push(botBike);
        }
    } else {
        botBike = createBike(true, 1);
        if (currentTrack.isHistory) {
            const isChapterTwoQualifier = Number(currentTrack.historyChapter) === 2
                && Number(currentTrack.historyStage) <= 4;
            botBike.displayName = isChapterTwoQualifier
                ? 'Макс'
                : currentTrack.opponent || 'Макс';
            const macmillanFinal = Number(currentTrack.historyChapter) === 2 && Number(currentTrack.historyStage) === 5;
            botBike.abilities = { nitroUnlocked: false, superJumpUnlocked: false, shieldCharges: 0, macmillanBurst: macmillanFinal };
            botBike.macmillanBurstCharges = macmillanFinal ? 3 : 0;
            if (Number(currentTrack.historyChapter) === 1 && currentTrack.historyStage === 5) {
                botBike.color = '#8b5a2b';
                botBike.visuals = {
                    ...botBike.visuals,
                    draisine: true,
                    frameColor: '#9a6538',
                    rimColor: '#704522',
                    hubColor: '#c4965d',
                    wheelRadius: 13,
                    rearWheelRadius: 15,
                    frontWheelRadius: 12
                };
            } else if (Number(currentTrack.historyChapter) === 2 && currentTrack.historyStage === 5) {
                botBike.color = '#8b5a2b';
                botBike.visuals = {
                    ...botBike.visuals,
                    macmillan: true,
                    macmillanTreadles: true,
                    macmillanTreadleColor: '#8b5a2b',
                    frameColor: '#8b5a2b',
                    rimColor: '#704522',
                    hubColor: '#c4965d',
                    wheelRadius: 13,
                    rearWheelRadius: 15,
                    frontWheelRadius: 9,
                    handlebarColor: '#704522',
                    stemColor: '#704522',
                    saddleColor: '#342319',
                    seatpostColor: '#704522'
                };
            } else if (Number(currentTrack.historyChapter) === 3 && Number(currentTrack.historyStage) === 6) {
                botBike.color = '#65778a';
                botBike.visuals = {
                    ...botBike.visuals,
                    highWheelerBoss: true,
                    frontWheelDriveColor: '#d6bd82',
                    frameColor: '#536579',
                    rimColor: '#8695a1',
                    hubColor: '#d6bd82',
                    wheelRadius: 20,
                    rearWheelRadius: 8,
                    frontWheelRadius: 20,
                    handlebarColor: '#4b5563',
                    stemColor: '#4b5563',
                    saddleColor: '#302a22',
                    seatpostColor: '#4b5563'
                };
            }
        }
        const chapterTwoQualifiers = currentTrack.isHistory && Number(currentTrack.historyChapter) === 2 && Number(currentTrack.historyStage) <= 4;
        additionalBots = (!currentTrack.isHistory && currentTrackLevel >= 3) || chapterTwoQualifiers
            ? [createBike(true, 2)]
            : [];
        activeBots = [botBike, ...additionalBots];
    }

    cameraX = 0;
    cameraVerticalOffset = 0;
    terrainVisibility = 1;
    frameCounter = 0;

    raceFinished = false;
    raceRunning = true;
    raceStarted = false;
    historyVictoryOutro = null;

    input = {
        accelerating: false,
        braking: false,
        reversing: false,
        jumpRequested: false
    };
    updateReverseButtonLabel();

    obstacles = createObstacles();
    collectedRaceCoins = 0;
    floatingTexts = [];
    collectibles = createCollectibles();

    if (!resizeHandlerAttached) {
        window.addEventListener(
            'resize',
            resizeCanvas
        );
        window.addEventListener('orientationchange', () => {
            window.setTimeout(resizeCanvas, 140);
        }, { passive: true });
        window.visualViewport?.addEventListener('resize', resizeCanvas, { passive: true });

        resizeHandlerAttached = true;
    }

    render();

    animationId = requestAnimationFrame(gameLoop);
}

// =========================================
// УПРАВЛЕНИЕ ИГРОКОМ ИЗ MAIN.JS
// =========================================

export function activateNitroBoost() {
    if (
        !raceRunning || !raceStarted || raceFinished ||
        !playerBike?.abilities?.nitroUnlocked || playerBike.nitroCooldown > 0
    ) return false;

    playerBike.nitroTimer = 120;
    playerBike.nitroCooldown = 480;
    syncAbilityButtons();
    return true;
}

export function activateMacmillanBurst() {
    if (
        !raceRunning || !raceStarted || raceFinished ||
        !playerBike?.abilities?.macmillanBurst || playerBike.macmillanBurstCharges <= 0 ||
        !playerBike.grounded || playerBike.impactSlowTimer > 0 || playerBike.flippedTimer > 0 ||
        playerBike.crashPending || input.braking || input.reversing || playerBike.macmillanBurstRequested
    ) return false;

    playerBike.macmillanBurstRequested = true;
    return true;
}

export function setAccelerating(value) {
    input.accelerating = Boolean(value);
}

export function setBraking(value) {
    input.braking = Boolean(value && playerBike?.hasBrakes);
}

export function setReversing(value) {
    input.reversing = Boolean(value);
    updateReverseButtonLabel();
}

export function triggerJump() {
    if (!raceRunning || raceFinished || !playerBike) return;

    // Разрешаем прыжок только на земле или за мгновение до приземления
    if (playerBike.grounded || (playerBike.jumpVelocity < 0 && playerBike.jumpHeight < 6)) {
        input.jumpRequested = true;
    }
}
