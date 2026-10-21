/**
 * engine.js — правила игры «Дурак» (подкидной и переводной).
 *
 * Здесь только чистая логика: никакого DOM, звуков и анимаций.
 * Состояние партии — обычный JSON-объект, поэтому его легко клонировать
 * (боты «Профи» прогоняют симуляции) и проверять тестами в Node.
 *
 * Основные понятия:
 *  - attacker    — главный атакующий текущего захода;
 *  - defender    — отбивающийся;
 *  - boutStarter — кто начал заход (с него начинается добор карт);
 *  - table       — пары на столе: { a: атакующая карта, d: отбивающая | null, by: кто положил };
 *  - taking      — отбивающийся сказал «Беру», остальные ещё могут подкинуть;
 *  - passed      — кто из атакующих уже сказал «Пас/Бито» с момента последнего изменения стола;
 *  - known       — карты, которые публично известны у игрока на руках (взятые со стола, козырь со дна).
 */
(function (global) {
  'use strict';

  var SUITS = ['S', 'C', 'D', 'H']; // пики, трефы, бубны, червы
  var RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
  var SUIT_SYMBOL = { S: '♠', C: '♣', D: '♦', H: '♥' };
  var SUIT_NAME = { S: 'пики', C: 'трефы', D: 'бубны', H: 'червы' };
  var RANK_LABEL = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
  var HAND_SIZE = 6; // до скольки добираем
  var MAX_TABLE = 6; // максимум атакующих карт за один заход

  /* ---------- Карты ---------- */

  function makeCard(suit, rank) {
    return { id: suit + rank, suit: suit, rank: rank };
  }

  /** Карта по id вида "H14" */
  function cardFromId(id) {
    return makeCard(id[0], Number(id.slice(1)));
  }

  function cardLabel(c) {
    return RANK_LABEL[c.rank] + SUIT_SYMBOL[c.suit];
  }

  /** Бьёт ли карта d карту a при козыре trump */
  function beats(a, d, trump) {
    if (d.suit === a.suit) return d.rank > a.rank;
    return d.suit === trump && a.suit !== trump;
  }

  /** Полная колода из 36 карт */
  function fullDeck() {
    var deck = [];
    SUITS.forEach(function (s) {
      RANKS.forEach(function (r) { deck.push(makeCard(s, r)); });
    });
    return deck;
  }

  /** Сортировка руки: сначала некозырные по мастям, козыри в конце, внутри — по старшинству */
  function sortHand(hand, trump) {
    var order = { S: 0, C: 1, D: 2, H: 3 };
    return hand.slice().sort(function (x, y) {
      var tx = x.suit === trump ? 1 : 0;
      var ty = y.suit === trump ? 1 : 0;
      if (tx !== ty) return tx - ty;
      if (x.suit !== y.suit) return order[x.suit] - order[y.suit];
      return x.rank - y.rank;
    });
  }

  /* ---------- Случайные числа (детерминированные, чтобы тесты были повторяемыми) ---------- */

  function rand(s) {
    // mulberry32: состояние хранится прямо в объекте партии
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    var t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function shuffle(s, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand(s) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ---------- Создание партии ---------- */

  /**
   * Создать новую партию.
   * @param {object} opts
   *   numPlayers — 2..4, mode — 'classic' | 'transfer', seed — число (необязательно),
   *   forceFirst — индекс игрока, который обязан ходить первым (для обучения),
   *   deck — заранее заданная колода (для тестов; последняя карта массива — верх колоды).
   */
  function createGame(opts) {
    opts = opts || {};
    var n = Math.max(2, Math.min(4, opts.numPlayers || 2));
    var s = {
      mode: opts.mode === 'transfer' ? 'transfer' : 'classic',
      n: n,
      players: [],
      deck: [],
      trumpCard: null,
      trumpSuit: null,
      discard: [],
      table: [],
      attacker: 0,
      defender: 1,
      boutStarter: 0,
      taking: false,
      passed: [],
      known: [],
      finishOrder: [],
      over: false,
      result: null,
      bout: 1,
      rng: (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2147483647)) | 0,
      first: null
    };
    for (var i = 0; i < n; i++) {
      s.players.push({ hand: [], finished: false });
      s.known.push([]);
    }

    s.deck = opts.deck ? opts.deck.map(function (c) { return makeCard(c.suit, c.rank); }) : shuffle(s, fullDeck());

    // Раздаём по одной карте по кругу, пока у всех не будет по 6
    for (var r = 0; r < HAND_SIZE; r++) {
      for (var p = 0; p < n; p++) s.players[p].hand.push(s.deck.pop());
    }

    // Козырь — последняя (нижняя) карта колоды, она лежит открыто
    s.trumpCard = s.deck[0];
    s.trumpSuit = s.trumpCard.suit;

    var first = findFirstAttacker(s);
    if (opts.forceFirst != null && first.player !== opts.forceFirst) {
      // Для обучения: меняем руки местами, чтобы первым ходил нужный игрок
      var a = s.players[first.player].hand;
      s.players[first.player].hand = s.players[opts.forceFirst].hand;
      s.players[opts.forceFirst].hand = a;
      first = { player: opts.forceFirst, card: first.card, reason: first.reason };
    }
    s.first = first;
    s.attacker = first.player;
    s.boutStarter = first.player;
    s.defender = nextActive(s, first.player);
    return s;
  }

  /** Первым ходит игрок с младшим козырем; если козырей ни у кого нет — с самой младшей картой */
  function findFirstAttacker(s) {
    var best = null;
    s.players.forEach(function (pl, idx) {
      pl.hand.forEach(function (c) {
        if (c.suit !== s.trumpSuit) return;
        if (!best || c.rank < best.card.rank) best = { player: idx, card: c, reason: 'trump' };
      });
    });
    if (best) return best;
    // Козырей нет ни у кого — ищем самую младшую карту, при равенстве выбираем случайно
    var minRank = 99;
    var cands = [];
    s.players.forEach(function (pl, idx) {
      pl.hand.forEach(function (c) {
        if (c.rank < minRank) { minRank = c.rank; cands = []; }
        if (c.rank === minRank) cands.push({ player: idx, card: c, reason: 'lowest' });
      });
    });
    return cands[Math.floor(rand(s) * cands.length)];
  }

  /* ---------- Вспомогательные проверки ---------- */

  /** Игрок вышел из игры: карт на руках нет и колода пуста */
  function isOut(s, p) {
    return s.players[p].hand.length === 0 && s.deck.length === 0;
  }

  /** Следующий по часовой стрелке игрок, который ещё в игре (или -1) */
  function nextActive(s, from) {
    for (var i = 1; i < s.n; i++) {
      var idx = (from + i) % s.n;
      if (!isOut(s, idx)) return idx;
    }
    return -1;
  }

  /** Сколько карт на столе ещё не побито */
  function unbeatenCount(s) {
    var k = 0;
    for (var i = 0; i < s.table.length; i++) if (!s.table[i].d) k++;
    return k;
  }

  /** Достоинства, которые уже есть на столе (по ним можно подкидывать и переводить) */
  function tableRanks(s) {
    var set = {};
    s.table.forEach(function (t) {
      set[t.a.rank] = true;
      if (t.d) set[t.d.rank] = true;
    });
    return set;
  }

  /**
   * Можно ли положить ещё одну атакующую карту:
   *  - всего за заход не больше 6 карт;
   *  - непобитых карт не больше, чем карт на руках у отбивающегося
   *    (это же правило действует и после «Беру»).
   */
  function canAddAttack(s) {
    if (s.table.length >= MAX_TABLE) return false;
    return unbeatenCount(s) < s.players[s.defender].hand.length;
  }

  /** Порядок подкидывающих: от главного атакующего по часовой, без отбивающегося */
  function throwerOrder(s) {
    var order = [];
    for (var i = 0; i < s.n; i++) {
      var idx = (s.attacker + i) % s.n;
      if (idx === s.defender) continue;
      if (s.players[idx].hand.length === 0) continue;
      order.push(idx);
    }
    return order;
  }

  function findInHand(s, p, cardId) {
    var hand = s.players[p].hand;
    for (var i = 0; i < hand.length; i++) if (hand[i].id === cardId) return i;
    return -1;
  }

  function removeFromHand(s, p, cardId) {
    var i = findInHand(s, p, cardId);
    var c = s.players[p].hand.splice(i, 1)[0];
    // Карта ушла с руки — больше не «известна» как карта на руке
    var k = s.known[p].indexOf(cardId);
    if (k >= 0) s.known[p].splice(k, 1);
    return c;
  }

  /* ---------- Что можно сделать ---------- */

  /** Карты, которыми игрок p может сейчас атаковать или подкинуть */
  function legalAttackCards(s, p) {
    if (s.over || p === s.defender) return [];
    var hand = s.players[p].hand;
    if (s.table.length === 0) return p === s.attacker ? hand.slice() : [];
    if (!canAddAttack(s)) return [];
    var ranks = tableRanks(s);
    return hand.filter(function (c) { return ranks[c.rank]; });
  }

  function canAttack(s, p, cardId) {
    return legalAttackCards(s, p).some(function (c) { return c.id === cardId; });
  }

  /** Может ли отбивающийся побить карту на позиции idx картой cardId */
  function canDefend(s, idx, cardId) {
    if (s.over || s.taking) return false;
    var pair = s.table[idx];
    if (!pair || pair.d) return false;
    var hi = findInHand(s, s.defender, cardId);
    if (hi < 0) return false;
    return beats(pair.a, s.players[s.defender].hand[hi], s.trumpSuit);
  }

  /** Индексы непобитых карт, которые можно побить этой картой */
  function defenseTargets(s, cardId) {
    var res = [];
    for (var i = 0; i < s.table.length; i++) if (canDefend(s, i, cardId)) res.push(i);
    return res;
  }

  /** Кому уйдёт ход при переводе */
  function transferTarget(s) {
    return nextActive(s, s.defender);
  }

  /**
   * Перевод (только в «Переводном»):
   *  - ещё ни одна карта на столе не побита и «Беру» не сказано;
   *  - кладём карту того же достоинства, что лежит на столе;
   *  - у следующего игрока должно хватить карт, чтобы отбиться от всех карт на столе.
   */
  function canTransfer(s, cardId) {
    if (s.over || s.mode !== 'transfer' || s.taking || s.table.length === 0) return false;
    if (s.table.some(function (t) { return t.d; })) return false;
    if (s.table.length + 1 > MAX_TABLE) return false;
    var hi = findInHand(s, s.defender, cardId);
    if (hi < 0) return false;
    if (s.players[s.defender].hand[hi].rank !== s.table[0].a.rank) return false;
    var t = transferTarget(s);
    if (t < 0 || t === s.defender) return false;
    return s.players[t].hand.length >= s.table.length + 1;
  }

  function canTake(s) {
    return !s.over && !s.taking && unbeatenCount(s) > 0;
  }

  /** «Пас/Бито» можно сказать, когда всё побито или отбивающийся уже берёт */
  function canPass(s, p) {
    if (s.over || p === s.defender || s.table.length === 0) return false;
    if (s.passed.indexOf(p) >= 0) return false;
    return s.taking || unbeatenCount(s) === 0;
  }

  /* ---------- Действия (меняют состояние) ---------- */

  function fail(msg) { return { ok: false, error: msg }; }

  /** Атака или подкидывание */
  function attack(s, p, cardId) {
    if (!canAttack(s, p, cardId)) return fail('Этой картой сейчас ходить нельзя');
    var isThrow = s.table.length > 0;
    var c = removeFromHand(s, p, cardId);
    s.table.push({ a: c, d: null, by: p });
    s.passed = [];
    return { ok: true, type: 'attack', card: c, player: p, isThrow: isThrow };
  }

  /** Отбить карту на позиции idx */
  function defend(s, idx, cardId) {
    if (!canDefend(s, idx, cardId)) return fail('Этой картой не отбиться');
    var c = removeFromHand(s, s.defender, cardId);
    s.table[idx].d = c;
    s.passed = [];
    return { ok: true, type: 'defend', card: c, player: s.defender, target: s.table[idx].a, index: idx };
  }

  /** Перевести ход следующему игроку */
  function transfer(s, cardId) {
    if (!canTransfer(s, cardId)) return fail('Перевести нельзя');
    var from = s.defender;
    var to = transferTarget(s);
    var c = removeFromHand(s, from, cardId);
    s.table.push({ a: c, d: null, by: from });
    s.attacker = from;
    s.defender = to;
    s.passed = [];
    return { ok: true, type: 'transfer', card: c, player: from, to: to };
  }

  /** «Беру» — дальше остальные ещё могут подкинуть */
  function take(s) {
    if (!canTake(s)) return fail('Сейчас брать не нужно');
    s.taking = true;
    s.passed = [];
    return { ok: true, type: 'take', player: s.defender };
  }

  /** «Пас» / «Бито» от атакующего */
  function pass(s, p) {
    if (!canPass(s, p)) return fail('Сейчас пасовать нельзя');
    s.passed.push(p);
    return { ok: true, type: 'pass', player: p };
  }

  /**
   * Кто сейчас должен действовать.
   * Возвращает { kind: 'attack' | 'defend' | 'throw' | 'resolve', player } или null, если партия окончена.
   */
  function pending(s) {
    if (s.over) return null;
    if (s.table.length === 0) return { kind: 'attack', player: s.attacker };
    if (!s.taking && unbeatenCount(s) > 0) return { kind: 'defend', player: s.defender };
    if (!canAddAttack(s)) return { kind: 'resolve' };
    var order = throwerOrder(s);
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if (s.passed.indexOf(p) >= 0) continue;
      if (legalAttackCards(s, p).length === 0) continue; // подкинуть нечего — автоматически пас
      return { kind: 'throw', player: p };
    }
    return { kind: 'resolve' };
  }

  /**
   * Завершить заход: «Бито» в сброс или отбивающийся забирает всё.
   * Затем добор из колоды: первым — начавший заход, дальше по часовой, отбивающийся — последним.
   * Возвращает подробности для анимации: кто что добрал, кто вышел.
   */
  function resolve(s) {
    var pnd = pending(s);
    if (!pnd || pnd.kind !== 'resolve') return fail('Заход ещё не закончен');
    var def = s.defender;
    var took = s.taking;
    var cards = [];
    s.table.forEach(function (t) { cards.push(t.a); if (t.d) cards.push(t.d); });

    if (took) {
      cards.forEach(function (c) {
        s.players[def].hand.push(c);
        s.known[def].push(c.id); // все видели, что он забрал
      });
    } else {
      cards.forEach(function (c) { s.discard.push(c); });
    }
    s.table = [];

    // Добор
    var draws = [];
    var order = [];
    for (var i = 0; i < s.n; i++) {
      var idx = (s.boutStarter + i) % s.n;
      if (idx !== def) order.push(idx);
    }
    order.push(def);
    order.forEach(function (p) {
      while (s.players[p].hand.length < HAND_SIZE && s.deck.length > 0) {
        var c = s.deck.pop();
        s.players[p].hand.push(c);
        if (s.deck.length === 0) s.known[p].push(c.id); // открытый козырь со дна видели все
        draws.push({ player: p, card: c });
      }
    });

    // Кто вышел из игры
    var finished = [];
    s.players.forEach(function (pl, p) {
      if (!pl.finished && pl.hand.length === 0 && s.deck.length === 0) {
        pl.finished = true;
        s.finishOrder.push(p);
        finished.push(p);
      }
    });

    var active = [];
    s.players.forEach(function (pl, p) { if (pl.hand.length > 0) active.push(p); });

    var info = { ok: true, type: 'resolve', took: took, defender: def, cards: cards, draws: draws, finished: finished };

    if (active.length === 0) {
      // Карты закончились у всех одновременно — ничья
      s.over = true;
      s.result = { draw: true, durak: -1 };
    } else if (active.length === 1) {
      s.over = true;
      s.result = { draw: false, durak: active[0] };
    } else {
      // Следующий заход: после «Бито» ходит отбивавшийся, после «Беру» — следующий за ним
      var nextAtt;
      if (took) nextAtt = nextActive(s, def);
      else nextAtt = s.players[def].hand.length > 0 ? def : nextActive(s, def);
      s.attacker = nextAtt;
      s.boutStarter = nextAtt;
      s.defender = nextActive(s, nextAtt);
      s.taking = false;
      s.passed = [];
      s.bout++;
    }
    info.over = s.over;
    info.result = s.result;
    return info;
  }

  /**
   * «Второй шанс» (за рекламу): вернуть в сброс карты последней взятой кучи.
   * Разрешено, только если игрок сейчас не отбивается и у него останется хотя бы одна карта.
   */
  function canSecondChance(s, p, ids) {
    if (s.over) return false;
    if (p === s.defender && s.table.length > 0) return false;
    var present = ids.filter(function (id) { return findInHand(s, p, id) >= 0; });
    if (present.length === 0) return false;
    return s.players[p].hand.length - present.length >= 1;
  }

  function secondChance(s, p, ids) {
    if (!canSecondChance(s, p, ids)) return fail('Второй шанс сейчас недоступен');
    var moved = [];
    ids.forEach(function (id) {
      if (findInHand(s, p, id) >= 0) {
        var c = removeFromHand(s, p, id);
        s.discard.push(c);
        moved.push(c);
      }
    });
    return { ok: true, type: 'secondChance', cards: moved };
  }

  /** Глубокая копия состояния (для симуляций ботов) */
  function cloneState(s) {
    return JSON.parse(JSON.stringify(s));
  }

  /** Сколько всего карт в игре (для проверок целостности) */
  function countCards(s) {
    var k = s.deck.length + s.discard.length;
    s.players.forEach(function (pl) { k += pl.hand.length; });
    s.table.forEach(function (t) { k += 1 + (t.d ? 1 : 0); });
    return k;
  }

  var Engine = {
    SUITS: SUITS,
    RANKS: RANKS,
    SUIT_SYMBOL: SUIT_SYMBOL,
    SUIT_NAME: SUIT_NAME,
    RANK_LABEL: RANK_LABEL,
    HAND_SIZE: HAND_SIZE,
    MAX_TABLE: MAX_TABLE,
    makeCard: makeCard,
    cardFromId: cardFromId,
    cardLabel: cardLabel,
    beats: beats,
    fullDeck: fullDeck,
    sortHand: sortHand,
    rand: rand,
    createGame: createGame,
    isOut: isOut,
    nextActive: nextActive,
    unbeatenCount: unbeatenCount,
    tableRanks: tableRanks,
    canAddAttack: canAddAttack,
    throwerOrder: throwerOrder,
    legalAttackCards: legalAttackCards,
    canAttack: canAttack,
    canDefend: canDefend,
    defenseTargets: defenseTargets,
    transferTarget: transferTarget,
    canTransfer: canTransfer,
    canTake: canTake,
    canPass: canPass,
    attack: attack,
    defend: defend,
    transfer: transfer,
    take: take,
    pass: pass,
    pending: pending,
    resolve: resolve,
    canSecondChance: canSecondChance,
    secondChance: secondChance,
    cloneState: cloneState,
    countCards: countCards
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else global.DurakEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
