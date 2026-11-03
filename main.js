import { ITEMS_DB, TRACKS_DB, CONTAINERS_DB } from './db.js?v=20';
import {
    player,
    loadPlayerState,
    initTelegramApp,
    clearSavedProgress,
    forceSavePlayerState
} from './state.js?v=20';
import {
    initRace,
    setAccelerating,
    setBraking,
    setReversing,
    triggerJump
} from './race.js?v=20';

import {
    initAudioControls,
    setAudioScene,
    playRaceResult
} from './audio.js?v=20';

const CATEGORY_NAMES = {
    frames: 'Рамы',
    forks: 'Вилки',
    chains: 'Цепи',
    drivetrain: 'Трансмиссии',
    drivetrains: 'Трансмиссии',
    bottomBrackets: 'Каретки',
    bottom_brackets: 'Каретки',
    cranks: 'Шатуны',
    wheels: 'Колёса',
    brakes: 'Тормоза',
    electronics: 'Электроника',
    motors: 'Электромоторы',
    batteries: 'Аккумуляторы',
    pedals: 'Педали',
    handlebars: 'Рули',
    stems: 'Выносы',
    saddles: 'Сёдла',
    seatposts: 'Подседельные штыри',
    cassettes: 'Кассеты',
    shifters: 'Манетки',
    derailleurs: 'Переключатели',
    suspension: 'Подвеска',
    tires: 'Покрышки',
    tubes: 'Камеры',
    hubs: 'Втулки'
};

const CATEGORY_ICONS = {
    frames: '🚲', forks: '🔧', chains: '⛓️',
    drivetrain: '⚙️', drivetrains: '⚙️',
    bottomBrackets: '🔩', bottom_brackets: '🔩',
    cranks: '🛠️', wheels: '⭕', brakes: '🛑',
    electronics: '⚡', motors: '⚡', batteries: '🔋',
    pedals: '🦶', handlebars: '↔️', stems: '🔧',
    saddles: '🚴', seatposts: '↕️', cassettes: '⚙️',
    shifters: '🎚️', derailleurs: '⚙️', suspension: '〰️',
    tires: '⭕', tubes: '⭕', hubs: '⚙️'
};

const RARITY_NAMES = {
    common: 'Обычная',
    rare: 'Редкая',
    legendary: 'Легендарная'
};

const TRACK_ICONS = {
    t1: '🏘️',
    t2: '🌲',
    t3: '🌿',
    t4: '🏛️',
    t5: '🎡',
    t6: '🪨',
    t7: '⛰️',
    t8: '🛤️',
    t9: '🏔️',
    t10: '🏆'
};

const STAT_META = {
    speed: { label: 'Максимальная скорость', short: 'Скорость', icon: '🏁', color: 'blue' },
    accel: { label: 'Ускорение', short: 'Ускорение', icon: '⚡', color: 'orange' },
    jump: { label: 'Сила прыжка', short: 'Прыжок', icon: '🪂', color: 'violet' },
    brake: { label: 'Торможение', short: 'Тормоза', icon: '🛑', color: 'rose' },
    grip: { label: 'Сцепление', short: 'Сцепление', icon: '🛞', color: 'cyan' },
    traction: { label: 'Тяга', short: 'Тяга', icon: '⚙️', color: 'amber' },
    handling: { label: 'Управляемость', short: 'Управляемость', icon: '🎯', color: 'emerald' },
    stability: { label: 'Стабильность', short: 'Стабильность', icon: '🧭', color: 'sky' },
    durability: { label: 'Прочность', short: 'Прочность', icon: '🛡️', color: 'slate' },
    weight: { label: 'Вес', short: 'Вес', icon: '⚖️', color: 'slate', noPlus: true },
    comfort: { label: 'Комфорт', short: 'Комфорт', icon: '🪑', color: 'pink' },
    suspension: { label: 'Амортизация', short: 'Амортизация', icon: '〰️', color: 'indigo' },
    power: { label: 'Мощность', short: 'Мощность', icon: '🔋', color: 'yellow' },
    torque: { label: 'Крутящий момент', short: 'Крутящий момент', icon: '🔩', color: 'orange' },
    efficiency: { label: 'Эффективность', short: 'Эффективность', icon: '♻️', color: 'green' },
    range: { label: 'Запас хода', short: 'Запас хода', icon: '📍', color: 'teal' },
    battery: { label: 'Ёмкость батареи', short: 'Батарея', icon: '🔋', color: 'green' }
};

const NON_STAT_NUMERIC_FIELDS = new Set([
    'price', 'cost', 'priceCoins', 'price_coins', 'year', 'id', 'level',
    'rarityLevel', 'rarity_level', 'stock', 'quantity', 'count'
]);

const STAT_KEY_ALIASES = {
    jump: new Set([
        'jump', 'jumppower', 'jumpforce', 'jumpstrength',
        'jumpheight', 'jumpbonus', 'jumpboost', 'airtime'
    ]),
    brake: new Set([
        'brake', 'brakes', 'braking', 'brakepower', 'brakingpower',
        'brakeforce', 'brakingforce', 'brakestrength',
        'brakeefficiency', 'stoppingpower', 'stoppower'
    ])
};

function normalizePartStatKey(key) {
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

    if (STAT_KEY_ALIASES.jump.has(normalized)) return 'jump';
    if (STAT_KEY_ALIASES.brake.has(normalized)) return 'brake';

    return key;
}

function getStatLabel(key) {
    if (STAT_META[key]) return STAT_META[key].label;
    return String(key)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, letter => letter.toUpperCase());
}

function formatStatValue(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number)
        ? number.toLocaleString('ru-RU')
        : number.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function getPartNumericStats(part) {
    if (!part || typeof part !== 'object') return [];

    return Object.entries(part)
        .filter(([key, value]) =>
            !NON_STAT_NUMERIC_FIELDS.has(key) &&
            typeof value === 'number' &&
            Number.isFinite(value)
        )
        .map(([originalKey, value]) => {
            const key = normalizePartStatKey(originalKey);

            return {
                key,
                label: STAT_META[key]?.short || getStatLabel(originalKey),
                value,
                icon: STAT_META[key]?.icon || '✦',
                noPlus: Boolean(STAT_META[key]?.noPlus)
            };
        });
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function ensureGarageStyles() {
    if (document.getElementById('garage-v2-styles')) return;

    const style = document.createElement('style');
    style.id = 'garage-v2-styles';

    style.textContent = `
        #screen-garage.garage-v2 {
            display:block;
            width:100%;
            height:100%;
            min-height:0;
        }

        #screen-garage.garage-v2.hidden {
            display:none;
        }

        .garage-v2,
        .garage-v2 * {
            box-sizing:border-box;
        }

        .garage-page {
            height:100%;
            width:100%;
            overflow-y:auto;
            overflow-x:hidden;
            padding:clamp(12px,2vw,28px);
            color:#e5edf5;
        }

        .garage-page::-webkit-scrollbar { width:8px; }
        .garage-page::-webkit-scrollbar-thumb {
            background:#334155;
            border-radius:20px;
        }

        .garage-heading {
            display:flex;
            align-items:flex-end;
            justify-content:space-between;
            gap:18px;
            margin:0 auto 22px;
            max-width:1500px;
        }

        .garage-eyebrow {
            color:#67e8a5;
            font-size:11px;
            font-weight:900;
            letter-spacing:.22em;
            text-transform:uppercase;
        }

        .garage-title {
            margin:5px 0 0;
            font-size:clamp(25px,3vw,38px);
            line-height:1.05;
            font-weight:950;
            letter-spacing:-.04em;
            color:#f8fafc;
        }

        .garage-subtitle {
            color:#94a3b8;
            font-size:13px;
            margin-top:8px;
        }

        .garage-actions {
            display:flex;
            flex-wrap:wrap;
            gap:9px;
        }

        .garage-action {
            border:1px solid #334155;
            border-radius:12px;
            padding:11px 15px;
            font-size:12px;
            font-weight:900;
            letter-spacing:.04em;
            background:#172334;
            color:#dbeafe;
            transition:.18s ease;
        }

        .garage-action:hover {
            transform:translateY(-2px);
            border-color:#64748b;
            background:#22334a;
        }

        .garage-action.primary {
            background:linear-gradient(135deg,#16a34a,#15803d);
            color:white;
            border-color:#22c55e;
            box-shadow:0 8px 25px #16a34a2c;
        }

        .garage-overview {
            max-width:1500px;
            margin:0 auto;
            display:grid;
            grid-template-columns:minmax(0,1.2fr) minmax(310px,.8fr);
            gap:16px;
        }

        .garage-panel {
            background:linear-gradient(145deg,#182536,#111b2a);
            border:1px solid #29394d;
            border-radius:21px;
            box-shadow:0 16px 42px #02061738;
            min-width:0;
        }

        .garage-bike-panel {
            padding:clamp(16px,2vw,26px);
            position:relative;
            overflow:hidden;
            isolation:isolate;
        }

        .garage-bike-panel:before {
            content:'';
            position:absolute;
            z-index:-1;
            inset:0;
            opacity:.3;
            background:
                radial-gradient(ellipse at 65% 45%,#0f766e55,transparent 58%),
                linear-gradient(135deg,transparent 55%,#38bdf811);
        }

        .garage-panel-top {
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
        }

        .garage-section-label {
            color:#94a3b8;
            font-size:11px;
            font-weight:900;
            text-transform:uppercase;
            letter-spacing:.16em;
        }

        .garage-status {
            border:1px solid #166534;
            color:#86efac;
            background:#14532d40;
            border-radius:999px;
            padding:6px 10px;
            font-size:10px;
            font-weight:900;
            letter-spacing:.08em;
        }

        .garage-bike-stage {
            min-height:250px;
            display:flex;
            align-items:center;
            justify-content:center;
            position:relative;
            padding:15px 0 0;
        }

        .garage-bike-stage:after {
            content:'';
            position:absolute;
            left:8%;
            right:8%;
            bottom:24px;
            height:1px;
            background:linear-gradient(90deg,transparent,#64748b88,transparent);
        }

        .garage-bike-svg {
            width:min(100%,680px);
            height:auto;
            overflow:visible;
            filter:drop-shadow(0 18px 20px #0007);
        }

        .garage-bike-svg .bike-frame { stroke:var(--garage-bike-accent,#38bdf8); }
        .garage-bike-svg .bike-metal { stroke:#cbd5e1; }
        .garage-bike-svg .bike-tire { stroke:#020617; }
        .garage-bike-svg .bike-spoke { stroke:#64748b; }
        .garage-bike-svg .bike-detail { stroke:#f8fafc; }

        .garage-bike-name {
            display:flex;
            align-items:center;
            justify-content:space-between;
            flex-wrap:wrap;
            gap:10px;
            border-top:1px solid #334155a6;
            padding-top:17px;
            margin-top:4px;
        }

        .garage-bike-model {
            font-size:clamp(18px,2vw,24px);
            font-weight:950;
            color:#f8fafc;
        }

        .garage-bike-caption {
            font-size:12px;
            color:#94a3b8;
            margin-top:4px;
        }

        .garage-frame-rarity {
            font-size:10px;
            font-weight:900;
            letter-spacing:.1em;
            text-transform:uppercase;
            border:1px solid #475569;
            background:#0f172a88;
            padding:7px 10px;
            border-radius:9px;
        }

        .garage-completeness {
            display:flex;
            align-items:center;
            gap:10px;
            color:#94a3b8;
            font-size:11px;
            margin-top:17px;
        }

        .garage-completeness-track {
            height:6px;
            background:#0f172a;
            border-radius:99px;
            overflow:hidden;
            flex:1;
        }

        .garage-completeness-fill {
            height:100%;
            background:linear-gradient(90deg,#22c55e,#5eead4);
            border-radius:99px;
        }

        .garage-stats-panel { padding:clamp(16px,2vw,24px); }

        .garage-stats-title {
            font-size:17px;
            font-weight:950;
            margin:7px 0 4px;
            color:#f8fafc;
        }

        .garage-stats-desc {
            color:#94a3b8;
            font-size:12px;
            margin-bottom:16px;
        }

        .garage-stat-grid {
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:10px;
        }

        .garage-stat-card {
            position:relative;
            overflow:hidden;
            border:1px solid #334155;
            background:linear-gradient(145deg,#0f1b2a,#111827);
            border-radius:15px;
            padding:13px;
            min-height:106px;
        }

        .garage-stat-card:after {
            content:'';
            position:absolute;
            width:80px;
            height:80px;
            right:-25px;
            bottom:-35px;
            border-radius:50%;
            background:var(--stat-glow,#38bdf8);
            opacity:.08;
            filter:blur(5px);
        }

        .garage-stat-top {
            display:flex;
            align-items:center;
            gap:7px;
            color:#94a3b8;
            font-size:11px;
            font-weight:800;
        }

        .garage-stat-icon { font-size:15px; }

        .garage-stat-value {
            font-size:27px;
            line-height:1;
            font-weight:950;
            color:#f8fafc;
            margin-top:14px;
            letter-spacing:-.04em;
        }

        .garage-stat-unit {
            font-size:10px;
            color:#64748b;
            margin-left:5px;
            font-weight:700;
        }

        .garage-extra-stats {
            display:flex;
            flex-wrap:wrap;
            gap:7px;
            margin-top:12px;
        }

        .garage-extra-stat {
            display:inline-flex;
            gap:6px;
            align-items:center;
            border:1px solid #334155;
            background:#0f172a88;
            border-radius:9px;
            padding:7px 9px;
            color:#cbd5e1;
            font-size:11px;
        }

        .garage-lower {
            max-width:1500px;
            display:grid;
            grid-template-columns:minmax(0,1fr);
            gap:16px;
            margin:16px auto 0;
        }

        .garage-equipment-panel,
        .garage-workshop-panel {
            padding:clamp(16px,2vw,23px);
        }

        .garage-section-head {
            display:flex;
            justify-content:space-between;
            align-items:flex-end;
            gap:12px;
            margin-bottom:15px;
        }

        .garage-section-title {
            font-size:18px;
            font-weight:950;
            color:#f8fafc;
            margin-top:5px;
        }

        .garage-section-note {
            color:#94a3b8;
            font-size:11px;
        }

        .garage-equipped-grid {
            display:grid;
            grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));
            gap:9px;
        }

        .garage-equipped-card {
            display:flex;
            flex-direction:column;
            gap:10px;
            min-width:0;
            padding:13px;
            border-radius:14px;
            border:1px solid #334155;
            background:linear-gradient(135deg,#111d2c,#0f172a);
        }

        .garage-equipped-card.is-empty {
            border-style:dashed;
            background:#0f172a55;
        }

        .garage-part-head {
            display:flex;
            align-items:flex-start;
            gap:10px;
        }

        .garage-part-icon {
            width:36px;
            height:36px;
            display:grid;
            place-items:center;
            flex-shrink:0;
            border-radius:10px;
            background:#33415566;
            font-size:17px;
        }

        .garage-part-info {
            flex:1;
            min-width:0;
        }

        .garage-part-category {
            color:#64748b;
            font-size:9px;
            font-weight:900;
            letter-spacing:.12em;
            text-transform:uppercase;
        }

        .garage-part-name {
            color:#e2e8f0;
            font-weight:850;
            font-size:13px;
            line-height:1.35;
            overflow-wrap:anywhere;
            margin-top:3px;
        }

        .garage-part-rarity {
            font-size:9px;
            font-weight:900;
            padding:5px 7px;
            border-radius:7px;
            background:#1e293b;
            white-space:nowrap;
        }

        .garage-part-stats {
            display:flex;
            flex-wrap:wrap;
            gap:5px;
        }

        .garage-part-stat {
            display:inline-flex;
            gap:4px;
            align-items:center;
            color:#cbd5e1;
            background:#1e293b;
            padding:5px 7px;
            border-radius:7px;
            font-size:10px;
        }

        .garage-empty-text {
            color:#94a3b8;
            font-size:12px;
        }

        .garage-empty-button {
            align-self:flex-start;
            border:1px solid #475569;
            color:#bfdbfe;
            font-size:10px;
            font-weight:900;
            border-radius:8px;
            padding:7px 9px;
            background:#1e293b;
        }

        .garage-workshop-intro {
            color:#94a3b8;
            font-size:12px;
            margin-top:5px;
        }

        #garage-upgrade-categories {
            display:flex;
            flex-wrap:wrap;
            gap:8px;
            margin:15px 0;
        }

        #garage-upgrade-categories button {
            border:1px solid #334155;
            border-radius:11px;
            background:#111d2c;
            padding:10px 12px;
            color:#cbd5e1;
            min-width:125px;
            font-size:12px;
        }

        #garage-upgrade-categories button:hover {
            border-color:#64748b;
            background:#243449;
        }

        #garage-upgrade-categories button.garage-selected-category {
            border-color:#22c55e;
            background:#14532d66;
            color:#dcfce7;
        }

        #garage-upgrade-category-title {
            font-size:16px;
            font-weight:900;
            color:#f8fafc;
            margin:16px 0 12px;
        }

        #garage-upgrade-parts {
            display:grid;
            grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));
            gap:10px;
        }

        #garage-upgrade-parts > div {
            border-color:#334155 !important;
            background:linear-gradient(145deg,#111d2c,#0f172a) !important;
            border-radius:14px !important;
        }

        .upgrade-part-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
        .upgrade-part-title { min-width:0; overflow-wrap:anywhere; }
        .upgrade-part-info { position:relative; flex:0 0 auto; }
        .upgrade-part-info-button {
            display:grid; place-items:center; width:25px; height:25px; padding:0 !important;
            border:1px solid #fbbf24 !important; border-radius:50% !important;
            color:#fde68a !important; background:#78350f !important;
            font-size:14px !important; font-weight:900; line-height:1;
        }
        .upgrade-part-info-panel {
            display:none; position:absolute; z-index:20; top:31px; right:0;
            width:min(260px, calc(100vw - 48px)); padding:11px;
            border:1px solid #a16207; border-radius:10px; color:#fef3c7;
            background:#1c1917; box-shadow:0 8px 24px #0009;
            font-size:11px; font-weight:500; line-height:1.5;
        }
        .upgrade-part-info-panel.is-open { display:block; }
        .upgrade-part-info-panel .garage-part-stats { margin-top:8px; }
        .upgrade-part-info-close {
            float:right; margin:-5px -5px 4px 8px; padding:0 5px !important;
            color:#fde68a !important; background:transparent !important;
            font-size:22px !important; line-height:1.1;
        }

        #garage-upgrade-parts button {
            border-radius:10px;
            font-size:11px;
            font-weight:900;
        }

        .garage-catalog-summary {
            font-size:11px;
            color:#64748b;
            margin-top:10px;
        }

        @media (max-width:950px) {
            .garage-overview { grid-template-columns:1fr; }
            .garage-bike-stage { min-height:210px; }
        }

        @media (max-width:600px) {
            .garage-heading {
                align-items:flex-start;
                flex-direction:column;
            }

            .garage-actions { width:100%; }

            .garage-action { flex:1; }

            .garage-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }

            .garage-bike-stage { min-height:165px; }

            .garage-equipped-grid { grid-template-columns:1fr; }
        }
    `;

    document.head.appendChild(style);
}

function ensureGarageLayout() {
    const root = document.getElementById('screen-garage');

    if (!root) return null;

    if (root.dataset.garageV2 === 'true') {
        return root;
    }

    ensureGarageStyles();

    root.className = 'screen garage-v2';

    root.innerHTML = `
        <div class="garage-page">

            <div class="garage-heading">
                <div>
                    <div class="garage-eyebrow">
                        VELO RIDER / CUSTOM WORKSHOP
                    </div>

                    <h2 class="garage-title">
                        Мой гараж
                    </h2>

                    <div class="garage-subtitle">
                        Просматривай сборку, установленные компоненты и характеристики велосипеда.
                    </div>
                </div>

                <div class="garage-actions">
                    <button type="button"
                        class="garage-action"
                        data-garage-upgrade>
                        ⚙ МОДЕРНИЗАЦИЯ
                    </button>

                    <button type="button"
                        class="garage-action primary"
                        data-garage-race>
                        🏁 НА ГОНКУ
                    </button>
                </div>
            </div>

            <div class="garage-overview">
                <section class="garage-panel garage-bike-panel">
                    <div class="garage-panel-top">
                        <div class="garage-section-label">
                            ТВОЯ СБОРКА
                        </div>

                        <div class="garage-status">
                            ● ГОТОВ К ЗАЕЗДУ
                        </div>
                    </div>

                    <div class="garage-bike-stage">
                        <svg class="garage-bike-svg" viewBox="0 0 680 300" role="img" aria-label="\u0413\u043e\u0440\u043d\u044b\u0439 \u0432\u0435\u043b\u043e\u0441\u0438\u043f\u0435\u0434">
                            <defs>
                                <linearGradient id="garage-metal-gradient" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#64748b"/></linearGradient>
                                <radialGradient id="garage-wheel-glow"><stop offset="0" stop-color="#38bdf8" stop-opacity=".12"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
                                <linearGradient id="garage-frame-gloss" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".45" stop-color="var(--garage-bike-accent,#38bdf8)"/><stop offset="1" stop-color="#0f172a" stop-opacity=".7"/></linearGradient>
                            </defs>
                            <ellipse cx="340" cy="270" rx="255" ry="18" fill="#020617" opacity=".55"/>
                            <circle cx="150" cy="185" r="105" fill="url(#garage-wheel-glow)"/>
                            <circle cx="520" cy="185" r="105" fill="url(#garage-wheel-glow)"/>
                            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <g class="bike-tire" stroke-width="16"><circle cx="150" cy="185" r="79"/><circle cx="520" cy="185" r="79"/></g>
                                <g class="bike-rims" stroke="#64748b" stroke-width="2"><circle cx="150" cy="185" r="67"/><circle cx="520" cy="185" r="67"/></g>
                                <g class="bike-spoke" stroke-width="1.4" opacity=".8">
                                    ${Array.from({ length: 18 }, (_, i) => { const a = i * Math.PI / 9; return `<path d="M150 185 L${150 + Math.cos(a) * 66} ${185 + Math.sin(a) * 66}"/>`; }).join('')}
                                    ${Array.from({ length: 18 }, (_, i) => { const a = i * Math.PI / 9; return `<path d="M520 185 L${520 + Math.cos(a) * 66} ${185 + Math.sin(a) * 66}"/>`; }).join('')}
                                </g>
                                <g class="bike-tread" stroke="#cbd5e1" stroke-width="2" opacity=".75">
                                    ${Array.from({ length: 28 }, (_, i) => { const a = i * Math.PI / 14; return `<path d="M${150 + Math.cos(a) * 85} ${185 + Math.sin(a) * 85} L${150 + Math.cos(a) * 89} ${185 + Math.sin(a) * 89}"/>`; }).join('')}
                                    ${Array.from({ length: 28 }, (_, i) => { const a = i * Math.PI / 14; return `<path d="M${520 + Math.cos(a) * 85} ${185 + Math.sin(a) * 85} L${520 + Math.cos(a) * 89} ${185 + Math.sin(a) * 89}"/>`; }).join('')}
                                </g>
                                <g class="bike-brake-discs" stroke="#cbd5e1" stroke-width="2.5"><circle cx="150" cy="185" r="27"/><circle cx="520" cy="185" r="27"/><circle cx="150" cy="185" r="19"/><circle cx="520" cy="185" r="19"/></g>
                                <g class="bike-frame" stroke="url(#garage-frame-gloss)" stroke-width="13">
                                    <path d="M150 185 L300 185 L235 88 L150 185"/>
                                    <path d="M235 88 L445 96 L300 185"/>
                                    <path d="M445 96 L457 145 L520 185"/>
                                    <path d="M235 88 L457 145" opacity=".45"/>
                                </g>
                                <g class="bike-metal-parts" stroke="url(#garage-metal-gradient)" stroke-width="7">
                                    <path id="garage-bike-seatpost" d="M235 88 L228 53"/><path id="garage-bike-saddle" d="M215 51 Q230 45 255 51" stroke-width="10"/>
                                    <g id="garage-bike-cockpit"><path d="M452 99 L461 27 L478 27"/><path d="M440 23 L481 23" stroke-width="6"/></g>
                                    <path class="bike-fork" d="M457 145 L520 185" stroke-width="9"/><path class="bike-fork-highlight" d="M397 145 L520 185" stroke="#38bdf8" stroke-width="2"/>
                                    <path d="M300 185 L330 207 L348 207"/><path d="M300 185 L276 160 L257 160"/>
                                </g>
                                <g stroke="#e2e8f0" stroke-width="2.5">
                                    <circle cx="300" cy="185" r="25"/><circle cx="300" cy="185" r="7" fill="#e2e8f0"/>
                                    <path d="M175 185 L300 185 L235 88"/><path d="M175 185 L235 88" opacity=".7"/>
                                    <g class="bike-crank-detail"><path d="M300 185 L326 207 M300 185 L278 160"/></g>
                                    <path d="M276 160 L257 160 M348 207 L365 207" stroke-width="5"/>
                                    <path d="M185 184 L196 174 L203 187" stroke="#fbbf24" stroke-width="4"/>
                                </g>
                                <g id="garage-bike-suspension" fill="none" stroke="#fbbf24" stroke-width="3"><path d="M465 150 L478 156 L473 164 L490 170 L485 178"/></g>
                                <g id="garage-bike-motor" display="none"><path d="M300 157 L326 157 L337 178 L326 194 L300 194 L290 178 Z" fill="#334155" stroke="#fbbf24" stroke-width="3"/><rect x="329" y="125" width="45" height="15" rx="5" fill="#0f172a" stroke="#94a3b8" stroke-width="2"/><circle cx="312" cy="176" r="9" fill="#fbbf24"/></g>
                                <g class="bike-chain-detail" fill="none" stroke="#cbd5e1" stroke-width="2"><path d="M150 185 L300 185"/><circle cx="300" cy="185" r="21"/><circle cx="150" cy="185" r="10"/></g>
                                <g fill="#e2e8f0" stroke="#0f172a" stroke-width="2"><circle cx="150" cy="185" r="6"/><circle cx="520" cy="185" r="6"/><circle cx="300" cy="185" r="6"/></g>
                                <path d="M415 135 Q427 143 417 151" stroke="#fbbf24" stroke-width="4"/>
                                <path class="bike-vbrakes" d="M160 157 Q150 149 140 157 M550 157 Q520 149 530 157" stroke="#ef4444" stroke-width="3"/>
                            </g>
                            <g fill="#94a3b8" font-size="10" font-family="Arial" font-weight="700" letter-spacing="2">
                                <text x="150" y="292" text-anchor="middle">\u0417\u0410\u0414\u041d\u0415\u0415 \u041a\u041e\u041b\u0415\u0421\u041e</text>
                                <text x="520" y="292" text-anchor="middle">\u041f\u0415\u0420\u0415\u0414\u041d\u0415\u0415 \u041a\u041e\u041b\u0415\u0421\u041e</text>
                            </g>
                        </svg>
                    </div>

                    <div class="garage-bike-name">
                        <div>
                            <div class="garage-section-label">
                                РАМА / ОСНОВА СБОРКИ
                            </div>

                            <div class="garage-bike-model"
                                id="garage-frame-name">
                                Мой велосипед
                            </div>

                            <div class="garage-bike-caption"
                                id="garage-frame-caption">
                                Текущая конфигурация велосипеда.
                            </div>
                        </div>

                        <div class="garage-frame-rarity"
                            id="garage-frame-rarity">
                            CUSTOM BUILD
                        </div>
                    </div>

                    <div class="garage-completeness">
                        <span id="garage-equipped-count">
                            0 / 0 СЛОТОВ
                        </span>

                        <div class="garage-completeness-track">
                            <div class="garage-completeness-fill"
                                id="garage-completeness-fill"
                                style="width:0%">
                            </div>
                        </div>

                        <span id="garage-completeness-percent">
                            0%
                        </span>
                    </div>
                </section>

                <section class="garage-panel garage-stats-panel">
                    <div class="garage-section-label">
                        PERFORMANCE
                    </div>

                    <h3 class="garage-stats-title">
                        Характеристики велосипеда
                    </h3>

                    <div class="garage-stats-desc">
                        Суммарный вклад всех установленных компонентов.
                    </div>

                    <div class="garage-stat-grid"
                        id="garage-stat-grid">
                    </div>

                    <div id="garage-extra-stats"
                        class="garage-extra-stats">
                    </div>
                </section>
            </div>

            <div class="garage-lower">
                <section class="garage-panel garage-equipment-panel">
                    <div class="garage-section-head">
                        <div>
                            <div class="garage-section-label">
                                CURRENT BUILD
                            </div>

                            <h3 class="garage-section-title">
                                Установленные компоненты
                            </h3>
                        </div>

                        <div class="garage-section-note"
                            id="garage-equipment-note">
                            Все слоты велосипеда
                        </div>
                    </div>

                    <div id="equipped-parts"
                        class="garage-equipped-grid">
                    </div>
                </section>
            </div>
        </div>
    `;

    root.dataset.garageV2 = 'true';

    root.querySelector('[data-garage-race]')?.addEventListener('click', () => {
        showScreen('race');
    });

    root.querySelector('[data-garage-upgrade]')?.addEventListener('click', () => {
        showScreen('upgrade');
    });

    return root;
}

const DUPLICATE_COMPENSATION = {
    common: 100,
    rare: 350,
    legendary: 1000
};

function getUpgradePrice(part) {
    const basePrice = Math.max(0, Number(part?.price) || 0);
    const multiplier = part?.rarity === 'common' ? 1.3 : part?.rarity === 'rare' ? 1.5 : 1;
    return Math.round(basePrice * multiplier / 10) * 10;
}

function getCategoryOrder() {
    return Object.keys(ITEMS_DB).filter(category =>
        Array.isArray(ITEMS_DB[category]) && ITEMS_DB[category].length > 0
    );
}

function getCategoryName(category) {
    if (CATEGORY_NAMES[category]) return CATEGORY_NAMES[category];
    return String(category)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, letter => letter.toUpperCase());
}

function getCategoryIcon(category) {
    return CATEGORY_ICONS[category] || '🔩';
}

function getRarityName(rarity) {
    return RARITY_NAMES[rarity] || rarity || 'Не указана';
}

let selectedUpgradeCategory = getCategoryOrder()[0] || 'frames';
let containerOpening = false;

function normalizePlayerState() {
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (!Array.isArray(player.unlockedTracks)) player.unlockedTracks = ['t1'];
    if (!Array.isArray(player.completedTracks)) player.completedTracks = [];
    if (!Array.isArray(player.trackRewardsClaimed)) player.trackRewardsClaimed = [];
    player.track4BonusClaimed = Boolean(player.track4BonusClaimed);

    if (!Array.isArray(player.unlockedComponentRarities)) {
        player.unlockedComponentRarities = ['common'];
    }

    if (!player.componentProgression || typeof player.componentProgression !== 'object') {
        player.componentProgression = {};
    }

    if (!player.componentProgression.rare) {
        player.componentProgression.rare = {
            unlocked: false,
            requiredTrack: 't2',
            title: 'Редкие компоненты'
        };
    }

    if (!player.componentProgression.legendary) {
        player.componentProgression.legendary = {
            unlocked: false,
            requiredTrack: 't4',
            title: 'Легендарные компоненты'
        };
    }
    player.componentProgression.rare.requiredTrack = 't2';
    player.componentProgression.legendary.requiredTrack = 't4';

    if (!player.equipped || typeof player.equipped !== 'object') {
        player.equipped = {};
    }

    player.coins = Math.max(0, Number(player.coins) || 0);
    player.coupons = Math.max(0, Number(player.coupons) || 0);
    player.totalWins = Math.max(0, Number(player.totalWins) || 0);

    if (typeof player.track1RewardClaimed !== 'boolean') {
        player.track1RewardClaimed = false;
    }

    if (!player.unlockedTracks.includes('t1')) {
        player.unlockedTracks.push('t1');
    }

    if (!player.unlockedComponentRarities.includes('common')) {
        player.unlockedComponentRarities.push('common');
    }

    ensureOwnedParts();
    syncProgression();
}

function partKey(category, id) {
    return `${category}:${id}`;
}

function hasPart(category, id) {
    const key = partKey(category, id);
    const idText = String(id);

    return player.inventory.some(entry => {
        if (entry === key || String(entry) === idText) return true;
        if (!entry || typeof entry !== 'object') return false;
        return String(entry.id) === idText &&
            (!entry.category || entry.category === category);
    }) || String(player.equipped?.[category] ?? '') === idText;
}

function ensureOwnedParts() {
    getCategoryOrder().forEach(category => {
        const equippedId = player.equipped[category];
        if (!equippedId) return;

        const part = ITEMS_DB[category].find(item => item.id === equippedId);
        if (!part) return;

        const key = partKey(category, equippedId);
        if (!player.inventory.includes(key)) {
            player.inventory.push(key);
        }
    });
}

function unlockComponentRarity(rarity) {
    if (!player.unlockedComponentRarities.includes(rarity)) {
        player.unlockedComponentRarities.push(rarity);
    }

    if (!player.componentProgression[rarity]) {
        player.componentProgression[rarity] = {};
    }

    player.componentProgression[rarity].unlocked = true;
}

function isRarityUnlocked(rarity) {
    return player.unlockedComponentRarities.includes(rarity);
}

function syncProgression() {
    if (player.completedTracks.includes('t2')) {
        unlockComponentRarity('rare');
    }
    if (player.completedTracks.includes('t4')) {
        unlockComponentRarity('rare');
        unlockComponentRarity('legendary');
    }
}

function getRarityRequirement(rarity) {
    if (rarity === 'rare') {
        const track = TRACKS_DB.find(item => item.id === 't2');
        return track
            ? `Победите бота на трассе «${track.name}»`
            : 'Победите на второй трассе';
    }
    if (rarity === 'legendary') {
        const track = TRACKS_DB.find(item => item.id === 't4');
        return track
            ? `Победите бота на трассе «${track.name}»`
            : 'Победите на четвёртой трассе';
    }
    return 'Выполните условие разблокировки.';
}

function canPlayTrack(trackId) {
    const index = TRACKS_DB.findIndex(track => track.id === trackId);
    if (index < 0 || !player.unlockedTracks.includes(trackId)) return false;

    for (let i = 0; i < index; i++) {
        if (!player.completedTracks.includes(TRACKS_DB[i].id)) return false;
    }

    return true;
}

function showScreen(screenName) {
    setAudioScene(screenName === 'race' ? (player.selectedTrack || 'race') : 'garage');

    document.querySelectorAll('.screen').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });

    const target = document.getElementById(`screen-${screenName}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    if (screenName === 'garage') {
        updateGarageUI();
    }

    if (screenName === 'upgrade') updateUpgradeUI();
    if (screenName === 'tracks') updateTracksUI();
    if (screenName === 'shop') {
        renderContainerShop();
    }

    if (screenName === 'race') {
        document.getElementById('race-ui')?.classList.add('hidden');
        initRace(handleRaceEnd);
    }

    updateHUD();
}

function ensureCouponsHUD() {
    if (document.getElementById('coupons-count')) return;

    const coinsElement = document.getElementById('coins-count');
    const hud = coinsElement?.parentElement?.parentElement;
    if (!hud) return;

    const couponBlock = document.createElement('div');
    couponBlock.className = 'flex items-center gap-2';
    couponBlock.innerHTML = `
        <span>🎟️</span>
        <span class="text-gray-400 text-sm uppercase tracking-wide">Велокупоны:</span>
        <span id="coupons-count" class="font-bold text-emerald-400">0</span>
    `;
    hud.appendChild(couponBlock);
}

function updateHUD() {
    ensureCouponsHUD();

    const coinsEl = document.getElementById('coins-count');
    const couponsEl = document.getElementById('coupons-count');
    const upgradeCoinsEl = document.getElementById('upgrade-coins');

    if (coinsEl) coinsEl.innerText = Math.floor(player.coins);
    if (couponsEl) couponsEl.innerText = Math.floor(player.coupons);
    if (upgradeCoinsEl) upgradeCoinsEl.innerText = Math.floor(player.coins);

    document.querySelectorAll('[data-container-buy]').forEach(button => {
        const container = CONTAINERS_DB.find(
            item => item.id === button.dataset.containerBuy
        );

        if (!container) return;

        const enough = container.currency === 'coupon'
            ? player.coupons >= container.price
            : player.coins >= container.price;
        const hasAvailableLoot = Object.values(
            getAvailableContainerChances(container, getPartPools())
        ).some(chance => chance > 0);

        button.disabled = containerOpening || !enough || !hasAvailableLoot;
    });

    const trackButton = document.getElementById('buy-track-container');
    if (trackButton) {
        trackButton.disabled = containerOpening || player.coins < 1000;
    }
}

function getContainerChanceText(container) {
    const chances = getAvailableContainerChances(container, getPartPools());

    return [
        `Обычные: ${Number(chances.common) || 0}%`,
        `Редкие: ${Number(chances.rare) || 0}%`,
        `Легендарные: ${Number(chances.legendary) || 0}%`
    ].join(' · ');
}

function renderContainerShop() {
    const shopScreen = document.getElementById('screen-shop');
    const lootResult = document.getElementById('loot-result');

    if (!shopScreen || !lootResult) return;

    let containerList = document.getElementById('container-shop-list');

    if (!containerList) {
        containerList = document.createElement('div');
        containerList.id = 'container-shop-list';
        containerList.className =
            'w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-8 px-4';

        lootResult.parentElement.insertBefore(
            containerList,
            lootResult
        );
    }

    containerList.innerHTML = '';

    CONTAINERS_DB.forEach(container => {
        const chances = getAvailableContainerChances(container, getPartPools());
        const hasAvailableLoot = Object.values(chances).some(chance => chance > 0);
        const isCoupon = container.currency === 'coupon';
        const priceText = isCoupon
            ? `${container.price} Велокупон`
            : `${Number(container.price).toLocaleString('ru-RU')} 🪙`;

        const card = document.createElement('div');
        card.className =
            'bg-gray-800 border border-gray-700 rounded-2xl p-5 flex flex-col gap-3 shadow-xl';

        card.innerHTML = `
            <div class="text-5xl text-center">
                ${container.icon || '📦'}
            </div>

            <h3 class="text-xl font-black text-center">
                ${container.name}
            </h3>

            <p class="text-sm text-gray-400 text-center min-h-10">
                ${container.description || ''}
            </p>

            ${hasAvailableLoot ? '' : '<p class="text-xs text-amber-300 text-center">Откроется после разблокировки редких деталей</p>'}

            <div class="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 space-y-1">
                <div class="font-bold text-gray-200 mb-1">
                    Шанс выпадения:
                </div>

                <div>
                    Обычная деталь: ${formatChance(chances.common)}%
                </div>

                <div>
                    Редкая деталь: ${formatChance(chances.rare)}%
                </div>

                <div>
                    Легендарная: ${formatChance(chances.legendary)}%
                </div>
            </div>

            <div class="mt-auto text-center text-yellow-300 font-bold">
                ${priceText}
            </div>

            <button type="button"
                data-container-buy="${container.id}"
                class="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 py-3 rounded-xl font-bold transition">
                Открыть контейнер
            </button>
        `;

        card.querySelector('[data-container-buy]')?.addEventListener('click', () => {
            openContainer(container.id);
        });

        containerList.appendChild(card);
    });

    updateHUD();
}

function calculateBikeStats() {
    const totals = {
        speed: 0,
        accel: 0,
        jump: 0,
        brake: 0
    };

    const equippedParts = [];

    getCategoryOrder().forEach(category => {
        const equippedId = player.equipped?.[category];
        const part = ITEMS_DB[category].find(item => item.id === equippedId);
        if (!part) return;

        equippedParts.push({ category, part });

        getPartNumericStats(part).forEach(stat => {
            totals[stat.key] = (Number(totals[stat.key]) || 0) + stat.value;
        });
    });

    player.totalSpeed = totals.speed || 0;
    player.totalAccel = totals.accel || 0;
    player.totalJump = totals.jump || 0;
    player.totalBrake = totals.brake || 0;
    player.totalStats = { ...totals };

    return {
        ...totals,
        equippedCount: equippedParts.length,
        equippedParts
    };
}

function getRarityAccent(rarity) {
    if (rarity === 'legendary') return '#fbbf24';
    if (rarity === 'rare') return '#38bdf8';
    return '#94a3b8';
}

function getPartStatsHTML(part) {
    const stats = getPartNumericStats(part);
    if (!stats.length) {
        return '<span class="garage-empty-text">Дополнительные параметры не указаны</span>';
    }

    return stats.map(stat => {
        const sign = stat.value > 0 && !stat.noPlus ? '+' : '';
        return `
            <span class="garage-part-stat" title="${escapeHTML(getStatLabel(stat.key))}">
                ${stat.icon} ${escapeHTML(stat.label)}: ${sign}${formatStatValue(stat.value)}
            </span>
        `;
    }).join('');
}

function getPartInfoHTML(category, part) {
    const ability = part.ability;
    const description = typeof ability === 'string' ? ability : ability?.description;
    if (part.rarity !== 'legendary' || !description) return '';

    return `
        <div class="upgrade-part-info">
            <button type="button" class="upgrade-part-info-button" aria-expanded="false" aria-label="Суперспособность: ${escapeHTML(part.name)}">?</button>
            <div class="upgrade-part-info-panel" role="note">
                <button type="button" class="upgrade-part-info-close" aria-label="Закрыть подсказку">×</button>
                <strong>Суперспособность</strong><br>
                ${escapeHTML(description)}
            </div>
        </div>
    `;
}

let openPartInfoPanel = null;
let openPartInfoHome = null;
let openPartInfoButton = null;
let openPartInfoBackdrop = null;

function closePartInfo() {
    if (!openPartInfoPanel) return;
    openPartInfoPanel.classList.remove('is-open', 'is-mobile-dialog');
    openPartInfoPanel.removeAttribute('aria-modal');
    openPartInfoHome?.appendChild(openPartInfoPanel);
    openPartInfoButton?.setAttribute('aria-expanded', 'false');
    openPartInfoBackdrop?.remove();
    openPartInfoPanel = openPartInfoHome = openPartInfoButton = openPartInfoBackdrop = null;
}

function attachPartInfoToggle(card) {
    const button = card.querySelector('.upgrade-part-info-button');
    const panel = card.querySelector('.upgrade-part-info-panel');
    if (!button || !panel) return;

    const closeButton = panel.querySelector('.upgrade-part-info-close');
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (openPartInfoPanel === panel) {
            closePartInfo();
            return;
        }
        closePartInfo();
        openPartInfoPanel = panel;
        openPartInfoHome = panel.parentElement;
        openPartInfoButton = button;
        panel.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        if (window.matchMedia('(max-width: 768px)').matches) {
            openPartInfoBackdrop = document.createElement('div');
            openPartInfoBackdrop.className = 'upgrade-part-info-backdrop';
            openPartInfoBackdrop.addEventListener('click', closePartInfo);
            document.body.appendChild(openPartInfoBackdrop);
            panel.classList.add('is-mobile-dialog');
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            document.body.appendChild(panel);
            closeButton?.focus({ preventScroll: true });
        }
    });
    closeButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closePartInfo();
        button.focus({ preventScroll: true });
    });
}

function renderGarageStats(stats) {
    const grid = document.getElementById('garage-stat-grid');
    const extra = document.getElementById('garage-extra-stats');
    if (!grid || !extra) return;

    const mainStats = [
        { key: 'speed', label: 'Максимальная скорость', icon: '🏁', glow: '#38bdf8' },
        { key: 'accel', label: 'Ускорение', icon: '⚡', glow: '#fb923c' },
        { key: 'jump', label: 'Сила прыжка', icon: '🪂', glow: '#a78bfa' },
        { key: 'brake', label: 'Торможение', icon: '🛑', glow: '#fb7185' }
    ];

    grid.innerHTML = mainStats.map(stat => `
        <div class="garage-stat-card" style="--stat-glow:${stat.glow}">
            <div class="garage-stat-top">
                <span class="garage-stat-icon">${stat.icon}</span>
                <span>${stat.label}</span>
            </div>
            <div class="garage-stat-value">
                ${formatStatValue(stats[stat.key] || 0)}
                <span class="garage-stat-unit">PTS</span>
            </div>
        </div>
    `).join('');

    const knownMain = new Set(mainStats.map(stat => stat.key));
    const extras = Object.keys(stats)
        .filter(key => !knownMain.has(key) && typeof stats[key] === 'number')
        .filter(key => key !== 'equippedCount' && !NON_STAT_NUMERIC_FIELDS.has(key));

    extra.innerHTML = extras.map(key => {
        const meta = STAT_META[key] || {};
        const icon = meta.icon || '✦';
        const label = meta.short || getStatLabel(key);
        return `
            <span class="garage-extra-stat" title="${escapeHTML(getStatLabel(key))}">
                ${icon} ${escapeHTML(label)}: <strong>${formatStatValue(stats[key])}</strong>
            </span>
        `;
    }).join('');
}

function updateGarageUI() {
    const root = ensureGarageLayout();
    if (!root) return;

    const equippedDiv = document.getElementById('equipped-parts');
    const stats = calculateBikeStats();
    if (!equippedDiv) return;

    const categories = getCategoryOrder();
    const installedCount = stats.equippedCount;
    const totalSlots = categories.length;
    const completeness = totalSlots > 0
        ? Math.round((installedCount / totalSlots) * 100)
        : 0;

    const frameCategory = categories.includes('frames') ? 'frames' : categories[0];
    const frameId = player.equipped?.[frameCategory];
    const frame = ITEMS_DB[frameCategory]?.find(item => item.id === frameId);

    const frameName = document.getElementById('garage-frame-name');
    const frameCaption = document.getElementById('garage-frame-caption');
    const frameRarity = document.getElementById('garage-frame-rarity');

    if (frameName) frameName.textContent = frame?.name || 'Рама не установлена';

    if (frameCaption) {
        frameCaption.textContent = frame
            ? `${getCategoryName(frameCategory)} · ${getRarityName(frame.rarity)} · Основа твоей сборки`
            : 'Выбери раму во вкладке «Модернизация», чтобы завершить сборку.';
    }

    if (frameRarity) {
        frameRarity.textContent = frame ? getRarityName(frame.rarity).toUpperCase() : 'CUSTOM BUILD';
        frameRarity.style.color = getRarityAccent(frame?.rarity);
        frameRarity.style.borderColor = getRarityAccent(frame?.rarity);
    }

    const bikeSvg = root.querySelector('.garage-bike-svg');
    const getEquippedPart = category => {
        const id = player.equipped?.[category];
        return ITEMS_DB[category]?.find(item => item.id === id) || null;
    };
    if (bikeSvg) {
        const fork = getEquippedPart('forks');
        const wheels = getEquippedPart('wheels');
        const tires = getEquippedPart('tires');
        const brakes = getEquippedPart('brakes');
        const electronics = getEquippedPart('electronics');
        const chain = getEquippedPart('chains');
        const crank = getEquippedPart('cranks');
        const handlebar = getEquippedPart('handlebars');
        const saddle = getEquippedPart('saddles');
        const seatpost = getEquippedPart('seatposts');
        const frameColor = getRarityAccent(frame?.rarity);
        bikeSvg.style.setProperty('--garage-bike-accent', frameColor);
        bikeSvg.style.setProperty('--garage-fork-accent', getRarityAccent(fork?.rarity));
        bikeSvg.style.setProperty('--garage-drive-accent', getRarityAccent(chain?.rarity));
        bikeSvg.style.setProperty('--garage-crank-accent', getRarityAccent(crank?.rarity));
        bikeSvg.style.setProperty('--garage-seat-accent', getRarityAccent(seatpost?.rarity));
        bikeSvg.style.setProperty('--garage-saddle-accent', getRarityAccent(saddle?.rarity));
        bikeSvg.style.setProperty('--garage-handlebar-width', handlebar?.rarity === 'legendary' ? '8px' : handlebar?.rarity === 'rare' ? '7px' : '6px');
        bikeSvg.dataset.frameId = frame?.id || 'none';
        bikeSvg.dataset.wheelId = wheels?.id || 'none';
        bikeSvg.classList.toggle('has-motor', Boolean(electronics && electronics.id !== 'e1'));
        bikeSvg.classList.toggle('has-suspension', Boolean(fork && fork.id !== 'fk1'));
        bikeSvg.classList.toggle('has-disc-brakes', Boolean(brakes && !['b1', 'b2'].includes(brakes.id)));
        const frameGroup = bikeSvg.querySelector('.bike-frame');
        if (frameGroup) {
            const geometry = frame?.rarity === 'legendary'
                ? { seat: [250, 80], head: [435, 88], lower: [447, 135] }
                : frame?.rarity === 'rare'
                    ? { seat: [242, 85], head: [440, 92], lower: [452, 140] }
                    : { seat: [235, 88], head: [445, 96], lower: [457, 145] };
            const points = geometry;
            const xy = pair => pair.join(' ');
            const paths = frameGroup.querySelectorAll('path');
            const values = [
                `M150 185 L300 185 L${xy(points.seat)} L150 185`,
                `M${xy(points.seat)} L${xy(points.head)} L300 185`,
                `M${xy(points.head)} L${xy(points.lower)} L520 185`,
                `M${xy(points.seat)} L${xy(points.lower)}`
            ];
            paths.forEach((path, index) => { if (values[index]) path.setAttribute('d', values[index]); });
            bikeSvg.querySelectorAll('.bike-fork, .bike-fork-highlight').forEach(path =>
                path.setAttribute('d', `M${xy(points.lower)} L520 185`)
            );
            const cockpitPaths = bikeSvg.querySelectorAll('#garage-bike-cockpit path');
            if (cockpitPaths[0]) cockpitPaths[0].setAttribute('d', `M${xy(points.head)} L${points.head[0] + 16} 27 L${points.head[0] + 33} 27`);
            if (cockpitPaths[1]) cockpitPaths[1].setAttribute('d', `M${points.head[0] - 5} 23 L${points.head[0] + 37} 23`);
        }
        if (frameGroup) frameGroup.setAttribute('stroke-width', frame?.rarity === 'legendary' ? '15' : frame?.rarity === 'rare' ? '13' : '11');
        const seatCoordinates = frame?.rarity === 'legendary' ? { x: 250, y: 80 } : frame?.rarity === 'rare' ? { x: 242, y: 85 } : { x: 235, y: 88 };
        const seatpostLine = bikeSvg.querySelector('#garage-bike-seatpost');
        if (seatpostLine) seatpostLine.setAttribute('d', `M${seatCoordinates.x} ${seatCoordinates.y} L${seatCoordinates.x - 7} 53`);
        const saddleLine = bikeSvg.querySelector('#garage-bike-saddle');
        if (saddleLine) saddleLine.setAttribute('d', `M${seatCoordinates.x - 20} 51 Q${seatCoordinates.x} 45 ${seatCoordinates.x + 25} 51`);
        const tireGroup = bikeSvg.querySelector('.bike-tire');
        if (tireGroup) tireGroup.setAttribute('stroke-width', tires?.rarity === 'legendary' ? '20' : tires?.rarity === 'rare' ? '17' : '14');
        const rimGroup = bikeSvg.querySelector('.bike-rims');
        if (rimGroup) rimGroup.setAttribute('stroke', wheels?.rarity === 'legendary' ? '#fbbf24' : wheels?.rarity === 'rare' ? '#38bdf8' : '#64748b');
        const motor = bikeSvg.querySelector('#garage-bike-motor');
        if (motor) motor.setAttribute('display', electronics && electronics.id !== 'e1' ? 'inline' : 'none');
        bikeSvg.querySelectorAll('.bike-brake-discs').forEach(group => {
            group.setAttribute('display', brakes && !['b1', 'b2'].includes(brakes.id) ? 'inline' : 'none');
        });
        const vBrakes = bikeSvg.querySelector('.bike-vbrakes');
        if (vBrakes) vBrakes.setAttribute('display', brakes && !['b1', 'b2'].includes(brakes.id) ? 'none' : 'inline');
        const cockpit = bikeSvg.querySelector('#garage-bike-cockpit');
        if (cockpit) cockpit.querySelectorAll('path').forEach(path => path.setAttribute('stroke-width', handlebar?.rarity === 'legendary' ? '8' : handlebar?.rarity === 'rare' ? '7' : '6'));
        const forkLine = bikeSvg.querySelector('.bike-fork');
        if (forkLine) forkLine.setAttribute('stroke', getRarityAccent(fork?.rarity));
        const suspension = bikeSvg.querySelector('#garage-bike-suspension');
        if (suspension) suspension.setAttribute('display', fork && fork.id !== 'fk1' ? 'inline' : 'none');
        const saddleElement = bikeSvg.querySelector('#garage-bike-saddle');
        if (saddleElement) saddleElement.setAttribute('stroke', getRarityAccent(saddle?.rarity));
        const seatpostElement = bikeSvg.querySelector('#garage-bike-seatpost');
        if (seatpostElement) seatpostElement.setAttribute('stroke', getRarityAccent(seatpost?.rarity));
        const chainDetail = bikeSvg.querySelector('.bike-chain-detail');
        if (chainDetail) chainDetail.setAttribute('stroke', getRarityAccent(chain?.rarity));
        const crankDetail = bikeSvg.querySelector('.bike-crank-detail');
        if (crankDetail) crankDetail.setAttribute('stroke', getRarityAccent(crank?.rarity));
    }

    const countEl = document.getElementById('garage-equipped-count');
    const percentEl = document.getElementById('garage-completeness-percent');
    const fillEl = document.getElementById('garage-completeness-fill');
    const noteEl = document.getElementById('garage-equipment-note');

    if (countEl) countEl.textContent = `${installedCount} / ${totalSlots} СЛОТОВ`;
    if (percentEl) percentEl.textContent = `${completeness}%`;
    if (fillEl) fillEl.style.width = `${completeness}%`;
    if (noteEl) noteEl.textContent = `${installedCount} установлено · ${Math.max(0, totalSlots - installedCount)} свободно`;

    equippedDiv.innerHTML = '';

    categories.forEach(category => {
        const equippedId = player.equipped?.[category];
        const part = ITEMS_DB[category].find(item => item.id === equippedId);
        const card = document.createElement('div');

        if (part) {
            const accent = getRarityAccent(part.rarity);
            card.className = 'garage-equipped-card';
            card.style.borderLeft = `3px solid ${accent}`;

            card.innerHTML = `
                <div class="garage-part-head">
                    <div class="garage-part-icon">${getCategoryIcon(category)}</div>
                    <div class="garage-part-info">
                        <div class="garage-part-category">${escapeHTML(getCategoryName(category))}</div>
                        <div class="garage-part-name">${escapeHTML(part.name)}</div>
                    </div>
                    <span class="garage-part-rarity" style="color:${accent}">${escapeHTML(getRarityName(part.rarity))}</span>
                </div>
                <div class="garage-part-stats">
                    ${getPartStatsHTML(part)}
                </div>
            `;
        } else {
            card.className = 'garage-equipped-card is-empty';
            card.innerHTML = `
                <div class="garage-part-head">
                    <div class="garage-part-icon">${getCategoryIcon(category)}</div>
                    <div class="garage-part-info">
                        <div class="garage-part-category">${escapeHTML(getCategoryName(category))}</div>
                        <div class="garage-part-name">Слот свободен</div>
                    </div>
                </div>
                <div class="garage-empty-text">Слот свободен. Деталь можно выбрать во вкладке «Модернизация».</div>
            `;
        }

        equippedDiv.appendChild(card);
    });

    renderGarageStats(stats);

    const oldSpeed = document.getElementById('stat-speed');
    const oldAccel = document.getElementById('stat-accel');
    if (oldSpeed) oldSpeed.textContent = formatStatValue(stats.speed || 0);
    if (oldAccel) oldAccel.textContent = formatStatValue(stats.accel || 0);
}

function updateUpgradeUI() {
    closePartInfo();
    const upgradeRoot = document.getElementById('screen-upgrade');
    const categoriesDiv =
        upgradeRoot?.querySelector('#upgrade-categories, #garage-upgrade-categories') ||
        document.getElementById('upgrade-categories') ||
        document.getElementById('garage-upgrade-categories');

    const partsDiv =
        upgradeRoot?.querySelector('#upgrade-parts, #garage-upgrade-parts') ||
        document.getElementById('upgrade-parts') ||
        document.getElementById('garage-upgrade-parts');

    const titleDiv =
        upgradeRoot?.querySelector('#upgrade-category-title, #garage-upgrade-category-title') ||
        document.getElementById('upgrade-category-title') ||
        document.getElementById('garage-upgrade-category-title');

    if (!categoriesDiv || !partsDiv || !titleDiv) return;

    syncProgression();

    const categories = getCategoryOrder();
    if (!categories.includes(selectedUpgradeCategory)) {
        selectedUpgradeCategory = categories[0] || '';
    }

    categoriesDiv.innerHTML = '';
    partsDiv.innerHTML = '';

    if (!categories.length) {
        titleDiv.innerText = 'Нет комплектующих';
        partsDiv.innerHTML = '<div class="bg-gray-900 p-5 rounded-xl text-gray-400">Добавьте детали в ITEMS_DB.</div>';
        updateHUD();
        return;
    }

    categories.forEach(category => {
        const items = ITEMS_DB[category];
        const equippedPart = items.find(item => item.id === player.equipped?.[category]);
        const ownedCount = items.filter(item => hasPart(category, item.id)).length;

        const button = document.createElement('button');
        button.className =
            'w-full text-left px-3 py-3 rounded-xl font-bold transition ' +
            (selectedUpgradeCategory === category
                ? 'garage-selected-category bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300');

        button.innerHTML = `
            <div>${getCategoryIcon(category)} ${getCategoryName(category)}</div>
            <div class="text-xs font-normal opacity-70 truncate mt-1">
                ${equippedPart ? equippedPart.name : 'Не установлено'}
            </div>
            <div class="text-xs opacity-60 mt-1">
                ${ownedCount}/${items.length} деталей
            </div>
        `;

        button.addEventListener('click', () => {
            selectedUpgradeCategory = category;
            updateUpgradeUI();
        });

        categoriesDiv.appendChild(button);
    });

    const category = selectedUpgradeCategory;
    const categoryItems = ITEMS_DB[category] || [];

    titleDiv.innerText = `${getCategoryIcon(category)} ${getCategoryName(category)}`;

    categoryItems.forEach(part => {
        const owned = hasPart(category, part.id);
        const equipped = player.equipped?.[category] === part.id;
        const unlocked = isRarityUnlocked(part.rarity);
        const price = getUpgradePrice(part);

        const card = document.createElement('div');
        card.className =
            'bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3';

        const statsHTML = `
            <div class="garage-part-stats">
                ${getPartStatsHTML(part)}
            </div>
        `;

        if (!unlocked) {
            card.innerHTML = `
                <div class="text-xs uppercase font-bold text-gray-500">
                    ${getCategoryName(category)}
                </div>

                <div class="upgrade-part-title-row">
                    <div class="upgrade-part-title text-xl font-black rarity-${part.rarity}">${escapeHTML(part.name)}</div>
                    ${getPartInfoHTML(category, part)}
                </div>

                <div class="text-xs text-gray-400">
                    Редкость: ${getRarityName(part.rarity)}
                </div>

                ${statsHTML}

                <div class="mt-auto bg-gray-800 p-3 rounded-lg">
                    <div class="font-bold text-gray-400 mb-2">
                        🔒 Компонент заблокирован
                    </div>

                    <div class="text-xs text-gray-400">
                        ${getRarityRequirement(part.rarity)}
                    </div>
                </div>
            `;

            attachPartInfoToggle(card);
            partsDiv.appendChild(card);
            return;
        }

        let actionHTML = '';
        const equippedId = player.equipped?.[category];
        const slotOccupied = equippedId !== undefined && equippedId !== null && equippedId !== '';

        if (equipped) {
            actionHTML = `
                <button disabled
                    class="bg-green-900 text-green-300 py-3 rounded-lg font-bold w-full">
                    ✓ Установлено
                </button>
            `;
        } else if (slotOccupied) {
            if (owned) {
                actionHTML = `
                    <button class="replace-part-button bg-blue-700 hover:bg-blue-600 py-3 rounded-lg font-bold w-full">
                        🔄 Заменить
                    </button>
                `;
            } else if (part.rarity === 'legendary') {
                actionHTML = '<div class="text-xs text-amber-300">🌟 Можно получить только из контейнера</div>';
            } else {
                actionHTML = `
                    <button class="replace-part-button bg-blue-700 hover:bg-blue-600 py-3 rounded-lg font-bold w-full">
                        🪙 Купить и заменить за ${price} 🪙
                    </button>
                `;
            }
        } else if (owned) {
            actionHTML = `
                <button class="install-part-button bg-blue-700 hover:bg-blue-600 py-3 rounded-lg font-bold w-full">
                    Установить
                </button>
            `;
        } else if (part.rarity === 'legendary') {
            actionHTML = '<div class="text-xs text-amber-300">🌟 Можно получить только из контейнера</div>';
        } else {
            actionHTML = `
                <button class="buy-part-button bg-yellow-600 hover:bg-yellow-500 py-3 rounded-lg font-bold w-full">
                    Купить за ${price} 🪙
                </button>
            `;
        }

        card.innerHTML = `
            <div class="text-xs uppercase font-bold text-gray-500">
                ${getCategoryName(category)}
            </div>

            <div class="upgrade-part-title-row">
                <div class="upgrade-part-title text-xl font-black rarity-${part.rarity}">${escapeHTML(part.name)}</div>
                ${getPartInfoHTML(category, part)}
            </div>

            <div class="text-xs text-gray-400">
                Редкость: ${getRarityName(part.rarity)}
            </div>

            ${statsHTML}

            <div class="mt-auto">
                ${
                    owned && !equipped
                        ? '<div class="text-xs text-green-400 mb-2">Есть в инвентаре</div>'
                        : ''
                }

                ${actionHTML}
            </div>
        `;

        attachPartInfoToggle(card);

        card.querySelector('.buy-part-button')?.addEventListener('click', () => {
            buyPart(category, part.id);
        });

        card.querySelector('.replace-part-button')?.addEventListener('click', () => {
            if (owned) {
                installPart(category, part.id);
            } else {
                buyAndReplacePart(category, part.id);
            }
        });

        card.querySelector('.install-part-button')?.addEventListener('click', () => {
            installPart(category, part.id);
        });

        partsDiv.appendChild(card);
    });

    updateHUD();
}

function buyPart(category, id) {
    const part = ITEMS_DB[category]?.find(item => item.id === id);
    if (!part) return;

    if (part.rarity === 'legendary') {
        alert('Легендарные детали можно получить только из контейнеров!');
        return;
    }

    if (!isRarityUnlocked(part.rarity)) {
        alert('Сначала открой эту редкость победой на трассе!');
        return;
    }

    if (hasPart(category, id)) {
        alert('Эта деталь уже есть в инвентаре!');
        return;
    }

    const price = getUpgradePrice(part);
    const balance = Math.max(0, Number(player.coins) || 0);

    if (balance < price) {
        alert(`Недостаточно монет! Нужно ${price} 🪙`);
        return;
    }

    player.coins = balance - price;
    player.inventory.push(partKey(category, id));

    updateHUD();
    updateUpgradeUI();
    updateGarageUI();
}

function buyAndReplacePart(category, id) {
    const part = ITEMS_DB[category]?.find(item => item.id === id);
    if (!part) return;

    if (part.rarity === 'legendary') {
        alert('Легендарные детали можно получить только из контейнеров!');
        return;
    }

    if (!isRarityUnlocked(part.rarity)) {
        alert('Эта редкость ещё не открыта!');
        return;
    }

    if (hasPart(category, id)) {
        installPart(category, id);
        return;
    }

    const price = getUpgradePrice(part);
    const balance = Math.max(0, Number(player.coins) || 0);

    if (balance < price) {
        alert(`Недостаточно монет! Нужно ${price} 🪙`);
        return;
    }

    player.coins = balance - price;
    player.inventory.push(partKey(category, id));
    player.equipped[category] = id;

    calculateBikeStats();
    updateHUD();
    updateGarageUI();
    updateUpgradeUI();
}

function installPart(category, id) {
    const part = ITEMS_DB[category]?.find(item => item.id === id);
    if (!part) return;

    if (!isRarityUnlocked(part.rarity)) {
        alert('Эта редкость ещё не открыта!');
        return;
    }

    if (!hasPart(category, id)) {
        alert('Сначала купи эту деталь!');
        return;
    }

    player.equipped[category] = id;

    calculateBikeStats();
    updateGarageUI();
    updateUpgradeUI();
    updateHUD();
}

function updateTracksUI() {
    const list = document.getElementById('tracks-list');
    if (!list) return;

    const totalEl = document.getElementById('tracks-total');
    if (totalEl) {
        totalEl.textContent = String(TRACKS_DB.length);
    }

    list.innerHTML = '';

    TRACKS_DB.forEach((track, index) => {
        const discovered = player.unlockedTracks.includes(track.id);
        const playable = canPlayTrack(track.id);
        const completed = player.completedTracks.includes(track.id);
        const selected = player.selectedTrack === track.id;
        const previousTrack = TRACKS_DB[index - 1];

        const winReward = Number(track.winReward) || (500 + index * 250);
        const lossReward = Number(track.lossReward) || (50 + index * 10);
        const couponReward = Math.max(1, Number(track.couponReward) || 1);
        const fourthTrackBonus = track.id === 't4'
            ? `<div class="track-reward track-reward--first-clear">
                    <span>Одноразово за первое прохождение</span>
                    <strong>${player.track4BonusClaimed ? '✓ Награда получена' : '2 редкие + 1 легендарный предмет'}</strong>
               </div>`
            : '';
        const raceLength = Math.max(1000, Number(track.length) * 3 - 1500);
        const obstaclesCount = Math.floor((Number(track.obstacles) || 0) * (3 + index * 0.07));
        const trackNumber = `TRACK ${String(index + 1).padStart(2, '0')}`;
        const icon = TRACK_ICONS[track.id] || '🗺️';

        let statusClass = 'track-status--locked';
        let statusText = '🔒 Закрыта';

        if (selected && playable) {
            statusClass = 'track-status--selected';
            statusText = '✓ Выбрана';
        } else if (completed) {
            statusClass = 'track-status--completed';
            statusText = '★ Пройдена';
        } else if (playable) {
            statusClass = 'track-status--available';
            statusText = '● Доступна';
        } else if (discovered) {
            statusClass = 'track-status--found';
            statusText = '🗺️ Найдена';
        }

        const cardClasses = [
            'track-card',
            playable ? 'track-card--playable' : 'track-card--locked-card',
            selected && playable ? 'track-card--selected' : ''
        ].filter(Boolean).join(' ');

        const card = document.createElement('article');
        card.className = cardClasses;

        if (playable) {
            card.innerHTML = `
                <div class="track-card__topline">
                    <span class="track-card__number">${trackNumber}</span>
                    <span class="track-status ${statusClass}">${statusText}</span>
                </div>

                <div class="track-card__title-row">
                    <div class="track-card__icon">${icon}</div>
                    <div class="track-card__title-wrap">
                        <h3 class="track-card__title rarity-${escapeHTML(track.rarity)}">
                            ${escapeHTML(track.name)}
                        </h3>
                        <span class="track-card__rarity">
                            ${escapeHTML(getRarityName(track.rarity))} трасса
                        </span>
                    </div>
                </div>

                <div class="track-card__stats">
                    <div class="track-stat">
                        <span>Длина</span>
                        <strong>${raceLength.toLocaleString('ru-RU')} м</strong>
                    </div>
                    <div class="track-stat">
                        <span>Препятствия</span>
                        <strong>${obstaclesCount} шт.</strong>
                    </div>
                    <div class="track-stat">
                        <span>Скорость бота</span>
                        <strong>${track.botMaxSpeed}</strong>
                    </div>
                </div>

                <div class="track-card__rewards">
                    <div class="track-card__section-label">НАГРАДЫ ЗА ЗАЕЗД</div>
                    <div class="track-card__reward-grid">
                        <div class="track-reward track-reward--win">
                            <span>Победа</span>
                            <strong>+${winReward.toLocaleString('ru-RU')} 🪙</strong>
                        </div>
                        <div class="track-reward track-reward--coupon">
                            <span>Велокупоны</span>
                            <strong>+${couponReward} 🎟️</strong>
                        </div>
                        <div class="track-reward">
                            <span>Поражение</span>
                            <strong>+${lossReward.toLocaleString('ru-RU')} 🪙</strong>
                        </div>
                        <div class="track-reward">
                            <span>Соперников</span>
                            <strong>${index + 1 >= 3 ? '2 бота' : '1 бот'}</strong>
                        </div>
                        ${fourthTrackBonus}
                    </div>
                </div>

                <button
                    type="button"
                    class="track-card__action"
                    ${selected ? 'disabled' : ''}>
                    ${selected ? '✓ Текущая трасса' : 'Выбрать маршрут'}
                </button>
            `;

            card.addEventListener('click', () => {
                window.selectTrack(track.id);
            });
        } else {
            const lockTitle = discovered
                ? 'Маршрут обнаружен'
                : 'Маршрут заблокирован';

            const lockRequirement = previousTrack
                ? `Победите бота на трассе «${previousTrack.name}», чтобы открыть доступ.`
                : 'Выполните предыдущие заезды.';

            card.innerHTML = `
                <div class="track-card__topline">
                    <span class="track-card__number">${trackNumber}</span>
                    <span class="track-status ${statusClass}">${statusText}</span>
                </div>

                <div class="track-card__title-row">
                    <div class="track-card__icon">🔒</div>
                    <div class="track-card__title-wrap">
                        <h3 class="track-card__title">
                            ${escapeHTML(track.name)}
                        </h3>
                        <span class="track-card__rarity">
                            ${escapeHTML(getRarityName(track.rarity))} трасса
                        </span>
                    </div>
                </div>

                <div class="track-card__stats">
                    <div class="track-stat">
                        <span>Длина</span>
                        <strong>${raceLength.toLocaleString('ru-RU')} м</strong>
                    </div>
                    <div class="track-stat">
                        <span>Препятствия</span>
                        <strong>${obstaclesCount} шт.</strong>
                    </div>
                    <div class="track-stat">
                        <span>Скорость бота</span>
                        <strong>${track.botMaxSpeed}</strong>
                    </div>
                </div>

                <div class="track-card__rewards">
                    <div class="track-card__section-label">НАГРАДЫ ЗА ЗАЕЗД</div>
                    <div class="track-card__reward-grid">
                        <div class="track-reward track-reward--win">
                            <span>Победа</span>
                            <strong>+${winReward.toLocaleString('ru-RU')} 🪙</strong>
                        </div>
                        <div class="track-reward track-reward--coupon">
                            <span>Велокупоны</span>
                            <strong>+${couponReward} 🎟️</strong>
                        </div>
                        ${fourthTrackBonus}
                    </div>
                </div>

                <div class="track-card__locked-note">
                    <strong>${lockTitle}</strong>
                    <span>${escapeHTML(lockRequirement)}</span>
                </div>
            `;
        }

        list.appendChild(card);
    });
}

function randomItem(items) {
    if (!items || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
}

function grantGuaranteedPart(rarity) {
    const pool = getPartPools()[rarity] || [];
    if (!pool.length) return null;
    const newParts = pool.filter(({ category, part }) => !hasPart(category, part.id));
    const prize = randomItem(newParts.length ? newParts : pool);
    if (!prize) return null;

    if (hasPart(prize.category, prize.part.id)) {
        const compensation = DUPLICATE_COMPENSATION[rarity] ?? 100;
        player.coins = (Number(player.coins) || 0) + compensation;
        return { ...prize, compensation };
    }

    player.inventory.push(partKey(prize.category, prize.part.id));
    return { ...prize, compensation: 0 };
}

function getPartPools() {
    const pools = {
        common: [],
        rare: [],
        legendary: []
    };

    getCategoryOrder().forEach(category => {
        ITEMS_DB[category].forEach(part => {
            if (!isRarityUnlocked(part.rarity)) return;
            if (!Object.prototype.hasOwnProperty.call(pools, part.rarity)) return;

            pools[part.rarity].push({
                category,
                part,
                duplicate: hasPart(category, part.id)
            });
        });
    });

    return pools;
}

function getAvailableContainerChances(container, pools = getPartPools()) {
    const rarities = ['common', 'rare', 'legendary'];
    const chances = container.chances || {};
    const weights = rarities.map(rarity =>
        isRarityUnlocked(rarity) && pools[rarity]?.length
            ? Math.max(0, Number(chances[rarity]) || 0)
            : 0
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!total) return { common: 0, rare: 0, legendary: 0 };
    return Object.fromEntries(rarities.map((rarity, index) => [rarity, weights[index] * 100 / total]));
}

function formatChance(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function chooseContainerRarity(container, pools) {
    const chances = getAvailableContainerChances(container, pools);
    const rarities = ['common', 'rare', 'legendary'];

    const available = rarities.filter(rarity =>
        isRarityUnlocked(rarity) && pools[rarity]?.length
    );

    if (!available.length) return null;

    const totalWeight = available.reduce((sum, rarity) => sum + chances[rarity], 0);

    if (totalWeight <= 0) return available[0];

    let roll = Math.random() * totalWeight;
    for (const rarity of available) {
        roll -= chances[rarity];
        if (roll < 0) return rarity;
    }

    return available[available.length - 1];
}

function getPartLoot(container) {
    const pools = getPartPools();
    const rarity = chooseContainerRarity(container, pools);
    if (!rarity) return null;
    return randomItem(pools[rarity]);
}

function hasEnoughCurrency(container) {
    if (container.currency === 'coupon') {
        return player.coupons >= Number(container.price);
    }
    return player.coins >= Number(container.price);
}

function chargeContainer(container) {
    const price = Math.max(0, Number(container.price) || 0);
    if (!hasEnoughCurrency(container)) return false;

    if (container.currency === 'coupon') {
        player.coupons = Math.max(0, Number(player.coupons) || 0) - price;
    } else {
        player.coins = Math.max(0, Number(player.coins) || 0) - price;
    }

    return true;
}

function refundContainer(container) {
    const price = Math.max(0, Number(container.price) || 0);
    if (container.currency === 'coupon') {
        player.coupons = (Number(player.coupons) || 0) + price;
    } else {
        player.coins = (Number(player.coins) || 0) + price;
    }
}

function openContainer(containerId) {
    if (containerOpening) return;

    if (containerId === 'parts') {
        containerId = 'basic';
    }

    if (containerId === 'parts-coupon') {
        containerId = 'coupon';
    }

    const container = CONTAINERS_DB.find(item => item.id === containerId);

    if (!container) {
        console.warn(
            'Контейнер не найден в CONTAINERS_DB:',
            containerId
        );
        return;
    }

    const loot = getPartLoot(container);

    if (!loot) {
        alert(
            'Нет деталей доступной редкости для этого контейнера. ' +
            'Открой следующую редкость. Оплата не списана.'
        );
        return;
    }

    if (!hasEnoughCurrency(container)) {
        if (container.currency === 'coupon') {
            alert(`Недостаточно Велокупонов! За этот контейнер нужно ${container.price}.`);
        } else {
            alert(
                `Недостаточно монет! Нужно ${Number(container.price).toLocaleString('ru-RU')} 🪙`
            );
        }
        return;
    }

    if (!chargeContainer(container)) return;

    containerOpening = true;
    updateHUD();

    const result = document.getElementById('loot-result');

    const box = document.querySelector(
        `[data-container-buy="${container.id}"]`
    )?.closest('.bg-gray-800');

    box?.classList.add('shake-animation');

    if (result) {
        result.className = 'mt-8 text-2xl font-black text-center';
        result.innerText = `Открываем: ${container.name}...`;
    }

    setTimeout(() => {
        let rewardGranted = false;

        try {
            box?.classList.remove('shake-animation');

            const { category, part } = loot;
            const key = partKey(category, part.id);
            const duplicate = hasPart(category, part.id);

            if (duplicate) {
                const compensation = DUPLICATE_COMPENSATION[part.rarity] ?? 100;
                player.coins = (Number(player.coins) || 0) + compensation;
                rewardGranted = true;

                if (result) {
                    result.innerHTML = `
                        🔁 Повторная деталь из контейнера «${container.name}»!

                        <br>

                        <span class="rarity-${part.rarity}">
                            ${part.name}
                        </span>

                        <br>

                        <span class="text-base text-green-400">
                            Категория: ${getCategoryName(category)}
                        </span>

                        <br>

                        <span class="text-base text-gray-400">
                            Редкость: ${getRarityName(part.rarity)}
                        </span>

                        <br>

                        <span class="text-xl font-black text-yellow-300">
                            Компенсация: +${compensation.toLocaleString('ru-RU')} 🪙
                        </span>

                        <br>

                        <span class="text-sm text-gray-400">
                            Деталь уже есть в инвентаре — вместо неё начислены монеты.
                        </span>
                    `;
                }
            } else {
                player.inventory.push(key);
                rewardGranted = true;

                if (result) {
                    result.innerHTML = `
                        🎉 Получена новая деталь из контейнера «${container.name}»!

                        <br>

                        <span class="rarity-${part.rarity}">
                            ${part.name}
                        </span>

                        <br>

                        <span class="text-base text-green-400">
                            Категория: ${getCategoryName(category)}
                        </span>

                        <br>

                        <span class="text-base text-gray-400">
                            Редкость: ${getRarityName(part.rarity)}
                        </span>

                        <br>

                        <span class="text-base text-gray-400">
                            Найди деталь в разделе «Модернизация».
                        </span>
                    `;
                }
            }
        } catch (error) {
            console.error('Ошибка открытия контейнера:', error);

            if (!rewardGranted) {
                refundContainer(container);
            }

            if (result) {
                result.innerHTML =
                    '<span class="text-red-400">Ошибка открытия. Оплата возвращена.</span>';
            }
        } finally {
            containerOpening = false;

            updateHUD();
            updateGarageUI();
            updateUpgradeUI();
            renderContainerShop();
        }
    }, 1200);
}

function getRaceReward(track, win) {
    const index = Math.max(
        0,
        TRACKS_DB.findIndex(item => item.id === track?.id)
    );

    if (win) {
        return Math.max(
            0,
            Number(track?.winReward) || (500 + index * 250)
        );
    }

    return Math.max(
        50,
        Number(track?.lossReward) || (50 + index * 10)
    );
}

function showRaceResult(win, reason, bonusText) {
    playRaceResult(Boolean(win));

    const ui = document.getElementById('race-ui');
    const title = document.getElementById('race-result-title');
    const rewardText = document.getElementById('race-reward');

    ui?.classList.remove('hidden');

    if (title) {
        title.innerText = win ? 'Победа!' : 'Поражение...';
        title.className = win
            ? 'text-5xl font-black mb-4 tracking-wide text-green-400'
            : 'text-5xl font-black mb-4 tracking-wide text-red-500';
    }

    if (rewardText) {
        rewardText.innerHTML = bonusText;
    }
}

function handleRaceEnd(win, reason = 'finish') {
    const selectedId = player.selectedTrack;
    const trackIndex = TRACKS_DB.findIndex(track => track.id === selectedId);
    const track = trackIndex >= 0 ? TRACKS_DB[trackIndex] : TRACKS_DB[0];
    const result = Boolean(win);
    const rewardCoins = getRaceReward(track, result);

    player.coins = (Number(player.coins) || 0) + rewardCoins;

    let bonusText = result
        ? `Победа: +${rewardCoins.toLocaleString('ru-RU')} 🪙`
        : `Поражение: +${rewardCoins.toLocaleString('ru-RU')} 🪙`;

    if (result) {
        player.totalWins = (Number(player.totalWins) || 0) + 1;

        const couponReward = Math.max(1, Number(track?.couponReward) || 1);
        player.coupons = (Number(player.coupons) || 0) + couponReward;
        bonusText += `<br>🎟️ Получено Велокупонов: +${couponReward}`;

        const firstVictory = !player.completedTracks.includes(selectedId);
        if (firstVictory && trackIndex >= 0) {
            player.completedTracks.push(selectedId);

            const nextTrack = TRACKS_DB[trackIndex + 1];
            if (nextTrack && !player.unlockedTracks.includes(nextTrack.id)) {
                player.unlockedTracks.push(nextTrack.id);
                bonusText += `<br>🏁 Открыта следующая трасса: ${nextTrack.name}`;
            }

            if (!player.trackRewardsClaimed.includes(selectedId)) {
                player.trackRewardsClaimed.push(selectedId);
            }
        }

        if (selectedId === 't2' && !isRarityUnlocked('rare')) {
            unlockComponentRarity('rare');
            bonusText += '<br>🔵 После второй трассы открыты редкие комплектующие!';
        }

        if (selectedId === 't4' && !isRarityUnlocked('legendary')) {
            unlockComponentRarity('legendary');
            bonusText += '<br>🌟 Открыты легендарные комплектующие!';
        }

        if (selectedId === 't4' && !player.track4BonusClaimed) {
            const guaranteed = [
                grantGuaranteedPart('legendary'),
                grantGuaranteedPart('rare'),
                grantGuaranteedPart('rare')
            ];
            player.track4BonusClaimed = true;
            bonusText += '<br>🎁 Награда за 4-ю трассу: легендарная деталь и 2 редкие!';
            const compensation = guaranteed.reduce((total, reward) => total + (reward?.compensation || 0), 0);
            if (compensation) bonusText += `<br>🔁 За повторные детали начислено: +${compensation.toLocaleString('ru-RU')} 🪙`;
        }

        syncProgression();
    } else {
        if (reason === 'pit') {
            bonusText += '<br>🕳️ Ты попал в яму! Следи за препятствиями и прыгай вовремя.';
        } else if (reason === 'bot-finish') {
            bonusText += '<br>🤖 Бот пересёк финиш первым.';
        } else {
            bonusText += '<br>Попробуй улучшить велосипед и повторить гонку!';
        }
    }

    updateHUD();
    updateGarageUI();
    updateTracksUI();
    updateUpgradeUI();
    renderContainerShop();
    showRaceResult(result, reason, bonusText);
}

window.selectTrack = function (id) {
    if (!canPlayTrack(id)) {
        alert('Сначала победи на предыдущей трассе!');
        return;
    }

    player.selectedTrack = id;
    updateTracksUI();
};

window.showScreen = showScreen;

window.openContainer = function (type, payment) {
    if (type === 'parts' && payment === 'coupon') {
        openContainer('coupon');
        return;
    }

    if (type === 'tracks') {
        return;
    }

    openContainer(type);
};

async function resetProgressRequest() {
    const confirmed = window.confirm(
        'Сбросить весь прогресс VeloRider?\n\n' +
        'Будут удалены монеты, велокупоны, открытые трассы, победы, ' +
        'купленные детали и текущая сборка велосипеда.\n\n' +
        'Это действие нельзя отменить.'
    );

    if (!confirmed) return;

    try {
        if (typeof clearSavedProgress !== 'function') {
            throw new Error('clearSavedProgress отсутствует в state.js');
        }

        await clearSavedProgress();

        window.alert('Прогресс сброшен. Игра перезапустится.');
        window.location.reload();
    } catch (error) {
        console.error('Не удалось сбросить прогресс:', error);
        window.alert(
            'Не удалось полностью сбросить прогресс. ' +
            'Проверь подключение и попробуй ещё раз.'
        );
    }
}

window.resetProgressRequest = resetProgressRequest;

window.resetRace = function () {
    showScreen('garage');
};

function setupButton(id, startAction, stopAction) {
    const button = document.getElementById(id);
    if (!button) return;

    button.addEventListener('mousedown', event => {
        event.preventDefault();
        startAction();
    });

    button.addEventListener('mouseup', event => {
        event.preventDefault();
        stopAction();
    });

    button.addEventListener('mouseleave', event => {
        event.preventDefault();
        stopAction();
    });

    button.addEventListener('touchstart', event => {
        event.preventDefault();
        startAction();
    }, { passive: false });

    button.addEventListener('touchend', event => {
        event.preventDefault();
        stopAction();
    }, { passive: false });

    button.addEventListener('touchcancel', event => {
        event.preventDefault();
        stopAction();
    }, { passive: false });
}

setupButton('btn-accelerate', () => setAccelerating(true), () => setAccelerating(false));
setupButton('btn-brake', () => setBraking(true), () => setBraking(false));
setupButton('btn-reverse', () => setReversing(true), () => setReversing(false));
setupButton('btn-jump', () => triggerJump(), () => {});

window.addEventListener('keydown', event => {
    const raceScreen = document.getElementById('screen-race');
    if (!raceScreen?.classList.contains('active')) return;

    if (event.code === 'KeyD' || event.code === 'ArrowRight') {
        event.preventDefault();
        setAccelerating(true);
    }

    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
        event.preventDefault();
        setReversing(true);
    }

    if (event.code === 'KeyS' || event.code === 'ArrowDown') {
        event.preventDefault();
        setBraking(true);
    }

    if (
        (event.code === 'KeyW' || event.code === 'ArrowUp' || event.code === 'Space') &&
        !event.repeat
    ) {
        event.preventDefault();
        triggerJump();
    }
});

window.addEventListener('keyup', event => {
    if (event.code === 'KeyD' || event.code === 'ArrowRight') setAccelerating(false);
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') setReversing(false);
    if (event.code === 'KeyS' || event.code === 'ArrowDown') setBraking(false);
});

window.addEventListener('blur', () => {
    setAccelerating(false);
    setBraking(false);
    setReversing(false);
});

async function bootstrap() {
    initTelegramApp();
    await loadPlayerState();

    normalizePlayerState();
    initAudioControls();
    setAudioScene('garage');
    calculateBikeStats();
    ensureCouponsHUD();
    renderContainerShop();
    updateHUD();
    updateGarageUI();
    updateTracksUI();
    updateUpgradeUI();
    showScreen('garage');

    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            void forceSavePlayerState();
        }
    });

    window.addEventListener('pagehide', () => {
        void forceSavePlayerState();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    void bootstrap();
});
