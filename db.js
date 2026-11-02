
const part = (
    id,
    name,
    rarity,
    speed,
    accel,
    jump,
    brake,
    price
) => {
    const partData = { id, name, rarity, speed, accel, jump, brake, price };
    const legendaryAbilities = {
        f3: { id: 'frameGuard', name: 'Карбоновый монокок', description: 'Первое столкновение с твёрдым препятствием за гонку наносит меньше потери скорости.' },
        f8: { id: 'shockFrame', name: 'Гибкая рама', description: 'После удара велосипед восстанавливает скорость на 15% быстрее.' },
        f9: { id: 'flowFrame', name: 'Трассовый баланс', description: 'На льду и сильном ветре теряется на 15% меньше скорости.' },
        f10: { id: 'landingFrame', name: 'Мягкая посадка', description: 'После успешного прыжка кратко ускоряет велосипед. Срабатывает не чаще раза в 5 секунд.' },
        e4: { id: 'nitro', name: 'Импульсный разгон', description: 'Дважды нажми газ, чтобы включить нитро: скорость и разгон повышаются на 2 секунды. Перезарядка — 8 секунд.' },
        e5: { id: 'nitro', name: 'Импульсный разгон', description: 'Дважды нажми газ, чтобы включить нитро: скорость и разгон повышаются на 2 секунды. Перезарядка — 8 секунд.' },
        fk8: { id: 'superJump', name: 'Пружинный прыжок', description: 'Прыжок становится на 35% выше и дольше держит велосипед в воздухе.' },
        ti5: { id: 'mudGrip', name: 'Грязевой протектор', description: 'В грязи и воде теряется на 20% меньше скорости.' },
        b7: { id: 'impactBrake', name: 'Контроль торможения', description: 'После столкновения замедление длится на 15% меньше.' }
    };
    if (legendaryAbilities[id]) partData.ability = legendaryAbilities[id];
    return partData;
};


// =========================================
// БАЗА ВЕЛОЗАПЧАСТЕЙ
// =========================================

export const ITEMS_DB = {

    // =====================================
    // РАМЫ
    // =====================================

    frames: [
        part('f1', 'Ardis Steel Frame', 'common', 2, 1, 1, 1, 200),
        part('f2', 'Trek Marlin Gen 3 Alpha Silver', 'rare', 4, 3, 3, 2, 1000),
        part('f3', 'Cannondale Jekyll Carbon', 'legendary', 8, 5, 8, 4, 2500),
        part('f4', 'Giant Talon ALUXX 6061', 'rare', 5, 4, 3, 2, 1200),
        part('f5', 'Specialized Rockhopper A1 Alloy', 'rare', 5, 3, 4, 3, 1300),
        part('f6', 'Cannondale Trail SmartForm C3', 'rare', 4, 4, 4, 3, 1400),
        part('f7', 'Marin Bobcat Trail Series 2', 'rare', 5, 4, 5, 3, 1500),
        part('f8', 'Trek Procaliber Carbon', 'legendary', 9, 7, 8, 5, 3500),
        part('f9', 'Giant XTC Advanced Carbon', 'legendary', 10, 8, 9, 5, 4000),
        part('f10', 'Specialized Epic Carbon', 'legendary', 11, 8, 10, 6, 4500)
    ],


    // =====================================
    // ВИЛКИ
    // =====================================

    forks: [
        part('fk1', 'Жёсткая вилка Ardis', 'common', 1, 1, 1, 1, 200),
        part('fk2', 'SR Suntour XCT', 'common', 1, 1, 2, 1, 300),
        part('fk3', 'SR Suntour XCM', 'rare', 2, 2, 4, 2, 700),
        part('fk4', 'RockShox Judy Silver', 'rare', 3, 3, 5, 2, 1100),
        part('fk5', 'RockShox Recon Gold RL', 'rare', 4, 4, 6, 3, 1500),
        part('fk6', 'RockShox SID Select', 'legendary', 7, 6, 9, 4, 2800),
        part('fk7', 'FOX 34 Float Performance', 'legendary', 8, 7, 10, 5, 3500),
        part('fk8', 'Cannondale Lefty Ocho', 'legendary', 9, 8, 11, 5, 4000)
    ],


    // =====================================
    // ЦЕПИ
    // =====================================

    chains: [
        part('ch1', 'Ardis 7/8 Speed', 'common', 1, 1, 0, 0, 150),
        part('ch2', 'KMC Z8', 'common', 1, 2, 0, 0, 220),
        part('ch3', 'KMC X10', 'rare', 2, 3, 0, 0, 450),
        part('ch4', 'Shimano HG601', 'rare', 3, 4, 0, 0, 650),
        part('ch5', 'SRAM GX Eagle Chain', 'legendary', 5, 6, 0, 0, 1200),
        part('ch6', 'Shimano XTR CN-M9100', 'legendary', 6, 7, 0, 0, 1600)
    ],


    // =====================================
    // ТРАНСМИССИИ
    // =====================================

    drivetrain: [
        part('d1', 'Ardis 3x7', 'common', 2, 2, 0, 0, 250),
        part('d2', 'Shimano Tourney TX', 'common', 2, 2, 0, 0, 350),
        part('d3', 'Shimano Acera M3000', 'common', 3, 3, 0, 0, 500),
        part('d4', 'Shimano CUES U6000', 'rare', 4, 4, 0, 0, 1000),
        part('d5', 'Shimano Deore M6100', 'rare', 5, 5, 0, 0, 1400),
        part('d6', 'Shimano SLX M7100', 'rare', 6, 6, 0, 0, 1900),
        part('d7', 'Shimano Deore XT M8100', 'legendary', 9, 8, 0, 0, 3000),
        part('d8', 'Shimano XTR M9100', 'legendary', 11, 10, 0, 0, 4000),
        part('d9', 'SRAM GX Eagle 1x12', 'legendary', 9, 9, 0, 0, 3200),
        part('d10', 'SRAM X0 Eagle 1x12', 'legendary', 10, 11, 0, 0, 3800)
    ],


    // =====================================
    // КАРЕТКИ
    // =====================================

    bottomBrackets: [
        part('bb1', 'Каретка под квадрат', 'common', 1, 1, 0, 0, 120),
        part('bb2', 'Shimano BB-UN300', 'common', 1, 2, 0, 0, 200),
        part('bb3', 'Shimano Hollowtech II', 'rare', 2, 3, 0, 0, 450),
        part('bb4', 'Shimano BB-MT500', 'rare', 3, 4, 0, 0, 650),
        part('bb5', 'Shimano XT BB-MT800', 'legendary', 5, 5, 0, 0, 1100),
        part('bb6', 'SRAM DUB', 'legendary', 5, 6, 0, 0, 1300)
    ],


    // =====================================
    // ШАТУНЫ
    // =====================================

    cranks: [
        part('cr1', 'Стальные шатуны Ardis', 'common', 1, 1, 0, 0, 150),
        part('cr2', 'Prowheel Alloy', 'common', 2, 2, 0, 0, 250),
        part('cr3', 'Shimano Acera', 'common', 2, 3, 0, 0, 350),
        part('cr4', 'Shimano Deore', 'rare', 3, 4, 0, 0, 600),
        part('cr5', 'Shimano SLX M7100', 'rare', 4, 5, 0, 0, 950),
        part('cr6', 'Shimano Deore XT', 'legendary', 6, 7, 0, 0, 1600),
        part('cr7', 'Shimano XTR', 'legendary', 8, 9, 0, 0, 2300),
        part('cr8', 'SRAM GX Eagle', 'legendary', 7, 8, 0, 0, 1900)
    ],


    // =====================================
    // КОЛЁСА
    // =====================================

    wheels: [
        part('w1', 'Стертые покрышки и простые колёса', 'common', 1, 1, 1, 2, 200),
        part('w2', 'Giant GX03V Alloy', 'common', 2, 2, 2, 2, 350),
        part('w3', 'WTB ST i25', 'rare', 3, 3, 3, 4, 700),
        part('w4', 'DT Swiss M 1900', 'rare', 4, 4, 4, 5, 1200),
        part('w5', 'DT Swiss XM 1700', 'legendary', 7, 6, 6, 7, 2300),
        part('w6', 'DT Swiss XRC 1200 Carbon', 'legendary', 9, 8, 8, 8, 3500)
    ],


    // =====================================
    // ТОРМОЗА
    // =====================================

    brakes: [
        part('b1', 'Старые V-Brakes', 'common', 0, 0, 0, 3, 150),
        part('b2', 'Shimano Tourney V-Brake', 'common', 0, 0, 0, 4, 250),
        part('b3', 'Shimano MT200 Hydraulic', 'rare', 0, 0, 0, 6, 600),
        part('b4', 'Shimano Deore M6100', 'rare', 0, 0, 0, 8, 1000),
        part('b5', 'Shimano SLX M7100', 'rare', 0, 0, 0, 9, 1300),
        part('b6', 'Shimano Deore XT M8120', 'legendary', 0, 0, 0, 12, 2000),
        part('b7', 'Shimano XTR M9120', 'legendary', 0, 0, 0, 15, 2800),
        part('b8', 'SRAM Code RSC', 'legendary', 0, 0, 0, 14, 2600)
    ],


    // =====================================
    // ЭЛЕКТРОНИКА И МОТОРЫ
    // =====================================

    electronics: [
        part('e1', 'Педальная тяга', 'common', 0, 0, 2, 0, 200),
        part('e2', 'Shimano Steps E5000', 'rare', 4, 5, -1, 0, 1800),
        part('e3', 'Bosch Performance Line', 'rare', 6, 7, -2, 0, 2500),
        part('e4', 'Bosch Performance Line CX', 'legendary', 10, 12, -3, 0, 4000),
        part('e5', 'Specialized 2.2 Motor', 'legendary', 11, 13, -3, 0, 4500)
    ],


    // =====================================
    // КАССЕТЫ
    // =====================================

    cassettes: [
        part('cs1', 'Shimano Tourney 7-speed', 'common', 1, 1, 0, 0, 150),
        part('cs2', 'Shimano Acera 9-speed', 'common', 2, 2, 0, 0, 300),
        part('cs3', 'Shimano CUES 10-speed', 'rare', 3, 4, 0, 0, 600),
        part('cs4', 'Shimano Deore 12-speed', 'rare', 5, 5, 0, 0, 1000),
        part('cs5', 'Shimano SLX 12-speed', 'rare', 6, 6, 0, 0, 1400),
        part('cs6', 'Shimano XT 12-speed', 'legendary', 8, 8, 0, 0, 2200),
        part('cs7', 'Shimano XTR 12-speed', 'legendary', 10, 10, 0, 0, 3000)
    ],


    // =====================================
    // ЗАДНИЕ ПЕРЕКЛЮЧАТЕЛИ
    // =====================================

    derailleurs: [
        part('rd1', 'Shimano Tourney RD-TY300', 'common', 1, 1, 0, 0, 180),
        part('rd2', 'Shimano Acera RD-M3020', 'common', 2, 2, 0, 0, 350),
        part('rd3', 'Shimano CUES RD-U6000', 'rare', 3, 4, 0, 0, 650),
        part('rd4', 'Shimano Deore RD-M6100', 'rare', 5, 5, 0, 0, 1000),
        part('rd5', 'Shimano SLX RD-M7100', 'rare', 6, 6, 0, 0, 1400),
        part('rd6', 'Shimano XT RD-M8100', 'legendary', 8, 8, 0, 0, 2200),
        part('rd7', 'Shimano XTR RD-M9100', 'legendary', 10, 10, 0, 0, 3000)
    ],


    // =====================================
    // МАНЕТКИ
    // =====================================

    shifters: [
        part('sh1', 'Shimano Tourney SL-TX50', 'common', 1, 1, 0, 0, 150),
        part('sh2', 'Shimano Acera SL-M3000', 'common', 2, 2, 0, 0, 300),
        part('sh3', 'Shimano CUES SL-U6000', 'rare', 3, 3, 0, 0, 550),
        part('sh4', 'Shimano Deore SL-M6100', 'rare', 4, 5, 0, 0, 850),
        part('sh5', 'Shimano SLX SL-M7100', 'rare', 5, 6, 0, 0, 1100),
        part('sh6', 'Shimano XT SL-M8100', 'legendary', 8, 8, 0, 0, 1800),
        part('sh7', 'Shimano XTR SL-M9100', 'legendary', 10, 10, 0, 0, 2500)
    ],


    // =====================================
    // РУЛИ
    // =====================================

    handlebars: [
        part('hb1', 'Стальной руль 600 мм', 'common', 0, 1, 1, 1, 100),
        part('hb2', 'Alloy Riser 680 мм', 'common', 1, 2, 2, 1, 250),
        part('hb3', 'Giant Connect Trail 780 мм', 'rare', 2, 3, 3, 2, 500),
        part('hb4', 'Race Face Chester', 'rare', 3, 4, 4, 2, 850),
        part('hb5', 'Renthal Fatbar Carbon', 'legendary', 5, 5, 6, 3, 1800)
    ],


    // =====================================
    // ВЫНОСЫ
    // =====================================

    stems: [
        part('st1', 'Стальной вынос', 'common', 0, 1, 0, 0, 100),
        part('st2', 'Alloy Ahead 60 mm', 'common', 1, 2, 1, 0, 200),
        part('st3', 'Race Face Ride', 'rare', 2, 3, 2, 0, 450),
        part('st4', 'Race Face Turbine', 'legendary', 4, 5, 3, 0, 1000)
    ],


    // =====================================
    // СЁДЛА
    // =====================================

    saddles: [
        part('sa1', 'Базовое седло', 'common', 0, 0, 1, 0, 100),
        part('sa2', 'Giant Sport Saddle', 'common', 1, 1, 2, 0, 250),
        part('sa3', 'Specialized Bridge Sport', 'rare', 2, 2, 3, 0, 500),
        part('sa4', 'WTB Volt', 'rare', 3, 3, 4, 0, 750),
        part('sa5', 'Fizik Terra Argo X3', 'legendary', 5, 4, 6, 0, 1400)
    ],


    // =====================================
    // ПОДСЕДЕЛЬНЫЕ ШТЫРИ
    // =====================================

    seatposts: [
        part('sp1', 'Обычный стальной штырь', 'common', 0, 0, 1, 0, 100),
        part('sp2', 'Alloy Seatpost', 'common', 1, 1, 2, 0, 220),
        part('sp3', 'KS Dropper Post', 'rare', 2, 2, 4, 0, 700),
        part('sp4', 'RockShox Reverb', 'legendary', 4, 3, 7, 0, 1600)
    ],


    // =====================================
    // ПЕДАЛИ
    // =====================================

    pedals: [
        part('pd1', 'Пластиковые платформы', 'common', 0, 1, 1, 0, 100),
        part('pd2', 'Aluminium Platform', 'common', 1, 2, 2, 0, 250),
        part('pd3', 'Shimano PD-M520', 'rare', 2, 3, 3, 0, 450),
        part('pd4', 'Race Face Chester', 'rare', 3, 4, 4, 0, 650),
        part('pd5', 'Crankbrothers Mallet E', 'legendary', 5, 6, 6, 0, 1300)
    ],


    // =====================================
    // ПОКРЫШКИ
    // =====================================

    tires: [
        part('ti1', 'Базовые MTB 26"', 'common', 1, 1, 1, 1, 150),
        part('ti2', 'Schwalbe Smart Sam', 'common', 2, 2, 2, 2, 300),
        part('ti3', 'Maxxis Ardent', 'rare', 3, 3, 3, 3, 550),
        part('ti4', 'Maxxis Rekon', 'rare', 4, 4, 4, 4, 800),
        part('ti5', 'Maxxis Minion DHF', 'legendary', 5, 5, 7, 7, 1500),
        part('ti6', 'Schwalbe Racing Ralph', 'legendary', 7, 7, 5, 4, 1700)
    ],


    // =====================================
    // ВТУЛКИ
    // =====================================

    hubs: [
        part('hu1', 'Базовые втулки на гайках', 'common', 1, 1, 0, 1, 120),
        part('hu2', 'Shimano TX505', 'common', 2, 2, 0, 1, 250),
        part('hu3', 'Shimano Deore M6010', 'rare', 3, 3, 0, 2, 500),
        part('hu4', 'DT Swiss 350', 'rare', 4, 4, 0, 3, 900),
        part('hu5', 'DT Swiss 240 EXP', 'legendary', 7, 7, 0, 4, 1800),
        part('hu6', 'Industry Nine Hydra', 'legendary', 8, 8, 0, 5, 2500)
    ]
};


// =========================================
// КОНТЕЙНЕРЫ
// Шансы указываются в процентах.
// Если редкость ещё закрыта, её шанс
// распределяется между открытыми редкостями.
// =========================================

export const CONTAINERS_DB = [

    {
        id: 'basic',
        name: 'Стартовый контейнер',
        description: 'Базовые детали для начинающего гонщика',
        icon: '📦',
        currency: 'coins',
        price: 500,
        chances: {
            common: 88,
            rare: 11,
            legendary: 1
        }
    },

    {
        id: 'sport',
        name: 'Спортивный контейнер',
        description: 'Больше редких деталей и улучшений',
        icon: '🚴',
        currency: 'coins',
        price: 1500,
        chances: {
            common: 65,
            rare: 30,
            legendary: 5
        }
    },

    {
        id: 'pro',
        name: 'Профессиональный контейнер',
        description: 'Высокий шанс на редкие и легендарные детали',
        icon: '🏆',
        currency: 'coins',
        price: 3500,
        chances: {
            common: 40,
            rare: 42,
            legendary: 18
        }
    },

    {
        id: 'coupon',
        name: 'Велоконтейнер',
        description: 'Контейнер средней ценности за 1 Велокупон',
        icon: '🎁',
        currency: 'coupon',
        price: 1,
        chances: {
            common: 60,
            rare: 35,
            legendary: 5
        }
    }
];


// =========================================
// ПРЕПЯТСТВИЯ
// =========================================

export const OBSTACLE_TYPES = {

    rock: {
        name: 'Камень',
        width: 35,
        height: 30,
        color: '#78716c'
    },

    log: {
        name: 'Бревно',
        width: 65,
        height: 22,
        color: '#92400e'
    },

    pit: {
        name: 'Яма',
        width: 55,
        height: 18,
        color: '#171717'
    },

    ramp: {
        name: 'Трамплин',
        width: 85,
        height: 35,
        color: '#a16207'
    },

    barrier: {
        name: 'Барьер',
        width: 45,
        height: 45,
        color: '#dc2626'
    },
    cone: { name: '\u041a\u043e\u043d\u0443\u0441\u044b', width: 34, height: 28, color: '#f97316' },
    mud: { name: '\u0413\u0440\u044f\u0437\u044c', width: 100, height: 15, color: '#78350f' },
    fallen_branch: { name: '\u041d\u0438\u0437\u043a\u0430\u044f \u0432\u0435\u0442\u043a\u0430', width: 78, height: 30, color: '#65a30d' },
    water_splash: { name: '\u0412\u043e\u0434\u043d\u0430\u044f \u043b\u0443\u0436\u0430', width: 90, height: 14, color: '#38bdf8' },
    wind_fan: { name: '\u0412\u0435\u0442\u0440\u043e\u0432\u043e\u0439 \u0432\u0435\u0435\u0440', width: 46, height: 58, color: '#a5f3fc' },
    spring_pad: { name: '\u041f\u0440\u0443\u0436\u0438\u043d\u043d\u0430\u044f \u043f\u043b\u0438\u0442\u0430', width: 68, height: 12, color: '#4ade80' },
    ice_patch: { name: '\u041b\u0451\u0434', width: 110, height: 12, color: '#bae6fd' },
    bridge_gap: { name: '\u0420\u0430\u0437\u0440\u0443\u0448\u0435\u043d\u043d\u044b\u0439 \u043c\u043e\u0441\u0442', width: 90, height: 22, color: '#0f172a' },
    pulse_gate: { name: '\u0421\u0432\u0435\u0442\u043e\u0432\u043e\u0439 \u0437\u0430\u0442\u0432\u043e\u0440', width: 52, height: 56, color: '#c084fc' },
    rolling_boulder: { name: '\u041a\u0430\u0442\u044f\u0449\u0438\u0439\u0441\u044f \u0432\u0430\u043b\u0443\u043d', width: 42, height: 38, color: '#a8a29e' }
};


// =========================================
// ТРАССЫ
// Награды за победу и поражение указаны
// отдельно для каждой трассы.
// =========================================

export const TRACKS_DB = [

    {
        id: 't1',
        musicTheme: 't1',
        name: 'Дворы',
        rarity: 'common',
        length: 15000,
        hills: 15,
        botMaxSpeed: 4,
        botAccel: 0.05,
        obstacles: 8,
        obstacleTypes: ['rock', 'log', 'ramp', 'cone', 'spring_pad', 'mud'],
        winReward: 500,
        lossReward: 50,
        couponReward: 1
    },

    {
        id: 't2',
        musicTheme: 't2',
        name: 'Лесопарк',
        rarity: 'common',
        length: 25000,
        hills: 30,
        botMaxSpeed: 6.5,
        botAccel: 0.08,
        obstacles: 18,
        obstacleTypes: ['log', 'rock', 'ramp', 'mud', 'water_splash', 'fallen_branch'],
        winReward: 650,
        lossReward: 60,
        couponReward: 1
    },

    {
        id: 't3',
        musicTheme: 't3',
        name: 'Саржин Яр',
        rarity: 'common',
        length: 35000,
        hills: 45,
        botMaxSpeed: 10,
        botAccel: 0.12,
        obstacles: 30,
        obstacleTypes: ['pit', 'rock', 'ramp', 'fallen_branch', 'wind_fan', 'water_splash'],
        winReward: 800,
        lossReward: 70,
        couponReward: 1
    },

    {
        id: 't4',
        musicTheme: 't4',
        name: 'Студгородок ХПИ',
        rarity: 'rare',
        length: 45000,
        hills: 60,
        botMaxSpeed: 14,
        botAccel: 0.18,
        obstacles: 45,
        obstacleTypes: ['barrier', 'log', 'ramp', 'pulse_gate', 'cone', 'spring_pad'],
        winReward: 1000,
        lossReward: 80,
        couponReward: 1
    },

    {
        id: 't5',
        musicTheme: 't5',
        name: 'Городской парк',
        rarity: 'rare',
        length: 55000,
        hills: 70,
        botMaxSpeed: 16,
        botAccel: 0.20,
        obstacles: 50,
        obstacleTypes: ['log', 'spring_pad', 'wind_fan', 'water_splash', 'cone', 'fallen_branch'],
        winReward: 1200,
        lossReward: 90,
        couponReward: 1
    },

    {
        id: 't6',
        musicTheme: 't6',
        name: 'Каменный карьер',
        rarity: 'rare',
        length: 65000,
        hills: 85,
        botMaxSpeed: 18,
        botAccel: 0.23,
        obstacles: 60,
        obstacleTypes: ['rock', 'rolling_boulder', 'mud', 'bridge_gap', 'wind_fan', 'spring_pad'],
        winReward: 1450,
        lossReward: 100,
        couponReward: 1
    },

    {
        id: 't7',
        musicTheme: 't7',
        name: 'Горный серпантин',
        rarity: 'rare',
        length: 75000,
        hills: 100,
        botMaxSpeed: 20,
        botAccel: 0.26,
        obstacles: 70,
        obstacleTypes: ['ice_patch', 'water_splash', 'bridge_gap', 'fallen_branch', 'pulse_gate', 'wind_fan'],
        winReward: 1700,
        lossReward: 115,
        couponReward: 1
    },

    {
        id: 't8',
        musicTheme: 't8',
        name: 'Заброшенная железная дорога',
        rarity: 'rare',
        length: 85000,
        hills: 115,
        botMaxSpeed: 22,
        botAccel: 0.29,
        obstacles: 80,
        obstacleTypes: ['barrier', 'pulse_gate', 'rolling_boulder', 'mud', 'cone', 'bridge_gap'],
        winReward: 2000,
        lossReward: 130,
        couponReward: 1
    },

    {
        id: 't9',
        musicTheme: 't9',
        name: 'Альпийский спуск',
        rarity: 'legendary',
        length: 95000,
        hills: 130,
        botMaxSpeed: 25,
        botAccel: 0.32,
        obstacles: 90,
        obstacleTypes: ['rock', 'pit', 'ramp', 'log', 'ice_patch', 'pulse_gate', 'rolling_boulder', 'wind_fan'],
        winReward: 2350,
        lossReward: 145,
        couponReward: 1
    },

    {
        id: 't10',
        musicTheme: 't10',
        name: 'VeloRider Марафон',
        rarity: 'legendary',
        length: 110000,
        hills: 150,
        botMaxSpeed: 28,
        botAccel: 0.36,
        obstacles: 110,
        obstacleTypes: ['rock', 'log', 'pit', 'ramp', 'barrier', 'cone', 'mud', 'fallen_branch', 'water_splash', 'wind_fan', 'spring_pad', 'ice_patch', 'bridge_gap', 'pulse_gate', 'rolling_boulder'],
        winReward: 2750,
        lossReward: 160,
        couponReward: 1
    }
];
