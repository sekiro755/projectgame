/**
 * progress.js — прогресс игрока: монеты, опыт и ранги, скины, статистика,
 * ежедневные задания, бонус за вход. Без DOM: только данные и правила начисления.
 *
 * Сохранение: VK Storage (VKWebAppStorageSet) + запасной localStorage.
 * При загрузке берём более свежую из двух копий (по метке времени ts).
 */
(function (global) {
  'use strict';

  var SAVE_KEY = 'durak_save_v1'; // VK Storage: ключ из латиницы/цифр/_/-, значение до 4096 байт

  /** Ранги по уровням */
  var RANKS = [
    { level: 1, name: 'Салага' },
    { level: 3, name: 'Шарящий' },
    { level: 6, name: 'Козырный' },
    { level: 10, name: 'Легенда двора' },
    { level: 15, name: 'Король подкидного' }
  ];

  /**
   * Скины: рубашка карт + стол. Часть открыта сразу,
   * остальные — за уровень, за монеты или за просмотр рекламы (ads — сколько роликов нужно).
   */
  var SKINS = [
    { id: 'neon', name: 'Неон', desc: 'Фиолетовое свечение и бирюза', level: 1, price: 0, ads: 0 },
    { id: 'space', name: 'Космос', desc: 'Звёзды, планеты и туманности', level: 1, price: 0, ads: 0 },
    { id: 'sunset', name: 'Аниме-закат', desc: 'Ретро-солнце и розовое небо', level: 4, price: 300, ads: 1 },
    { id: 'pixel', name: 'Пиксель 8-бит', desc: 'Олдскульные пиксели', level: 7, price: 600, ads: 2 },
    { id: 'graffiti', name: 'Граффити', desc: 'Краска, кирпич и стрит-арт', level: 10, price: 900, ads: 3 }
  ];

  /** Пул ежедневных заданий. type — событие, которое двигает прогресс */
  var QUEST_POOL = [
    { id: 'win3', type: 'win', target: 3, reward: 60, text: 'Выиграй 3 партии' },
    { id: 'ace', type: 'defendAce', target: 1, reward: 30, text: 'Отбейся тузом' },
    { id: 'transfer2', type: 'transfer', target: 2, reward: 40, text: 'Переведи 2 раза', hint: 'в режиме «Переводной»' },
    { id: 'play5', type: 'game', target: 5, reward: 40, text: 'Сыграй 5 партий' },
    { id: 'pro1', type: 'winPro', target: 1, reward: 70, text: 'Обыграй бота «Профи»' },
    { id: 'throw8', type: 'throwIn', target: 8, reward: 35, text: 'Подкинь 8 карт' },
    { id: 'trump5', type: 'defendTrump', target: 5, reward: 35, text: 'Отбейся козырем 5 раз' },
    { id: 'emoji3', type: 'emoji', target: 3, reward: 20, text: 'Кинь 3 эмодзи в соперников' },
    { id: 'multi1', type: 'winMulti', target: 1, reward: 50, text: 'Победи в партии на 3–4 игроков' },
    { id: 'streak2', type: 'streak', target: 2, reward: 50, text: 'Выиграй 2 партии подряд', setMax: true }
  ];
  var FIRST_DAY_QUESTS = ['win3', 'ace', 'transfer2'];

  /** Бонус за вход: 7 дней подряд, потом цикл повторяется */
  var DAILY_REWARDS = [20, 30, 40, 50, 70, 90, 150];

  var AD_BONUS_COINS = 30;
  var AD_BONUS_LIMIT = 5;

  function defaults() {
    return {
      v: 1,
      ts: 0,
      coins: 100,
      xp: 0,
      skins: ['neon', 'space'],
      back: 'neon',
      table: 'neon',
      adSkin: {},                 // прогресс просмотров рекламы по скинам
      stats: { games: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0, transfers: 0 },
      quests: { day: '', list: [] },
      daily: { last: '', streak: 0 },
      adBonus: { day: '', n: 0 },
      flags: { tut: false, fav: false, sound: true, vibro: true, fast: false, hints: {} },
      setup: { mode: 'classic', diff: 'normal', players: 2 }
    };
  }

  var data = defaults();
  var saveTimer = null;

  /* ---------- Даты ---------- */

  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  /** Простой хеш строки — чтобы задания дня выбирались одинаково при перезапуске */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- Загрузка / сохранение ---------- */

  /** Аккуратно накладываем сохранение на значения по умолчанию (на случай новых полей) */
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in saved)) return;
      var b = base[k], v = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
        // Объекты с произвольными ключами (подсказки, прогресс рекламы) берём целиком
        base[k] = Object.keys(b).length ? merge(b, v) : v;
      } else if (typeof v === typeof b || b === null) {
        base[k] = v;
      }
    });
    return base;
  }

  function parse(str) {
    try { return str ? JSON.parse(str) : null; } catch (e) { return null; }
  }

  function load() {
    var local = null;
    try { local = parse(global.localStorage.getItem(SAVE_KEY)); } catch (e) { /* приватный режим */ }
    var VK = global.VK;
    var remote = VK && VK.available() ? VK.storageGet(SAVE_KEY).then(parse).catch(function () { return null; }) : Promise.resolve(null);
    return remote.then(function (rem) {
      var best = local;
      if (rem && (!best || (rem.ts || 0) > (best.ts || 0))) best = rem;
      data = merge(defaults(), best);
      return data;
    });
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    data.ts = Date.now();
    var json = JSON.stringify(data);
    try { global.localStorage.setItem(SAVE_KEY, json); } catch (e) { /* нет места или запрещено */ }
    var VK = global.VK;
    if (VK && VK.available()) {
      if (json.length > 4000) {
        // Не должно случаться, но на всякий случай урезаем некритичное
        data.flags.hints = {};
        json = JSON.stringify(data);
      }
      VK.storageSet(SAVE_KEY, json).catch(function () { /* сохранится в localStorage */ });
    }
  }

  /** Отложенное сохранение, чтобы не дёргать хранилище на каждое событие */
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(saveNow, 600);
  }

  /* ---------- Уровни и ранги ---------- */

  function xpForLevel(level) { return 80 + 40 * (level - 1); }

  function levelInfo(xp) {
    if (xp == null) xp = data.xp;
    var level = 1, rest = xp;
    while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++; }
    return { level: level, cur: rest, need: xpForLevel(level), rank: rankFor(level) };
  }

  function rankFor(level) {
    var name = RANKS[0].name;
    RANKS.forEach(function (r) { if (level >= r.level) name = r.name; });
    return name;
  }

  function nextRank(level) {
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].level > level) return RANKS[i];
    return null;
  }

  /** Добавить опыт; вернуть сведения о повышении уровня и открывшихся скинах */
  function addXp(n) {
    var before = levelInfo();
    data.xp += n;
    var after = levelInfo();
    var unlocked = checkLevelUnlocks();
    save();
    return {
      levelUp: after.level > before.level,
      level: after.level,
      rankUp: after.rank !== before.rank,
      rank: after.rank,
      unlocked: unlocked
    };
  }

  function addCoins(n) {
    data.coins = Math.max(0, data.coins + n);
    save();
    return data.coins;
  }

  /* ---------- Скины ---------- */

  function skin(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return null;
  }

  function owns(id) { return data.skins.indexOf(id) >= 0; }

  function unlockSkin(id) {
    if (!owns(id)) data.skins.push(id);
    save();
  }

  /** Скины, которые открываются автоматически при достижении уровня */
  function checkLevelUnlocks() {
    var lvl = levelInfo().level;
    var res = [];
    SKINS.forEach(function (s) {
      if (!owns(s.id) && lvl >= s.level) { data.skins.push(s.id); res.push(s); }
    });
    return res;
  }

  function buySkin(id) {
    var s = skin(id);
    if (!s || owns(id) || data.coins < s.price) return false;
    data.coins -= s.price;
    unlockSkin(id);
    return true;
  }

  /** Засчитать просмотр рекламы для скина. Вернёт true, если скин открылся */
  function adWatchedForSkin(id) {
    var s = skin(id);
    if (!s || owns(id)) return false;
    data.adSkin[id] = (data.adSkin[id] || 0) + 1;
    if (data.adSkin[id] >= s.ads) { unlockSkin(id); return true; }
    save();
    return false;
  }

  function selectSkin(kind, id) {
    if (!owns(id)) return false;
    if (kind === 'back') data.back = id; else data.table = id;
    save();
    return true;
  }

  /* ---------- Ежедневные задания ---------- */

  function questDef(id) {
    for (var i = 0; i < QUEST_POOL.length; i++) if (QUEST_POOL[i].id === id) return QUEST_POOL[i];
    return null;
  }

  /** Новый день — новые задания (в самый первый день — три классических) */
  function ensureQuests() {
    var today = dayKey();
    if (data.quests.day === today && data.quests.list.length) return false;
    var ids;
    if (!data.quests.day) {
      ids = FIRST_DAY_QUESTS.slice();
    } else {
      var pool = QUEST_POOL.map(function (q) { return q.id; });
      var h = hash(today);
      ids = [];
      while (ids.length < 3) {
        var idx = h % pool.length;
        ids.push(pool.splice(idx, 1)[0]);
        h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
      }
    }
    data.quests = { day: today, list: ids.map(function (id) { return { id: id, p: 0, done: false, claimed: false }; }) };
    save();
    return true;
  }

  function quests() {
    ensureQuests();
    return data.quests.list.map(function (q) {
      var d = questDef(q.id) || {};
      return { id: q.id, text: d.text, hint: d.hint, target: d.target, reward: d.reward, p: Math.min(q.p, d.target), done: q.done, claimed: q.claimed };
    });
  }

  /** Событие для заданий. Возвращает задания, которые только что выполнены */
  function questEvent(type, amount) {
    ensureQuests();
    if (amount == null) amount = 1;
    var completed = [];
    data.quests.list.forEach(function (q) {
      var d = questDef(q.id);
      if (!d || d.type !== type || q.done) return;
      q.p = d.setMax ? Math.max(q.p, amount) : q.p + amount;
      if (q.p >= d.target) { q.done = true; completed.push(d); }
    });
    save();
    return completed;
  }

  function claimQuest(id) {
    var q = data.quests.list.filter(function (x) { return x.id === id; })[0];
    var d = questDef(id);
    if (!q || !d || !q.done || q.claimed) return 0;
    q.claimed = true;
    addCoins(d.reward);
    return d.reward;
  }

  function claimableQuests() {
    return data.quests.list.filter(function (q) { return q.done && !q.claimed; }).length;
  }

  /* ---------- Бонус за вход ---------- */

  function dailyStatus() {
    var today = dayKey();
    if (data.daily.last === today) {
      return { available: false, day: data.daily.streak, reward: 0, rewards: DAILY_REWARDS };
    }
    var day = data.daily.last === yesterdayKey() ? data.daily.streak + 1 : 1;
    var reward = DAILY_REWARDS[(day - 1) % DAILY_REWARDS.length];
    return { available: true, day: day, reward: reward, rewards: DAILY_REWARDS };
  }

  function claimDaily() {
    var st = dailyStatus();
    if (!st.available) return 0;
    data.daily = { last: dayKey(), streak: st.day };
    addCoins(st.reward);
    return st.reward;
  }

  /* ---------- Бонусные монеты за рекламу (лимит в день) ---------- */

  function adBonusLeft() {
    if (data.adBonus.day !== dayKey()) return AD_BONUS_LIMIT;
    return Math.max(0, AD_BONUS_LIMIT - data.adBonus.n);
  }

  function useAdBonus() {
    if (adBonusLeft() <= 0) return 0;
    if (data.adBonus.day !== dayKey()) data.adBonus = { day: dayKey(), n: 0 };
    data.adBonus.n++;
    addCoins(AD_BONUS_COINS);
    return AD_BONUS_COINS;
  }

  /* ---------- Итоги партии ---------- */

  /**
   * Записать результат партии и начислить награды.
   * r = { outcome: 'win' | 'lose' | 'draw', diff, players, tutorial }
   */
  function recordGame(r) {
    var st = data.stats;
    var diffIdx = { novice: 0, normal: 1, pro: 2 }[r.diff] || 0;
    var coins = 0, xp = 0, streakBonus = 0;
    st.games++;
    if (r.outcome === 'win') {
      st.wins++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
      coins = 20 + diffIdx * 12 + (r.players - 2) * 6;
      xp = 30 + diffIdx * 12 + (r.players - 2) * 5;
      if (st.streak >= 2) streakBonus = Math.min(5 * st.streak, 25);
    } else if (r.outcome === 'lose') {
      st.losses++;
      st.streak = 0;
      coins = 5;
      xp = 10 + diffIdx * 3;
    } else {
      st.draws++;
      coins = 10;
      xp = 15 + diffIdx * 4;
    }
    if (r.tutorial) coins += 50; // награда за обучение
    addCoins(coins + streakBonus);
    var lv = addXp(xp);
    save();
    return { coins: coins, streakBonus: streakBonus, xp: xp, streak: st.streak, level: lv };
  }

  function winrate() {
    var st = data.stats;
    return st.games ? Math.round(100 * st.wins / st.games) : 0;
  }

  global.Progress = {
    SKINS: SKINS,
    RANKS: RANKS,
    DAILY_REWARDS: DAILY_REWARDS,
    AD_BONUS_COINS: AD_BONUS_COINS,
    AD_BONUS_LIMIT: AD_BONUS_LIMIT,
    get data() { return data; },
    load: load,
    save: save,
    saveNow: saveNow,
    dayKey: dayKey,
    levelInfo: levelInfo,
    nextRank: nextRank,
    addXp: addXp,
    addCoins: addCoins,
    skin: skin,
    owns: owns,
    buySkin: buySkin,
    adWatchedForSkin: adWatchedForSkin,
    selectSkin: selectSkin,
    checkLevelUnlocks: checkLevelUnlocks,
    ensureQuests: ensureQuests,
    quests: quests,
    questEvent: questEvent,
    claimQuest: claimQuest,
    claimableQuests: claimableQuests,
    dailyStatus: dailyStatus,
    claimDaily: claimDaily,
    adBonusLeft: adBonusLeft,
    useAdBonus: useAdBonus,
    recordGame: recordGame,
    winrate: winrate
  };
})(window);
