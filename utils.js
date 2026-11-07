// ============================================================
// VeloRider — Common Utility Functions & Constants
// ============================================================

export const MIN_SPRINT_RECORD_IMPROVEMENT_MS = 10;

export function getRarityAccent(rarity) {
    if (rarity === 'legendary') return '#fbbf24';
    if (rarity === 'rare') return '#38bdf8';
    if (rarity === 'special') return '#c084fc';
    return '#94a3b8';
}

/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Returns a random element from an array.
 * @template T
 * @param {T[]} items
 * @returns {T|null}
 */
export function randomItem(items) {
    if (!items || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
}
