import { clamp } from './utils.js';

const BOT_GAP_JUMP_TYPES = new Set([
    'pit',
    'bridge_gap',
    'cliff',
    'loose_planks'
]);
const BOT_GAP_APPROACH_DISTANCE = 560;
const BOT_OPTIONAL_JUMP_CHANCES = {
    rock: 0.86,
    log: 0.86,
    barrier: 0.88,
    cone: 0.74,
    fallen_branch: 0.9,
    wooden_gate: 0.88,
    iron_gate: 0.9,
    pulse_gate: 0.95,
    rolling_boulder: 0.55,
    rolling_wheel: 0.88,
    smith_hammer: 0.95,
    mill_paddle: 0.9,
    crank_rack: 0.9,
    mud: 0.72,
    water_splash: 0.7,
    ice_patch: 0.64,
    wind_fan: 0.82,
    forge_slag: 0.8,
    ford_stones: 0.7,
    cobblestones: 0.48
};

// Исторические этапы имеют собственные дистанции и плотность препятствий,
// поэтому их соперников балансируем отдельно от обычных трасс.
const HISTORY_BOT_PACE = Object.freeze({
    h1: { maxSpeed: 2.8, acceleration: 0.0325, jumpForce: 10.5, power: 10 },
    h2: { maxSpeed: 3.1, acceleration: 0.039, jumpForce: 10.5, power: 12 },
    h3: { maxSpeed: 3.35, acceleration: 0.046, jumpForce: 10.7, power: 15 },
    h4: { maxSpeed: 3.65, acceleration: 0.05, jumpForce: 10.7, power: 18 },
    h5: { maxSpeed: 3.9, acceleration: 0.054, jumpForce: 10.5, power: 22 },
    m1: { maxSpeed: 4.8, acceleration: 0.071, jumpForce: 10.7, power: 19 },
    m2: { maxSpeed: 4.8, acceleration: 0.071, jumpForce: 10.7, power: 22 },
    m3: { maxSpeed: 4.8, acceleration: 0.071, jumpForce: 10.7, power: 25 },
    m4: { maxSpeed: 4.8, acceleration: 0.071, jumpForce: 10.7, power: 28 },
    m5: { maxSpeed: 5.0, acceleration: 0.075, jumpForce: 10.9, power: 31 },
    l1: { maxSpeed: 5.35, acceleration: 0.085, jumpForce: 10.7, power: 27 },
    l2: { maxSpeed: 6.05, acceleration: 0.095, jumpForce: 10.8, power: 31 },
    l3: { maxSpeed: 6.8, acceleration: 0.12, jumpForce: 10.8, power: 34 },
    l4: { maxSpeed: 6.05, acceleration: 0.095, jumpForce: 10.8, power: 31 },
    l5: { maxSpeed: 6.8, acceleration: 0.12, jumpForce: 10.9, power: 35 },
    l6: { maxSpeed: 7.5, acceleration: 0.15, jumpForce: 11.1, power: 40 }
});

export function getBotPersonality(botIndex) {
    return Number(botIndex) === 2
        ? { style: 'bold', jumpConfidence: 1.08, boostReadiness: 0.76 }
        : { style: 'steady', jumpConfidence: 1, boostReadiness: 0.84 };
}

export function createBotBrain(botIndex, personality = getBotPersonality(botIndex)) {
    return {
        ...personality,
        state: 'cruising',
        targetObstacleId: null,
        lastAction: 'none'
    };
}

export function getBotDifficultyStats(botIndex, difficultyTrack, currentTrack, getTrackBalance) {
    const balance = getTrackBalance(difficultyTrack?.id);
    const historyPace = currentTrack?.isHistory
        ? HISTORY_BOT_PACE[currentTrack.id]
        : null;
    const fallbackSpeed = Number(currentTrack?.botMaxSpeed) || 4;
    const fallbackAccel = Number(currentTrack?.botAccel) || 0.05;
    const rawSpeed = Number(currentTrack?.isHistory
        ? currentTrack.botMaxSpeed
        : difficultyTrack?.botMaxSpeed) || fallbackSpeed;
    const rawAcceleration = Number(currentTrack?.isHistory
        ? currentTrack.botAccel
        : difficultyTrack?.botAccel) || fallbackAccel;
    const personality = getBotPersonality(botIndex);

    // Небольшая вариация формы сохраняет равный шанс лидерства в каждом заезде.
    const speedVariation = 0.97 + Math.random() * 0.06;
    const accelVariation = 0.95 + Math.random() * 0.1;

    return {
        trackId: difficultyTrack?.id || currentTrack?.id,
        maxSpeed: Math.max(1.5, (historyPace?.maxSpeed ?? rawSpeed * balance.speed) * speedVariation),
        acceleration: Math.max(0.012, (historyPace?.acceleration ?? rawAcceleration * balance.accel) * accelVariation),
        jumpForce: historyPace?.jumpForce ?? balance.jumpForce,
        power: Math.max(0, Number(historyPace?.power ?? balance.power) || 0),
        personality
    };
}

export function getBotAbilities(botIndex, currentTrack, currentTrackLevel) {
    const botLevel = currentTrack?.isHistory && Number(currentTrack.historyChapter) === 2
        ? 3
        : currentTrackLevel;

    return {
        nitroUnlocked: botLevel >= 3,
        superJumpUnlocked: botLevel >= 5 && Math.random() < 0.6,
        shieldCharges: botLevel >= 9 ? 1 : 0,
        macmillanBurst: currentTrack?.isHistory &&
            Number(currentTrack.historyChapter) === 2 &&
            Number(currentTrack.historyStage) === 5 &&
            botIndex === 1
    };
}

export function getTimedObstaclePulse(obstacle, frameCounter) {
    const speed = obstacle.type === 'crank_rack'
        ? 0.105
        : obstacle.type === 'mill_paddle'
            ? 0.062
            : 0.052;
    return Math.sin(frameCounter * speed + (Number(obstacle.phase) || 0));
}

export function isTimedObstacleActive(obstacle, frameCounter) {
    const threshold = obstacle.type === 'crank_rack' ? 0.28 : 0.05;
    return getTimedObstaclePulse(obstacle, frameCounter) > threshold;
}

function shouldBotJumpObstacle(bike, obstacle, frameCounter, racePressure = 0) {
    if (BOT_GAP_JUMP_TYPES.has(obstacle.type)) return true;

    const chance = BOT_OPTIONAL_JUMP_CHANCES[obstacle.type];
    if (!chance) return false;

    if (obstacle.type === 'pulse_gate' && Math.sin(frameCounter * 0.045 + obstacle.x) > 0.15) {
        return false;
    }
    if (
        ['smith_hammer', 'mill_paddle', 'crank_rack'].includes(obstacle.type) &&
        !isTimedObstacleActive(obstacle, frameCounter)
    ) {
        return false;
    }

    // Фиксированный бросок для пары «бот-препятствие»: ИИ не меняет решение каждый кадр.
    const roll = ((Math.floor(obstacle.x * 17) + bike.botIndex * 31) % 100) / 100;
    const confidence = Number(bike.botBrain?.jumpConfidence) || getBotPersonality(bike.botIndex).jumpConfidence;
    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
    // Бот, который отстаёт, чаще выбирает прыжок, чтобы не терять темп.
    // При низкой стабильности он, наоборот, реже рискует на необязательных объектах.
    const utility = chance + racePressure * 0.12 + (stabilityRatio - 0.55) * 0.1;
    return roll < Math.min(0.98, clamp(utility, 0.2, 0.98) * confidence);
}

function findUpcomingGap(bike, obstacles, bikeWidth, distanceLimit = Infinity) {
    const front = bike.x + bikeWidth * 0.35;
    return obstacles.find(obstacle =>
        BOT_GAP_JUMP_TYPES.has(obstacle.type) &&
        obstacle.x + obstacle.width >= front - 8 &&
        obstacle.x - front <= distanceLimit &&
        !obstacle.botJumpAttemptedBy.has(bike.botIndex)
    ) || null;
}

export function shouldBotHoldRampForGap(bike, obstacles, bikeWidth) {
    return Boolean(findUpcomingGap(bike, obstacles, bikeWidth, BOT_GAP_APPROACH_DISTANCE));
}

function findBotJumpTarget(bike, obstacles, frameCounter, bikeWidth, racePressure = 0) {
    const front = bike.x + bikeWidth * 0.35;
    const imminentGap = findUpcomingGap(bike, obstacles, bikeWidth, BOT_GAP_APPROACH_DISTANCE);
    if (imminentGap) return imminentGap;

    return obstacles.find(obstacle =>
        shouldBotJumpObstacle(bike, obstacle, frameCounter, racePressure) &&
        obstacle.x + obstacle.width >= front - 8 &&
        !obstacle.botJumpAttemptedBy.has(bike.botIndex)
    ) || null;
}

function approachRock(bike, maxSpeed, obstacles, bikeWidth, racePressure) {
    const front = bike.x + bikeWidth * 0.35;
    const rock = obstacles.find(obstacle =>
        obstacle.type === 'rock' &&
        !obstacle.botHitBy?.has?.(bike.botIndex) &&
        obstacle.x > front
    );
    if (!rock) return false;

    const distance = rock.x - front;
    const brakingDistance = clamp(
        Math.max(1, bike.velocityX) * 12 + rock.width * 0.25 + 15,
        55,
        110
    );
    // Это именно торможение перед камнем. После того как переднее колесо
    // дошло до него, решение больше не должно замедлять бота после удара.
    if (distance > brakingDistance) return false;

    const stabilityRatio = clamp(Number(bike.stability) || 0, 0, 100) / 100;
    const riskAdjustedLimit = clamp(
        0.62 + Math.max(0, racePressure) * 0.08 - (1 - stabilityRatio) * 0.08,
        0.52,
        0.74
    );
    const approachLimit = Math.max(0.65, maxSpeed * riskAdjustedLimit);
    bike.velocityX = Math.min(bike.velocityX, approachLimit);
    return true;
}

export function updateBotDrivingDecision(bike, context) {
    const {
        obstacles,
        frameCounter,
        currentTrackId,
        getTrackBalance,
        startJump,
        gravity,
        bikeWidth,
        competitors = []
    } = context;
    const brain = bike.botBrain || (bike.botBrain = createBotBrain(bike.botIndex));
    const otherRacers = competitors.filter(racer => racer && racer !== bike && !racer.isGhost);
    const leaderX = Math.max(bike.x, ...otherRacers.map(racer => Number(racer.x) || 0));
    const racePressure = clamp((leaderX - bike.x) / 900, -0.35, 1);

    brain.state = 'cruising';
    brain.targetObstacleId = null;

    if (!bike.grounded || bike.jumpHeight > 0) {
        brain.state = 'airborne';
        return;
    }

    const obstacle = findBotJumpTarget(bike, obstacles, frameCounter, bikeWidth, racePressure);
    if (obstacle?.type !== 'rock' &&
        approachRock(bike, context.maxSpeed, obstacles, bikeWidth, racePressure)) {
        brain.state = 'cautious-approach';
        brain.lastAction = 'slow-for-rock';
    }
    if (!obstacle) return;

    const front = bike.x + bikeWidth * 0.35;
    const distance = obstacle.x - front;
    const speed = Math.max(1.2, bike.velocityX);
    const mandatoryGap = BOT_GAP_JUMP_TYPES.has(obstacle.type);
    const reactionDistance = mandatoryGap
        ? clamp(speed * 12 + obstacle.width * 0.22 + 12, 50, 100)
        : clamp(speed * 12 + obstacle.width * 0.16 + 18, 60, 120);

    brain.targetObstacleId = obstacle.id;
    // Разрывы обязательны для прыжка. Если бот приземлился уже у самого края,
    // он всё равно делает поздний спасательный прыжок, пока препятствие ещё
    // не прошло передним колесом. Обычные препятствия сохраняют прежний порог.
    if (distance > reactionDistance ||
        (!mandatoryGap && distance < -bikeWidth * 0.2)) {
        brain.state = distance <= reactionDistance * 1.5 ? 'preparing-jump' : brain.state;
        return;
    }

    const baseForce = Number(bike.botJumpForce) || getTrackBalance(currentTrackId).jumpForce;
    const superJumpBonus = bike.abilities?.superJumpUnlocked ? 2.5 : 0;
    obstacle.botJumpAttemptedBy.add(bike.botIndex);
    brain.state = 'jumping';
    brain.lastAction = mandatoryGap ? 'jump-gap' : 'jump-obstacle';
    startJump(bike, baseForce + (mandatoryGap ? 0.8 : 0) + superJumpBonus,
        bike.abilities?.superJumpUnlocked ? 0.355 : gravity);
}

export function updateBotAbilities(bike, obstacles, bikeWidth, competitors = []) {
    const brain = bike.botBrain || (bike.botBrain = createBotBrain(bike.botIndex));
    if (bike.macmillanBurstTimer > 0) bike.macmillanBurstTimer--;
    if (bike.nitroTimer > 0) {
        bike.nitroTimer--;
    } else if (bike.nitroCooldown > 0) {
        bike.nitroCooldown--;
    }
    if (bike.shieldActiveTimer > 0) bike.shieldActiveTimer--;

    const front = bike.x + bikeWidth * 0.35;
    const otherRacers = competitors.filter(racer => racer && racer !== bike && !racer.isGhost);
    const leaderX = Math.max(bike.x, ...otherRacers.map(racer => Number(racer.x) || 0));
    const racePressure = clamp((leaderX - bike.x) / 900, -0.35, 1);
    const burstTopSpeed = Math.max(1.5, Number(bike.botBaseMaxSpeed) || 3);
    const burstObstacleAhead = obstacles.some(obstacle =>
        obstacle.x >= front && obstacle.x - bike.x < 230
    );
    if (
        bike.abilities?.macmillanBurst &&
        bike.macmillanBurstCharges > 0 &&
        bike.grounded &&
        bike.impactSlowTimer <= 0 &&
        bike.velocityX < burstTopSpeed * 0.86 &&
        !burstObstacleAhead
    ) {
        bike.velocityX = burstTopSpeed;
        bike.macmillanBurstCharges--;
        bike.macmillanBurstTimer = 32;
        brain.lastAction = 'pedal-burst';
    }

    const boostReadiness = Number(brain.boostReadiness) || 0.8;
    const safeDistance = 170 + boostReadiness * 90;
    if (
        bike.abilities?.nitroUnlocked &&
        bike.nitroTimer <= 0 &&
        bike.nitroCooldown <= 0 &&
        bike.grounded &&
        bike.impactSlowTimer <= 0
    ) {
        const immediateHazardAhead = obstacles.some(obstacle =>
            obstacle.x >= front &&
            obstacle.x - front < safeDistance &&
            obstacle.type !== 'ramp'
        );
        const gapAhead = obstacles.some(obstacle =>
            BOT_GAP_JUMP_TYPES.has(obstacle.type) &&
            obstacle.x >= front &&
            obstacle.x - front < 360
        );
        const needsCatchUp = racePressure > -0.08;
        const needsAcceleration = bike.velocityX < burstTopSpeed * 0.78;
        if (!immediateHazardAhead && !gapAhead && (needsCatchUp || needsAcceleration)) {
            bike.nitroTimer = 48;
            bike.nitroCooldown = 430;
            brain.lastAction = 'nitro';
        }
    }
}

export function getBotAirLeanInput(bike, getGroundY) {
    const gravity = Math.max(0.01, Number(bike.jumpGravity) || 0.38);
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
    return clamp((targetPitchVelocity - bike.pitchVelocity) * 70, -1, 1);
}
