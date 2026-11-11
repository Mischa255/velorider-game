
const WEAKER_LEGENDARY_COUPON_PRICES = Object.freeze({
    ch5: 30,
    bb5: 30,
    st4: 30,
    cr6: 35,
    sa5: 35,
    fk6: 40,
    d7: 40,
    d9: 40,
    cr8: 40,
    sh6: 40,
    hb5: 40,
    sp4: 40,
    pd5: 40,
    hu5: 40,
    cs6: 45,
    rd6: 45,
    ti6: 45,
    b6: 50,
    s3: 55,
    w5: 55,
    f8: 70
});

const part = (
    id,
    name,
    rarity,
    speed,
    accel,
    jump,
    brake,
    price,
    power = 0,
    visuals = {} // <-- Новый параметр
) => {
    const partData = { id, name, rarity, speed, accel, jump, brake, price, visuals }; // <-- Сохраняем visuals
    if (Number.isFinite(visuals.stability) && /^(?:f\d+|fk\d+|s\d+)$/.test(id)) {
        partData.stability = visuals.stability;
    }
    if (power) partData.power = power;
    const partAbilities = {
        f3: { id: 'jekyllShield', name: 'Активная подвеска Jekyll', description: 'Раз за заезд смягчает первое столкновение с препятствием или спасает от жёсткого приземления.' },
        f9: { id: 'flowFrame', name: 'Трассовый баланс', description: 'На льду и сильном ветре теряется на 15% меньше скорости.' },
        f10: { id: 'landingFrame', name: 'Мягкая посадка', description: 'После успешного прыжка кратко ускоряет велосипед. Срабатывает не чаще раза в 5 секунд.' },
        e4: { id: 'nitro', name: 'Импульсный разгон', description: 'Нажми кнопку G, чтобы включить нитро: скорость и разгон повышаются на 2 секунды. Перезарядка — 8 секунд.' },
        e5: { id: 'nitro', name: 'Импульсный разгон', description: 'Нажми кнопку G, чтобы включить нитро: скорость и разгон повышаются на 2 секунды. Перезарядка — 8 секунд.' },
        fk8: { id: 'superJump', name: 'Пружинный прыжок', description: 'Прыжок становится на 35% выше и дольше держит велосипед в воздухе.' },
        f14: { id: 'fallResistance', name: 'Устойчивость к падениям', description: 'Не позволяет раме перевернуться и проиграть из-за удара, низкой стабильности или жёсткой посадки.' },
        ti5: { id: 'mudGrip', name: 'Грязевой протектор', description: 'В грязи и воде теряется на 20% меньше скорости.' },
        b7: { id: 'impactBrake', name: 'Контроль торможения', description: 'После столкновения замедление длится на 15% меньше.' },
        pd6: { id: 'macmillanBurst', name: 'Рычажный рывок', description: 'Нажми кнопку E на земле: велосипед мгновенно разгонится до разрешённой максимальной скорости. Три заряда за гонку.' }
    };
    if (partAbilities[id]) partData.ability = partAbilities[id];
    const couponPrice = WEAKER_LEGENDARY_COUPON_PRICES[id];
    if (rarity === 'legendary' && !partData.ability && Number.isFinite(couponPrice) && couponPrice >= 30) {
        partData.couponPrice = couponPrice;
    }
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
        // Хардтейлы
        part("f1", "Ardis Steel Frame", "common", 2, 1, 1, 1, 520, 0, {color:"#71717a",width:10,type:"hardtail",stability:20}),
        part("f2", "Trek Marlin Gen 3 Alpha Silver", "rare", 4, 3, 3, 2, 3000, 0, {color:"#0ea5e9",width:12,type:"hardtail",stability:22}),
        part("f4", "Giant Talon ALUXX 6061", "rare", 5, 4, 3, 2, 3600, 0, {color:"#ef4444",width:12,type:"hardtail",stability:23}),
        part("f5", "Specialized Rockhopper A1 Alloy", "rare", 5, 3, 4, 3, 3900, 0, {color:"#f59e0b",width:12,type:"hardtail",stability:23}),
        part("f6", "Cannondale Trail SmartForm C3", "rare", 4, 4, 4, 3, 4200, 0, {color:"#10b981",width:12,type:"hardtail",stability:24}),
        part("f7", "Marin Bobcat Trail Series 2", "rare", 5, 4, 5, 3, 4500, 0, {color:"#8b5cf6",width:12,type:"hardtail",stability:24}),
        // У двухподвесов скорость и ускорение снижены на 40%, результат округлён вниз.
        // Редкие двухподвесы стоят дороже хардтейлов и открывают задний амортизатор.
        part("f11", "Trek Fuel EX Alloy", "rare", 3, 3, 6, 3, 7800, 0, {color:"#14b8a6",width:14,type:"dh",stability:23}),
        part("f12", "Giant Trance X Alloy", "rare", 4, 3, 7, 4, 9600, 0, {color:"#06b6d4",width:14,type:"dh",stability:24}),
        part('f8', 'Trek Procaliber Carbon', 'legendary', 9, 7, 8, 5, 3500, 0, { color: '#b91c1c', width: 15, type: 'hardtail', stability: 26 }),
        part('f9', 'Giant XTC Advanced Carbon', 'legendary', 10, 8, 9, 5, 4000, 0, { color: '#3b82f6', width: 15, type: 'hardtail', stability: 26 }),
        part('f10', 'Specialized Epic Carbon', 'legendary', 11, 8, 10, 6, 4500, 0, { color: '#14b8a6', width: 15, type: 'hardtail', stability: 27 }),
        
        // Легендарные двухподвесы используют тот же штраф с округлением вниз.
        part('f3', 'Cannondale Jekyll Carbon', 'legendary', 4, 3, 8, 4, 5600, 0, { color: '#22c55e', width: 15, type: 'dh', stability: 26 }),
        part('f13', 'Specialized Stumpjumper EVO Carbon', 'legendary', 6, 4, 11, 6, 7000, 0, { color: '#f97316', width: 16, type: 'dh', stability: 27 }),
        part('f14', 'Laufmaschine Карла Дреза', 'special', 0, 0, 0, 0, 0, 0, { color: '#9a6538', width: 12, type: 'hardtail', stability: 1, specialHistoryFrame: true }),
        part('f15', 'Педальный велоципед Макмиллана', 'special', 4, 3, 3, 2, 0, 0, { color: '#8b5a2b', width: 12, type: 'hardtail', stability: 22, specialMacmillanFrame: true })
    ],

    // =====================================
    // ЗАДНИЕ АМОРТИЗАТОРЫ (Подвеска)
    // =====================================
    suspension: [
        part("s1", "Пружинный амортизатор", "common", 0, 0, 1, 0, 520, 0, {color:"#94a3b8",stability:24}),
        part("s2", "RockShox Monarch", "rare", 0, 0, 3, 0, 2400, 0, {color:"#38bdf8",stability:36}),
        part('s3', 'FOX FLOAT X2 Factory', 'legendary', 0, 0, 6, 0, 2200, 0, { color: '#fbbf24', stability: 48 }),
        part("s4", "FOX FLOAT DPS Performance", "rare", 0, 0, 4, 0, 3300, 0, {color:"#f97316",stability:39}),
        part("s5", "FOX FLOAT X Performance Elite", "rare", 0, 0, 5, 0, 4360, 0, {color:"#fb923c",stability:43}),
        part("s6", "DT Swiss R 535 ONE", "rare", 0, 0, 4, 0, 3900, 0, {color:"#e2e8f0",stability:41}),
        part('s7', 'DT Swiss R 535', 'legendary', 0, 0, 7, 0, 2700, 0, { color: '#facc15', stability: 52 })
    ],

    // =====================================
    // ВИЛКИ
    // =====================================
    forks: [
        part("fk1", "Жёсткая вилка Ardis", "common", 1, 1, 1, 1, 520, 0, {color:"#71717a",stability:0}),
        part("fk2", "SR Suntour XCT", "common", 1, 1, 2, 1, 780, 0, {color:"#a1a1aa",stability:7}),
        part("fk3", "SR Suntour XCM", "rare", 2, 2, 4, 2, 2100, 0, {color:"#000000",stability:11}),
        part("fk4", "RockShox Judy Silver", "rare", 3, 3, 5, 2, 3300, 0, {color:"#1e293b",stability:14}),
        part("fk5", "RockShox Recon Gold RL", "rare", 4, 4, 6, 3, 4500, 0, {color:"#fcd34d",stability:17}),
        part('fk6', 'RockShox SID Select', 'legendary', 7, 6, 9, 4, 2800, 0, { color: '#3b82f6', stability: 21 }),
        part('fk7', 'FOX 34 Float Performance', 'legendary', 8, 7, 10, 5, 3500, 0, { color: '#f59e0b', stability: 24 }),
        part('fk8', 'Cannondale Lefty Ocho', 'legendary', 9, 8, 11, 5, 4000, 0, { color: '#ef4444', stability: 19 })
    ],

    // =====================================
    // ЦЕПИ
    // =====================================
    chains: [
        part("ch1", "Ardis 7/8 Speed", "common", 1, 1, 0, 0, 400, 0, {color:"#a1a1aa"}),
        part("ch2", "KMC Z8", "common", 1, 2, 0, 0, 580, 0, {color:"#9ca3af"}),
        part("ch3", "KMC X10", "rare", 2, 3, 0, 0, 1360, 0, {color:"#e2e8f0"}),
        part("ch4", "Shimano HG601", "rare", 3, 4, 0, 0, 1960, 0, {color:"#93c5fd"}),
        part('ch5', 'SRAM GX Eagle Chain', 'legendary', 5, 6, 0, 0, 1200, 0, { color: '#d1d5db' }),
        part('ch6', 'Shimano XTR CN-M9100', 'legendary', 6, 7, 0, 0, 1600, 0, { color: '#fcd34d' })
    ],

    // =====================================
    // ТРАНСМИССИИ
    // =====================================
    drivetrain: [
        part("d1", "Ardis 3x7", "common", 2, 2, 0, 0, 660),
        part("d2", "Shimano Tourney TX", "common", 2, 2, 0, 0, 920),
        part("d3", "Shimano Acera M3000", "common", 3, 3, 0, 0, 1300),
        part("d4", "Shimano CUES U6000", "rare", 4, 4, 0, 0, 3000),
        part("d5", "Shimano Deore M6100", "rare", 5, 5, 0, 0, 4200),
        part("d6", "Shimano SLX M7100", "rare", 6, 6, 0, 0, 5700),
        part('d7', 'Shimano Deore XT M8100', 'legendary', 9, 8, 0, 0, 3000),
        part('d8', 'Shimano XTR M9100', 'legendary', 11, 10, 0, 0, 4000),
        part('d9', 'SRAM GX Eagle 1x12', 'legendary', 9, 9, 0, 0, 3200),
        part('d10', 'SRAM X0 Eagle 1x12', 'legendary', 10, 11, 0, 0, 3800)
    ],

    // =====================================
    // КАРЕТКИ
    // =====================================
    bottomBrackets: [
        part("bb1", "Каретка под квадрат", "common", 1, 1, 0, 0, 320),
        part("bb2", "Shimano BB-UN300", "common", 1, 2, 0, 0, 520),
        part("bb3", "Shimano Hollowtech II", "rare", 2, 3, 0, 0, 1360),
        part("bb4", "Shimano BB-MT500", "rare", 3, 4, 0, 0, 1960),
        part('bb5', 'Shimano XT BB-MT800', 'legendary', 5, 5, 0, 0, 1100),
        part('bb6', 'SRAM DUB', 'legendary', 5, 6, 0, 0, 1300)
    ],

    // =====================================
    // ШАТУНЫ
    // =====================================
    cranks: [
        part("cr1", "Стальные шатуны Ardis", "common", 1, 1, 0, 0, 400, 0, {color:"#71717a"}),
        part("cr2", "Prowheel Alloy", "common", 2, 2, 0, 0, 660, 0, {color:"#1e293b"}),
        part("cr3", "Shimano Acera", "common", 2, 3, 0, 0, 920, 0, {color:"#475569"}),
        part("cr4", "Shimano Deore", "rare", 3, 4, 0, 0, 1800, 0, {color:"#000000"}),
        part("cr5", "Shimano SLX M7100", "rare", 4, 5, 0, 0, 2860, 0, {color:"#1e293b"}),
        part('cr6', 'Shimano Deore XT', 'legendary', 6, 7, 0, 0, 1600, 0, { color: '#f8fafc' }),
        part('cr7', 'Shimano XTR', 'legendary', 8, 9, 0, 0, 2300, 0, { color: '#9ca3af' }),
        part('cr8', 'SRAM GX Eagle', 'legendary', 7, 8, 0, 0, 1900, 0, { color: '#111827' })
    ],

    // =====================================
    // КОЛЁСА
    // =====================================
    wheels: [
        part("w1", "Стертые покрышки и простые колёса", "common", 1, 1, 1, 2, 520, 0, {rimColor:"#52525b",radius:9,hubColor:"#a1a1aa"}),
        part("w2", "Giant GX03V Alloy", "common", 2, 2, 2, 2, 920, 0, {rimColor:"#3f3f46",radius:9.2,hubColor:"#e2e8f0"}),
        part("w3", "WTB ST i25", "rare", 3, 3, 3, 4, 2100, 0, {rimColor:"#1e293b",radius:9.5,hubColor:"#9ca3af"}),
        part("w4", "DT Swiss M 1900", "rare", 4, 4, 4, 5, 3600, 0, {rimColor:"#e2e8f0",radius:9.8,hubColor:"#ef4444"}),
        part('w5', 'DT Swiss XM 1700', 'legendary', 7, 6, 6, 7, 2300, 0, { rimColor: '#f43f5e', radius: 10.2, hubColor: '#f8fafc' }),
        part('w6', 'DT Swiss XRC 1200 Carbon', 'legendary', 9, 8, 8, 8, 3500, 0, { rimColor: '#fbbf24', radius: 10.5, hubColor: '#fcd34d' }),
        part('w7', 'Разновеликие деревянные колёса', 'special', 0, 0, 0, 0, 0, 0, { rimColor: '#8b5a2b', hubColor: '#563819', radius: 12, rearRadius: 15, frontRadius: 12 })
    ],

    // =====================================
    // ТОРМОЗА
    // =====================================
    brakes: [
        part("b1", "Старые V-Brakes", "common", 0, 0, 0, 3, 400),
        part("b2", "Shimano Tourney V-Brake", "common", 0, 0, 0, 4, 660),
        part("b3", "Shimano MT200 Hydraulic", "rare", 0, 0, 0, 6, 1800),
        part("b4", "Shimano Deore M6100", "rare", 0, 0, 0, 8, 3000),
        part("b5", "Shimano SLX M7100", "rare", 0, 0, 0, 9, 3900),
        part("b9", "Avid BB5", "rare", 0, 0, 0, 6, 5100),
        part('b6', 'Shimano Deore XT M8120', 'legendary', 0, 0, 0, 12, 2000),
        part('b7', 'Shimano XTR M9120', 'legendary', 0, 0, 0, 15, 2800),
        part('b8', 'SRAM Code RSC', 'legendary', 0, 0, 0, 14, 2600)
    ],

    // =====================================
    // ЭЛЕКТРОНИКА И МОТОРЫ
    // =====================================
    electronics: [
        part("e1", "Педальная тяга", "common", 0, 0, 2, 0, 520, 2),
        part("e2", "Shimano Steps E5000", "rare", 4, 5, -1, 0, 5400, 10),
        part("e3", "Bosch Performance Line", "rare", 6, 7, -2, 0, 7500, 18),
        part('e4', 'Bosch Performance Line CX', 'legendary', 10, 12, -3, 0, 4000, 28),
        part('e5', 'Specialized 2.2 Motor', 'legendary', 11, 13, -3, 0, 4500, 36)
    ],

    // =====================================
    // КАССЕТЫ
    // =====================================
    cassettes: [
        part("cs1", "Shimano Tourney 7-speed", "common", 1, 1, 0, 0, 400),
        part("cs2", "Shimano Acera 9-speed", "common", 2, 2, 0, 0, 780),
        part("cs3", "Shimano CUES 10-speed", "rare", 3, 4, 0, 0, 1800),
        part("cs4", "Shimano Deore 12-speed", "rare", 5, 5, 0, 0, 3000),
        part("cs5", "Shimano SLX 12-speed", "rare", 6, 6, 0, 0, 4200),
        part('cs6', 'Shimano XT 12-speed', 'legendary', 8, 8, 0, 0, 2200),
        part('cs7', 'Shimano XTR 12-speed', 'legendary', 10, 10, 0, 0, 3000)
    ],

    // =====================================
    // ЗАДНИЕ ПЕРЕКЛЮЧАТЕЛИ
    // =====================================
    derailleurs: [
        part("rd1", "Shimano Tourney RD-TY300", "common", 1, 1, 0, 0, 460),
        part("rd2", "Shimano Acera RD-M3020", "common", 2, 2, 0, 0, 920),
        part("rd3", "Shimano CUES RD-U6000", "rare", 3, 4, 0, 0, 1960),
        part("rd4", "Shimano Deore RD-M6100", "rare", 5, 5, 0, 0, 3000),
        part("rd5", "Shimano SLX RD-M7100", "rare", 6, 6, 0, 0, 4200),
        part('rd6', 'Shimano XT RD-M8100', 'legendary', 8, 8, 0, 0, 2200),
        part('rd7', 'Shimano XTR RD-M9100', 'legendary', 10, 10, 0, 0, 3000)
    ],

    // =====================================
    // МАНЕТКИ
    // =====================================
    shifters: [
        part("sh1", "Shimano Tourney SL-TX50", "common", 1, 1, 0, 0, 400),
        part("sh2", "Shimano Acera SL-M3000", "common", 2, 2, 0, 0, 780),
        part("sh3", "Shimano CUES SL-U6000", "rare", 3, 3, 0, 0, 1660),
        part("sh4", "Shimano Deore SL-M6100", "rare", 4, 5, 0, 0, 2560),
        part("sh5", "Shimano SLX SL-M7100", "rare", 5, 6, 0, 0, 3300),
        part('sh6', 'Shimano XT SL-M8100', 'legendary', 8, 8, 0, 0, 1800),
        part('sh7', 'Shimano XTR SL-M9100', 'legendary', 10, 10, 0, 0, 2500)
    ],

    // =====================================
    // РУЛИ
    // =====================================
    handlebars: [
        part("hb1", "Стальной руль 600 мм", "common", 0, 1, 1, 1, 260, 0, {color:"#a1a1aa",width:1.5}),
        part("hb2", "Alloy Riser 680 мм", "common", 1, 2, 2, 1, 660, 0, {color:"#1e293b",width:1.8}),
        part("hb3", "Giant Connect Trail 780 мм", "rare", 2, 3, 3, 2, 1500, 0, {color:"#cbd5e1",width:2.1}),
        part("hb4", "Race Face Chester", "rare", 3, 4, 4, 2, 2560, 0, {color:"#ef4444",width:2.1}),
        part('hb5', 'Renthal Fatbar Carbon', 'legendary', 5, 5, 6, 3, 1800, 0, { color: '#d97706', width: 2.5 }),
        part('hb6', 'Деревянный руль Дреза', 'special', 0, 0, 0, 0, 0, 0, { color: '#9a6538', width: 1.6 }),
        part('hb7', 'Кованый руль Макмиллана', 'special', 2, 3, 2, 1, 0, 0, { color: '#8b5a2b', width: 1.7 })
    ],

    // =====================================
    // ВЫНОСЫ
    // =====================================
    stems: [
        part("st1", "Стальной вынос", "common", 0, 1, 0, 0, 260),
        part("st2", "Alloy Ahead 60 mm", "common", 1, 2, 1, 0, 520),
        part("st3", "Race Face Ride", "rare", 2, 3, 2, 0, 1360),
        part('st4', 'Race Face Turbine', 'legendary', 4, 5, 3, 0, 1000),
        part('st5', 'Деревянный вынос Дреза', 'special', 0, 0, 0, 0, 0, 0, { color: '#9a6538' }),
        part('st6', 'Короткий кованый вынос Макмиллана', 'special', 1, 2, 1, 0, 0, 0, { color: '#8b5a2b' })
    ],

    // =====================================
    // СЁДЛА
    // =====================================
    saddles: [
        part("sa1", "Базовое седло", "common", 0, 0, 1, 0, 260, 0, {color:"#1e293b"}),
        part("sa2", "Giant Sport Saddle", "common", 1, 1, 2, 0, 660, 0, {color:"#334155"}),
        part("sa3", "Specialized Bridge Sport", "rare", 2, 2, 3, 0, 1500, 0, {color:"#ef4444"}),
        part("sa4", "WTB Volt", "rare", 3, 3, 4, 0, 2260, 0, {color:"#f8fafc"}),
        part('sa5', 'Fizik Terra Argo X3', 'legendary', 5, 4, 6, 0, 1400, 0, { color: '#f59e0b' }),
        part('sa6', 'Кожаное седло Дреза', 'special', 0, 0, 0, 0, 0, 0, { color: '#5b3824' }),
        part('sa7', 'Кожаное седло Макмиллана', 'special', 2, 2, 3, 0, 0, 0, { color: '#60452f' })
    ],

    // =====================================
    // ПОДСЕДЕЛЬНЫЕ ШТЫРИ
    // =====================================
    seatposts: [
        part("sp1", "Обычный стальной штырь", "common", 0, 0, 1, 0, 260, 0, {color:"#71717a"}),
        part("sp2", "Alloy Seatpost", "common", 1, 1, 2, 0, 580, 0, {color:"#1e293b"}),
        part("sp3", "KS Dropper Post", "rare", 2, 2, 4, 0, 2100, 0, {color:"#38bdf8"}),
        part('sp4', 'RockShox Reverb', 'legendary', 4, 3, 7, 0, 1600, 0, { color: '#facc15' })
    ],

    // =====================================
    // ПЕДАЛИ
    // =====================================
    pedals: [
        part("pd1", "Пластиковые платформы", "common", 0, 1, 1, 0, 260),
        part("pd2", "Aluminium Platform", "common", 1, 2, 2, 0, 660),
        part("pd3", "Shimano PD-M520", "rare", 2, 3, 3, 0, 1360),
        part("pd4", "Race Face Chester", "rare", 3, 4, 4, 0, 1960),
        part('pd5', 'Crankbrothers Mallet E', 'legendary', 5, 6, 6, 0, 1300),
        part('pd6', 'Рычажные педали Макмиллана', 'special', 2, 3, 3, 0, 0, 0, { color: '#8b5a2b', macmillanTreadles: true })
    ],

    // =====================================
    // ПОКРЫШКИ
    // =====================================
    tires: [
        part("ti1", "Базовые MTB 26\"", "common", 1, 1, 1, 1, 400, 0, {width:3}),
        part("ti2", "Schwalbe Smart Sam", "common", 2, 2, 2, 2, 780, 0, {width:3.5}),
        part("ti3", "Maxxis Ardent", "rare", 3, 3, 3, 3, 1660, 0, {width:3.8}),
        part("ti4", "Maxxis Rekon", "rare", 4, 4, 4, 4, 2400, 0, {width:4}),
        part('ti5', 'Maxxis Minion DHF', 'legendary', 5, 5, 7, 7, 1500, 0, { width: 4.5 }),
        part('ti6', 'Schwalbe Racing Ralph', 'legendary', 7, 7, 5, 4, 1700, 0, { width: 4.2 })
    ],

    // =====================================
    // ВТУЛКИ
    // =====================================
    hubs: [
        part("hu1", "Базовые втулки на гайках", "common", 1, 1, 0, 1, 320),
        part("hu2", "Shimano TX505", "common", 2, 2, 0, 1, 660),
        part("hu3", "Shimano Deore M6010", "rare", 3, 3, 0, 2, 1500),
        part("hu4", "DT Swiss 350", "rare", 4, 4, 0, 3, 2700),
        part('hu5', 'DT Swiss 240 EXP', 'legendary', 7, 7, 0, 4, 1800),
        part('hu6', 'Industry Nine Hydra', 'legendary', 8, 8, 0, 5, 2500)
    ],

    // =====================================
    // РАЙДЕРЫ (ГОНЩИКИ)
    // Райдеры дают тягу на подъёмах; исторический Дрез также добавляет стабильность.
    // =====================================
    riders: [
        part('r1', 'Школьник', 'common', 0, 0, 0, 0, 1000, 10),
        part('r2', 'Велолюбитель', 'common', 0, 0, 0, 0, 2800, 24),
        part('r3', 'Дорожник', 'common', 0, 0, 0, 0, 5800, 40),
        part('r4', 'Велокурьер', 'rare', 0, 0, 0, 0, 10000, 65),
        {
            id: 'r5',
            name: 'Джон',
            rarity: 'legendary',
            speed: 0,
            accel: 0,
            jump: 0,
            brake: 0,
            price: 100,
            power: 100,
            currency: 'coupon'
        },
        {
            id: 'r6',
            name: 'Карл Дрез',
            rarity: 'special',
            speed: 0,
            accel: 0,
            jump: 0,
            brake: 0,
            price: 0,
            power: 17,
            stability: 8,
            visuals: { jerseyColor: '#6b4d31', pantsColor: '#332c24', hatColor: '#30251e' }
        }
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
            common: 60,
            rare: 39,
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
            common: 45,
            rare: 45,
            legendary: 10
        }
    },

    {
        id: 'pro',
        name: 'Профессиональный контейнер',
        description: 'Высокий шанс на редкие и легендарные детали',
        icon: '🏆',
        currency: 'coins',
        price: 4000,
        chances: {
            common: 10,
            rare: 60,
            legendary: 30
        }
    },

    {
        id: 'coupon',
        name: 'Велоконтейнер',
        description: 'Сбалансированные шансы за 2 Велокупона',
        icon: '🎁',
        currency: 'coupon',
        price: 2,
        chances: {
            common: 60,
            rare: 35,
            legendary: 5
        }
    },
    {
        id: 'winner',
        name: 'Контейнер Победителя',
        description: 'Только редкие и легендарные детали',
        icon: '🏅',
        currency: 'coupon',
        price: 20,
        chances: { common: 0, rare: 60, legendary: 40 }
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
    ice_patch: { name: '\u041b\u0451\u0434', width: 110, height: 12, color: '#bae6fd' },
    bridge_gap: { name: '\u0420\u0430\u0437\u0440\u0443\u0448\u0435\u043d\u043d\u044b\u0439 \u043c\u043e\u0441\u0442', width: 90, height: 22, color: '#0f172a' },
    pulse_gate: { name: '\u0421\u0432\u0435\u0442\u043e\u0432\u043e\u0439 \u0437\u0430\u0442\u0432\u043e\u0440', width: 52, height: 56, color: '#c084fc' },
    rolling_boulder: { name: '\u041a\u0430\u0442\u044f\u0449\u0438\u0439\u0441\u044f \u0432\u0430\u043b\u0443\u043d', width: 42, height: 38, color: '#a8a29e' }
};

// Небольшие декорации-механики для исторической главы. Они дают короткую
// потерю скорости или требуют подпрыгнуть, но не добавляют сложных правил.
OBSTACLE_TYPES.cobblestones = { name: 'Булыжная мостовая', width: 92, height: 9, color: '#8b8174' };
OBSTACLE_TYPES.plank_bridge = { name: 'Деревянный настил', width: 118, height: 12, color: '#9a6538' };
OBSTACLE_TYPES.wooden_gate = { name: 'Садовая калитка', width: 48, height: 32, color: '#704522' };
OBSTACLE_TYPES.cliff = { name: 'Обрыв перед финишем', width: 150, height: 72, color: '#020617' };
OBSTACLE_TYPES.forge_slag = { name: 'Горячий шлак', width: 84, height: 15, color: '#f97316' };
OBSTACLE_TYPES.smith_hammer = { name: 'Кузнечный молот', width: 58, height: 68, color: '#64748b' };
OBSTACLE_TYPES.ford_stones = { name: 'Камни в ручье', width: 132, height: 25, color: '#38bdf8' };
OBSTACLE_TYPES.mill_paddle = { name: 'Лопасть водяного колеса', width: 62, height: 66, color: '#8b5a2b' };
OBSTACLE_TYPES.crank_rack = { name: 'Испытательный рычажный механизм', width: 66, height: 48, color: '#b7793f' };
OBSTACLE_TYPES.loose_planks = { name: 'Разобранный настил', width: 132, height: 25, color: '#5b3b26' };


// =========================================
// ТРАССЫ
// Награды за победу и поражение указаны
// отдельно для каждой трассы.
// =========================================

export const TRACKS_DB = [

    {
        id: 'sprint',
        musicTheme: 't0',
        name: 'Спринт 100м',
        rarity: 'common',
        alwaysUnlocked: true, // Всегда доступна
        length: 1000, 
        hills: 0,
        botMaxSpeed: 0,
        botAccel: 0,
        obstacles: 0,
        obstacleTypes: [],
        winReward: 0,
        lossReward: 0,
        couponReward: 0
    },

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
        obstacleTypes: ['rock', 'pit', 'log', 'ramp', 'cone', 'mud'],
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
        obstacleTypes: ['log', 'rock', 'pit', 'ramp', 'mud', 'water_splash', 'fallen_branch'],
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
        obstacleTypes: ['barrier', 'log', 'pit', 'ramp', 'pulse_gate', 'cone'],
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
        obstacleTypes: ['log', 'pit', 'wind_fan', 'water_splash', 'cone', 'fallen_branch'],
        winReward: 1200,
        lossReward: 90,
        couponReward: 2
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
        obstacleTypes: ['rock', 'pit', 'rolling_boulder', 'mud', 'bridge_gap', 'wind_fan'],
        winReward: 1450,
        lossReward: 100,
        couponReward: 2
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
        obstacleTypes: ['pit', 'ice_patch', 'water_splash', 'bridge_gap', 'fallen_branch', 'pulse_gate', 'wind_fan'],
        winReward: 1700,
        lossReward: 115,
        couponReward: 2
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
        obstacleTypes: ['pit', 'barrier', 'pulse_gate', 'rolling_boulder', 'mud', 'cone', 'bridge_gap'],
        winReward: 2000,
        lossReward: 130,
        couponReward: 2
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
        couponReward: 3
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
        obstacleTypes: ['rock', 'log', 'pit', 'ramp', 'barrier', 'cone', 'mud', 'fallen_branch', 'water_splash', 'wind_fan', 'ice_patch', 'bridge_gap', 'pulse_gate', 'rolling_boulder'],
        winReward: 2750,
        lossReward: 160,
        couponReward: 3
    }
];

export const HISTORY_TRACKS_DB = [
    {
        id: 'h1', historyChapter: 1, historyStage: 1, isHistory: true, musicTheme: '1h1',
        name: 'Первые метры · Мангейм', year: '1817', opponent: 'Макс',
        historyFeature: 'Булыжная дорожка замедляет наезд; небольшой трамплин позволяет перепрыгнуть её.',
        length: 15000, hills: 12, botMaxSpeed: 4, botAccel: 0.05,
        botDifficultyTrackId: 't1', obstacles: 3,
        obstacleTypes: ['pit', 'cobblestones', 'log', 'ramp'], winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ type: 'coupons', amount: 5 }]
    },
    {
        id: 'h2', historyChapter: 1, historyStage: 2, isHistory: true, musicTheme: '1h2',
        name: 'Дорога к Шветцингену', year: '1817', opponent: 'Макс',
        historyFeature: 'Корни и лужи сбивают темп; невысокие ветки можно перепрыгнуть.',
        length: 15000, hills: 15, botMaxSpeed: 4, botAccel: 0.05,
        botDifficultyTrackId: 't2', obstacles: 3,
        obstacleTypes: ['pit', 'fallen_branch', 'water_splash', 'cobblestones'], winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ category: 'handlebars', id: 'hb6' }]
    },
    {
        id: 'h3', historyChapter: 1, historyStage: 3, isHistory: true, musicTheme: '1h3',
        name: 'Аллея и деревянный мост', year: '1817', opponent: 'Макс',
        historyFeature: 'Узкий деревянный настил проходится на скорости, а бревно лучше перепрыгнуть.',
        length: 15000, hills: 18, botMaxSpeed: 4, botAccel: 0.05,
        botDifficultyTrackId: 't3', obstacles: 4,
        obstacleTypes: ['pit', 'plank_bridge', 'log', 'rock', 'ramp'], winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ category: 'wheels', id: 'w7' }]
    },
    {
        id: 'h4', historyChapter: 1, historyStage: 4, isHistory: true, musicTheme: '1h4',
        name: 'Парижский показ', year: '1818', opponent: 'Макс',
        historyFeature: 'Садовая калитка, короткие рампы, ямы и обрыв перед финишем напоминают о демонстрации в Люксембургском саду.',
        length: 15000, hills: 20, botMaxSpeed: 4, botAccel: 0.05,
        botDifficultyTrackId: 't4', obstacles: 5,
        obstacleTypes: ['pit', 'wooden_gate', 'ramp', 'fallen_branch', 'plank_bridge'], winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [
            { category: 'stems', id: 'st5' },
            { category: 'saddles', id: 'sa6' }
        ]
    },
    {
        id: 'h5', historyChapter: 1, historyStage: 5, isHistory: true, musicTheme: '1h5',
        name: 'Заезд Карла Дреза', year: '1818', opponent: 'Карл Дрез', historyCinematicLocation: 'ПАРИЖ',
        historyFeature: 'Финальный маршрут: ямы, лужи, камни, настил и обрыв у финиша. Соперник едет на Laufmaschine и отталкивается ногами.',
        length: 25000, hills: 30, botMaxSpeed: 6.5, botAccel: 0.08,
        botDifficultyTrackId: 't2', obstacles: 7,
        obstacleTypes: ['pit', 'plank_bridge', 'rock', 'water_splash', 'log', 'cobblestones'], winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [
            { category: 'frames', id: 'f14' },
            { category: 'riders', id: 'r6' }
        ]
    },
    {
        id: 'm1', historyChapter: 2, historyStage: 1, isHistory: true, musicTheme: '2h1',
        name: 'У кузницы Кейр-Милл', year: '1839', opponent: 'Макс и Лера',
        historyFeature: 'Испытание у кузницы: разгон через двор, прыжок через горячий шлак и молот, который по очереди опускается на дорогу.',
        length: 25000, hills: 24, botMaxSpeed: 10, botAccel: 0.12,
        botDifficultyTrackId: 't3', obstacles: 18,
        obstacleTypes: ['cobblestones', 'plank_bridge', 'log', 'ramp', 'pit', 'forge_slag', 'smith_hammer', 'rock', 'fallen_branch'],
        historyObstaclePattern: ['cobblestones', 'ramp', 'forge_slag', 'log', 'plank_bridge', 'smith_hammer', 'rock', 'cobblestones', 'ramp', 'forge_slag', 'fallen_branch', 'plank_bridge', 'log', 'ramp', 'log', 'cobblestones'],
        winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ type: 'coupons', amount: 6 }]
    },
    {
        id: 'm2', historyChapter: 2, historyStage: 2, isHistory: true, musicTheme: '2h2',
        name: 'Крутой спуск к ручью', year: '1839', opponent: 'Макс и Лера',
        historyFeature: 'Спуск к броду: промчись по камням через ручей, пережди просвет между лопастями мельницы и перепрыгни промоину.',
        length: 25000, hills: 30, botMaxSpeed: 10, botAccel: 0.12,
        botDifficultyTrackId: 't3', obstacles: 18,
        obstacleTypes: ['ramp', 'pit', 'rock', 'plank_bridge', 'water_splash', 'log', 'ford_stones', 'mill_paddle', 'rolling_boulder', 'cobblestones'],
        historyObstaclePattern: ['ford_stones', 'ramp', 'water_splash', 'rock', 'plank_bridge', 'mill_paddle', 'ford_stones', 'log', 'ramp', 'water_splash', 'water_splash', 'rolling_boulder', 'plank_bridge', 'ramp', 'ford_stones', 'cobblestones'],
        winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ category: 'stems', id: 'st6' }]
    },
    {
        id: 'm3', historyChapter: 2, historyStage: 3, isHistory: true, musicTheme: '2h3',
        name: 'Булыжная дорога в Дамфрис', year: '1840', opponent: 'Макс и Лера',
        historyFeature: 'Дорога-полигон: длинные булыжные полосы, грязевые колеи и вращающиеся шатунные рычаги проверяют прыжки и устойчивость.',
        length: 35000, hills: 42, botMaxSpeed: 10, botAccel: 0.12,
        botDifficultyTrackId: 't3', obstacles: 30,
        obstacleTypes: ['cobblestones', 'mud', 'ramp', 'pit', 'fallen_branch', 'rock', 'forge_slag', 'crank_rack', 'ford_stones', 'rolling_boulder', 'log'],
        historyObstaclePattern: ['cobblestones', 'crank_rack', 'fallen_branch', 'ramp', 'forge_slag', 'rock', 'cobblestones', 'rolling_boulder', 'ramp', 'mud', 'cobblestones', 'log', 'cobblestones', 'ford_stones', 'ramp', 'rock'],
        winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ category: 'saddles', id: 'sa7' }]
    },
    {
        id: 'm4', historyChapter: 2, historyStage: 4, isHistory: true, musicTheme: '2h4',
        name: 'Деревянные мостки', year: '1840', opponent: 'Макс и Лера',
        historyFeature: 'Мостовая гонка: трамплины ведут на шаткий деревянный мост с отсутствующими досками; за воротами ждёт ещё один разрыв.',
        length: 35000, hills: 48, botMaxSpeed: 10, botAccel: 0.12,
        botDifficultyTrackId: 't3', obstacles: 30,
        obstacleTypes: ['plank_bridge', 'pit', 'ramp', 'rock', 'cobblestones', 'log', 'wooden_gate', 'loose_planks', 'crank_rack', 'smith_hammer'],
        historyObstaclePattern: ['plank_bridge', 'ramp', 'wooden_gate', 'cobblestones', 'crank_rack', 'log', 'plank_bridge', 'rock', 'cobblestones', 'ramp', 'smith_hammer', 'log', 'loose_planks', 'wooden_gate', 'cobblestones', 'ramp', 'plank_bridge', 'rock', 'cobblestones', 'ramp', 'wooden_gate', 'log', 'plank_bridge', 'crank_rack', 'rock', 'cobblestones', 'ramp', 'log', 'wooden_gate', 'plank_bridge', 'ramp', 'rock'],
        winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [{ category: 'handlebars', id: 'hb7' }]
    },
    {
        id: 'm5', historyChapter: 2, historyStage: 5, isHistory: true, musicTheme: '2h5',
        name: 'Испытание Макмиллана', year: '1840', opponent: 'Киркпатрик Макмиллан', historyCinematicLocation: 'ДАМФРИС',
        historyFeature: 'Финальный маршрут собирает все испытания: молот у кузницы, брод и лопасти, булыжный подъём и короткий мостовой разрыв перед финишем.',
        length: 35000, hills: 55, botMaxSpeed: 10, botAccel: 0.12,
        botDifficultyTrackId: 't3', obstacles: 30,
        obstacleTypes: ['cobblestones', 'plank_bridge', 'pit', 'ramp', 'rock', 'water_splash', 'log', 'mud', 'forge_slag', 'smith_hammer', 'ford_stones', 'mill_paddle', 'crank_rack', 'loose_planks', 'rolling_boulder'],
        historyObstaclePattern: ['forge_slag', 'ramp', 'smith_hammer', 'cobblestones', 'ford_stones', 'loose_planks', 'ramp', 'crank_rack', 'rock', 'plank_bridge', 'mill_paddle', 'ramp', 'log', 'forge_slag', 'rolling_boulder', 'cobblestones', 'ramp', 'ford_stones', 'water_splash', 'cobblestones', 'smith_hammer', 'rock', 'plank_bridge', 'ramp', 'ford_stones', 'log', 'crank_rack', 'water_splash', 'mill_paddle', 'cobblestones', 'ramp', 'mud'],
        winReward: 0, lossReward: 0, couponReward: 0,
        historyRewards: [
            { category: 'frames', id: 'f15' },
            { category: 'pedals', id: 'pd6' }
        ]
    }
];
