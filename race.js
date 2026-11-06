import { player } from './state.js?v=82';
import { TRACKS_DB, OBSTACLE_TYPES, ITEMS_DB } from './db.js?v=82';
import { clamp, randomItem, MIN_SPRINT_RECORD_IMPROVEMENT_MS, getRarityAccent } from './utils.js?v=82';
import { playCoinSound, playBoostSound } from './audio.js?v=82';

// =========================================
// VELOCITY RACE ENGINE
// Игрок и боты едут по одной общей трассе
// и встречают одни и те же препятствия.
// =========================================

const GRAVITY = 0.42;
const SIMULATION_STEP_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 100;
const SPRINT_GHOST_ACCELERATION_SECONDS = 1.2;
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
let lastFrameTime = 0;
let frameAccumulator = 0;
let resizeHandlerAttached = false;
let callbackOnRaceEnd = null;
let currentTrack = null;
let finishX = 0;
let cameraX = 0;
let obstacles = [];
let frameCounter = 0;
let raceFinished = false;
let raceRunning = false;
let raceStarted = false;
let raceTimeMs = 0;
let timerStarted = false;

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
        jumpForce: 10.5
    };
}

function getTrackLevel() {
    const storyTracks = TRACKS_DB.filter(track => !track.alwaysUnlocked);
    const index = storyTracks.findIndex(track => track.id === currentTrack?.id);

    return Math.max(1, index + 1);
}

// =========================================
// НОВАЯ СИСТЕМА СЛОЖНОСТИ БОТОВ
// =========================================

function getBotDifficultyTrack(botIndex) {
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

function getBotDifficultyStats(botIndex) {
    const difficultyTrack = getBotDifficultyTrack(botIndex);

    const balance = getTrackBalance(difficultyTrack?.id);

    const fallbackSpeed =
        Number(currentTrack?.botMaxSpeed) || 4;

    const fallbackAccel =
        Number(currentTrack?.botAccel) || 0.05;

    const rawSpeed = Number(difficultyTrack?.botMaxSpeed) || fallbackSpeed;
    const rawAcceleration = Number(difficultyTrack?.botAccel) || fallbackAccel;

    // Случайный баланс формы гонщиков на каждый заезд (в пределах ±3% от скорости сложности трассы):
    // В одном заезде активнее и быстрее Макс, в другом - Лера. Ни один бот не привязан к вечному лидерству.
    const speedVariation = 0.97 + Math.random() * 0.06;
    const accelVariation = 0.95 + Math.random() * 0.10;

    return {
        trackId: difficultyTrack?.id || currentTrack?.id,

        maxSpeed: Math.max(
            1.5,
            rawSpeed * balance.speed * speedVariation
        ),

        acceleration: Math.max(
            0.012,
            rawAcceleration * balance.accel * accelVariation
        ),

        jumpForce: balance.jumpForce
    };
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

function isTouchingObstacle(bike, obstacle) {
    const bikeLeft = bike.x - BIKE_WIDTH * 0.35;
    const bikeRight = bike.x + BIKE_WIDTH * 0.35;

    return bikeRight >= obstacle.x &&
        bikeLeft <= obstacle.x + obstacle.width;
}

function createObstacles() {
    if (!currentTrack || currentTrack.id === 'sprint') return [];

    const typePool = Array.isArray(currentTrack.obstacleTypes)
        ? currentTrack.obstacleTypes.filter(type => OBSTACLE_TYPES[type])
        : Object.keys(OBSTACLE_TYPES);
    if (!typePool.length) return [];

    const configuredCount = Math.max(1, Number(currentTrack.obstacles) || 1);
    const obstacleCount = Math.max(
        1,
        Math.floor(configuredCount * (3 + Math.max(0, currentTrackLevel - 1) * 0.07))
    );
    // Обычные ямы гарантированы на каждой сюжетной трассе и растут по уровню:
    // 3 на первой, затем +2 на каждой следующей. Генерация не зависит от удачи.
    const pitCount = Math.min(obstacleCount, currentTrackLevel * 2 + 1);
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
        const type = pitIndices.has(index) ? 'pit' : randomItem(randomTypePool);
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
            playerHit: false,
            botHitBy: new Set(),
            botJumpAttemptedBy: new Set(),
            playerRampUsed: false,
            botRampUsedBy: new Set()
        });
        previousRight = x + definition.width;
    }

    return generated.sort((a, b) => a.x - b.x);
}

// =========================================
// СПОСОБНОСТИ БОТОВ
// =========================================

function getBotAbilities(botIndex) {
    return {
        // Оба бота умеют использовать нитро с 3-й трассы!
        nitroUnlocked: currentTrackLevel >= 3,

        // Суперпрыжок доступен любому боту с равной вероятностью с 5-й трассы
        superJumpUnlocked: currentTrackLevel >= 5 && Math.random() < 0.6,

        shieldCharges: currentTrackLevel >= 9 ? 1 : 0
    };
}

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
        mudGrip: abilityIds.has('mudGrip'),
        impactBrake: abilityIds.has('impactBrake'),
        shieldCharges: 0
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
    const electronics = getEquippedPart('electronics'); // Добавили электронику
    const fullSuspension = frame?.visuals?.type === 'dh';
    const stability = Math.min(100,
        (Number(frame?.stability) || 0) +
        (Number(fork?.stability) || 0) +
        (fullSuspension ? Number(shock?.stability) || 0 : 0)
    );
    const frameTubeSize = Number(frame?.visuals?.width) || 0;

    return {
        riderId: rider?.id || 'r1',
        
        // --- РАМА ---
        frameColor: frame?.visuals?.color || getRarityAccent(frame?.rarity),
        // Ширина в базе рассчитана для SVG гаража (10–16 условных единиц),
        // в Canvas матча переводим её в реальную толщину труб в пикселях.
        frameWidth: frameTubeSize ? clamp(frameTubeSize / 4, 2.5, 4) : (frame?.rarity === 'legendary' ? 3.5 : frame?.rarity === 'rare' ? 3 : 2.5),
        frameType: frame?.visuals?.type || 'normal',
        fullSuspension,
        rearSuspension: Boolean(fullSuspension && shock),
        rearShockColor: shock?.visuals?.color || getRarityAccent(shock?.rarity),
        stability,
        hasBrakes: Boolean(brakes),
        brakeStrength: clamp(Number(brakes?.brake) || 0, 0, 15),
        
        // --- ВИЛКА ---
        forkColor: fork?.visuals?.color || getRarityAccent(fork?.rarity),
        
        // --- ТРАНСМИССИЯ И ПОСАДКА ---
        chainColor: chain?.visuals?.color || getRarityAccent(chain?.rarity),
        gearColor: getRarityAccent(derailleur?.rarity),
        chainringCount: ['d1', 'd2', 'd3'].includes(drivetrain?.id) ? 3 : 1,
        crankColor: crank?.visuals?.color || getRarityAccent(crank?.rarity),
        seatpostColor: seatpost?.visuals?.color || getRarityAccent(seatpost?.rarity),
        saddleColor: saddle?.visuals?.color || getRarityAccent(saddle?.rarity),
        
        // --- РУЛЬ ---
        handlebarColor: handlebar?.visuals?.color || getRarityAccent(handlebar?.rarity),
        handlebarWidth: handlebar?.visuals?.width || (handlebar?.rarity === 'legendary' ? 2.4 : handlebar?.rarity === 'rare' ? 2.1 : 1.8),
        
        // --- КОЛЕСА ---
        rimColor: wheel?.visuals?.rimColor || (wheel?.rarity === 'legendary' ? '#fbbf24' : wheel?.rarity === 'rare' ? '#38bdf8' : '#64748b'),
        hubColor: wheel?.visuals?.hubColor || '#e2e8f0',
        wheelRadius: wheel?.visuals?.radius || (9.5 + Math.min(1.2, Math.max(0, Number(wheel?.speed) || 0) * 0.08)),
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
    const difficulty = isBot ? getBotDifficultyStats(botIndex) : null;
    const botColor = botIndex === 1 ? '#ef4444' : '#a855f7';
    const visuals = isBot ? getBotVisualProfile(botIndex) : getBikeVisualProfile();
    // Оставляем место за задним колесом, чтобы стартовый велосипед не обрезался краем Canvas.
    const startX = 50;

    return {
        id: isBot ? `bot-${botIndex}` : 'player',
        displayName: isBot ? (botIndex === 1 ? 'Макс' : 'Лера') : 'Игрок',
        visuals,
        stability: clamp(Number(visuals?.stability) || 0, 0, 100),
        hasBrakes: Boolean(visuals?.hasBrakes),
        brakeStrength: clamp(Number(visuals?.brakeStrength) || 0, 0, 15),
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
        collidedObstacles: new Set(),

        isBot,
        botIndex: isBot ? botIndex : 0,
        color: isBot ? botColor : (visuals?.frameColor || getRarityAccent()),
        abilities: isBot ? getBotAbilities(botIndex) : getPlayerPartAbilities(),

        botDifficultyTrackId: difficulty?.trackId || null,
        botBaseMaxSpeed: difficulty?.maxSpeed || 0,
        botBaseAcceleration: difficulty?.acceleration || 0,
        botJumpForce: difficulty?.jumpForce || 0,

        nitroTimer: 0,
        springBoostTimer: 0,
        nitroCooldown: 120 + Math.floor(Math.random() * 100),
        lastGasTap: 0,
        landingBoostCooldown: 0,
        shieldActiveTimer: 0,
        finishFrame: null,
        wheelRotation: 0,
        pedalPhase: 0
    };
}

// =========================================
// ФИЗИКА ПРЫЖКА
// =========================================

function startBikeFlip(bike, direction = 1, message = 'ПЕРЕВОРОТ! Низкая стабильность') {
    if (!bike || bike.flippedTimer > 0) return false;
    bike.flippedTimer = 74;
    bike.flipDirection = direction < 0 ? -1 : 1;
    const instability = 1 - clamp(Number(bike.stability) || 0, 0, 100) / 100;
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

function maybeFlipFromImpact(bike, impactForce, direction = 1, message = 'КОЧКА! Низкая стабильность') {
    if (!bike || bike.flippedTimer > 0 || bike.bumpCooldown > 0) return false;

    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
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

    return Math.random() < chance && startBikeFlip(bike, direction, message);
}

function applyImpactPitchImpulse(bike, impactForce, direction = 1) {
    if (!bike) return;
    const instability = 1 - clamp(Number(bike.stability) || 0, 0, 100) / 100;
    const impulse = Number(impactForce) * (0.002 + instability * 0.007) * (direction < 0 ? -1 : 1);
    bike.pitchVelocity = clamp((Number(bike.pitchVelocity) || 0) + impulse, -0.24, 0.24);
}

function updateBikeFlipRecovery(bike) {
    if (bike.bumpCooldown > 0) bike.bumpCooldown--;
    if (!(bike.flippedTimer > 0)) return false;

    bike.flippedTimer--;
    bike.previousX = bike.x;
    bike.x = Math.max(0, bike.x + Math.max(0, bike.velocityX) * 0.28);
    bike.velocityX = Math.max(0.2, bike.velocityX * 0.955);

    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
    const stillFalling = bike.flippedTimer > 36;
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

    const suspensionQuality = clamp((Number(bike.stability) || 0) / 100, 0.15, 1);
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

    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
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

        const impactImbalance = front.residual - rear.residual;
        const naturalWobble = (Math.random() - 0.5) * Math.max(0, bodyKick - 1.5) * instability * 0.022;
        bike.pitchVelocity += clamp(
            impactImbalance * (0.008 + instability * 0.018) + naturalWobble,
            -0.095,
            0.095
        );

        maybeFlipFromImpact(bike, bodyKick, frontDelta - rearDelta, 'КОЧКА! Низкая стабильность');
    }
}

function getBotAirLeanInput(bike) {
    const gravity = Math.max(0.01, Number(bike.jumpGravity) || GRAVITY);
    const height = Math.max(0, Number(bike.jumpHeight) || 0);
    const verticalSpeed = Number(bike.jumpVelocity) || 0;
    const landingTime = Math.max(0, Math.min(90,
        (verticalSpeed + Math.sqrt(Math.max(0, verticalSpeed * verticalSpeed + 2 * gravity * height))) / gravity
    ));
    const landingX = bike.x + Math.max(0, Number(bike.velocityX) || 0) * landingTime;
    const targetPitch = Math.atan2(
        getGroundY(landingX + 25, 0) - getGroundY(landingX - 25, 0),
        50
    );
    const pitchError = clamp(targetPitch - bike.pitchAngle, -2.2, 2.2);
    const targetPitchVelocity = clamp(pitchError * 0.045, -0.012, 0.012);

    // Бот немного подруливает велосипедом к углу поверхности в точке посадки,
    // но использует ту же ограниченную силу воздушного контроля, что и игрок.
    return clamp((targetPitchVelocity - bike.pitchVelocity) * 70, -1, 1);
}

function updateJumpPhysics(bike) {
    if (!bike.isBot && bike.landingBoostCooldown > 0) bike.landingBoostCooldown--;

    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
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
            ? getBotAirLeanInput(bike)
            : (input.reversing ? 1 : 0) - (input.accelerating ? 1 : 0);
        bike.pitchVelocity += leanInput * 0.00065 * (0.85 + stabilityRatio * 0.15);

        // Тормоз не вращает байк в воздухе: он только гасит лишнее вращение.
        // Сила эффекта зависит от установленной тормозной системы.
        const braking = bike.isBot
            ? Math.abs(bike.pitchVelocity) > 0.022
            : input.braking;
        if (braking && bike.hasBrakes) {
            const brakeRatio = clamp(Number(bike.brakeStrength) || 0, 0, 15) / 15;
            bike.pitchVelocity *= 1 - (0.01 + brakeRatio * 0.05);
        }
        bike.pitchVelocity *= 0.965 - stabilityRatio * 0.055;
        bike.pitchVelocity = clamp(bike.pitchVelocity, -0.045, 0.045);
    }
    const pitchLimit = 2.35;
    bike.pitchAngle = clamp(bike.pitchAngle + bike.pitchVelocity, -pitchLimit, pitchLimit);

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
        const failedLanding = upsideDown || (
            landingSpeed > landingSpeedTolerance &&
            absoluteLandingAngle > safeLandingAngle
        );

        bike.jumpHeight = 0;
        bike.jumpVelocity = 0;
        bike.jumpGravity = GRAVITY;
        bike.grounded = true;
        bike.airY = null;
        bike.rampLift = 0;
        bike.currentRamp = null;
        if (failedLanding) {
            startBikeFlip(
                bike,
                landingAngle < 0 ? -1 : 1,
                'ЖЁСТКОЕ ПРИЗЕМЛЕНИЕ!'
            );
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
    const prevGroundY = getGroundY(bike.previousX ?? bike.x, 0);

    // Плавный учет уклона рельефа при отрыве, чтобы не втыкаться в крутой подъем
    const terrainSlopeVy = clamp((prevGroundY - groundY) * 0.35, -1.5, 2.5);

    bike.grounded = false;

    bike.jumpVelocity = Math.max(
        4,
        Number(force) || 9
    ) + terrainSlopeVy;
    // Прыжок сохраняет текущий наклон; сам отрыв не добавляет резкого переворота.
    bike.pitchVelocity = clamp(Number(bike.pitchVelocity) || 0, -0.045, 0.045);

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
        const launchAngle = Math.atan2(ramp.height * 0.4, Math.max(1, ramp.width));
        bike.pitchVelocity = clamp(
            (Number(bike.pitchVelocity) || 0) + launchAngle * 0.035,
            -0.045,
            0.045
        );

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

const REVERSE_STOP_THRESHOLD = 0.06;

function getBrakeDeceleration(bike, totalBrake, speed) {
    if (!bike?.hasBrakes) return 0;

    const brakeQuality = clamp(Number(bike.brakeStrength) || 0, 0, 15) / 15;
    const ratedPower = 0.08 + clamp(Number(totalBrake) || 0, 0, 80) * 0.0045;
    const brakeTierFactor = 0.4 + brakeQuality * 0.6;
    const speedPenalty = 1 + Math.min(20, Math.abs(Number(speed) || 0)) * 0.03;

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

// =========================================
// ФИЗИКА ИГРОКА
// =========================================

function updatePlayerPhysics() {
    if (updateBikeFlipRecovery(playerBike)) {
        updateReverseButtonLabel();
        return;
    }

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

    const brakeApplied = input.braking && playerBike.hasBrakes;
    const driveInput = Number(input.accelerating) - Number(input.reversing);

    const jumpForce =
        8.5 + jump * 0.12;

    const jumpGravity = clamp(
        GRAVITY - jump * 0.001,
        0.39,
        GRAVITY
    );

    if (driveInput > 0 && playerBike.grounded) {
        playerBike.velocityX += acceleration;
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
            playerBike.velocityX -= acceleration * 0.9;
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

    let allowedSpeed = maxSpeed * nitroMultiplier;
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

    if (slope > 0.04) {
        // Требуемая мощность в зависимости от крутизны склона
        const requiredPower = slope * 165;
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
                playerBike.velocityX -= lostAccel;
            }

            // Гравитационное сопротивление крутого склона действует и на земле, и при полете против склона
            const gravityDrag = slope * 0.18 * (1 - powerRatio);
            playerBike.velocityX -= gravityDrag;

            if (powerRatio < 0.45) {
                // Мощность критически мала: велосипед не вытягивает гору и откатывается назад!
                if (playerBike.velocityX < 0.5) {
                    playerBike.velocityX = Math.max(-0.8, playerBike.velocityX - 0.05);
                    if (powerWarningCooldown <= 0 && playerBike.grounded) {
                        addFloatingText(playerBike.x, getGroundY(playerBike.x, 0) - 65, '⚠️ Мало мощности! 🔋', '#ef4444');
                        powerWarningCooldown = 90;
                    }
                }
            }
        } else {
            // Высокая мощность: уверенный заезд в гору и небольшая помощь тяги
            if (driveInput > 0 && playerBike.grounded) {
                playerBike.velocityX += Math.min(0.04, (powerRatio - 1) * 0.015);
            }
        }
    } else if (slope < -0.04) {
        // На спуске сила тяжести помогает разгону вплоть до максимальной скорости
        const downhillBoost = Math.min(0.06, Math.abs(slope) * 0.05);
        playerBike.velocityX += downhillBoost;
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
    updateSuspensionResponse(playerBike);
    updateReverseButtonLabel();
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
    if (updateBikeFlipRecovery(bike)) return;

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

    if (bike.grounded) {
        bike.velocityX += baseAcceleration;
    }

    // Соревновательный азарт: бот активнее крутит педали (драфтинг), если отстает от лидера или соперника
    if (bike.grounded && !bike.isGhost) {
        const competitors = [playerBike, ...activeBots.filter(b => b !== bike && !b.isGhost)];
        const ahead = competitors.find(c => c && (c.x - bike.x) > 50 && (c.x - bike.x) < 450);
        if (ahead) {
            bike.velocityX += baseAcceleration * 0.28;
        }
    }

    let allowedSpeed = maxSpeed;

    const botWheelBase = 25;
    const botFrontY = getGroundY(bike.x + botWheelBase, 0);
    const botBackY = getGroundY(bike.x - botWheelBase, 0);
    const botSlope = (botBackY - botFrontY) / (botWheelBase * 2);
    if (bike.grounded && botSlope > 0.04) {
        const botHillDrag = botSlope * 0.08;
        bike.velocityX = Math.max(0.4, bike.velocityX - botHillDrag);
        allowedSpeed = Math.min(allowedSpeed, Math.max(0.6, maxSpeed * (1 - botSlope * 1.5)));
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
    updateSuspensionResponse(bike);
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

    let impactDuration = 42;
    if (playerBike.abilities?.impactBrake) impactDuration = Math.round(impactDuration * 0.85);
    if (playerBike.abilities?.flowFrame && ['ice_patch', 'wind_fan'].includes(obstacle.type)) {
        speedLimit = Math.max(speedLimit, Math.min(playerBike.velocityX, speedLimit * 1.15));
    }

    const roughObstacle = ['rock', 'rolling_boulder', 'log', 'fallen_branch'].includes(obstacle.type);
    const stability = clamp(Number(playerBike.stability) || 0, 0, 100);
    if (roughObstacle) {
        const retainedSpeed = (playerBike.velocityX - speedLimit) * stability * 0.0018;
        speedLimit += retainedSpeed;
        impactDuration = Math.round(impactDuration * (1 - stability * 0.002));

        const severity = obstacle.type === 'rolling_boulder' ? 1.35 : obstacle.type === 'rock' ? 1.2 : 1;
        const impactForce = playerBike.velocityX * severity / 3;
        const impactDirection = obstacle.type === 'rock' ? -1 : 1;
        applyImpactPitchImpulse(playerBike, impactForce, impactDirection);
        maybeFlipFromImpact(
            playerBike,
            impactForce,
            impactDirection,
            'УДАР! Низкая стабильность'
        );
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

    const roughObstacle = ['rock', 'rolling_boulder', 'log', 'fallen_branch'].includes(obstacle.type);
    if (roughObstacle) {
        const stability = clamp(Number(bike.stability) || 0, 0, 100);
        speedFactor = Math.min(0.94, speedFactor + stability * 0.0018);
        duration = Math.round(duration * (1 - stability * 0.002));
        bike.impactSlowTimer = duration;
        const severity = obstacle.type === 'rolling_boulder' ? 1.35 : obstacle.type === 'rock' ? 1.2 : 1;
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

function finishRace(playerWon, reason = 'finish') {
    if (raceFinished) return;

    raceFinished = true;
    raceRunning = false;
    animationId = null;
    input = {
        accelerating: false,
        braking: false,
        reversing: false,
        jumpRequested: false
    };

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
                        playerBike.velocityX = Math.max(playerBike.velocityX + 3.2, 11);
                        playerBike.nitroTimer = Math.max(playerBike.nitroTimer, 50);
                        if (typeof playBoostSound === 'function') {
                            try { playBoostSound(); } catch (e) {}
                        }
                        addFloatingText(playerBike.x, by - 40, '⚡ ТУРБО БУСТ! ⚡', '#38bdf8');
                    } else {
                        // Бот наехал на турбо-ускоритель и рванул вперед!
                        bike.velocityX = Math.max(bike.velocityX + 3.0, (bike.botBaseMaxSpeed || 4) * 1.35);
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
    ctx.save();
    if (bike.isGhost) {
        ctx.globalAlpha = 0.4;
    }

    const x = bike.x - cameraX;
    const groundY = getGroundY(bike.x, 0);
    const y = groundY - bike.jumpHeight - bike.rampLift;
    const visuals = bike.visuals || {};
    // В каталоге радиус задан в игровых единицах; матчевую модель немного
    // увеличиваем, чтобы колёса и рама читались, а не слипались в тонкие линии.
    const radius = clamp((Number(visuals.wheelRadius) || 9.5) * 1.24, 11.5, 15.5);
    const wheelY = y - radius + 1;
    const rearWheelX = x - 25;
    const frontWheelX = x + 25;
    const bottomX = x - 3;
    const bottomY = wheelY - radius * 0.42;
    const seatX = x - 10;
    const headX = x + 11;
    const travel = Number.isFinite(bike.previousX)
        ? bike.x - bike.previousX
        : 0;

    bike.wheelRotation = (bike.wheelRotation || 0) + travel / radius;
    bike.pedalPhase = (bike.pedalPhase || 0) + travel / radius * 0.42;
    const wheelAngle = bike.wheelRotation;
    const pedalAngle = bike.pedalPhase;

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
    const bikeRenderScale = 1.16;
    ctx.save();
    ctx.translate(x, wheelY);
    ctx.scale(bikeRenderScale, bikeRenderScale);
    ctx.translate(-x, -wheelY);

    // --- НАКЛОНЯЕМ ХОЛСТ ---
    ctx.save();
    ctx.translate(x, wheelY - 15);
    ctx.rotate(bike.pitchAngle || 0);
    ctx.translate(-x, -(wheelY - 15));
    // -----------------------

    function drawWheel(cx) {
        ctx.save();
        ctx.translate(cx, wheelY);
        ctx.rotate(wheelAngle);

        const tireWidth = clamp((Number(visuals.tireWidth) || 3.2) * 1.18, 3.8, 5.2);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = tireWidth + 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = tireWidth * 0.42;
        ctx.beginPath();
        ctx.arc(0, 0, radius - tireWidth * 0.42, 0, Math.PI * 2);
        ctx.stroke();

        // Чёткая окантовка обода и равномерные спицы вместо хаотичной сетки.
        ctx.strokeStyle = visuals.rimColor || '#64748b';
        ctx.lineWidth = 1.55;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.76, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(203,213,225,0.82)';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72);
        }
        ctx.stroke();

        // Небольшие насечки протектора помогают колесу отделяться от фона.
        ctx.strokeStyle = 'rgba(226,232,240,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
            const angle = i * Math.PI / 9;
            const inner = radius - tireWidth * 0.36;
            const outer = radius + tireWidth * 0.34;
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
            ctx.arc(0, 0, radius * 0.43, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#0f172a';
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3;
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * radius * 0.43, Math.sin(angle) * radius * 0.43, 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    drawWheel(rearWheelX);
    drawWheel(frontWheelX);

    if (!bike.isBot && input.braking && bike.hasBrakes && bike.velocityX > 0.15) {
        ctx.save();
        ctx.shadowColor = '#fb384f';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fb384f';
        ctx.beginPath();
        ctx.arc(rearWheelX, wheelY, radius * 0.34, 0, Math.PI * 2);
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

    if (visuals.fullSuspension) {
        drawTube(bottomX, bottomY, seatX, wheelY - 27);
        drawTube(seatX, wheelY - 27, headX, wheelY - 19);
        drawTube(headX, wheelY - 19, bottomX, bottomY);
    } else {
        drawTube(rearWheelX, wheelY, bottomX, bottomY);
        drawTube(bottomX, bottomY, seatX, wheelY - 27);
        drawTube(seatX, wheelY - 27, rearWheelX, wheelY);
        drawTube(seatX, wheelY - 27, headX, wheelY - 19);
        drawTube(headX, wheelY - 19, bottomX, bottomY);
    }

    if (visuals.fullSuspension) {
        const swingPivot = { x: rearWheelX + 11, y: wheelY - 4 };
        const rocker = { x: seatX - 7, y: wheelY - 15 };
        drawTube(rearWheelX, wheelY, swingPivot.x, swingPivot.y, frameColor, frameWidth * 0.8);
        drawTube(swingPivot.x, swingPivot.y, bottomX, bottomY, frameColor, frameWidth * 0.8);
        drawTube(rearWheelX, wheelY, rocker.x, rocker.y, frameColor, frameWidth * 0.8);
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
    drawTube(headX + 1, wheelY - 19, frontWheelX - 1, wheelY, visuals.forkColor || '#cbd5e1', 4);
    if (visuals.suspension) {
        const forkCompression = bike.frontCompression || 0;
        drawTube(headX + 3, wheelY - 17, frontWheelX - 3, wheelY - 5 + forkCompression * 0.35, '#fbbf24', 1.5);
    }

    ctx.strokeStyle = visuals.gearColor || '#94a3b8';
    ctx.lineWidth = 0.8;
    for (const gearRadius of [2.4, 3.4, 4.2]) {
        ctx.beginPath();
        ctx.arc(rearWheelX, wheelY, gearRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rearWheelX + 1, wheelY + 3);
    ctx.lineTo(rearWheelX + 5, wheelY + 7);
    ctx.lineTo(rearWheelX + 9, wheelY + 4);
    ctx.arc(rearWheelX + 9, wheelY + 2, 2, 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.strokeStyle = visuals.chainColor || '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(rearWheelX + 3, wheelY - 2.6);
    ctx.lineTo(bottomX - 4, bottomY - 3.5);
    ctx.moveTo(bottomX - 4, bottomY + 3.5);
    ctx.lineTo(rearWheelX + 3, wheelY + 2.6);
    ctx.arc(bottomX, bottomY, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    const pedalRadius = 7;
    const leftPedal = {
        x: bottomX + Math.cos(pedalAngle) * pedalRadius,
        y: bottomY + Math.sin(pedalAngle) * pedalRadius
    };
    const rightPedal = {
        x: bottomX + Math.cos(pedalAngle + Math.PI) * pedalRadius,
        y: bottomY + Math.sin(pedalAngle + Math.PI) * pedalRadius
    };
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
    ctx.moveTo(bottomX, bottomY);
    ctx.lineTo(leftPedal.x, leftPedal.y);
    ctx.moveTo(bottomX, bottomY);
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
        }
    }

    ctx.lineCap = 'round';
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
        } else if (riderId === 'r4') {
            // Большой терморюкзак курьера (Delivery Box)
            ctx.fillStyle = '#eab308';
            ctx.fillRect(hip.x - 11, shoulder.y - 2, 10, 14);
            ctx.strokeStyle = '#713f12';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(hip.x - 11, shoulder.y - 2, 10, 14);
            // Логотип полоска
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(hip.x - 10, shoulder.y + 4, 8, 3);
        } else if (riderId === 'r5') {
            // Джон: золотые полосы чемпиона
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(shoulder.x - 2, shoulder.y + 1);
            ctx.lineTo(hip.x + 1, hip.y);
            ctx.stroke();
        }
    }

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
        ctx.rect(bottomX - 3, bottomY - 5, 10, 8);
        ctx.fill();
        ctx.stroke();
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

    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, x, wheelY - 63);
    ctx.restore();
}

function drawRaceHUD() {
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
        !playerBike
    ) {
        return;
    }

    drawBackground();
    drawTrack();
    drawObstacles();
    drawCollectibles();
    drawFinishLine();

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

    activeBots.filter(bike => !bike.isGhost).forEach(drawBot);

    drawBike(
        playerBike,
        'ТЫ',
        playerBike.color
    );

    // Рисуем призрака поверх игрока, чтобы он оставался заметен при совпадении позиций.
    activeBots.filter(bike => bike.isGhost).forEach(drawBot);

    drawFloatingTexts();
    drawRaceHUD();
}

// =========================================
// ОБНОВЛЕНИЕ ГОНКИ
// =========================================

function update() {
    if (!raceRunning || raceFinished) return;

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
    timerStarted = false;
    raceTimeMs = 0;
    lastFrameTime = 0;
    frameAccumulator = 0;

    resizeCanvas();
    setTimeout(resizeCanvas, 50);

    finishX = currentTrack.id === 'sprint'
        ? 4500
        : Math.max(
            6000,
            (Number(currentTrack.length) || 15000) *
            TRACK_MULTIPLIER - 1500
        );

    playerBike = createBike(false);
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
        additionalBots = currentTrackLevel >= 2
            ? [createBike(true, 2)]
            : [];
        activeBots = [botBike, ...additionalBots];
    }

    cameraX = 0;
    frameCounter = 0;

    raceFinished = false;
    raceRunning = true;
    raceStarted = false;

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
