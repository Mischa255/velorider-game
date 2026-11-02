import { player } from './state.js';
import { TRACKS_DB, OBSTACLE_TYPES } from './db.js';

// =========================================
// VELOCITY RACE ENGINE
// Игрок и бот едут по одной общей трассе
// и встречают одни и те же препятствия.
// =========================================

const GRAVITY = 0.42;
const BIKE_WIDTH = 46;
const BIKE_HEIGHT = 24;
const TRACK_MULTIPLIER = 3;
const OBSTACLE_MULTIPLIER = 3;
const PLAYER_LANE_OFFSET = 0;
const BOT_LANE_OFFSET = 0;

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

// =========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

function getGroundY(worldX, laneOffset = 0) {
    const base = viewHeight * 0.72 + laneOffset;
    const hills = Math.max(1, Number(currentTrack?.hills) || 15);
    const amplitude = Math.min(42, 10 + hills * 0.18);

    const longWave = Math.sin(worldX * 0.00125) * amplitude;
    const shortWave = Math.sin(worldX * 0.0035) * (amplitude * 0.24);
    const tinyWave = Math.sin(worldX * 0.008) * 2.5;

    return base + longWave + shortWave + tinyWave;
}

function isTouchingObstacle(bike, obstacle) {
    const bikeLeft = bike.x - BIKE_WIDTH * 0.35;
    const bikeRight = bike.x + BIKE_WIDTH * 0.35;
    return bikeRight >= obstacle.x && bikeLeft <= obstacle.x + obstacle.width;
}

function createBike(isBot = false) {
    return {
        // Бот стартует немного позади, но на той же самой линии трассы.
        x: isBot ? 250 : 350,
        previousX: isBot ? 250 : 350,
        velocityX: 0,
        jumpHeight: 0,
        jumpVelocity: 0,
        jumpGravity: GRAVITY,
        grounded: true,
        rampLift: 0,
        currentRamp: null,
        impactSlowTimer: 0,
        impactSpeedLimit: 0,
        collidedObstacles: new Set(),
        isBot,
        color: isBot ? '#f97316' : '#22c55e'
    };
}

// =========================================
// ГЕНЕРАЦИЯ ОБЩЕЙ ТРАССЫ И ПРЕПЯТСТВИЙ
// =========================================

function createObstacles() {
    const typePool = Array.isArray(currentTrack?.obstacleTypes)
        ? currentTrack.obstacleTypes.filter(type => OBSTACLE_TYPES[type])
        : Object.keys(OBSTACLE_TYPES);

    const obstacleCount = Math.max(
        8,
        Math.floor((Number(currentTrack?.obstacles) || 8) * OBSTACLE_MULTIPLIER)
    );

    const usableLength = Math.max(1000, finishX - 1800);
    const spacing = usableLength / (obstacleCount + 1);
    const generated = [];

    for (let i = 0; i < obstacleCount; i++) {
        const type = randomItem(typePool) || 'rock';
        const definition = OBSTACLE_TYPES[type];
        const x = 900 + spacing * (i + 1) + (Math.random() - 0.5) * spacing * 0.35;

        generated.push({
            id: `${type}-${i}`,
            type,
            x,
            width: Number(definition.width) || 40,
            height: Number(definition.height) || 25,
            color: definition.color || '#777777',
            playerHit: false,
            botHit: false,
            playerRampUsed: false,
            botRampUsed: false
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
    if (bike.grounded) return;

    bike.jumpHeight += bike.jumpVelocity;
    bike.jumpVelocity -= bike.jumpGravity || GRAVITY;

    if (bike.jumpHeight <= 0) {
        bike.jumpHeight = 0;
        bike.jumpVelocity = 0;
        bike.jumpGravity = GRAVITY;
        bike.grounded = true;
        bike.rampLift = 0;
        bike.currentRamp = null;
    }
}

function startJump(bike, force) {
    if (!bike || !bike.grounded) return false;

    bike.grounded = false;
    bike.jumpVelocity = Math.max(4, Number(force) || 9);
    bike.jumpGravity = GRAVITY;
    bike.jumpHeight = 1;
    bike.rampLift = 0;
    bike.currentRamp = null;
    return true;
}

// =========================================
// РАМПА: ОБА ВЕЛОСИПЕДА ЕДУТ ПО НЕЙ ОДИНАКОВО
// =========================================

function updateRamp(bike, isBot) {
    const usedProperty = isBot ? 'botRampUsed' : 'playerRampUsed';

    if (!bike.grounded) {
        bike.rampLift = 0;
        return;
    }

    const previousX = Number.isFinite(bike.previousX)
        ? bike.previousX
        : bike.x;

    // Сначала продолжаем обработку трамплина, на который велосипед уже заехал.
    let ramp = bike.currentRamp
        ? obstacles.find(obstacle =>
            obstacle.id === bike.currentRamp &&
            obstacle.type === 'ramp' &&
            !obstacle[usedProperty]
        )
        : null;

    // Проверяем также пересечение рампы за один кадр.
    // Это важно, когда скорость велосипеда выше ширины короткого трамплина.
    if (!ramp) {
        ramp = obstacles.find(obstacle => {
            if (obstacle.type !== 'ramp' || obstacle[usedProperty]) return false;
            if (bike.velocityX <= 0) return false;

            const rampStart = obstacle.x;
            const rampEnd = obstacle.x + obstacle.width;
            return bike.x >= rampStart - 4 && previousX <= rampEnd;
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
    const crossedRampEnd = previousX < rampEnd && bike.x >= rampEnd;
    const reachedRampEnd = progress >= 1;

    if (bike.velocityX > 0.4 && (crossedRampEnd || reachedRampEnd)) {
        ramp[usedProperty] = true;

        // Запуск с рампы сильнее и дольше обычного прыжка.
        // Уменьшенная гравитация не даёт велосипеду резко опуститься сразу за краем.
        const extraJump = isBot
            ? 0
            : Math.min(Number(player.totalJump) || 0, 35) * 0.035;

        bike.jumpHeight = Math.max(bike.rampLift, ramp.height * 0.85);
        bike.rampLift = 0;
        bike.grounded = false;
        bike.jumpVelocity = 12 + extraJump;
        bike.jumpGravity = 0.38;
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
    const speed = Math.max(0, Number(player.totalSpeed) || 0);
    const accel = Math.max(0, Number(player.totalAccel) || 0);
    const jump = Math.max(0, Number(player.totalJump) || 0);
    const brake = Math.max(0, Number(player.totalBrake) || 0);

    const maxSpeed = 3.2 + Math.min(speed, 70) * 0.12;
    const acceleration = 0.05 + Math.min(accel, 70) * 0.002;
    const brakePower = Math.min(0.72, 0.12 + brake * 0.008);
    const jumpForce = 8.5 + Math.min(jump, 45) * 0.1;

    if (input.accelerating) playerBike.velocityX += acceleration;
    if (input.reversing) playerBike.velocityX -= acceleration * 0.9;

    if (input.braking) {
        if (playerBike.velocityX > 0) {
            playerBike.velocityX = Math.max(0, playerBike.velocityX - brakePower);
        } else if (playerBike.velocityX < 0) {
            playerBike.velocityX = Math.min(0, playerBike.velocityX + brakePower);
        }
    }

    if (!input.accelerating && !input.reversing && !input.braking) {
        playerBike.velocityX *= 0.992;
    }

    let allowedSpeed = maxSpeed;

    if (playerBike.impactSlowTimer > 0) {
        playerBike.impactSlowTimer--;
        allowedSpeed = Math.min(allowedSpeed, playerBike.impactSpeedLimit);
    }

    playerBike.velocityX = clamp(
        playerBike.velocityX,
        -maxSpeed * 0.65,
        allowedSpeed
    );

    playerBike.previousX = playerBike.x;
    playerBike.x = Math.max(0, playerBike.x + playerBike.velocityX);

    if (input.jumpRequested) {
        startJump(playerBike, jumpForce);
        input.jumpRequested = false;
    }

    updateJumpPhysics(playerBike);
    updateRamp(playerBike, false);
}

// =========================================
// ИИ БОТА: ПОИСК БЛИЖАЙШЕГО ПРЕПЯТСТВИЯ
// Камни специально не включены: по игровой механике
// они замедляют велосипед. Бот перепрыгивает ямы,
// брёвна и барьеры, трамплин проходит как рампу.
// =========================================

function findBotJumpTarget() {
    const jumpableTypes = new Set(['pit', 'log', 'barrier']);
    const front = botBike.x + BIKE_WIDTH * 0.35;

    return obstacles.find(obstacle => {
        if (!jumpableTypes.has(obstacle.type)) return false;
        if (obstacle.x + obstacle.width < front - 8) return false;
        if (obstacle.botJumpAttempted) return false;
        return true;
    }) || null;
}

function updateBotAI() {
    if (!botBike.grounded || botBike.jumpHeight > 0) return;

    const obstacle = findBotJumpTarget();
    if (!obstacle) return;

    const front = botBike.x + BIKE_WIDTH * 0.35;
    const distance = obstacle.x - front;
    const speed = Math.max(1.5, botBike.velocityX);

    // Прыжок начинается незадолго до препятствия.
    // Старое значение 95–210 px заставляло бота взлетать слишком рано
    // и приземляться ещё до того, как он доезжал до препятствия.
    const reactionDistance = clamp(
        speed * 5 + 8,
        16,
        34
    );

    if (distance <= reactionDistance && distance >= -BIKE_WIDTH * 0.2) {
        const force = getTrackBalance(currentTrack.id).jumpForce;
        obstacle.botJumpAttempted = true;
        startJump(botBike, force);
    }
}

// =========================================
// ФИЗИКА БОТА
// =========================================

function updateBotPhysics() {
    const balance = getTrackBalance(currentTrack.id);

    const maxSpeed = Math.max(
        1.5,
        (Number(currentTrack.botMaxSpeed) || 4) * balance.speed
    );

    const baseAcceleration = Math.max(
        0.012,
        (Number(currentTrack.botAccel) || 0.05) * balance.accel
    );

    botBike.velocityX += baseAcceleration;

    let allowedSpeed = maxSpeed;

    if (botBike.impactSlowTimer > 0) {
        botBike.impactSlowTimer--;
        allowedSpeed = Math.min(allowedSpeed, botBike.impactSpeedLimit);
    }

    botBike.velocityX = Math.min(botBike.velocityX, allowedSpeed);

    // Решение о прыжке принимается до перемещения вперёд.
    updateBotAI();

    botBike.previousX = botBike.x;
    botBike.x = Math.max(0, botBike.x + botBike.velocityX);

    updateJumpPhysics(botBike);
    updateRamp(botBike, true);
}

// =========================================
// СТОЛКНОВЕНИЯ ИГРОКА
// =========================================

function applyPlayerImpact(obstacle, speedLimit = 1.0) {
    if (playerBike.collidedObstacles.has(obstacle.id)) return;

    playerBike.collidedObstacles.add(obstacle.id);
    playerBike.impactSlowTimer = 42;
    playerBike.impactSpeedLimit = speedLimit;
    playerBike.velocityX = Math.min(playerBike.velocityX, speedLimit);
}

function updatePlayerCollisions() {
    for (const obstacle of obstacles) {
        if (obstacle.x + obstacle.width < playerBike.x - BIKE_WIDTH) continue;
        if (obstacle.x > playerBike.x + BIKE_WIDTH) break;
        if (!isTouchingObstacle(playerBike, obstacle)) continue;

        // Яма: игрок проигрывает, если касается её на земле.
        if (obstacle.type === 'pit') {
            if (playerBike.grounded && playerBike.jumpHeight < 8) {
                finishRace(false, 'pit');
                return;
            }
            continue;
        }

        if (obstacle.type === 'ramp') continue;

        // Камень замедляет, если велосипед не перепрыгнул его.
        if (obstacle.type === 'rock') {
            if (playerBike.jumpHeight < obstacle.height * 0.65) {
                applyPlayerImpact(obstacle, 1.15);
            }
            continue;
        }

        if (obstacle.type === 'log' || obstacle.type === 'barrier') {
            const requiredJump = obstacle.height + 9;
            if (playerBike.jumpHeight < requiredJump) {
                applyPlayerImpact(obstacle, 0.85);
            }
        }
    }
}

// =========================================
// СТОЛКНОВЕНИЯ БОТА
// Бот не проигрывает в яме, но если ИИ не успел
// прыгнуть, он теряет скорость и продолжает гонку.
// =========================================

function applyBotImpact(obstacle, speedFactor = 0.5, duration = 34) {
    if (obstacle.botHit) return;

    obstacle.botHit = true;
    botBike.impactSlowTimer = duration;
    botBike.impactSpeedLimit = Math.max(
        0.9,
        botBike.velocityX * speedFactor
    );
}

function updateBotCollisions() {
    for (const obstacle of obstacles) {
        if (obstacle.x + obstacle.width < botBike.x - BIKE_WIDTH) continue;
        if (obstacle.x > botBike.x + BIKE_WIDTH) break;
        if (!isTouchingObstacle(botBike, obstacle)) continue;

        // В отличие от игрока бот не проигрывает при наезде на яму.
        // Но должен стараться перепрыгнуть её заранее.
        if (obstacle.type === 'pit') {
            if (botBike.grounded && botBike.jumpHeight < 8) {
                applyBotImpact(obstacle, 0.48, 42);
            }
            continue;
        }

        if (obstacle.type === 'ramp') continue;

        if (obstacle.type === 'rock') {
            if (botBike.jumpHeight < obstacle.height * 0.65) {
                applyBotImpact(obstacle, 0.55, 32);
            }
            continue;
        }

        if (obstacle.type === 'log' || obstacle.type === 'barrier') {
            if (botBike.jumpHeight < obstacle.height + 9) {
                applyBotImpact(obstacle, 0.45, 38);
            }
        }
    }
}

// =========================================
// ПРОВЕРКА ФИНИША
// =========================================

function checkFinish() {
    const playerFinished = playerBike.x >= finishX;
    const botFinished = botBike.x >= finishX;

    if (!playerFinished && !botFinished) return;

    if (playerFinished && !botFinished) {
        finishRace(true, 'finish');
        return;
    }

    if (botFinished && !playerFinished) {
        finishRace(false, 'bot-finish');
        return;
    }

    finishRace(playerBike.x >= botBike.x, 'photo-finish');
}

// =========================================
// ОТРИСОВКА ФОНА
// =========================================

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.6, '#1e3a5f');
    gradient.addColorStop(1, '#334155');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, viewHeight * 0.48);

    for (let x = 0; x <= viewWidth + 20; x += 20) {
        const y = viewHeight * 0.48 +
            Math.sin((x + cameraX * 0.18) * 0.004) * 24 +
            Math.sin((x + cameraX * 0.1) * 0.009) * 12;
        ctx.lineTo(x, y);
    }

    ctx.lineTo(viewWidth, viewHeight);
    ctx.lineTo(0, viewHeight);
    ctx.closePath();
    ctx.fill();
}

// =========================================
// ОДНА ОБЩАЯ ЛИНИЯ ТРАССЫ
// =========================================

function drawTrack() {
    ctx.beginPath();

    for (let x = 0; x <= viewWidth + 10; x += 8) {
        const worldX = cameraX + x;
        const y = getGroundY(worldX, 0);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 28;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(226,232,240,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([14, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// =========================================
// ОТРИСОВКА ПРЕПЯТСТВИЙ — ТОЛЬКО ОДИН РАЗ
// =========================================

function drawObstacle(obstacle) {
    const screenX = obstacle.x - cameraX;
    if (screenX < -100 || screenX > viewWidth + 100) return;

    const groundY = getGroundY(obstacle.x, 0);
    const width = obstacle.width;
    const height = obstacle.height;

    if (obstacle.type === 'pit') {
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.ellipse(screenX + width / 2, groundY + 2, width / 2, 10, 0, 0, Math.PI * 2);
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
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(screenX, groundY - height, width, height);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, groundY - height, width, height);
        ctx.strokeStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(screenX + 5, groundY - height / 2, 5, 0, Math.PI * 2);
        ctx.stroke();
        return;
    }

    if (obstacle.type === 'barrier') {
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(screenX, groundY - height, width, height);
        ctx.fillStyle = '#fecaca';

        for (let i = 0; i < 3; i++) {
            ctx.fillRect(screenX + 5 + i * 14, groundY - height + 6, 7, height - 12);
        }

        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, groundY - height, width, height);
    }
}

function drawObstacles() {
    obstacles.forEach(drawObstacle);
}

// =========================================
// ОТРИСОВКА ВЕЛОСИПЕДА
// =========================================

function drawBike(bike, label, color) {
    const x = bike.x - cameraX;
    const groundY = getGroundY(bike.x, 0);
    const y = groundY - bike.jumpHeight - bike.rampLift;

    const wheelY = y - 8;
    const rearWheelX = x - 17;
    const frontWheelX = x + 17;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, groundY - 1, 25, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(rearWheelX, wheelY, 8, 0, Math.PI * 2);
    ctx.arc(frontWheelX, wheelY, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rearWheelX, wheelY, 5, 0, Math.PI * 2);
    ctx.arc(frontWheelX, wheelY, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rearWheelX, wheelY);
    ctx.lineTo(x - 3, wheelY - 10);
    ctx.lineTo(frontWheelX, wheelY);
    ctx.lineTo(rearWheelX, wheelY);
    ctx.moveTo(x - 3, wheelY - 10);
    ctx.lineTo(x + 5, wheelY);
    ctx.lineTo(rearWheelX, wheelY);
    ctx.stroke();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 5, wheelY);
    ctx.lineTo(frontWheelX, wheelY);
    ctx.lineTo(frontWheelX + 2, wheelY - 13);
    ctx.lineTo(frontWheelX + 8, wheelY - 13);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 2, wheelY - 10);
    ctx.lineTo(x - 6, wheelY - 21);
    ctx.lineTo(x + 7, wheelY - 16);
    ctx.lineTo(frontWheelX + 2, wheelY - 13);
    ctx.moveTo(x - 6, wheelY - 21);
    ctx.lineTo(x - 12, wheelY - 14);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - 6, wheelY - 25, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, x, wheelY - 36);
}

// =========================================
// HUD ГОНКИ
// =========================================

function drawRaceHUD() {
    const playerProgress = clamp(playerBike.x / finishX, 0, 1);
    const botProgress = clamp(botBike.x / finishX, 0, 1);
    const mobile = viewWidth < 600;

    ctx.save();
    ctx.textAlign = 'left';

    if (mobile) {
        // На телефонах делаем панель шире, значки и шкалы крупнее.
        const panelWidth = Math.min(370, viewWidth - 20);
        const panelHeight = 108;
        const x = (viewWidth - panelWidth) / 2;
        const y = 12;
        const barX = x + 76;
        const barWidth = Math.max(72, panelWidth - 135);
        const percentX = x + panelWidth - 48;

        ctx.fillStyle = 'rgba(15,23,42,0.90)';
        ctx.fillRect(x, y, panelWidth, panelHeight);
        ctx.strokeStyle = 'rgba(148,163,184,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);

        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(currentTrack.name, x + 13, y + 21);

        // Игрок.
        ctx.font = '22px Arial';
        ctx.fillText('🚴', x + 12, y + 53);
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#bbf7d0';
        ctx.fillText('ТЫ', x + 43, y + 50);
        ctx.fillStyle = '#334155';
        ctx.fillRect(barX, y + 39, barWidth, 12);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(barX, y + 39, barWidth * playerProgress, 12);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#bbf7d0';
        ctx.fillText(`${Math.round(playerProgress * 100)}%`, percentX, y + 50);

        // Соперник.
        ctx.font = '22px Arial';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('🤖', x + 12, y + 88);
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#fed7aa';
        ctx.fillText('БОТ', x + 43, y + 85);
        ctx.fillStyle = '#334155';
        ctx.fillRect(barX, y + 74, barWidth, 12);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(barX, y + 74, barWidth * botProgress, 12);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#fed7aa';
        ctx.fillText(`${Math.round(botProgress * 100)}%`, percentX, y + 85);
    } else {
        ctx.fillStyle = 'rgba(15,23,42,0.82)';
        ctx.fillRect(14, 12, Math.min(320, viewWidth - 28), 66);

        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(currentTrack.name, 25, 31);

        const barWidth = Math.min(280, viewWidth - 50);
        ctx.fillStyle = '#334155';
        ctx.fillRect(25, 40, barWidth, 8);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(25, 40, barWidth * playerProgress, 8);
        ctx.fillStyle = '#334155';
        ctx.fillRect(25, 56, barWidth, 6);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(25, 56, barWidth * botProgress, 6);

        ctx.font = '11px Arial';
        ctx.fillStyle = '#bbf7d0';
        ctx.fillText(`Ты: ${Math.round(playerProgress * 100)}%`, 25 + barWidth + 9, 48);
        ctx.fillStyle = '#fed7aa';
        ctx.fillText(`Бот: ${Math.round(botProgress * 100)}%`, 25 + barWidth + 9, 63);
    }

    ctx.restore();
}

function drawFinishLine() {
    const screenX = finishX - cameraX;
    if (screenX < -30 || screenX > viewWidth + 40) return;

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
            ctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
            ctx.fillRect(screenX + col * tile, topY + row * tile, tile, tile);
        }
    }
}

// =========================================
// ОТРИСОВКА КАДРА
// =========================================

function render() {
    if (!ctx || !canvas || !playerBike || !botBike) return;

    drawBackground();
    drawTrack();
    drawObstacles();
    drawFinishLine();

    // Обе модели находятся на одной высоте и одной поверхности.
    drawBike(botBike, 'БОТ', '#f97316');
    drawBike(playerBike, 'ТЫ', '#22c55e');

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

    updateBotPhysics();

    updatePlayerCollisions();
    if (raceFinished) return;

    updateBotCollisions();

    const targetCamera = Math.max(0, playerBike.x - viewWidth * 0.34);
    cameraX += (targetCamera - cameraX) * 0.12;

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
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    viewWidth = Math.max(320, rect.width || canvas.clientWidth || 800);
    viewHeight = Math.max(220, rect.height || canvas.clientHeight || 420);

    canvas.width = Math.round(viewWidth * dpr);
    canvas.height = Math.round(viewHeight * dpr);

    ctx = canvas.getContext('2d');

    if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        console.error('Не найден canvas с id="raceCanvas".');
        return;
    }

    callbackOnRaceEnd = onRaceEnd;

    currentTrack = TRACKS_DB.find(
        track => track.id === player.selectedTrack
    ) || TRACKS_DB[0];

    if (!currentTrack) {
        console.error('В TRACKS_DB нет ни одной трассы.');
        return;
    }

    resizeCanvas();

    finishX = Math.max(
        6000,
        (Number(currentTrack.length) || 15000) * TRACK_MULTIPLIER - 1500
    );

    playerBike = createBike(false);
    botBike = createBike(true);

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
        window.addEventListener('resize', resizeCanvas);
        resizeHandlerAttached = true;
    }

    render();
    animationId = requestAnimationFrame(gameLoop);
}

// =========================================
// УПРАВЛЕНИЕ ИГРОКОМ ИЗ MAIN.JS
// =========================================

export function setAccelerating(value) {
    input.accelerating = Boolean(value);
}

export function setBraking(value) {
    input.braking = Boolean(value);
}

export function setReversing(value) {
    input.reversing = Boolean(value);
}

export function triggerJump() {
    if (!raceRunning || raceFinished) return;
    input.jumpRequested = true;
}

// Останавливает гонку без вызова обработчика результата и без награды.
export function stopRace() {
    raceRunning = false;
    raceFinished = true;
    input.accelerating = false;
    input.braking = false;
    input.reversing = false;
    input.jumpRequested = false;
    callbackOnRaceEnd = null;

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}
