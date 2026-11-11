const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const TERRAIN_KNOT_WEIGHTS = Object.freeze({
    straight: 1.35,
    rollers: 0.92,
    climb: 0.66,
    crest: 0.74,
    drop: 0.95,
    landing: 0.78,
    steps: 0.82,
    kicker: 0.48,
    canyon: 0.88,
    stream: 0.94,
    pavement: 1.1,
    bridge: 0.9,
    metal: 0.8
});

const ROUTE_PATTERNS = Object.freeze({
    gentle: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.06, detail: 0.05 },
        { kind: 'climb', level: -0.48 },
        { kind: 'crest', level: -0.22, detail: 0.04 },
        { kind: 'drop', level: 0.32 },
        { kind: 'steps', level: 0.08 },
        { kind: 'straight', level: 0 }
    ],
    technical: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.08, detail: 0.07 },
        { kind: 'climb', level: -0.68 },
        { kind: 'crest', level: -0.28, detail: 0.07 },
        { kind: 'drop', level: 0.42 },
        { kind: 'steps', level: 0.12 },
        { kind: 'climb', level: -0.12 },
        { kind: 'straight', level: 0 }
    ],
    technicalAlt: [
        { kind: 'straight', level: 0 },
        { kind: 'drop', level: 0.28 },
        { kind: 'rollers', level: 0.22, detail: 0.055 },
        { kind: 'climb', level: -0.48 },
        { kind: 'steps', level: -0.12 },
        { kind: 'crest', level: -0.34, detail: 0.06 },
        { kind: 'climb', level: 0.08 },
        { kind: 'straight', level: 0 }
    ],
    flow: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.035, detail: 0.045 },
        { kind: 'climb', level: -0.32 },
        { kind: 'crest', level: -0.13, detail: 0.035 },
        { kind: 'steps', level: 0.02 },
        { kind: 'drop', level: 0.24 },
        { kind: 'rollers', level: 0.04, detail: 0.04 },
        { kind: 'straight', level: 0 }
    ],
    bigAir: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.06, detail: 0.06 },
        { kind: 'climb', level: -0.52 },
        { kind: 'kicker', level: -0.78 },
        { kind: 'canyon', level: 0.52 },
        { kind: 'landing', level: 0.22 },
        { kind: 'climb', level: 0 },
        { kind: 'rollers', level: 0, detail: 0.07 }
    ],
    historyDraisine: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.04, detail: 0.035 },
        { kind: 'climb', level: -0.28 },
        { kind: 'crest', level: -0.12 },
        { kind: 'drop', level: 0.2 },
        { kind: 'steps', level: 0.05 },
        { kind: 'straight', level: 0 }
    ],
    historyDraisineAlt: [
        { kind: 'straight', level: 0 },
        { kind: 'steps', level: 0.035 },
        { kind: 'rollers', level: -0.025, detail: 0.03 },
        { kind: 'climb', level: -0.22 },
        { kind: 'crest', level: -0.08 },
        { kind: 'drop', level: 0.16 },
        { kind: 'straight', level: 0 }
    ],
    historyMacmillan: [
        { kind: 'straight', level: 0 },
        { kind: 'rollers', level: -0.05, detail: 0.055 },
        { kind: 'climb', level: -0.48 },
        { kind: 'crest', level: -0.25, detail: 0.05 },
        { kind: 'stream', level: 0.26 },
        { kind: 'drop', level: 0.42 },
        { kind: 'steps', level: 0.1 },
        { kind: 'straight', level: 0 }
    ],
    historyMacmillanAlt: [
        { kind: 'straight', level: 0 },
        { kind: 'stream', level: 0.12 },
        { kind: 'rollers', level: 0.06, detail: 0.05 },
        { kind: 'climb', level: -0.38 },
        { kind: 'crest', level: -0.18, detail: 0.045 },
        { kind: 'drop', level: 0.31 },
        { kind: 'steps', level: 0.08 },
        { kind: 'straight', level: 0 }
    ],
    historyLallement: [
        { kind: 'pavement', level: 0 },
        { kind: 'steps', level: 0.12 },
        { kind: 'climb', level: -0.38 },
        { kind: 'crest', level: -0.12 },
        { kind: 'drop', level: 0.28 },
        { kind: 'metal', level: 0.08 },
        { kind: 'bridge', level: 0 },
        { kind: 'straight', level: 0 }
    ],
    historyLallementAlt: [
        { kind: 'pavement', level: 0 },
        { kind: 'metal', level: 0.06 },
        { kind: 'rollers', level: 0.015, detail: 0.035 },
        { kind: 'climb', level: -0.29 },
        { kind: 'bridge', level: -0.06 },
        { kind: 'crest', level: -0.11 },
        { kind: 'drop', level: 0.2 },
        { kind: 'straight', level: 0 }
    ]
});

function hashString(value) {
    let hash = 2166136261;
    const text = String(value ?? 'route');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function getRoutePattern(track, level, cycleIndex) {
    if (track?.id === 'sprint' || (track?.isHistory && track.id === 'l3')) return [];

    if (track?.isHistory) {
        const chapter = Number(track.historyChapter) || 1;
        if (chapter === 1) return ROUTE_PATTERNS[cycleIndex % 2 ? 'historyDraisineAlt' : 'historyDraisine'];
        if (chapter === 2) return ROUTE_PATTERNS[cycleIndex % 2 ? 'historyMacmillanAlt' : 'historyMacmillan'];
        return ROUTE_PATTERNS[cycleIndex % 2 ? 'historyLallementAlt' : 'historyLallement'];
    }

    if (level >= 5) {
        if (cycleIndex % 2 === 1) return ROUTE_PATTERNS.bigAir;
        return ROUTE_PATTERNS[cycleIndex % 4 === 0 ? 'technical' : 'technicalAlt'];
    }
    if (level >= 3) return ROUTE_PATTERNS[cycleIndex % 3 === 1 ? 'technicalAlt' : 'technical'];
    return ROUTE_PATTERNS[cycleIndex % 2 ? 'flow' : 'gentle'];
}

function getCycleRelief(track, cycleIndex, relief) {
    const variation = hashString(`${track?.id || 'route'}:${cycleIndex}:profile`) / 0xffffffff;
    const span = track?.isHistory ? 0.12 : 0.24;
    const minimum = track?.isHistory ? 0.94 : 0.88;
    return relief * (minimum + variation * span);
}

function getReliefScale(track, level, configuredAmplitude, viewHeight) {
    const amplitude = Math.max(0, Number(configuredAmplitude) || 0);
    let relief = 12 + amplitude * 0.76;

    if (track?.isHistory) {
        const chapter = Number(track.historyChapter) || 1;
        if (chapter === 1) relief = 10 + amplitude * 0.58;
        else if (chapter === 2) relief = 13 + amplitude * 0.76;
        else relief = 14 + amplitude * 0.78;
    }

    if (track?.id === 'sprint' || track?.id === 'l3') return 0;

    // Keep every generated route comfortably inside the playable viewport.
    return clamp(relief, 12, Math.min(82, Math.max(18, viewHeight * 0.145)));
}

function getCycleCount(track, level, routeEnd) {
    const history = Boolean(track?.isHistory);
    const targetCycleLength = history
        ? 14500
        : clamp(6200 + Math.max(1, level) * 1550, 8000, 23000);
    return clamp(Math.ceil(routeEnd / targetCycleLength), 2, 18);
}

function getCycleLengthPattern(pattern, routeLength) {
    const totalWeight = pattern.reduce(
        (sum, segment) => sum + (TERRAIN_KNOT_WEIGHTS[segment.kind] || 1),
        0
    ) || 1;
    return pattern.map(segment => ({
        ...segment,
        length: routeLength * (TERRAIN_KNOT_WEIGHTS[segment.kind] || 1) / totalWeight
    }));
}

function pchipTangents(anchors) {
    if (anchors.length < 2) return anchors.map(() => 0);
    const secants = [];
    for (let index = 0; index < anchors.length - 1; index++) {
        const span = Math.max(1, anchors[index + 1].x - anchors[index].x);
        secants.push((anchors[index + 1].y - anchors[index].y) / span);
    }

    const tangents = new Array(anchors.length).fill(0);
    // The route starts and ends on a flat approach/roll-out.
    tangents[0] = 0;
    tangents[tangents.length - 1] = 0;

    for (let index = 1; index < anchors.length - 1; index++) {
        const before = secants[index - 1];
        const after = secants[index];
        if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
            tangents[index] = 0;
            continue;
        }

        const beforeSpan = anchors[index].x - anchors[index - 1].x;
        const afterSpan = anchors[index + 1].x - anchors[index].x;
        const weightBefore = 2 * afterSpan + beforeSpan;
        const weightAfter = afterSpan + 2 * beforeSpan;
        tangents[index] = (weightBefore + weightAfter) /
            (weightBefore / before + weightAfter / after);
    }

    return tangents.map(tangent => clamp(tangent, -0.24, 0.24));
}

function smoothStep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

function stepBump(value, start, end, edge = 0.075) {
    const rise = smoothStep((value - start) / edge);
    const fall = 1 - smoothStep((value - (end - edge)) / edge);
    return rise * fall;
}

function segmentDetail(segment, progress, relief, seed) {
    const envelope = Math.sin(Math.PI * progress) ** 2;
    const phase = (seed % 997) / 997 * Math.PI * 2;

    if (segment.kind === 'rollers') {
        const waveCount = clamp(Math.floor(segment.length / 330), 3, 8);
        return Math.sin(progress * Math.PI * 2 * waveCount + phase) *
            envelope * relief * (Number(segment.detail) || 0.05);
    }

    if (segment.kind === 'kicker') {
        return -envelope * relief * 0.105 * (0.7 + progress * 0.3);
    }

    if (segment.kind === 'canyon') {
        return envelope * relief * 0.09;
    }

    if (segment.kind === 'crest') {
        return -envelope * relief * 0.055;
    }

    if (segment.kind === 'drop' || segment.kind === 'stream') {
        return envelope * relief * 0.045;
    }

    if (segment.kind === 'steps' || segment.kind === 'metal' || segment.kind === 'bridge') {
        const first = stepBump(progress, 0.12, 0.39);
        const second = stepBump(progress, 0.55, 0.82);
        const scale = segment.kind === 'steps' ? 0.08 : 0.045;
        return (first - second * 0.72) * relief * scale;
    }

    return 0;
}

/**
 * Create a deterministic per-track route from connected Hermite segments.
 * The shared PCHIP tangent at each knot keeps both height and first derivative
 * continuous, while local rollers/steps have zero slope at segment endpoints.
 */
export function buildTerrainRoute(track, {
    finishX = 20000,
    viewHeight = 460,
    amplitude = 24,
    level = 1
} = {}) {
    const routeEnd = Math.max(1000, Number(finishX) || 20000) + 2400;
    const actualLevel = Math.max(1, Number(track?.isHistory
        ? track.historyStage
        : level) || 1);
    const relief = getReliefScale(track, actualLevel, amplitude, viewHeight);
    if (relief <= 0) return { segments: [], setPieces: [], relief: 0, routeEnd };

    const cycleCount = getCycleCount(track, actualLevel, routeEnd);
    const cycleLength = routeEnd / cycleCount;
    const seed = hashString(track?.id);
    const anchors = [{ x: 0, y: 0 }];
    const segmentSpecs = [];
    const setPieces = [];

    for (let cycle = 0; cycle < cycleCount; cycle++) {
        const pattern = getRoutePattern(track, actualLevel, cycle);
        if (!pattern.length) continue;
        const cycleRelief = getCycleRelief(track, cycle, relief);
        const weightedPattern = getCycleLengthPattern(pattern, cycleLength);
        let x = cycle * cycleLength;

        for (let index = 0; index < weightedPattern.length; index++) {
            const spec = weightedPattern[index];
            const nextX = index === weightedPattern.length - 1
                ? (cycle + 1) * cycleLength
                : x + spec.length;
            const nextY = Number(spec.level || 0) * cycleRelief;
            const segment = {
                x0: x,
                x1: nextX,
                length: nextX - x,
                y0: anchors[anchors.length - 1].y,
                y1: nextY,
                kind: spec.kind,
                detail: spec.detail,
                relief: cycleRelief,
                seed: seed + cycle * 71 + index * 19
            };
            segmentSpecs.push(segment);
            anchors.push({ x: nextX, y: nextY });

            if (!track?.isHistory && actualLevel >= 5 && spec.kind === 'kicker') {
                const rampX = x + (nextX - x) * 0.72;
                const pitWidth = clamp(82 + actualLevel * 5, 107, 132);
                setPieces.push({
                    id: `${track.id}-big-air-${cycle}`,
                    rampX,
                    pitX: rampX + 112,
                    pitWidth,
                    landingX: rampX + 112 + pitWidth + 115
                });
            }
            x = nextX;
        }
    }

    const tangents = pchipTangents(anchors);
    const segments = segmentSpecs.map((segment, index) => ({
        ...segment,
        m0: tangents[index],
        m1: tangents[index + 1]
    }));

    return { segments, setPieces, relief, routeEnd };
}

function findSegment(segments, worldX) {
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (worldX <= segments[middle].x1) high = middle;
        else low = middle + 1;
    }
    return segments[low];
}

export function sampleTerrainOffset(segments, worldX) {
    if (!Array.isArray(segments) || segments.length === 0) return 0;
    const x = Number(worldX) || 0;
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (x <= first.x0) return first.y0;
    if (x >= last.x1) return last.y1;

    const segment = findSegment(segments, x);
    const length = Math.max(1, segment.x1 - segment.x0);
    const t = clamp((x - segment.x0) / length, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const hermite = h00 * segment.y0 +
        h10 * length * segment.m0 +
        h01 * segment.y1 +
        h11 * length * segment.m1;
    return hermite + segmentDetail(segment, t, segment.relief, segment.seed);
}

export function sampleTerrainHeight(segments, worldX, baseY, relief = 1) {
    // Geometry stores its designed scale in route offsets. `relief` remains an
    // optional multiplier for editor previews and deterministic route checks.
    return (Number(baseY) || 0) + sampleTerrainOffset(segments, worldX) * (Number(relief) || 1);
}

