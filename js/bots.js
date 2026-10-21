/**
 * bots.js — искусственный интеллект соперников.
 *
 * Три уровня:
 *  - novice («Новичок») — ходит случайными допустимыми картами;
 *  - normal («Норм»)    — отбивается минимальной подходящей картой, бережёт козыри;
 *  - pro («Профи»)      — помнит вышедшие и взятые карты, считает козыри,
 *                         подкидывает то, чем соперник вероятно не отобьётся.
 *
 * Главная функция: decide(state, player, level) → действие
 *   { type: 'attack', card } | { type: 'defend', index, card } | { type: 'transfer', card }
 *   | { type: 'take' } | { type: 'pass' }
 * Бот видит только свою руку и публичную информацию (стол, сброс, размеры рук, известные карты).
 */
(function (global) {
  'use strict';

  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : global.DurakEngine;

  /** Настройки «Профи» (подобраны симуляциями: node tests/simulate.js) */
  var TUNE = {
    takeInClassic: true,    // в «Подкидном» взвешивать «взять» против «отбиться»
    transferRisk: 4,        // штраф атаке, если соперник вероятно переведёт
    takeTempo: 8            // ценность «отбиться и перехватить ход»
  };

  /** «Цена» карты: младшие дешёвые, козыри дорогие */
  function value(c, trump) {
    return (c.rank - 6) + (c.suit === trump ? 10 : 0);
  }

  function rnd(s) { return E.rand(s); }

  function pick(s, arr) { return arr[Math.floor(rnd(s) * arr.length)]; }

  function minBy(arr, fn) {
    var best = null, bv = Infinity;
    arr.forEach(function (x) { var v = fn(x); if (v < bv) { bv = v; best = x; } });
    return best;
  }

  /**
   * Подобрать набор карт, чтобы отбить ВСЕ непобитые карты с минимальной суммарной ценой.
   * Перебор с отсечением (карт на столе не больше 6, так что это быстро).
   * Возвращает { cost, assign: [{ index, card }] } или null, если отбиться нельзя.
   */
  function planDefense(s, p) {
    var trump = s.trumpSuit;
    var hand = s.players[p].hand;
    var targets = [];
    s.table.forEach(function (t, i) {
      if (t.d) return;
      var opts = hand.filter(function (c) { return E.beats(t.a, c, trump); })
        .sort(function (x, y) { return value(x, trump) - value(y, trump); })
        .slice(0, 7);
      targets.push({ index: i, opts: opts });
    });
    if (targets.some(function (t) { return t.opts.length === 0; })) return null;
    // Сначала самые «трудные» карты — с меньшим числом вариантов
    targets.sort(function (x, y) { return x.opts.length - y.opts.length; });

    var best = null;
    var used = {};
    var cur = [];
    var minRest = [];
    for (var i = targets.length - 1, acc = 0; i >= 0; i--) {
      minRest[i] = acc;
      acc += value(targets[i].opts[0], trump);
    }
    (function dfs(k, cost) {
      if (k === targets.length) {
        best = { cost: cost, assign: cur.slice() };
        return;
      }
      var t = targets[k];
      for (var j = 0; j < t.opts.length; j++) {
        var c = t.opts[j];
        if (used[c.id]) continue;
        var nc = cost + value(c, trump);
        if (best && nc + minRest[k] >= best.cost) continue;
        used[c.id] = true;
        cur.push({ index: t.index, card: c });
        dfs(k + 1, nc);
        cur.pop();
        used[c.id] = false;
      }
    })(0, 0);
    return best;
  }

  /* ---------- Память «Профи» ---------- */

  /** Карты, которые бот p не видит (могут быть у соперников или в колоде) */
  function unknownPool(s, p) {
    var seen = {};
    s.players[p].hand.forEach(function (c) { seen[c.id] = true; });
    s.discard.forEach(function (c) { seen[c.id] = true; });
    s.table.forEach(function (t) { seen[t.a.id] = true; if (t.d) seen[t.d.id] = true; });
    s.known.forEach(function (ids, q) { if (q !== p) ids.forEach(function (id) { seen[id] = true; }); });
    if (s.deck.length > 0) seen[s.trumpCard.id] = true; // козырь лежит под колодой, его видно
    return E.fullDeck().filter(function (c) { return !seen[c.id]; });
  }

  /**
   * Вероятность того, что игрок target сможет побить карту card.
   * Учитываем известные карты у него на руке и неизвестный остаток.
   */
  function beatProb(s, me, target, card, pool) {
    var trump = s.trumpSuit;
    return holdProb(s, me, target, function (c) { return E.beats(card, c, trump); }, pool);
  }

  /** Вероятность, что у игрока target есть хотя бы одна карта, подходящая под условие fits */
  function holdProb(s, me, target, fits, pool) {
    var knownIds = s.known[target];
    for (var i = 0; i < knownIds.length; i++) {
      if (fits(E.cardFromId(knownIds[i]))) return 1;
    }
    var k = s.players[target].hand.length - knownIds.length; // неизвестных карт у него
    if (k <= 0) return 0;
    pool = pool || unknownPool(s, me);
    var U = pool.length;
    var B = pool.filter(fits).length;
    if (B === 0) return 0;
    if (k >= U) return 1;
    // P(ни одной бьющей среди k случайных карт из U)
    var pNone = 1;
    for (var j = 0; j < k; j++) pNone *= Math.max(0, (U - B - j)) / (U - j);
    return 1 - pNone;
  }

  /** Сколько у бота карт того же достоинства (для будущих подкидываний) */
  function sameRankCount(hand, c) {
    return hand.filter(function (x) { return x.rank === c.rank && x.id !== c.id; }).length;
  }

  /* ---------- Атака (первая карта захода) ---------- */

  function chooseAttack(s, p, level) {
    var hand = s.players[p].hand;
    var trump = s.trumpSuit;
    if (level === 'novice') return pick(s, hand);

    if (level === 'normal') {
      // Самая дешёвая карта; при равенстве — та, у которой есть пара для подкидывания
      return minBy(hand, function (c) { return value(c, trump) * 10 - sameRankCount(hand, c); });
    }

    // pro
    var pool = unknownPool(s, p);
    var endgame = s.deck.length === 0;
    var def = s.defender;
    return minBy(hand, function (c) {
      var pb = beatProb(s, p, def, c, pool);
      var pairs = hand.filter(function (x) { return x.rank === c.rank && x.id !== c.id && x.suit !== trump; }).length;
      if (endgame) {
        // В конце важнее заставить соперника взять и самому скинуть карты
        return value(c, trump) * 0.5 - 10 * (1 - pb) - 2.5 * pairs;
      }
      var cost = value(c, trump) - 4 * (1 - pb) - (c.rank <= 10 ? 1.5 * pairs : 0.5 * pairs);
      // В «Переводном» опасно ходить достоинством, которое соперник может перевести
      if (s.mode === 'transfer' && TUNE.transferRisk) {
        var pt = holdProb(s, p, def, function (x) { return x.rank === c.rank; }, pool);
        cost += TUNE.transferRisk * pt;
      }
      // Козыри рано не разбрасываем
      if (c.suit === trump && s.deck.length > 4) cost += 6;
      return cost;
    });
  }

  /* ---------- Подкидывание ---------- */

  function chooseThrow(s, p, level) {
    var legal = E.legalAttackCards(s, p);
    if (legal.length === 0) return null;
    var trump = s.trumpSuit;
    var hand = s.players[p].hand;
    var deckEmpty = s.deck.length === 0;

    if (level === 'novice') {
      return rnd(s) < 0.5 ? pick(s, legal) : null;
    }

    // Если можно скинуть все карты и выйти — так и делаем (только когда колода пуста)
    if (deckEmpty && legal.length >= hand.length) {
      return minBy(legal, function (c) { return value(c, trump); });
    }

    if (level === 'normal') {
      var maxRank = s.taking ? 12 : (deckEmpty ? 14 : 10);
      var cands = legal.filter(function (c) { return c.suit !== trump && c.rank <= maxRank; });
      if (!cands.length) return null;
      return minBy(cands, function (c) { return value(c, trump); });
    }

    // pro
    var pool = unknownPool(s, p);
    var def = s.defender;
    if (s.taking) {
      // Соперник и так берёт — сбрасываем мелочь, сильные карты ему не дарим
      var junk = legal.filter(function (c) {
        return c.suit !== trump && (c.rank <= 11 || (deckEmpty && c.rank <= 13));
      });
      if (!junk.length) return null;
      return minBy(junk, function (c) { return value(c, trump); });
    }
    var best = null, bestScore = Infinity;
    legal.forEach(function (c) {
      var isTrump = c.suit === trump;
      if (isTrump && !deckEmpty) return;
      var pb = beatProb(s, p, def, c, pool);
      var ok;
      if (deckEmpty) ok = !isTrump || pb < 0.3;
      else ok = value(c, trump) <= 6 || pb < 0.45;
      if (!ok) return;
      var score = pb * 10 + value(c, trump);
      if (score < bestScore) { bestScore = score; best = c; }
    });
    return best;
  }

  /* ---------- Защита ---------- */

  function chooseDefense(s, p, level) {
    var trump = s.trumpSuit;
    var hand = s.players[p].hand;
    var transferCards = s.mode === 'transfer'
      ? hand.filter(function (c) { return E.canTransfer(s, c.id); })
      : [];

    if (level === 'novice') {
      if (transferCards.length && rnd(s) < 0.5) return { type: 'transfer', card: pick(s, transferCards) };
      // Отбиваемся по одной карте случайной подходящей картой
      for (var i = 0; i < s.table.length; i++) {
        if (s.table[i].d) continue;
        var opts = hand.filter(function (c) { return E.canDefend(s, i, c.id); });
        if (!opts.length) return { type: 'take' };
        return { type: 'defend', index: i, card: pick(s, opts) };
      }
      return { type: 'take' };
    }

    var plan = planDefense(s, p);
    var cheapestTransfer = transferCards.length ? minBy(transferCards, function (c) { return value(c, trump); }) : null;

    if (level === 'normal') {
      if (cheapestTransfer && (cheapestTransfer.suit !== trump || !plan)) {
        return { type: 'transfer', card: cheapestTransfer };
      }
      if (!plan) return { type: 'take' };
      // Бережём старшие козыри в начале партии, если на столе мелочь
      var usesBigTrump = plan.assign.some(function (x) { return x.card.suit === trump && x.card.rank >= 12; });
      var cheapAttack = s.table.every(function (t) { return t.a.rank <= 10 && t.a.suit !== trump; });
      if (usesBigTrump && cheapAttack && s.deck.length >= 12 && s.table.length <= 2) return { type: 'take' };
      return firstStep(plan);
    }

    // pro
    var deckLeft = s.deck.length;
    if (cheapestTransfer) {
      // Некозырный перевод почти всегда дешевле отбоя: отбиваться пришлось бы картой старше.
      // Козырем переводим, только если иначе не отбиться или отбой выходит намного дороже.
      var tCost = value(cheapestTransfer, trump);
      if (cheapestTransfer.suit !== trump || !plan || plan.cost > tCost + 6) {
        return { type: 'transfer', card: cheapestTransfer };
      }
    }
    if (!plan) return { type: 'take' };
    // В эндшпиле брать почти всегда хуже; в «Переводном» симуляции показали, что лучше отбиваться
    if (deckLeft === 0 || s.mode === 'transfer' || !TUNE.takeInClassic) return firstStep(plan);

    // Сравниваем «отбиться» и «взять»
    var tableCards = [];
    s.table.forEach(function (t) { tableCards.push(t.a); if (t.d) tableCards.push(t.d); });
    var defendScore = -plan.cost + TUNE.takeTempo;
    var gain = tableCards.reduce(function (a, c) { return a + value(c, trump); }, 0);
    var takeScore = gain * 0.5 - tableCards.length * (deckLeft < 10 ? 4 : 2) - 5;
    if (hand.length + tableCards.length > 10) takeScore -= 6;
    if (takeScore > defendScore) return { type: 'take' };
    return firstStep(plan);
  }

  function firstStep(plan) {
    // Сначала кроем самую «трудную» карту плана (у неё меньше всего вариантов отбоя)
    var step = plan.assign[0];
    return { type: 'defend', index: step.index, card: step.card };
  }

  /* ---------- Главная функция ---------- */

  function decide(s, p, level) {
    var pnd = E.pending(s);
    if (!pnd) return null;
    // Защита от зацикливания: в затянутом эндшпиле боты иногда ходят непредсказуемо,
    // иначе одни и те же карты могут бесконечно ходить по кругу переводами и «Беру».
    if (s.deck.length === 0 && s.bout > 40 && rnd(s) < 0.35) level = 'novice';
    if (pnd.kind === 'attack' && pnd.player === p) {
      return { type: 'attack', card: chooseAttack(s, p, level) };
    }
    if (pnd.kind === 'defend' && pnd.player === p) {
      return chooseDefense(s, p, level);
    }
    if (pnd.kind === 'throw' && pnd.player === p) {
      var c = chooseThrow(s, p, level);
      return c ? { type: 'attack', card: c } : { type: 'pass' };
    }
    return null;
  }

  /** Применить решение бота к состоянию */
  function apply(s, p, action) {
    switch (action.type) {
      case 'attack': return E.attack(s, p, action.card.id);
      case 'defend': return E.defend(s, action.index, action.card.id);
      case 'transfer': return E.transfer(s, action.card.id);
      case 'take': return E.take(s);
      case 'pass': return E.pass(s, p);
    }
    return { ok: false, error: 'unknown action' };
  }

  /**
   * Доиграть партию до конца за всех игроков ботами (без анимаций).
   * Используется, когда живой игрок уже вышел, а остальные ещё играют.
   */
  function playOut(s, levels, maxSteps) {
    maxSteps = maxSteps || 5000;
    for (var i = 0; i < maxSteps && !s.over; i++) {
      var pnd = E.pending(s);
      if (pnd.kind === 'resolve') { E.resolve(s); continue; }
      var act = decide(s, pnd.player, levels[pnd.player] || 'normal');
      var r = apply(s, pnd.player, act);
      if (!r.ok) {
        // Подстраховка: если решение вдруг недопустимо — безопасный ход
        if (pnd.kind === 'defend') E.take(s);
        else if (pnd.kind === 'throw') E.pass(s, pnd.player);
        else E.attack(s, pnd.player, s.players[pnd.player].hand[0].id);
      }
    }
    if (!s.over) {
      // Совсем крайний случай: дураком считаем того, у кого больше всего карт
      var worst = 0;
      s.players.forEach(function (pl, i) { if (pl.hand.length > s.players[worst].hand.length) worst = i; });
      s.over = true;
      s.result = { draw: false, durak: worst };
    }
    return s;
  }

  var Bots = {
    TUNE: TUNE,
    value: value,
    planDefense: planDefense,
    beatProb: beatProb,
    unknownPool: unknownPool,
    decide: decide,
    apply: apply,
    playOut: playOut
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else global.DurakBots = Bots;
})(typeof window !== 'undefined' ? window : this);
