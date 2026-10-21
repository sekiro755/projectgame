/**
 * Симуляция тысяч партий «бот против бота».
 * 1) Проверяет инварианты правил после каждого действия (36 карт, лимиты, корректный отбой).
 * 2) Сравнивает силу уровней ботов.
 * Запуск: node tests/simulate.js [кол-во партий]
 */
'use strict';
const E = require('../js/engine.js');
const B = require('../js/bots.js');

const GAMES = Number(process.argv[2]) || 1500;

function check(s, where) {
  const all = [];
  s.deck.forEach((c) => all.push(c.id));
  s.discard.forEach((c) => all.push(c.id));
  s.players.forEach((p) => p.hand.forEach((c) => all.push(c.id)));
  s.table.forEach((t) => { all.push(t.a.id); if (t.d) all.push(t.d.id); });
  if (all.length !== 36) throw new Error(where + ': карт ' + all.length);
  if (new Set(all).size !== 36) throw new Error(where + ': дубликаты карт');
  if (s.table.length > 6) throw new Error(where + ': больше 6 карт на столе');
  if (!s.over && s.table.length) {
    const unb = E.unbeatenCount(s);
    if (unb > s.players[s.defender].hand.length) throw new Error(where + ': непобитых больше, чем карт у отбивающегося');
  }
  s.table.forEach((t) => {
    if (t.d && !E.beats(t.a, t.d, s.trumpSuit)) throw new Error(where + ': неверный отбой');
  });
  if (!s.over && s.attacker === s.defender) throw new Error(where + ': атакующий = отбивающийся');
}

function play(n, levels, mode, seed) {
  const s = E.createGame({ numPlayers: n, mode, seed });
  const stats = { transfers: 0, takes: 0, steps: 0 };
  check(s, 'start');
  while (!s.over) {
    if (++stats.steps > 3000) throw new Error('партия зациклилась, seed=' + seed);
    const pnd = E.pending(s);
    if (pnd.kind === 'resolve') {
      E.resolve(s);
      check(s, 'resolve');
      continue;
    }
    const act = B.decide(s, pnd.player, levels[pnd.player]);
    const r = B.apply(s, pnd.player, act);
    if (!r.ok) throw new Error('бот сделал недопустимый ход: ' + JSON.stringify(act) + ' ' + r.error + ' seed=' + seed);
    if (act.type === 'transfer') stats.transfers++;
    if (act.type === 'take') stats.takes++;
    check(s, act.type);
  }
  return { s, stats };
}

function tournament(n, levels, mode) {
  const lost = new Array(n).fill(0);
  let draws = 0, transfers = 0;
  for (let g = 0; g < GAMES; g++) {
    // Меняем места, чтобы не было преимущества позиции
    const shift = g % n;
    const lv = levels.map((_, i) => levels[(i + shift) % n]);
    const { s, stats } = play(n, lv, mode, 1000 + g);
    transfers += stats.transfers;
    if (s.result.draw) draws++;
    else lost[(s.result.durak + shift) % n]++;
  }
  const line = levels.map((l, i) => `${l}: дурак ${(100 * lost[i] / GAMES).toFixed(1)}%`).join(' | ');
  console.log(`[${mode}, ${n} игр.] ${line} | ничьи ${(100 * draws / GAMES).toFixed(1)}%` + (mode === 'transfer' ? ` | переводов/партию ${(transfers / GAMES).toFixed(2)}` : ''));
  return lost.map((x) => x / GAMES);
}

const t0 = Date.now();
const r1 = tournament(2, ['pro', 'normal'], 'classic');
const r2 = tournament(2, ['normal', 'novice'], 'classic');
const r3 = tournament(2, ['pro', 'novice'], 'classic');
tournament(2, ['pro', 'normal'], 'transfer');
tournament(2, ['normal', 'novice'], 'transfer');
tournament(3, ['pro', 'normal', 'novice'], 'classic');
tournament(4, ['pro', 'normal', 'novice', 'normal'], 'transfer');
tournament(4, ['novice', 'novice', 'novice', 'novice'], 'classic');
console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)} c, все инварианты соблюдены.`);

// Профи должен проигрывать реже, чем Норм, а Норм — реже, чем Новичок
if (!(r1[0] < r1[1] && r2[0] < r2[1] && r3[0] < r3[1])) {
  console.error('ВНИМАНИЕ: уровни ботов не упорядочены по силе');
  process.exitCode = 1;
}
