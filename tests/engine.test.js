/**
 * Тесты правил. Запуск: node --test tests/
 * Проверяем крайние случаи: лимиты подкидывания, «Беру», перевод, пустая колода, ничья.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

/** Карта из строки: '6S', '10H', 'QD', 'AC' (S ♠, C ♣, D ♦, H ♥) */
function C(str) {
  const suit = str.slice(-1);
  const r = str.slice(0, -1);
  const rank = { J: 11, Q: 12, K: 13, A: 14 }[r] || Number(r);
  return E.makeCard(suit, rank);
}
/** Обратно: карта → строка в формате тестов ('AH', '10S') */
const lab = (c) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.rank] || String(c.rank)) + c.suit;
const ids = (arr) => arr.map(lab).sort();
const knownLabels = (s, p) => s.known[p].map((id) => lab(E.cardFromId(id)));

/** Обёртки над движком, принимающие карты в формате тестов */
const T = {
  attack: (s, p, c) => E.attack(s, p, C(c).id),
  canAttack: (s, p, c) => E.canAttack(s, p, C(c).id),
  defend: (s, i, c) => E.defend(s, i, C(c).id),
  canDefend: (s, i, c) => E.canDefend(s, i, C(c).id),
  transfer: (s, c) => E.transfer(s, C(c).id),
  canTransfer: (s, c) => E.canTransfer(s, C(c).id),
  secondChance: (s, p, arr) => E.secondChance(s, p, arr.map((x) => C(x).id)),
  canSecondChance: (s, p, arr) => E.canSecondChance(s, p, arr.map((x) => C(x).id))
};

/** Собрать позицию вручную. deck[0] — дно колоды (козырь), последний элемент — верх. */
function make({ hands, deck = [], trump = 'H', mode = 'classic', attacker = 0, defender }) {
  const s = E.createGame({ numPlayers: hands.length, mode, seed: 1 });
  s.players.forEach((p, i) => { p.hand = hands[i].map(C); p.finished = false; });
  s.deck = deck.map(C);
  s.trumpSuit = trump;
  s.trumpCard = s.deck[0] || E.makeCard(trump, 6);
  s.discard = [];
  s.table = [];
  s.known = hands.map(() => []);
  s.attacker = attacker;
  s.boutStarter = attacker;
  s.defender = defender != null ? defender : E.nextActive(s, attacker);
  return s;
}

test('раздача: по 6 карт, козырь — нижняя карта, первым ходит младший козырь', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const n of [2, 3, 4]) {
      const s = E.createGame({ numPlayers: n, seed });
      s.players.forEach((p) => assert.equal(p.hand.length, 6));
      assert.equal(s.deck.length, 36 - 6 * n);
      assert.equal(s.trumpCard.id, s.deck[0].id);
      assert.equal(E.countCards(s), 36);
      // Проверяем, что у первого игрока действительно младший козырь
      let minTrump = 99, owner = -1;
      s.players.forEach((p, i) => p.hand.forEach((c) => {
        if (c.suit === s.trumpSuit && c.rank < minTrump) { minTrump = c.rank; owner = i; }
      }));
      if (owner >= 0) assert.equal(s.attacker, owner);
      assert.equal(s.defender, (s.attacker + 1) % n);
    }
  }
});

test('forceFirst (обучение): первым ходит нужный игрок', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = E.createGame({ numPlayers: 2, seed, forceFirst: 0 });
    assert.equal(s.attacker, 0);
    assert.equal(E.countCards(s), 36);
  }
});

test('кто кого бьёт', () => {
  const t = 'H';
  assert.ok(E.beats(C('6S'), C('7S'), t));
  assert.ok(!E.beats(C('7S'), C('6S'), t));
  assert.ok(E.beats(C('AS'), C('6H'), t), 'козырь бьёт любую некозырную');
  assert.ok(!E.beats(C('6H'), C('AS'), t), 'некозырная не бьёт козырь');
  assert.ok(E.beats(C('6H'), C('7H'), t), 'козырь бьётся старшим козырем');
  assert.ok(!E.beats(C('6S'), C('7C'), t), 'другая некозырная масть не бьёт');
});

test('подкидывать можно только по достоинствам на столе', () => {
  const s = make({ hands: [['6S', '6C', '7D', 'KS', '9C', '10D'], ['8S', '7S', 'AC', 'JD', 'QD', '9H']] });
  assert.ok(T.attack(s, 0, '6S').ok);
  assert.ok(!T.canAttack(s, 0, '7D'), 'семёрки на столе нет');
  assert.ok(T.canAttack(s, 0, '6C'));
  assert.ok(T.defend(s, 0, '7S').ok);
  assert.ok(T.canAttack(s, 0, '7D'), 'после отбоя семёркой можно подкинуть семёрку');
  assert.ok(!T.canAttack(s, 1, '8S'), 'отбивающийся не подкидывает');
});

test('лимит: непобитых карт не больше, чем карт у отбивающегося', () => {
  const s = make({ hands: [['6S', '6C', '6D', '6H', '9C', '10D'], ['8S', 'AD']], trump: 'D' });
  assert.ok(T.attack(s, 0, '6S').ok);
  assert.ok(T.attack(s, 0, '6C').ok);
  assert.ok(!T.canAttack(s, 0, '6D'), 'у отбивающегося всего 2 карты');
  assert.ok(T.defend(s, 0, '8S').ok);
  assert.ok(!T.canAttack(s, 0, '6D'), 'всего за заход не больше исходных 2 карт отбивающегося');
  assert.ok(T.defend(s, 1, 'AD').ok);
  assert.equal(E.pending(s).kind, 'resolve');
  const r = E.resolve(s);
  assert.ok(r.ok && !r.took);
  assert.equal(s.discard.length, 4);
});

test('лимит: не больше 6 карт за заход', () => {
  const s = make({
    hands: [
      ['6S', '6C', '6D', '6H', '9H', '8D', '8C'],
      ['8S', '9C', '9D', '10S', '10C', '10D', 'AH', 'KH']
    ],
    deck: ['QS', 'QC'],
    trump: 'H'
  });
  assert.ok(T.attack(s, 0, '6S').ok); assert.ok(T.defend(s, 0, '8S').ok);
  assert.ok(T.attack(s, 0, '6C').ok); assert.ok(T.defend(s, 1, '9C').ok);
  assert.ok(T.attack(s, 0, '6D').ok); assert.ok(T.defend(s, 2, '9D').ok);
  ['6H', '9H', '8D'].forEach((id) => assert.ok(T.attack(s, 0, id).ok, id));
  assert.equal(s.table.length, 6);
  assert.ok(!E.canAddAttack(s));
  assert.ok(!T.canAttack(s, 0, '8C'), 'восьмёрка есть на столе, но лимит 6 карт исчерпан');
  assert.deepEqual(E.legalAttackCards(s, 0), []);
});

test('«Беру»: можно подкинуть ещё, но не больше карт на руке у берущего', () => {
  const s = make({
    hands: [['6S', '6C', '6D', '6H', 'JC', 'QC'], ['7C', '8D', 'AS'], ['9S', '9C']],
    trump: 'D'
  });
  assert.ok(T.attack(s, 0, '6S').ok);
  assert.ok(E.take(s).ok);
  assert.ok(!T.canDefend(s, 0, '7C'), 'после «Беру» отбиваться нельзя');
  assert.ok(T.canAttack(s, 0, '6C'));
  assert.ok(T.attack(s, 0, '6C').ok);
  assert.ok(T.attack(s, 0, '6H').ok);
  assert.ok(!T.canAttack(s, 0, '6D'), 'у берущего всего 3 карты');
  assert.equal(E.pending(s).kind, 'resolve');
  const r = E.resolve(s);
  assert.ok(r.took);
  assert.equal(s.players[1].hand.length, 6);
  assert.equal(s.attacker, 2, 'после «Беру» ход переходит к следующему за берущим');
  assert.equal(s.defender, 0);
});

test('«Беру»: подкидывают все по очереди, пока все не скажут пас', () => {
  const s = make({ hands: [['6S', 'JC', 'QC'], ['7C', '8D', 'AS', 'KD', '10C'], ['6C', '9C']], trump: 'D' });
  T.attack(s, 0, '6S');
  E.take(s);
  let p = E.pending(s);
  assert.deepEqual(p, { kind: 'throw', player: 2 }, 'у атакующего нечего подкинуть — очередь третьего');
  assert.ok(E.pass(s, 2).ok);
  assert.equal(E.pending(s).kind, 'resolve');
});

test('порядок подкидывания: сначала главный атакующий, потом остальные', () => {
  const s = make({ hands: [['6S', '7S', 'JC'], ['8S', '9S', 'AD', 'KD'], ['7C', '8C']], trump: 'D' });
  T.attack(s, 0, '6S');
  T.defend(s, 0, '8S');
  assert.deepEqual(E.pending(s), { kind: 'throw', player: 2 }, 'у главного нечего подкинуть (нет 6 и 8)');
  assert.ok(!T.canAttack(s, 2, '7C'), 'семёрки на столе нет');
  assert.ok(T.attack(s, 2, '8C').ok);

  const s2 = make({ hands: [['6S', '6D', 'JC'], ['8S', '9S', 'AD', 'KD'], ['6C', '8C']], trump: 'H' });
  T.attack(s2, 0, '6S');
  T.defend(s2, 0, '8S');
  assert.deepEqual(E.pending(s2), { kind: 'throw', player: 0 });
  E.pass(s2, 0);
  assert.deepEqual(E.pending(s2), { kind: 'throw', player: 2 });
  T.attack(s2, 2, '6C');
  assert.equal(E.pending(s2).kind, 'defend');
  assert.deepEqual(s2.passed, [], 'после новой карты пасы сбрасываются');
});

test('добор: первым начавший заход, отбивающийся последним; колода кончается', () => {
  const s = make({
    hands: [['6S', '7S'], ['8S', '9S', 'KD'], ['10C', 'JC']],
    deck: ['AH', 'QH', 'JH'], // верх — JH
    trump: 'H'
  });
  T.attack(s, 0, '6S');
  T.defend(s, 0, '8S');
  E.pass(s, 0);
  assert.equal(E.pending(s).kind, 'resolve');
  const r = E.resolve(s);
  // Атакующий (0) добирает первым: у него 1 карта → берёт 3 последних карты колоды
  assert.deepEqual(r.draws.map((d) => d.player), [0, 0, 0]);
  assert.equal(s.deck.length, 0);
  assert.deepEqual(knownLabels(s, 0), ['AH'], 'козырь со дна известен всем');
  assert.equal(s.players[2].hand.length, 2, 'третьему не досталось');
  assert.equal(s.attacker, 1, 'после «Бито» ходит отбивавшийся');
});

test('пустая колода: игрок выходит, игра продолжается без него', () => {
  const s = make({ hands: [['6S'], ['7S', 'AC'], ['10C', 'JC']], trump: 'H' });
  T.attack(s, 0, '6S');
  T.defend(s, 0, '7S');
  assert.equal(E.pending(s).kind, 'resolve', 'подкинуть некому: у первого карт нет, у третьего нет семёрок');
  const r = E.resolve(s);
  assert.deepEqual(r.finished, [0]);
  assert.ok(!s.over);
  assert.equal(s.attacker, 1);
  assert.equal(s.defender, 2);
  assert.equal(E.nextActive(s, 2), 1, 'вышедший игрок пропускается');
});

test('ничья: у всех одновременно закончились карты', () => {
  const s = make({ hands: [['6S'], ['7S']], trump: 'H' });
  T.attack(s, 0, '6S');
  T.defend(s, 0, '7S');
  const r = E.resolve(s);
  assert.ok(s.over);
  assert.equal(s.result.draw, true);
  assert.equal(r.finished.length, 2);
});

test('ничья втроём: последние двое вышли одновременно', () => {
  const s = make({ hands: [['6S'], ['7S'], []], trump: 'H' });
  s.players[2].finished = true;
  T.attack(s, 0, '6S');
  T.defend(s, 0, '7S');
  E.resolve(s);
  assert.ok(s.over && s.result.draw);
});

test('дурак: остался один с картами', () => {
  const s = make({ hands: [['6S'], ['7S', 'AC']], trump: 'H' });
  T.attack(s, 0, '6S');
  T.defend(s, 0, '7S');
  E.resolve(s);
  assert.ok(s.over);
  assert.equal(s.result.durak, 1);
});

test('дурак после «Беру» в конце', () => {
  const s = make({ hands: [['AH'], ['7S', 'AC']], trump: 'H' });
  T.attack(s, 0, 'AH');
  assert.ok(E.take(s).ok);
  E.resolve(s);
  assert.ok(s.over);
  assert.equal(s.result.durak, 1);
});

test('перевод: только в переводном режиме', () => {
  const s = make({ hands: [['6S', '9C'], ['6C', '8D'], ['QS', 'QC', 'KD']], mode: 'classic' });
  T.attack(s, 0, '6S');
  assert.ok(!T.canTransfer(s, '6C'));
});

test('перевод: тем же достоинством, до первого отбоя, ход уходит дальше', () => {
  const s = make({ hands: [['6S', '9C'], ['6C', '8D', 'JS'], ['QS', 'QC', 'KD']], mode: 'transfer' });
  T.attack(s, 0, '6S');
  assert.ok(!T.canTransfer(s, '8D'), 'другое достоинство');
  assert.ok(T.canTransfer(s, '6C'));
  const r = T.transfer(s, '6C');
  assert.ok(r.ok);
  assert.equal(s.attacker, 1);
  assert.equal(s.defender, 2);
  assert.equal(s.table.length, 2);
  assert.equal(E.pending(s).player, 2);
});

test('перевод: нельзя после отбоя и после «Беру»', () => {
  const s = make({ hands: [['6S', '6D', '9C'], ['6C', '7S', 'JS', 'QD'], ['QS', 'QC', 'KD', 'KC']], mode: 'transfer' });
  T.attack(s, 0, '6S');
  T.attack(s, 0, '6D');
  T.defend(s, 0, '7S');
  assert.ok(!T.canTransfer(s, '6C'), 'уже была побита карта');

  const s2 = make({ hands: [['6S', '9C'], ['6C', '8D'], ['QS', 'QC', 'KD']], mode: 'transfer' });
  T.attack(s2, 0, '6S');
  E.take(s2);
  assert.ok(!T.canTransfer(s2, '6C'), 'после «Беру» переводить нельзя');
});

test('перевод: у следующего должно хватить карт', () => {
  const s = make({ hands: [['6S', '6D', '9C'], ['6C', '8D', 'JS'], ['QS', 'QC']], mode: 'transfer' });
  T.attack(s, 0, '6S');
  T.attack(s, 0, '6D');
  assert.ok(!T.canTransfer(s, '6C'), 'у третьего 2 карты, а на столе стало бы 3');
});

test('перевод вдвоём возвращает ход атакующему, цепочка переводов', () => {
  const s = make({ hands: [['6S', '6H', '9C'], ['6C', '8D', 'JS', 'QS']], mode: 'transfer', trump: 'D' });
  T.attack(s, 0, '6S');
  assert.ok(T.transfer(s, '6C').ok);
  assert.equal(s.defender, 0);
  assert.equal(s.attacker, 1);
  assert.ok(T.canTransfer(s, '6H'), 'можно перевести обратно');
  assert.ok(T.transfer(s, '6H').ok);
  assert.equal(s.defender, 1);
  assert.equal(s.table.length, 3);
});

test('перевод, затем «Беру»: ход переходит к следующему за взявшим', () => {
  const s = make({ hands: [['6S', '9C', 'JD'], ['6C', '8D', 'JS'], ['QS', 'QC', 'KD']], mode: 'transfer', trump: 'H' });
  T.attack(s, 0, '6S');
  T.transfer(s, '6C');
  E.take(s);
  while (E.pending(s).kind === 'throw') E.pass(s, E.pending(s).player);
  E.resolve(s);
  assert.equal(s.attacker, 0);
  assert.equal(s.defender, 1);
  assert.equal(s.players[2].hand.length, 5);
});

test('второй шанс: возвращает взятую кучу в сброс', () => {
  const s = make({ hands: [['6S', '9C', 'JD'], ['7H', '8D']], trump: 'H' });
  T.attack(s, 0, '6S');
  E.take(s);
  while (E.pending(s).kind === 'throw') E.pass(s, E.pending(s).player);
  E.resolve(s);
  assert.equal(s.players[1].hand.length, 3);
  assert.ok(!T.canSecondChance(s, 1, ['7H', '8D', '6S']), 'должна остаться хотя бы одна карта');
  assert.ok(T.canSecondChance(s, 1, ['6S']));
  const r = T.secondChance(s, 1, ['6S']);
  assert.ok(r.ok);
  assert.deepEqual(ids(s.players[1].hand), ['7H', '8D']);
  assert.equal(s.discard.length, 1);
  assert.deepEqual(s.known[1], []);
});
