import { player } from './state.js?v=25';
import { TRACKS_DB, OBSTACLE_TYPES, ITEMS_DB } from './db.js?v=25';

// =========================================
// VELOCITY RACE ENGINE
// Игрок и боты едут по одной общей трассе
// и встречают одни и те же препятствия.
// =========================================

const GRAVITY = 0.42;
const BIKE_WIDTH = 46;
const BIKE_HEIGHT = 24;
const TRACK_MULTIPLIER = 3;
const OBSTACLE_MULTIPLIER = 3;
const RACE_ZOOM_DESKTOP = 0.86;
const RACE_ZOOM_MOBILE_PORTRAIT = 0.60;
const RACE_ZOOM_MOBILE_LANDSCAPE = 0.70;
const PLAYER_LANE_OFFSET = 0;
const BOT_LANE_OFFSET = 0;

function getCameraZoom() {
    const w = window.innerWidth || 800;
    const h = window.innerHeight || 600;
    if (w <= 520) return RACE_ZOOM_MOBILE_PORTRAIT;
    if (w <= 920 && h <= 540) return RACE_ZOOM_MOBILE_LANDSCAPE;
    if (w <= 768) return 0.68;
    return RACE_ZOOM_DESKTOP;
}

const TRACK_BALANCE = {
    t1:  { speed: 0.70, accel: 0.65, jumpForce: 10.5 },
    t2:  { speed: 0.58, accel: 0.65, jumpForce: 10.5 },
    t3:  { speed: 0.52, accel: 0.68, jumpForce: 10.7 },
    t4:  { speed: 0.46, accel: 0.70, jumpForce: 10.7 },
    t5:  { speed: 0.43, accel: 0.72, jumpForce: 10.8 },
    t6:  { speed: 0.41, accel: 0.74, jumpForce: 11.0 },
    t7:  { speed: 0.39, accel: 0.76, jumpForce: 11.0 },
    t8:  { speed: 0.38, accel: 0.78, jumpForce: 11.2 },
    t9:  { speed: 0.36, accel: 0.80, jumpForce: 11.3 },
    t10: { speed: 0.35, accel: 0.82, jumpForce: 11.5 }
};

// =========================================
// РЕЛЬЕФ ТРАСС
// =========================================

const TRACK_TERRAIN = {
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
let animationId = null;
let resizeHandlerAttached = false;
let callbackOnRaceEnd = null;
let currentTrack = null;
let finishX = 0;
let cameraX = 0;
let obstacles = [];
let frameCounter = 0;
let raceFinished = false;
let raceRunning = false;

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
let currentTrackLevel = 1;

// =========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function isMobileScreen() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function randomItem(items) {
    if (!items || !items.length) return null;

    return items[Math.floor(Math.random() * items.length)];
}

function getTrackBalance(trackId) {
    return TRACK_BALANCE[trackId] || {
        speed: 0.5,
        accel: 0.7,
        jumpForce: 10.5
    };
}

function getTrackLevel() {
    const index = TRACKS_DB.findIndex(
        track => track.id === currentTrack?.id
    );

    return Math.max(1, index + 1);
}

// =========================================
// НОВАЯ СИСТЕМА СЛОЖНОСТИ БОТОВ
// =========================================

function getBotDifficultyTrack(botIndex) {
    const currentIndex = TRACKS_DB.findIndex(
        track => track.id === currentTrack?.id
    );

    if (currentIndex < 0) {
        return currentTrack;
    }

    if (botIndex === 1) {
        return TRACKS_DB[currentIndex];
    }

    if (botIndex === 2) {
        return TRACKS_DB[Math.max(0, currentIndex - 1)];
    }

    return TRACKS_DB[currentIndex];
}

function getBotDifficultyStats(botIndex) {
    const difficultyTrack = getBotDifficultyTrack(botIndex);

    const balance = getTrackBalance(difficultyTrack?.id);

    const fallbackSpeed =
        Number(currentTrack?.botMaxSpeed) || 4;

    const fallbackAccel =
        Number(currentTrack?.botAccel) || 0.05;

    const rawSpeed =
        Number(difficultyTrack?.botMaxSpeed) || fallbackSpeed;

    const rawAcceleration =
        Number(difficultyTrack?.botAccel) || fallbackAccel;

    return {
        trackId: difficultyTrack?.id || currentTrack?.id,

        maxSpeed: Math.max(
            1.5,
            rawSpeed * balance.speed
        ),

        acceleration: Math.max(
            0.012,
            rawAcceleration * balance.accel
        ),

        jumpForce: balance.jumpForce
    };
}

// =========================================
// РЕЛЬЕФ
// =========================================

function getTrackTerrain() {
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

function isTouchingObstacle(bike, obstacle) {
    const bikeLeft = bike.x - BIKE_WIDTH * 0.35;
    const bikeRight = bike.x + BIKE_WIDTH * 0.35;

    return bikeRight >= obstacle.x &&
        bikeLeft <= obstacle.x + obstacle.width;
}

// =========================================
// СПОСОБНОСТИ БОТОВ
// =========================================

function getBotAbilities(botIndex) {
    return {
        nitroUnlocked:
            currentTrackLevel >= 5 &&
            botIndex === 1,

        superJumpUnlocked:
            currentTrackLevel >= 8 &&
            botIndex === 2,

        shieldCharges:
            currentTrackLevel >= 10
                ? (botIndex === 1 ? 2 : 1)
                : 0
    };
}

// =========================================
// СОЗДАНИЕ ВЕЛОСИПЕДА
// =========================================

function getBikeVisualProfile() {
    const part = category => ITEMS_DB[category]?.find(item => item.id === player.equipped?.[category]) || null;
    const rank = rarity => rarity === 'legendary' ? 2 : rarity === 'rare' ? 1 : 0;
    const color = rarity => rarity === 'legendary' ? '#fbbf24' : rarity === 'rare' ? '#38bdf8' : '#94a3b8';
    const frame = part('frames'), fork = part('forks'), wheels = part('wheels');
    const tires = part('tires'), brakes = part('brakes'), electronics = part('electronics');
    const chains = part('chains'), cranks = part('cranks'), handlebars = part('handlebars');
    const saddle = part('saddles'), seatpost = part('seatposts');
    return {
        frameColor: color(frame?.rarity), forkColor: color(fork?.rarity),
        chainColor: color(chains?.rarity), crankColor: color(cranks?.rarity),
        saddleColor: color(saddle?.rarity), seatpostColor: color(seatpost?.rarity),
        handlebarColor: color(handlebars?.rarity),
        wheelRadius: 9.5 + rank(wheels?.rarity) * 0.6,
        tireWidth: 2.4 + rank(tires?.rarity) * 0.8,
        frameWidth: 2.8 + rank(frame?.rarity) * 0.7,
        handlebarWidth: 2 + rank(handlebars?.rarity) * 0.6,
        discBrakes: Boolean(brakes && !['b1', 'b2'].includes(brakes.id)),
        suspension: Boolean(fork && fork.id !== 'fk1'),
        motor: Boolean(electronics && electronics.id !== 'e1'),
        hubColor: color(wheels?.rarity)
    };
}

function getPlayerPartAbilities() {
    const equippedParts = Object.entries(player.equipped || {}).map(([category, id]) =>
        ITEMS_DB[category]?.find(item => item.id === id)
    ).filter(Boolean);
    return {
        nitroUnlocked: equippedParts.some(item => item.ability?.id === 'nitro'),
        superJumpUnlocked: equippedParts.some(item => item.ability?.id === 'superJump'),
        frameGuard: equippedParts.some(item => item.ability?.id === 'frameGuard'),
        shockFrame: equippedParts.some(item => item.ability?.id === 'shockFrame'),
        flowFrame: equippedParts.some(item => item.ability?.id === 'flowFrame'),
        landingFrame: equippedParts.some(item => item.ability?.id === 'landingFrame'),
        mudGrip: equippedParts.some(item => item.ability?.id === 'mudGrip'),
        impactBrake: equippedParts.some(item => item.ability?.id === 'impactBrake')
    };
}

function createBike(isBot = false, botIndex = 1) {
    const botColor = botIndex === 2
        ? '#38bdf8'
        : '#f97316';

    const startX = isBot
        ? (botIndex === 2 ? 145 : 245)
        : 350;

    const difficulty = isBot
        ? getBotDifficultyStats(botIndex)
        : null;

    return {
        id: isBot ? `bot-${botIndex}` : 'player',
        displayName: isBot ? (botIndex === 1 ? '\u041c\u0430\u043a\u0441' : '\u041b\u0435\u0440\u0430') : '\u0418\u0433\u0440\u043e\u043a',
        visuals: isBot ? null : getBikeVisualProfile(),

        x: startX,
        previousX: startX,

        velocityX: 0,

        jumpHeight: 0,
        jumpVelocity: 0,
        jumpGravity: GRAVITY,
        airY: null,

        grounded: true,

        rampLift: 0,
        currentRamp: null,

        impactSlowTimer: 0,
        impactSpeedLimit: 0,

        collidedObstacles: new Set(),

        isBot,
        botIndex: isBot ? botIndex : 0,

        color: isBot ? botColor : '#22c55e',

        abilities: isBot ? getBotAbilities(botIndex) : getPlayerPartAbilities(),

        botDifficultyTrackId: difficulty?.trackId || null,
        botBaseMaxSpeed: difficulty?.maxSpeed || 0,
        botBaseAcceleration: difficulty?.acceleration || 0,
        botJumpForce: difficulty?.jumpForce || 0,

        nitroTimer: 0,
        springBoostTimer: 0,
        nitroCooldown: 150 + botIndex * 65,
        lastGasTap: 0,
        frameGuardUsed: false,
        landingBoostCooldown: 0,

        shieldActiveTimer: 0,

        finishFrame: null
    };
}

// =========================================
// ГЕНЕРАЦИЯ ОБЩЕЙ ТРАССЫ И ПРЕПЯТСТВИЙ
// =========================================

function createObstacles() {
    let typePool = Array.isArray(currentTrack?.obstacleTypes)
        ? currentTrack.obstacleTypes.filter(
            type => OBSTACLE_TYPES[type]
        )
        : Object.keys(OBSTACLE_TYPES);

    if (currentTrackLevel === 5) {
        typePool = [
            ...typePool,
            'ramp',
            'ramp',
            'rock'
        ];
    } else if (currentTrackLevel === 8) {
        typePool = [
            ...typePool,
            'pit',
            'pit',
            'barrier',
            'ramp'
        ];
    } else if (currentTrackLevel === 10) {
        typePool = [
            ...typePool,
            'pit',
            'pit',
            'rock',
            'barrier',
            'ramp',
            'ramp'
        ];
    }

    typePool = typePool.filter(
        type => OBSTACLE_TYPES[type]
    );

    const obstacleMultiplier = 3 + (currentTrackLevel - 1) * 0.07;

    const obstacleCount = Math.max(
        8,
        Math.floor(
            (Number(currentTrack?.obstacles) || 8) *
            obstacleMultiplier
        )
    );

    const usableLength = Math.max(1000, finishX - 1800);
    const spacing = usableLength / (obstacleCount + 1);

    const generated = [];
    const pitCount = currentTrackLevel * 2;
    const pitIndices = new Set(
        Array.from({ length: pitCount }, (_, index) =>
            Math.floor((index + 0.5) * obstacleCount / pitCount)
        )
    );
    const nonPitPool = typePool.filter(type => type !== 'pit');

    for (let i = 0; i < obstacleCount; i++) {
        const type = pitIndices.has(i)
            ? 'pit'
            : randomItem(nonPitPool) || 'rock';
        const definition = OBSTACLE_TYPES[type];

        const x =
            900 +
            spacing * (i + 1) +
            (Math.random() - 0.5) * spacing * 0.35;

        const specialRampScale = type === 'ramp'
            ? (
                currentTrackLevel === 5
                    ? 1.18
                    : currentTrackLevel === 8
                        ? 1.32
                        : currentTrackLevel === 10
                            ? 1.45
                            : 1
            )
            : 1;

        const specialObstacleScale =
            currentTrackLevel === 10 && type !== 'ramp'
                ? 1.12
                : 1;

        generated.push({
            id: `${type}-${i}`,

            type,
            x,

            width: Math.round(
                (Number(definition.width) || 40) *
                specialRampScale
            ),

            height: Math.round(
                (Number(definition.height) || 25) *
                specialRampScale *
                specialObstacleScale
            ),

            color: definition.color || '#777777',

            playerHit: false,
            botHit: false,

            playerRampUsed: false,
            botRampUsed: false,

            botRampUsedBy: new Set(),
            botJumpAttemptedBy: new Set(),
            botHitBy: new Set()
        });
    }

    return generated.sort((a, b) => a.x - b.x);
}

// =========================================
// ЗАВЕРШЕНИЕ ГОНКИ
// =========================================

function finishRace(playerWon, reason = 'finish') {
    if (raceFinished) return;

    raceFinished = true;
    raceRunning = false;

    input.accelerating = false;
    input.braking = false;
    input.reversing = false;
    input.jumpRequested = false;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (typeof callbackOnRaceEnd === 'function') {
        callbackOnRaceEnd(Boolean(playerWon), reason);
    }
}

// =========================================
// ФИЗИКА ПРЫЖКА
// =========================================

function updateJumpPhysics(bike) {
    if (!bike.isBot && bike.landingBoostCooldown > 0) bike.landingBoostCooldown--;

// --- НОВЫЙ КОД НАКЛОНА НАЧАЛО (ИСПРАВЛЕНО) ---
    let targetPitch = 0;
    if (bike.grounded && !bike.currentRamp) {
        const wheelBase = 25; 
        const frontY = getGroundY(bike.x + wheelBase, 0);
        const backY = getGroundY(bike.x - wheelBase, 0);
        targetPitch = Math.atan2(frontY - backY, wheelBase * 2);
    } else if (bike.currentRamp) {
        targetPitch = -0.35; 
    } else {
        targetPitch = -bike.jumpVelocity * 0.04; 
    }
    bike.pitchAngle = bike.pitchAngle || 0;
    bike.pitchAngle += (targetPitch - bike.pitchAngle) * 0.18;
    // --- НОВЫЙ КОД НАКЛОНА КОНЕЦ ---

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
        bike.jumpHeight = 0;
        bike.jumpVelocity = 0;
        bike.jumpGravity = GRAVITY;
        bike.grounded = true;
        bike.airY = null;
        bike.rampLift = 0;
        bike.currentRamp = null;
        if (!bike.isBot && bike.abilities?.landingFrame && bike.landingBoostCooldown <= 0) {
            bike.velocityX += 0.45;
            bike.springBoostTimer = Math.max(bike.springBoostTimer || 0, 24);
            bike.landingBoostCooldown = 300;
        }
    }
}

function startJump(bike, force, gravity = GRAVITY) {
    if (!bike || !bike.grounded) return false;

    const groundY = getGroundY(bike.x, 0);
    const prevGroundY = getGroundY(bike.previousX ?? bike.x, 0);

    // Плавный учет уклона рельефа при отрыве, чтобы не втыкаться в крутой подъем
    const terrainSlopeVy = clamp((prevGroundY - groundY) * 0.35, -1.5, 2.5);

    bike.grounded = false;

    bike.jumpVelocity = Math.max(
        4,
        Number(force) || 9
    ) + terrainSlopeVy;

    bike.jumpGravity = clamp(
        Number(gravity) || GRAVITY,
        0.36,
        GRAVITY
    );

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
            : clamp(
                Number(player.totalJump) || 0,
                0,
                30
            );

        const extraJump = jumpStat * 0.045;

        bike.jumpHeight = Math.max(
            bike.rampLift,
            ramp.height * 0.85
        );
        bike.airY = getGroundY(bike.x, 0) - bike.jumpHeight;

        bike.rampLift = 0;
        bike.grounded = false;
        bike.jumpVelocity = !isBot && currentTrackLevel >= 8
            ? 10.2 + Math.min(extraJump, 0.9)
            : 12 + extraJump;

        bike.jumpGravity = isBot && bike.abilities?.superJumpUnlocked
            ? 0.355
            : isBot
                ? clamp(
                    0.38 - (Number(bike.botJumpForce) - 10.5) * 0.002,
                    0.36,
                    0.38
                )
                : !isBot && currentTrackLevel >= 8
                    ? 0.4
                    : clamp(
                        0.38 - jumpStat * 0.0007,
                        0.36,
                        0.38
                    );

        bike.currentRamp = null;
    }

    if (bike.velocityX <= 0.05 && progress < 1) {
        bike.rampLift = 0;
        bike.currentRamp = null;
    }
}

// =========================================
// ФИЗИКА ИГРОКА
// =========================================

function updatePlayerPhysics() {
    const speed = Math.max(
        0,
        Number(player.totalSpeed) || 0
    );

    const accel = Math.max(
        0,
        Number(player.totalAccel) || 0
    );

    const jump = clamp(
        Number(player.totalJump) || 0,
        0,
        30
    );

    const brake = clamp(
        Number(player.totalBrake) || 0,
        0,
        80
    );

    const maxSpeed =
        3.2 + Math.min(speed, 70) * 0.12;

    if (playerBike.nitroTimer > 0) playerBike.nitroTimer--;
    if (playerBike.nitroCooldown > 0) playerBike.nitroCooldown--;
    const nitroMultiplier = playerBike.nitroTimer > 0 ? 1.32 : 1;

    const acceleration =
        0.05 + Math.min(accel, 70) * 0.002;

    const brakePower = 0.08 + Math.min(brake, 80) * 0.0045;

    const jumpForce =
        8.5 + jump * 0.12;

    const jumpGravity = clamp(
        GRAVITY - jump * 0.001,
        0.39,
        GRAVITY
    );

    if (input.accelerating) {
        playerBike.velocityX += acceleration;
    }

    if (input.reversing) {
        playerBike.velocityX -= acceleration * 0.9;
    }

    if (input.braking) {
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

    if (
        !input.accelerating &&
        !input.reversing &&
        !input.braking
    ) {
        const coastBrake = 0.005 + Math.min(brake, 80) * 0.00013;
        playerBike.velocityX *= 1 - coastBrake;
    }

    let allowedSpeed = maxSpeed * nitroMultiplier;
    if (playerBike.nitroTimer > 0 && input.accelerating) {
        playerBike.velocityX += acceleration * 0.55;
    }

    if (playerBike.springBoostTimer > 0) {
        playerBike.springBoostTimer--;
        allowedSpeed *= 1.18;
    }

    if (playerBike.impactSlowTimer > 0) {
        playerBike.impactSlowTimer--;

        allowedSpeed = Math.min(
            allowedSpeed,
            playerBike.impactSpeedLimit
        );
    }

    playerBike.velocityX = clamp(
        playerBike.velocityX,
        -maxSpeed * 0.65,
        allowedSpeed
    );

    playerBike.previousX = playerBike.x;

    playerBike.x = Math.max(
        0,
        playerBike.x + playerBike.velocityX
    );

    if (input.jumpRequested) {
        const superJumpMultiplier = playerBike.abilities?.superJumpUnlocked ? 1.15 : 1;
        startJump(
            playerBike,
            jumpForce * superJumpMultiplier,
            jumpGravity * (playerBike.abilities?.superJumpUnlocked ? 0.98 : 1)
        );

        input.jumpRequested = false;
    }

    updateJumpPhysics(playerBike);
    updateRamp(playerBike, false);
}

// =========================================
// ИИ БОТА: ПОИСК БЛИЖАЙШЕГО ПРЕПЯТСТВИЯ
// =========================================

function findBotJumpTarget(bike) {
    const jumpableTypes = new Set([
        'pit',
        'log',
        'barrier', 'cone', 'fallen_branch', 'bridge_gap', 'pulse_gate', 'rolling_boulder'
    ]);

    const front = bike.x + BIKE_WIDTH * 0.35;

    return obstacles.find(obstacle => {
        if (!jumpableTypes.has(obstacle.type)) return false;

        if (obstacle.x + obstacle.width < front - 8) {
            return false;
        }

        if (
            obstacle.botJumpAttemptedBy.has(
                bike.botIndex
            )
        ) {
            return false;
        }

        return true;
    }) || null;
}

function updateBotAI(bike) {
    if (!bike.grounded || bike.jumpHeight > 0) return;

    const obstacle = findBotJumpTarget(bike);

    if (!obstacle) return;

    const front = bike.x + BIKE_WIDTH * 0.35;
    const distance = obstacle.x - front;

    const speed = Math.max(
        1.2,
        bike.velocityX
    );

    const reactionDistance = obstacle.type === 'pit'
        ? clamp(
            speed * 12 + obstacle.width * 0.22 + 12,
            50,
            100
        )
        : clamp(
            speed * 8 + obstacle.width * 0.16 + 10,
            38,
            74
        );

    if (
        distance <= reactionDistance &&
        distance >= -BIKE_WIDTH * 0.2
    ) {
        const baseForce =
            Number(bike.botJumpForce) ||
            getTrackBalance(currentTrack.id).jumpForce;

        const superJumpBonus =
            bike.abilities?.superJumpUnlocked
                ? 2.5
                : 0;

        const force =
            (obstacle.type === 'pit'
                ? baseForce + 0.8
                : baseForce) + superJumpBonus;

        obstacle.botJumpAttemptedBy.add(
            bike.botIndex
        );

        startJump(
            bike,
            force,
            bike.abilities?.superJumpUnlocked
                ? 0.355
                : GRAVITY
        );
    }
}

// =========================================
// ПОДХОД БОТА К КАМНЮ
// =========================================

function updateBotRockApproach(bike, maxSpeed) {
    const front = bike.x + BIKE_WIDTH * 0.35;

    const rock = obstacles.find(obstacle => {
        if (obstacle.type !== 'rock') return false;

        if (
            obstacle.botHitBy.has(bike.botIndex)
        ) {
            return false;
        }

        return obstacle.x + obstacle.width >= front - 8;
    });

    if (!rock) return;

    const distance = rock.x - front;

    const speed = Math.max(
        1,
        bike.velocityX
    );

    const brakingDistance = clamp(
        speed * 12 + rock.width * 0.25 + 15,
        55,
        110
    );

    if (
        distance <= brakingDistance &&
        distance >= -rock.width
    ) {
        const approachLimit = Math.max(
            0.65,
            maxSpeed * 0.62
        );

        bike.velocityX = Math.min(
            bike.velocityX,
            approachLimit
        );
    }
}

// =========================================
// СПОСОБНОСТИ БОТА
// =========================================

function updateBotAbilities(bike) {
    if (bike.nitroTimer > 0) {
        bike.nitroTimer--;
    } else if (bike.nitroCooldown > 0) {
        bike.nitroCooldown--;
    }

    if (bike.shieldActiveTimer > 0) {
        bike.shieldActiveTimer--;
    }

    if (
        bike.abilities?.nitroUnlocked &&
        bike.nitroTimer <= 0 &&
        bike.nitroCooldown <= 0 &&
        bike.grounded &&
        bike.impactSlowTimer <= 0
    ) {
        const front = bike.x + BIKE_WIDTH * 0.35;

        const obstacleAhead = obstacles.some(obstacle =>
            obstacle.x >= front &&
            obstacle.x - front < 230
        );

        if (!obstacleAhead) {
            bike.nitroTimer = 48;
            bike.nitroCooldown = 430;
        }
    }
}

// =========================================
// ФИЗИКА БОТА
// =========================================

function updateBotPhysics(bike) {
    updateBotAbilities(bike);
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

    bike.velocityX += baseAcceleration;

    let allowedSpeed = maxSpeed;

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

    updateBotRockApproach(
        bike,
        maxSpeed
    );

    updateBotAI(bike);

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
}

// =========================================
// СТОЛКНОВЕНИЯ ИГРОКА
// =========================================

function applyPlayerImpact(obstacle, speedLimit = 1.0) {
    if (
        playerBike.collidedObstacles.has(obstacle.id)
    ) {
        return;
    }

    playerBike.collidedObstacles.add(obstacle.id);

    let impactDuration = playerBike.abilities?.shockFrame ? 36 : 42;
    if (playerBike.abilities?.impactBrake) impactDuration = Math.round(impactDuration * 0.85);
    if (playerBike.abilities?.frameGuard && !playerBike.frameGuardUsed &&
        ['rock', 'rolling_boulder', 'log', 'barrier', 'fallen_branch', 'cone'].includes(obstacle.type)) {
        playerBike.frameGuardUsed = true;
        speedLimit = Math.max(speedLimit, playerBike.velocityX * 0.78);
    }
    if (playerBike.abilities?.flowFrame && ['ice_patch', 'wind_fan'].includes(obstacle.type)) {
        speedLimit = Math.max(speedLimit, Math.min(playerBike.velocityX, speedLimit * 1.15));
    }

    playerBike.impactSlowTimer = impactDuration;
    playerBike.impactSpeedLimit = speedLimit;

    playerBike.velocityX = Math.min(
        playerBike.velocityX,
        speedLimit
    );
}

function updatePlayerCollisions() {
    for (const obstacle of obstacles) {
        if (
            obstacle.x + obstacle.width <
            playerBike.x - BIKE_WIDTH
        ) {
            continue;
        }

        if (
            obstacle.x >
            playerBike.x + BIKE_WIDTH
        ) {
            break;
        }

        if (!isTouchingObstacle(playerBike, obstacle)) {
            continue;
        }

        if (obstacle.type === 'pit' || obstacle.type === 'bridge_gap') {
            if (
                playerBike.grounded &&
                playerBike.jumpHeight < 8
            ) {
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
        if (obstacle.type === 'spring_pad') {
            if (!obstacle.playerHit && playerBike.grounded) {
                obstacle.playerHit = true;
                playerBike.velocityX += 1.6;
                playerBike.springBoostTimer = 36;
            }
            continue;
        }
        if (obstacle.type === 'mud' || obstacle.type === 'water_splash' || obstacle.type === 'ice_patch' || obstacle.type === 'wind_fan') {
            if (playerBike.grounded) {
                if (playerBike.abilities?.mudGrip && ['mud', 'water_splash'].includes(obstacle.type)) {
                    applyPlayerImpact(obstacle, Math.max(0.8, playerBike.velocityX * 0.82));
                } else if (obstacle.type === 'ice_patch') {
                    applyPlayerImpact(obstacle, Math.max(0.8, playerBike.velocityX * 0.58));
                } else if (obstacle.type === 'wind_fan') {
                    applyPlayerImpact(obstacle, Math.max(0.6, playerBike.velocityX * 0.42));
                } else {
                    applyPlayerImpact(obstacle, obstacle.type === 'water_splash' ? 0.8 : 1.05);
                }
            }
            continue;
        }
        if (obstacle.type === 'ramp') continue;

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
            obstacle.type === 'barrier' || obstacle.type === 'cone' || obstacle.type === 'fallen_branch'
        ) {
            const requiredJump =
                obstacle.height + 9;

            if (
                playerBike.jumpHeight < requiredJump
            ) {
                applyPlayerImpact(obstacle, 0.85);
            }
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
    if (
        obstacle.botHitBy.has(bike.botIndex)
    ) {
        return;
    }

    obstacle.botHitBy.add(bike.botIndex);

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
    for (const obstacle of obstacles) {
        if (
            obstacle.x + obstacle.width <
            bike.x - BIKE_WIDTH
        ) {
            continue;
        }

        if (
            obstacle.x >
            bike.x + BIKE_WIDTH
        ) {
            break;
        }

        if (!isTouchingObstacle(bike, obstacle)) {
            continue;
        }

        if (obstacle.type === 'pit' || obstacle.type === 'bridge_gap') {
            if (
                bike.jumpHeight <
                Math.max(22, obstacle.height * 0.75)
            ) {
                applyBotImpact(
                    bike,
                    obstacle,
                    0.28,
                    54
                );
            }

            continue;
        }

        if (obstacle.type === 'pulse_gate') {
            if (Math.sin(frameCounter * 0.045 + obstacle.x) > 0.15) continue;
            if (bike.jumpHeight < obstacle.height + 8) applyBotImpact(bike, obstacle, 0.5, 38);
            continue;
        }
        if (obstacle.type === 'spring_pad') {
            if (!obstacle.botHitBy.has(bike.botIndex) && bike.grounded) {
                obstacle.botHitBy.add(bike.botIndex);
                bike.velocityX += 1.6;
                bike.springBoostTimer = 36;
            }
            continue;
        }
        if (obstacle.type === 'mud' || obstacle.type === 'water_splash' || obstacle.type === 'ice_patch' || obstacle.type === 'wind_fan') {
            if (bike.grounded) {
                const factor = obstacle.type === 'wind_fan' ? 0.28 : obstacle.type === 'ice_patch' ? 0.52 : obstacle.type === 'water_splash' ? 0.42 : 0.58;
                applyBotImpact(bike, obstacle, factor, obstacle.type === 'ice_patch' ? 24 : 48);
            }
            continue;
        }
        if (obstacle.type === 'ramp') continue;

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

        // Стало (убран obstacle.type === 'pulse_gate'):
        if (
            obstacle.type === 'log' ||
            obstacle.type === 'barrier' || obstacle.type === 'cone' || obstacle.type === 'fallen_branch'
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
        }
    }
}

// =========================================
// ПРОВЕРКА ФИНИША
// =========================================

function checkFinish() {
    const playerFinished =
        playerBike.x >= finishX;

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

    const furthestBot = Math.max(
        ...finishedBots.map(bike => bike.x)
    );

    finishRace(
        playerBike.x >= furthestBot,
        'photo-finish'
    );
}

// =========================================
// ОТРИСОВКА ФОНА
// =========================================

function drawBackground() {
    const palette = getTrackPalette();

    // 1. Градиент неба
    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        viewHeight
    );

    gradient.addColorStop(0, palette.skyTop);
    gradient.addColorStop(0.58, palette.skyMid);
    gradient.addColorStop(1, palette.skyBottom);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // 2. Солнце или Луна со свечением вдали
    const isNight = ['#1d233f', '#090f2b', '#1a263c', '#281b2c'].includes(palette.skyTop);
    ctx.save();
    ctx.beginPath();
    const celestialX = (viewWidth * 0.8) - (cameraX * 0.015) % viewWidth; 
    const celestialY = viewHeight * 0.35;
    ctx.arc(celestialX, celestialY, viewWidth * 0.08, 0, Math.PI * 2);
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
        const mGrad = ctx.createLinearGradient(0, viewHeight * 0.4, 0, viewHeight);
        mGrad.addColorStop(0, color);
        mGrad.addColorStop(1, palette.skyBottom);
        
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

    if ([5, 8, 10].includes(currentTrackLevel)) {
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
// ОБЩАЯ ЛИНИЯ ТРАССЫ
// =========================================

function drawTrack() {
    const palette = getTrackPalette();
    const points = [];

    // Собираем точки поверхности трассы
    for (let x = 0; x <= viewWidth + 10; x += 8) {
        const worldX = cameraX + x;
        const y = getGroundY(worldX, 0);
        points.push({ x, y });
    }

    // 1. РИСУЕМ ПОДЗЕМЕЛЬЕ (Сплошная заливка грунта до низа экрана)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    // Замыкаем контур по нижнему краю экрана
    ctx.lineTo(viewWidth + 10, viewHeight);
    ctx.lineTo(0, viewHeight);
    ctx.closePath();

    // Градиент грунта (сверху цвет земли трассы, снизу уходит в темноту)
    const groundGradient = ctx.createLinearGradient(0, viewHeight * 0.5, 0, viewHeight);
    groundGradient.addColorStop(0, palette.near); 
    groundGradient.addColorStop(1, '#020617');    
    ctx.fillStyle = groundGradient;
    ctx.fill();

    // 2. РИСУЕМ САМУ ДОРОГУ (Широкая полоса по поверхности)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
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
    ctx.setLineDash([16, 12]);
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

    if (obstacle.type === 'mud' || obstacle.type === 'ice_patch' || obstacle.type === 'water_splash' || obstacle.type === 'spring_pad') {
        ctx.fillStyle = obstacle.color; ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY + 1, width / 2, Math.max(5, height / 2), 0, 0, Math.PI * 2); ctx.fill();
        if (obstacle.type === 'spring_pad') { ctx.strokeStyle = '#dcfce7'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(screenX + 8, groundY - 2); ctx.lineTo(screenX + width - 8, groundY - 2); ctx.stroke(); }
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
    if (obstacle.type === 'bridge_gap') { ctx.fillStyle = '#020617'; ctx.fillRect(screenX, groundY - 2, width, 12); ctx.strokeStyle = '#a16207'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(screenX, groundY - 5); ctx.lineTo(screenX + width, groundY - 5); ctx.stroke(); return; }
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

function drawBike(bike, label, color) {
    const x = bike.x - cameraX;
    const groundY = getGroundY(bike.x, 0);
    const y = groundY - bike.jumpHeight - bike.rampLift;
    const visuals = bike.visuals || {};
    const radius = visuals.wheelRadius || 9.5;
    const wheelY = y - 8;
    const rearWheelX = x - 25;
    const frontWheelX = x + 25;
    const bottomX = x - 3;
    const seatX = x - 10;
    const headX = x + 11;
    const travel = Number.isFinite(bike.previousX)
        ? bike.x - bike.previousX
        : 0;

    bike.wheelRotation = (bike.wheelRotation || 0) + travel / radius;
    bike.pedalPhase = (bike.pedalPhase || 0) + travel / radius * 0.42;
    const wheelAngle = bike.wheelRotation;
    const pedalAngle = bike.pedalPhase;

    // --- НАКЛОНЯЕМ ХОЛСТ ---
    ctx.save();
    ctx.translate(x, wheelY - 15);
    ctx.rotate(bike.pitchAngle || 0);
    ctx.translate(-x, -(wheelY - 15));
    // -----------------------

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, groundY - 1, 35, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    function drawWheel(cx) {
        ctx.save();
        ctx.translate(cx, wheelY);
        ctx.rotate(wheelAngle);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = visuals.tireWidth || 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72);
        }
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            ctx.moveTo(Math.cos(angle) * (radius - 1), Math.sin(angle) * (radius - 1));
            ctx.lineTo(Math.cos(angle) * (radius + 1), Math.sin(angle) * (radius + 1));
        }
        ctx.stroke();

        ctx.strokeStyle = visuals.hubColor || '#94a3b8';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        if (visuals.discBrakes) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawWheel(rearWheelX);
    drawWheel(frontWheelX);

    if (!bike.isBot && input.braking && bike.velocityX > 0.15) {
        ctx.save();
        ctx.shadowColor = '#fb384f';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fb384f';
        ctx.beginPath();
        ctx.arc(rearWheelX, wheelY, radius * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.translate(0, wheelY);
    ctx.scale(1, 0.78);
    ctx.translate(0, -wheelY);

    const frameColor = visuals.frameColor || color;
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = visuals.frameWidth || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(rearWheelX, wheelY);
    ctx.lineTo(bottomX, wheelY);
    ctx.lineTo(seatX, wheelY - 27);
    ctx.lineTo(rearWheelX, wheelY);
    ctx.moveTo(seatX, wheelY - 27);
    ctx.lineTo(headX, wheelY - 19);
    ctx.lineTo(bottomX, wheelY);
    ctx.stroke();

    ctx.strokeStyle = visuals.forkColor || '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(headX, wheelY - 19);
    ctx.lineTo(frontWheelX, wheelY);
    ctx.stroke();
    if (visuals.suspension) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(headX + 3, wheelY - 16);
        ctx.lineTo(headX + 6, wheelY - 12);
        ctx.lineTo(headX + 3, wheelY - 8);
        ctx.lineTo(headX + 7, wheelY - 4);
        ctx.stroke();
    }

    ctx.strokeStyle = visuals.chainColor || '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(rearWheelX + 2, wheelY + 1);
    ctx.lineTo(bottomX, wheelY + 1);
    ctx.arc(bottomX, wheelY, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    const pedalRadius = 7;
    const leftPedal = {
        x: bottomX + Math.cos(pedalAngle) * pedalRadius,
        y: wheelY + Math.sin(pedalAngle) * pedalRadius
    };
    const rightPedal = {
        x: bottomX + Math.cos(pedalAngle + Math.PI) * pedalRadius,
        y: wheelY + Math.sin(pedalAngle + Math.PI) * pedalRadius
    };
    ctx.strokeStyle = visuals.crankColor || '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bottomX, wheelY, 4.5, 0, Math.PI * 2);
    ctx.moveTo(bottomX, wheelY);
    ctx.lineTo(leftPedal.x, leftPedal.y);
    ctx.moveTo(bottomX, wheelY);
    ctx.lineTo(rightPedal.x, rightPedal.y);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(leftPedal.x - 3, leftPedal.y);
    ctx.lineTo(leftPedal.x + 3, leftPedal.y);
    ctx.moveTo(rightPedal.x - 3, rightPedal.y);
    ctx.lineTo(rightPedal.x + 3, rightPedal.y);
    ctx.stroke();

    ctx.strokeStyle = visuals.seatpostColor || '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(seatX, wheelY - 27);
    ctx.lineTo(seatX - 1, wheelY - 33);
    ctx.stroke();
    ctx.strokeStyle = visuals.saddleColor || '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(seatX - 8, wheelY - 33);
    ctx.lineTo(seatX + 6, wheelY - 33);
    ctx.stroke();

    const hip = { x: seatX + 1, y: wheelY - 35 };
    const shoulder = { x: x + 1, y: wheelY - 46 };
    const head = { x: x + 4, y: wheelY - 53 };
    const kneeA = { x: (hip.x + leftPedal.x) / 2 + 3, y: (hip.y + leftPedal.y) / 2 - 3 };
    const kneeB = { x: (hip.x + rightPedal.x) / 2 - 3, y: (hip.y + rightPedal.y) / 2 - 3 };
    const jersey = bike.isBot ? color : '#16a34a';

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#172033';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(kneeB.x, kneeB.y);
    ctx.lineTo(rightPedal.x, rightPedal.y);
    ctx.stroke();
    ctx.strokeStyle = '#0f172a';
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
    ctx.strokeStyle = bike.isBot ? '#f8fafc' : '#bbf7d0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 1, shoulder.y + 1);
    ctx.lineTo(hip.x, hip.y - 1);
    ctx.stroke();

    const elbow = { x: x + 10, y: wheelY - 42 };
    const hand = { x: headX + 13, y: wheelY - 37 };
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
    ctx.fillStyle = bike.isBot ? color : '#16a34a';
    ctx.beginPath();
    ctx.ellipse(head.x - 0.3, head.y - 2.5, 4.5, 2.1, -0.08, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(head.x - 4.5, head.y - 2.2);
    ctx.lineTo(head.x + 3.5, head.y - 2.2);
    ctx.stroke();

    ctx.strokeStyle = visuals.handlebarColor || '#f8fafc';
    ctx.lineWidth = visuals.handlebarWidth || 2;
    ctx.beginPath();
    ctx.moveTo(headX, wheelY - 19);
    ctx.lineTo(headX + 2, wheelY - 35);
    ctx.lineTo(headX + 14, wheelY - 35);
    ctx.moveTo(headX - 3, wheelY - 37);
    ctx.lineTo(headX + 19, wheelY - 37);
    ctx.stroke();

    if (visuals.motor) {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x - 1, wheelY - 12, 10, 8);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();

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

    ctx.restore(); // <--- ВОЗВРАЩАЕМ ХОЛСТ НА МЕСТО

    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, x, wheelY - 51);
}

function drawRaceHUD() {
    const racers = [
        {
            bike: playerBike,
            label: '🚴 ТЫ',
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
                label: `${bike.displayName}${icon}`,
                color: bike.color
            };
        })
    ];

    const mobileLayout =
    window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(pointer: coarse)').matches;
    const uiScale = mobileLayout ? 1 / getCameraZoom() : 1;
    const panelWidth = mobileLayout
        ? Math.min(390 * uiScale, viewWidth - 20 * uiScale)
        : Math.min(390, viewWidth - 28);
    const rowHeight = mobileLayout ? 29 * uiScale : 19;
    const panelHeight = mobileLayout
        ? (42 + racers.length * 29) * uiScale
        : 35 + racers.length * rowHeight;
    const panelX = mobileLayout ? 12 * uiScale : 14;
    const panelY = mobileLayout ? 52 * uiScale : 12;
    const pad = mobileLayout ? 11 * uiScale : 11;
    const titleHeight = mobileLayout ? 24 * uiScale : 18;
    const rowOffset = mobileLayout ? 34 * uiScale : 31;
    const rowBarHeight = mobileLayout ? 11 * uiScale : 7;

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

    ctx.font = `bold ${mobileLayout ? 15 * uiScale : 13}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';

    ctx.fillText(
        currentTrack.name,
        panelX + pad,
        panelY + titleHeight
    );

    const labelWidth = mobileLayout ? Math.min(105 * uiScale, panelWidth * 0.34) : 53;
    const percentWidth = mobileLayout ? 42 * uiScale : 38;

    const barX = panelX + pad + labelWidth;

    const barWidth = Math.max(
        mobileLayout ? 70 * uiScale : 55,
        panelWidth - labelWidth - percentWidth - (mobileLayout ? 24 * uiScale : 24)
    );

    racers.forEach((racer, index) => {
        const progress = clamp(
            racer.bike.x / finishX,
            0,
            1
        );

        const y = panelY + rowOffset + index * rowHeight;

        ctx.font = `bold ${mobileLayout ? 13 * uiScale : 10}px Arial`;
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
        !playerBike ||
        !botBike
    ) {
        return;
    }

    drawBackground();
    drawTrack();
    drawObstacles();
    drawFinishLine();

    activeBots.forEach((bike, index) => {
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
    });

    drawBike(
        playerBike,
        'ТЫ',
        '#22c55e'
    );

    drawRaceHUD();
}

// =========================================
// ОБНОВЛЕНИЕ ГОНКИ
// =========================================

function update() {
    if (!raceRunning || raceFinished) return;

    frameCounter++;

    updatePlayerPhysics();

    if (raceFinished) return;

    if (
        playerBike.x >= finishX &&
        playerBike.finishFrame === null
    ) {
        playerBike.finishFrame = frameCounter;
    }

    activeBots.forEach(bike => {
        updateBotPhysics(bike);
    });

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

function gameLoop() {
    if (!raceRunning || raceFinished) return;

    update();
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

    const dpr = Math.max(
        1,
        Math.min(2, window.devicePixelRatio || 1)
    );

    const zoom = getCameraZoom();

    const canvasWidth = Math.max(320, rect.width || canvas.clientWidth || 800);
    const canvasHeight = Math.max(220, rect.height || canvas.clientHeight || 420);
    viewWidth = canvasWidth / zoom;
    viewHeight = canvasHeight / zoom;

    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);

    ctx = canvas.getContext('2d');

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

    currentTrack = TRACKS_DB.find(
        track => track.id === player.selectedTrack
    ) || TRACKS_DB[0];

    if (!currentTrack) {
        console.error(
            'В TRACKS_DB нет ни одной трассы.'
        );

        return;
    }

    currentTrackLevel = getTrackLevel();

    resizeCanvas();
    setTimeout(resizeCanvas, 50);

    finishX = Math.max(
        6000,
        (Number(currentTrack.length) || 15000) *
        TRACK_MULTIPLIER - 1500
    );

    playerBike = createBike(false);

    botBike = createBike(true, 1);

    additionalBots = currentTrackLevel >= 3
        ? [createBike(true, 2)]
        : [];

    activeBots = [
        botBike,
        ...additionalBots
    ];

    cameraX = 0;
    frameCounter = 0;

    raceFinished = false;
    raceRunning = true;

    input = {
        accelerating: false,
        braking: false,
        reversing: false,
        jumpRequested: false
    };

    obstacles = createObstacles();

    if (!resizeHandlerAttached) {
        window.addEventListener(
            'resize',
            resizeCanvas
        );

        resizeHandlerAttached = true;
    }

    render();

    animationId = requestAnimationFrame(gameLoop);
}

// =========================================
// УПРАВЛЕНИЕ ИГРОКОМ ИЗ MAIN.JS
// =========================================

export function setAccelerating(value) {
    const nextValue = Boolean(value);
    if (nextValue && !input.accelerating && raceRunning && !raceFinished && playerBike?.abilities?.nitroUnlocked) {
        const now = performance.now();
        if (now - playerBike.lastGasTap < 320 && playerBike.nitroCooldown <= 0) {
            playerBike.nitroTimer = 120;
            playerBike.nitroCooldown = 480;
            playerBike.lastGasTap = 0;
        } else {
            playerBike.lastGasTap = now;
        }
    }
    input.accelerating = nextValue;
}

export function setBraking(value) {
    input.braking = Boolean(value);
}

export function setReversing(value) {
    input.reversing = Boolean(value);
}

export function triggerJump() {
    if (!raceRunning || raceFinished || !playerBike) return;

    // Разрешаем прыжок только на земле или за мгновение до приземления
    if (playerBike.grounded || (playerBike.jumpVelocity < 0 && playerBike.jumpHeight < 6)) {
        input.jumpRequested = true;
    }
}
