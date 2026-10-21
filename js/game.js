/**
 * game.js — интерфейс игры: экраны, отрисовка стола, управление (тап и drag & drop),
 * анимации, боты по таймерам, реплики и эмодзи, награды, шеринг, VK и реклама.
 *
 * Правила живут в engine.js, ИИ — в bots.js, прогресс — в progress.js.
 * Здесь только «как это выглядит и ощущается».
 */
(function () {
  'use strict';

  const E = window.DurakEngine;
  const Bots = window.DurakBots;
  const P = window.Progress;
  const VK = window.VK;
  const Ads = window.Ads;
  const Sound = window.Sound;

  /* =========================================================
     Утилиты
     ========================================================= */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =========================================================
     Константы
     ========================================================= */

  const HUMAN = 0;

  const BOT_ROSTER = [
    { name: 'Тимоха', emoji: '😎' }, { name: 'Лиза', emoji: '💅' }, { name: 'Бот Вася', emoji: '🤖' },
    { name: 'Кира', emoji: '🦊' }, { name: 'Макс', emoji: '🧢' }, { name: 'Соня', emoji: '🌸' },
    { name: 'Дэн', emoji: '🎧' }, { name: 'Ника', emoji: '✨' }, { name: 'Гоша', emoji: '🐸' },
    { name: 'Аня', emoji: '🍓' }, { name: 'Артём', emoji: '🛹' }, { name: 'Вика', emoji: '🎀' }
  ];

  /** Реплики ботов — короткие и безобидные */
  const PHRASES = {
    start: ['погнали!', 'удачи 🍀', 'ну, держитесь 😏', 'го катку', 'я в форме 💪'],
    beaten: ['изи', 'отбился 😏', 'не сегодня', 'чётко', 'мимо 😌'],
    take: ['ладно, беру 😤', 'ну ок...', 'запомню это 👀', 'беру, не спорю', 'эх, давай сюда'],
    transferBot: ['лови перевод!', 'держи 😜', 'не моё, передаю', 'а теперь ты'],
    transferedToMe: ['ну ты и жук', 'хитро 👀', 'вот это поворот', 'ну спасибо 😅'],
    humanTook: ['хе-хе', 'забирай 😎', 'бывает 🙃', 'кушай с хлебом'],
    out: ['гг', 'я всё 😎', 'я вышел, удачи', 'было весело'],
    durak: ['ну всё, я дурак 🤡', 'реванш?', 'это была разминка', 'в следующий раз!'],
    win: ['гг вп', 'изи катка', 'гг 🙌', 'хорошо сыграли'],
    emojiReply: ['эй! 😅', 'ну ты чего', '😂😂😂', 'сам такой 😜', 'я всё вижу 👀', 'ха-ха'],
    bigThrow: ['лови ещё', 'а вот ещё', 'подкину-ка', 'ещё одна 😏'],
    trumpHit: ['козырем тебя!', 'опа, козырь', 'а у меня козырь 😎']
  };

  const EMOJIS = ['😂', '🔥', '💀', '👀', '🤡'];
  const DIFF_LABEL = { novice: 'Новичок', normal: 'Норм', pro: 'Профи' };
  const MODE_LABEL = { classic: 'Подкидной', transfer: 'Переводной' };
  const SUIT_TXT = { S: '♠︎', C: '♣︎', D: '♦︎', H: '♥︎' };

  /** Подсказки обучения: каждая показывается один раз */
  const HINTS = {
    trump: 'Это козырь — <b>{suit}</b>. Козыри бьют карты любой другой масти 💪',
    attack: 'Твой ход! <b>Тапни карту</b> или перетащи её на стол 👆',
    defend: 'Отбейся старшей картой той же масти или козырем — перетащи её прямо на карту соперника. Не можешь — жми <b>«Беру»</b>',
    transfer: 'Переводной: положи карту <b>того же достоинства</b> на стол — и отбиваться будет следующий игрок 🔁',
    throw: 'Всё побито! Можно <b>подкинуть</b> карту того же достоинства, что на столе. Или жми <b>«Бито»</b>',
    take_throw: 'Соперник берёт — можно подкинуть ему ещё карт того же достоинства 😈',
    select: 'Тапни по карте на столе, которую бьёшь, или по пустому месту на столе — чтобы перевести',
    emoji: 'Тапни по аватарке соперника, чтобы кинуть в него эмодзи 😂',
    chance: 'Взял кучу? <b>«Второй шанс»</b> вернёт её в отбой — один раз за партию'
  };

  const LOADING_TIPS = [
    'Тасуем колоду…', 'Ищем младший козырь…', 'Подсказка: козырь бьёт любую масть',
    'Подсказка: подкидывать можно до 6 карт', 'Раздаём по шесть…'
  ];

  /* =========================================================
     Состояние приложения
     ========================================================= */

  const App = {
    user: { name: 'Ты', photo: null },
    screen: 'loading',
    dailyShown: false,
    adAvailable: false
  };

  /** Состояние текущей партии */
  const G = {
    s: null,            // состояние движка
    opts: null,         // { mode, diff, players, tutorial }
    bots: [],           // [null, { name, emoji, level }, ...]
    timer: null,
    busy: false,        // идёт анимация — ввод заблокирован
    paused: false,
    autoPaused: false,
    over: false,
    token: 0,           // меняется с каждой партией, чтобы отменять «старые» таймеры
    selected: null,     // выбранная карта, когда у неё несколько вариантов хода
    drag: null,
    lastTaken: null,    // карты последней взятой игроком кучи (для «Второго шанса»)
    chanceUsed: false,
    bubbleCd: {},
    emojiCd: 0,
    hintEl: null,
    picker: null,
    lastTurnBout: -1,
    result: null
  };

  /* =========================================================
     Экраны, тосты, модальные окна
     ========================================================= */

  function show(name) {
    App.screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    closePicker();
    removeHint();
  }

  function toast(html) {
    const t = el('div', 'toast', html);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  /**
   * Модальное окно. buttons: [{ label, cls, onClick, keep }]
   * keep: true — не закрывать окно после нажатия.
   */
  function modal({ emoji, title, text, html, buttons = [], onClose }) {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal');
    box.innerHTML =
      (emoji ? `<div class="modal-emoji">${emoji}</div>` : '') +
      (title ? `<h3>${title}</h3>` : '') +
      (text ? `<p>${text}</p>` : '') +
      (html || '');
    const btns = el('div', 'modal-btns');
    const close = () => { back.remove(); if (onClose) onClose(); };
    buttons.forEach((b) => {
      const btn = el('button', 'btn ' + (b.cls || 'btn-ghost'), b.label);
      btn.addEventListener('click', () => {
        sfx('tap');
        if (!b.keep) close();
        if (b.onClick) b.onClick(btn, close);
      });
      btns.appendChild(btn);
    });
    box.appendChild(btns);
    back.appendChild(box);
    $('#modal-root').appendChild(back);
    return { close, box };
  }

  function sfx(name) { Sound.play(name); }

  function buzz(style) {
    if (P.data.flags.vibro) VK.haptic(style);
  }

  function setAva(node, user) {
    node.innerHTML = '';
    if (user && user.photo) {
      const img = el('img');
      img.alt = '';
      img.src = user.photo;
      img.onerror = () => { node.textContent = '🙂'; };
      node.appendChild(img);
    } else {
      node.textContent = '🙂';
    }
  }

  function updateCoins(bump) {
    $$('.coins b').forEach((b) => { b.textContent = P.data.coins; });
    if (bump) $$('.coins').forEach((c) => { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); });
  }

  /** Монетки летят от кнопки к счётчику */
  function coinBurst(fromEl) {
    sfx('coin');
    buzz('light');
    const target = $('.screen.active .coins');
    if (!fromEl || !target) { updateCoins(true); return; }
    const a = fromEl.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const c = el('div', 'fly-emoji', '🪙');
      c.style.fontSize = '22px';
      $('#fx').appendChild(c);
      const sx = a.left + a.width / 2 + (Math.random() - 0.5) * 40;
      const sy = a.top + a.height / 2 + (Math.random() - 0.5) * 20;
      const anim = c.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 1 },
        { transform: `translate(${(sx + b.left) / 2}px, ${Math.min(sy, b.top) - 60}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${b.left + 10}px, ${b.top + 6}px) scale(.7)`, opacity: 0.6 }
      ], { duration: 650 + i * 60, easing: 'ease-in-out' });
      anim.onfinish = () => c.remove();
    }
    setTimeout(() => updateCoins(true), 700);
  }

  /* =========================================================
     Реклама: состояние кнопок
     ========================================================= */

  /** Кнопка рекламы: если ролика нет — показываем «Реклама пока недоступна» */
  function setAdButton(btn, label, allowed = true) {
    btn.dataset.label = label;
    btn.dataset.allowed = allowed ? '1' : '0';
    applyAdButton(btn);
  }

  function applyAdButton(btn) {
    if (btn.id === 'g-chance') return; // в партии кнопку просто скрываем
    if (!btn.dataset.label) return;
    if (!App.adAvailable) {
      btn.disabled = true;
      btn.innerHTML = '🎬 Реклама пока недоступна';
    } else {
      btn.disabled = btn.dataset.allowed === '0';
      btn.innerHTML = btn.dataset.label;
    }
  }

  function adFail(reason) {
    toast(reason === 'unavailable' ? 'Реклама пока недоступна 😔' : 'Досмотри ролик до конца, чтобы получить награду');
  }

  /* =========================================================
     Карты
     ========================================================= */

  function cardEl(card, opts = {}) {
    const e = el('div', 'card');
    e.dataset.cid = card.id;
    if (opts.back) {
      e.classList.add('back', 'bk-' + P.data.back);
      return e;
    }
    if (card.suit === 'H' || card.suit === 'D') e.classList.add('red');
    if (opts.trump) e.classList.add('trump');
    const r = E.RANK_LABEL[card.rank];
    const s = SUIT_TXT[card.suit];
    let center;
    if (card.rank === 14) center = `<div class="cc ace">${s}</div>`;
    else if (card.rank >= 11) center = `<div class="cc face"><span>${r}</span></div>`;
    else center = `<div class="cc">${s}</div>`;
    e.innerHTML = `<div class="cr"><b>${r}</b><i>${s}</i></div>${center}<div class="cr br"><b>${r}</b><i>${s}</i></div>`;
    return e;
  }

  function backEl() {
    const e = el('div', 'card back bk-' + P.data.back);
    return e;
  }

  function cssPx(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  }

  /** Размер карт под экран: ширина ~17% экрана, но не больше, чем позволяет высота */
  function updateSizes() {
    const app = $('#app');
    const w = app.clientWidth;
    const h = app.clientHeight;
    const cw = Math.round(Math.max(44, Math.min(w * 0.17, h * 0.1, 84)));
    document.documentElement.style.setProperty('--cw', cw + 'px');
    updateTableSize();
  }

  /** Размер карт на столе: два ряда по три пары должны помещаться */
  function updateTableSize() {
    const table = $('#g-table');
    const w = $('#app').clientWidth;
    const cw = cssPx('--cw');
    const th = table.clientHeight || 300;
    // На широком экране колода и отбой стоят целиком внутри стола — места под пары чуть меньше
    const wLimit = window.innerWidth >= 540 ? (w - 30) / 6.75 : (w - 6) / 5.55;
    const tcw = Math.round(Math.max(36, Math.min(cw * 1.05, wLimit, (th - 14) / 3.62)));
    document.documentElement.style.setProperty('--tcw', tcw + 'px');
  }

  /* =========================================================
     Загрузка
     ========================================================= */

  function setLoader(p) {
    $('#loader-bar').style.width = p + '%';
  }

  async function boot() {
    $('#loading-tip').textContent = pick(LOADING_TIPS);
    setLoader(10);
    bindUI();
    updateSizes();
    const vkInit = VK.init(); // VKWebAppInit — как можно раньше
    setLoader(30);
    try {
      await vkInit;
      setLoader(45);
      await P.load();
      setLoader(65);
      const user = await VK.getUser().catch(() => null);
      if (user) App.user = user;
    } catch (e) {
      console.warn('Загрузка: ', e);
    }
    setLoader(85);
    Sound.setEnabled(P.data.flags.sound);
    P.ensureQuests();
    P.checkLevelUnlocks();
    Ads.isRewardedAvailable(true);
    await sleep(400);
    setLoader(100);
    await sleep(250);
    if (!P.data.flags.tut) openRules(true);
    else goMenu();
  }

  /* =========================================================
     Главное меню
     ========================================================= */

  function goMenu() {
    stopGame();
    renderMenu();
    show('menu');
    if (!App.dailyShown) {
      App.dailyShown = true;
      setTimeout(maybeDaily, 450);
    }
  }

  function renderMenu() {
    setAva($('#m-ava'), App.user);
    $('#m-name').textContent = App.user.name;
    const lv = P.levelInfo();
    $('#m-rank').textContent = `${lv.rank} · ур. ${lv.level}`;
    $('#m-xp').style.width = Math.round(100 * lv.cur / lv.need) + '%';
    updateCoins();
    const st = P.data.stats;
    $('#m-streak').hidden = st.streak < 2;
    $('#m-streak b').textContent = st.streak;
    const setup = P.data.setup;
    markSeg('#seg-mode', setup.mode);
    markSeg('#seg-diff', setup.diff);
    markSeg('#seg-players', String(setup.players));
    const claim = P.claimableQuests() + (P.dailyStatus().available ? 1 : 0);
    $('#m-quests-badge').hidden = claim === 0;
    $('#m-quests-badge').textContent = claim;
    const left = P.adBonusLeft();
    setAdButton($('#m-adbonus'),
      left > 0 ? `🎬 +${P.AD_BONUS_COINS} 🪙 <small>${left}/${P.AD_BONUS_LIMIT}</small>` : '🎬 Лимит на сегодня',
      left > 0);
    updateSoundIcons();
  }

  function markSeg(sel, value) {
    $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === value));
  }

  function updateSoundIcons() {
    const on = P.data.flags.sound;
    $('#m-sound').textContent = on ? '🔊' : '🔇';
    $('#g-sound').textContent = on ? '🔊' : '🔇';
  }

  function toggleSound() {
    P.data.flags.sound = !P.data.flags.sound;
    Sound.setEnabled(P.data.flags.sound);
    P.save();
    updateSoundIcons();
    sfx('tap');
  }

  function daysStrip(st) {
    const cur = st.day;
    const idx = (cur - 1) % 7;
    return '<div class="daily-days">' + st.rewards.map((r, i) => {
      let cls = 'dd';
      if (i < idx || (!st.available && i === idx)) cls += ' done';
      if (i === idx) cls += ' today';
      return `<div class="${cls}">День ${i + 1}<b>${r}</b></div>`;
    }).join('') + '</div>';
  }

  /** Ежедневный бонус за вход */
  function maybeDaily() {
    const st = P.dailyStatus();
    if (!st.available || App.screen !== 'menu') return;
    modal({
      emoji: '🎁',
      title: 'Бонус за вход',
      text: st.day > 1 ? `Ты заходишь ${st.day}-й день подряд — так держать!` : 'Заходи каждый день — награда растёт!',
      html: daysStrip(st),
      buttons: [{
        label: `Забрать +${st.reward} 🪙`, cls: 'btn-play',
        onClick: (btn) => { P.claimDaily(); coinBurst(btn); renderMenu(); }
      }]
    });
  }

  /* =========================================================
     Магазин скинов
     ========================================================= */

  function openShop() {
    renderShop();
    show('shop');
  }

  function renderShop() {
    updateCoins();
    const list = $('#shop-list');
    list.innerHTML = '';
    const lvl = P.levelInfo().level;
    P.SKINS.forEach((sk) => {
      const owned = P.owns(sk.id);
      const item = el('div', 'skin-item' + (P.data.back === sk.id || P.data.table === sk.id ? ' equipped' : ''));
      const prev = el('div', `skin-prev tbl-${sk.id}` + (owned ? '' : ' locked'));
      prev.innerHTML = `<div class="card back bk-${sk.id}"></div><div class="card back bk-${sk.id}"></div>`;
      const info = el('div', 'skin-info');
      const status = owned ? 'Открыт ✓' : `Откроется на ${sk.level} уровне (сейчас ${lvl})`;
      info.innerHTML = `<b>${sk.name}</b><small>${sk.desc}</small><small>${status}</small>`;
      const btns = el('div', 'skin-btns');
      if (owned) {
        const bBack = el('button', 'btn btn-ghost' + (P.data.back === sk.id ? ' on' : ''), P.data.back === sk.id ? '✓ Рубашка' : 'Рубашка');
        bBack.onclick = () => { P.selectSkin('back', sk.id); sfx('tap'); renderShop(); };
        const bTable = el('button', 'btn btn-ghost' + (P.data.table === sk.id ? ' on' : ''), P.data.table === sk.id ? '✓ Стол' : 'Стол');
        bTable.onclick = () => { P.selectSkin('table', sk.id); sfx('tap'); renderShop(); };
        btns.append(bBack, bTable);
      } else {
        const bBuy = el('button', 'btn btn-coin', `🪙 ${sk.price}`);
        bBuy.disabled = P.data.coins < sk.price;
        bBuy.onclick = () => {
          if (P.buySkin(sk.id)) {
            sfx('level');
            toast(`Скин «${sk.name}» твой! 🎉`);
            P.selectSkin('back', sk.id);
            P.selectSkin('table', sk.id);
            renderShop();
          }
        };
        const bAd = el('button', 'btn btn-ad');
        bAd.dataset.ad = '1';
        const seen = P.data.adSkin[sk.id] || 0;
        setAdButton(bAd, `🎬 Реклама ${seen}/${sk.ads}`);
        bAd.onclick = () => {
          Ads.showRewarded(() => {
            const opened = P.adWatchedForSkin(sk.id);
            if (opened) {
              sfx('level');
              toast(`Скин «${sk.name}» открыт! 🎉`);
              P.selectSkin('back', sk.id);
              P.selectSkin('table', sk.id);
            } else {
              toast(`Осталось роликов: ${sk.ads - (P.data.adSkin[sk.id] || 0)}`);
            }
            renderShop();
          }, adFail);
        };
        btns.append(bBuy, bAd);
      }
      info.appendChild(btns);
      item.append(prev, info);
      list.appendChild(item);
    });
  }

  /* =========================================================
     Задания
     ========================================================= */

  function openQuests() {
    renderQuests();
    show('quests');
  }

  function renderQuests() {
    updateCoins();
    const st = P.dailyStatus();
    const daily = $('#q-daily');
    daily.innerHTML = `<h4>🎁 Бонус за вход</h4><p>Заходи каждый день подряд — награда растёт до 150 🪙</p>${daysStrip(st)}`;
    const db = el('button', 'btn ' + (st.available ? 'btn-play' : 'btn-ghost'),
      st.available ? `Забрать +${st.reward} 🪙` : 'Получено — заходи завтра');
    db.disabled = !st.available;
    db.onclick = () => { P.claimDaily(); coinBurst(db); renderQuests(); };
    daily.appendChild(db);

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const hrs = Math.max(1, Math.ceil((midnight - now) / 3600000));
    $('#q-reset').textContent = `новые через ${hrs} ч`;

    const list = $('#quest-list');
    list.innerHTML = '';
    P.quests().forEach((q) => {
      const item = el('div', 'quest' + (q.done ? ' done' : '') + (q.claimed ? ' claimed' : ''));
      item.innerHTML = `
        <div class="quest-body">
          <b>${q.text}</b>
          <small>${q.hint ? q.hint + ' · ' : ''}${q.p}/${q.target}</small>
          <span class="xpbar"><i style="width:${Math.round(100 * q.p / q.target)}%"></i></span>
        </div>
        <div class="quest-side"><span class="quest-reward">+${q.reward} 🪙</span></div>`;
      if (q.done && !q.claimed) {
        const b = el('button', 'btn', 'Забрать');
        b.onclick = () => { P.claimQuest(q.id); coinBurst(b); renderQuests(); };
        $('.quest-side', item).appendChild(b);
      } else if (q.claimed) {
        $('.quest-side', item).insertAdjacentHTML('beforeend', '<small class="muted">получено ✓</small>');
      }
      list.appendChild(item);
    });
  }

  /** Событие для заданий + тост о выполнении */
  function quest(type, amount) {
    const done = P.questEvent(type, amount);
    done.forEach((d) => toast(`🎯 Задание выполнено: ${d.text} — забери награду!`));
  }

  /* =========================================================
     Профиль
     ========================================================= */

  function openProfile() {
    renderProfile();
    show('profile');
  }

  function renderProfile() {
    updateCoins();
    setAva($('#p-ava'), App.user);
    $('#p-name').textContent = App.user.name;
    const lv = P.levelInfo();
    $('#p-rank').textContent = `${lv.rank} · уровень ${lv.level}`;
    $('#p-xp').style.width = Math.round(100 * lv.cur / lv.need) + '%';
    const next = P.nextRank(lv.level);
    $('#p-next').textContent = `${lv.cur}/${lv.need} XP` + (next ? ` · «${next.name}» с ${next.level} уровня` : ' · максимальный ранг 👑');
    const st = P.data.stats;
    const items = [
      ['Партии', st.games], ['Победы', st.wins, true], ['Винрейт', P.winrate() + '%', true], ['Лучшая серия', st.best + ' 🔥'],
      ['Текущая серия', st.streak], ['Поражения', st.losses], ['Ничьи', st.draws], ['Переводы', st.transfers]
    ];
    $('#p-stats').innerHTML = items.map(([name, val, acc]) =>
      `<div class="stat${acc ? ' accent' : ''}"><b>${val}</b><span>${name}</span></div>`).join('');
    $('#set-sound').checked = P.data.flags.sound;
    $('#set-vibro').checked = P.data.flags.vibro;
    $('#set-fast').checked = P.data.flags.fast;
  }

  /* =========================================================
     Правила и обучение
     ========================================================= */

  function openRules(firstTime) {
    $('#rules-skip').hidden = !firstTime;
    $('#scr-rules [data-back]').style.visibility = firstTime ? 'hidden' : '';
    show('rules');
  }

  /* =========================================================
     Игра: запуск и остановка
     ========================================================= */

  function startGame(extra = {}) {
    const setup = P.data.setup;
    const opts = Object.assign({ mode: setup.mode, diff: setup.diff, players: Number(setup.players) }, extra);
    if (opts.tutorial) Object.assign(opts, { mode: 'classic', diff: 'novice', players: 2 });
    stopGame();
    G.token++;
    G.opts = opts;
    G.s = E.createGame({ numPlayers: opts.players, mode: opts.mode, forceFirst: opts.tutorial ? HUMAN : null });

    const roster = shuffled(BOT_ROSTER);
    G.bots = [null];
    for (let p = 1; p < opts.players; p++) G.bots.push(Object.assign({ level: opts.diff }, roster[p - 1]));
    if (opts.tutorial) G.bots[1] = { name: 'Бот Вася', emoji: '🤖', level: 'novice' };

    Object.assign(G, {
      busy: true, paused: false, autoPaused: false, over: false, selected: null, drag: null,
      lastTaken: null, chanceUsed: false, bubbleCd: {}, emojiCd: 0, lastTurnBout: -1, result: null
    });

    const scr = $('#scr-game');
    scr.className = scr.className.replace(/\btbl-\S+/g, '').trim() + ' tbl-' + P.data.table;
    $('#g-mode-label').textContent = opts.tutorial ? 'Обучение' : `${MODE_LABEL[opts.mode]} · ${DIFF_LABEL[opts.diff]}`;
    const tl = $('#g-trump-label');
    tl.textContent = SUIT_TXT[G.s.trumpSuit];
    tl.classList.toggle('red', G.s.trumpSuit === 'H' || G.s.trumpSuit === 'D');
    setAva($('#g-me-ava'), App.user);
    buildOpponents();
    $('#g-battle').innerHTML = '';
    $('#g-hand').innerHTML = '';
    show('game');
    requestAnimationFrame(() => {
      updateSizes();
      dealAnimation(G.token);
    });
  }

  function stopGame() {
    clearTimeout(G.timer);
    G.timer = null;
    G.token++;
    G.s = null;
    removeHint();
    closePicker();
    $('#fx').innerHTML = '';
  }

  /** Раздача: карты разлетаются из колоды по одной */
  async function dealAnimation(token) {
    const s = G.s;
    sfx('shuffle');
    const order = new Map();
    for (let r = 0; r < E.HAND_SIZE; r++) {
      for (let p = 0; p < s.n; p++) order.set(s.players[p].hand[r].id, r * s.n + p);
    }
    const stagger = 55;
    renderGame({ fromDeck: order, stagger, noFlip: false });
    for (let i = 0; i < order.size; i++) setTimeout(() => { if (token === G.token) sfx('deal'); }, 150 + i * stagger);
    await sleep(order.size * stagger + 450);
    if (token !== G.token) return;

    // Кто ходит первым и почему
    const f = s.first;
    const who = f.player === HUMAN ? 'Ты ходишь первым' : `${G.bots[f.player].name} ходит первым`;
    const why = f.reason === 'trump' ? `младший козырь ${E.cardLabel(f.card)}` : 'ни у кого нет козырей';
    banner(`${who}<br><small style="font-size:12px;opacity:.85">${why}</small>`, true);
    for (let p = 1; p < s.n; p++) if (Math.random() < 0.5) say(p, 'start');
    await sleep(900);
    if (token !== G.token) return;
    G.busy = false;
    hint('trump', $('#g-deck'), { suit: E.SUIT_NAME[s.trumpSuit] + ' ' + SUIT_TXT[s.trumpSuit] });
    renderGame({ noFlip: true });
    step();
  }

  /* =========================================================
     Игра: отрисовка
     ========================================================= */

  function name(p) { return p === HUMAN ? 'Ты' : G.bots[p].name; }

  function buildOpponents() {
    const wrap = $('#g-opps');
    wrap.innerHTML = '';
    for (let p = 1; p < G.s.n; p++) {
      const b = G.bots[p];
      const o = el('div', 'opp');
      o.dataset.p = p;
      o.innerHTML = `
        <div class="opp-ava">${b.emoji}<span class="opp-role"></span></div>
        <div class="opp-name">${esc(b.name)}</div>
        <div class="opp-fan"></div>
        <span class="opp-count"></span>
        <div class="bubble"></div>`;
      $('.opp-ava', o).addEventListener('click', (e) => { e.stopPropagation(); openEmojiPicker(p, o); });
      wrap.appendChild(o);
    }
  }

  /** Перерисовать стол. anim.fromDeck — карты, прилетающие из колоды; anim.noFlip — без анимации */
  function renderGame(anim = {}) {
    if (!G.s) return;
    const before = anim.noFlip ? null : captureRects();
    if (G.selected && actionsFor(G.selected).length < 2) G.selected = null;
    renderHand();
    updateTableSize();
    renderOpps();
    renderDeck();
    renderBattle();
    renderDiscard();
    renderBar();
    if (before) playFlip(before, anim);
  }

  function renderOpps() {
    const s = G.s;
    const pnd = s.over ? null : E.pending(s);
    $$('#g-opps .opp').forEach((o) => {
      const p = Number(o.dataset.p);
      const pl = s.players[p];
      const out = pl.finished || (pl.hand.length === 0 && s.deck.length === 0);
      o.classList.toggle('out', out);
      o.classList.toggle('active', !G.busy && !!pnd && pnd.player === p);
      let role = '';
      if (!out && !s.over) {
        if (p === s.defender) role = '🛡️';
        else if (p === s.attacker) role = '⚔️';
      }
      const roleEl = $('.opp-role', o);
      roleEl.textContent = role;
      roleEl.hidden = !role;
      const fan = $('.opp-fan', o);
      fan.innerHTML = '';
      const n = pl.hand.length;
      const W = fan.clientWidth || 100;
      const cw = 22;
      const step = n > 1 ? Math.min(9, (W - cw) / (n - 1)) : 0;
      const x0 = (W - ((n - 1) * step + cw)) / 2;
      pl.hand.forEach((c, i) => {
        const b = cardEl(c, { back: true });
        b.style.left = (x0 + i * step) + 'px';
        b.style.setProperty('--rot', ((i - (n - 1) / 2) * Math.min(4, 30 / Math.max(n, 1))) + 'deg');
        b.style.zIndex = i;
        fan.appendChild(b);
      });
      const cnt = $('.opp-count', o);
      cnt.textContent = n;
      cnt.hidden = n === 0;
      let lbl = $('.opp-out-label', o);
      if (out && !lbl) {
        lbl = el('div', 'opp-out-label', s.over && s.result && s.result.durak === p ? 'дурак 🤡' : 'вышел 😎');
        o.insertBefore(lbl, $('.bubble', o));
      } else if (lbl && !out) lbl.remove();
      else if (lbl && s.over && s.result && s.result.durak === p) lbl.textContent = 'дурак 🤡';
    });
  }

  function renderDeck() {
    const s = G.s;
    const d = $('#g-deck');
    d.innerHTML = '';
    if (s.deck.length > 0) {
      const tc = cardEl(s.trumpCard);
      tc.classList.add('trump-card');
      d.appendChild(tc);
      const stack = Math.min(3, s.deck.length - 1);
      for (let i = 0; i < stack; i++) {
        const b = backEl();
        b.style.left = (-i * 1.5) + 'px';
        b.style.top = (-i * 1.5) + 'px';
        d.appendChild(b);
      }
      d.appendChild(el('span', 'deck-count', s.deck.length));
    } else {
      const red = s.trumpSuit === 'H' || s.trumpSuit === 'D';
      d.appendChild(el('div', 'trump-mark' + (red ? ' red' : ''), SUIT_TXT[s.trumpSuit]));
    }
  }

  function renderDiscard() {
    const s = G.s;
    const d = $('#g-discard');
    d.innerHTML = '';
    const n = s.discard.length;
    if (!n) return;
    const shown = Math.min(5, Math.ceil(n / 4));
    for (let i = 0; i < shown; i++) {
      const b = backEl();
      b.style.setProperty('--rot', ((i * 37) % 30 - 15) + 'deg');
      b.style.left = ((i * 13) % 7 - 3) + 'px';
      d.appendChild(b);
    }
    d.appendChild(el('span', 'deck-count', 'бито ' + n));
  }

  function renderBattle() {
    const s = G.s;
    const b = $('#g-battle');
    b.innerHTML = '';
    s.table.forEach((t, i) => {
      const pr = el('div', 'pair');
      pr.dataset.i = i;
      const a = cardEl(t.a);
      a.classList.add('a');
      pr.appendChild(a);
      if (t.d) {
        const dd = cardEl(t.d);
        dd.classList.add('d');
        pr.appendChild(dd);
      }
      b.appendChild(pr);
    });
    if (G.selected) markTargets(G.selected);
  }

  function isHumanTurn() {
    const s = G.s;
    if (!s || s.over || G.busy || G.paused) return false;
    const pnd = E.pending(s);
    return !!pnd && pnd.player === HUMAN;
  }

  function renderHand() {
    const s = G.s;
    const hand = $('#g-hand');
    hand.innerHTML = '';
    const opts = humanOptions();
    hand.classList.toggle('my-turn', isHumanTurn());
    E.sortHand(s.players[HUMAN].hand, s.trumpSuit).forEach((c) => {
      const e = cardEl(c, { trump: c.suit === s.trumpSuit });
      if (opts[c.id]) e.classList.add('playable');
      if (G.selected === c.id) e.classList.add('selected');
      hand.appendChild(e);
    });
    layoutHand();
  }

  /** Раскладка руки веером; если карт много — в два ряда */
  function layoutHand() {
    const hand = $('#g-hand');
    const nodes = Array.from(hand.children);
    const n = nodes.length;
    const pad = 6; // запас по краям: крайние карты повёрнуты и не должны вылезать за экран
    const W = (hand.clientWidth || 340) - pad * 2;
    const cw = cssPx('--cw') || 62;
    const ch = cw * 1.42;
    let rows = 1;
    let perRow = n;
    let step = n > 1 ? Math.min(cw * 0.8, (W - cw) / (n - 1)) : 0;
    if (n > 1 && step < cw * 0.32) {
      rows = 2;
      perRow = Math.ceil(n / 2);
      step = Math.min(cw * 0.8, (W - cw) / Math.max(1, perRow - 1));
    }
    const rowGap = ch * 0.42;
    hand.style.height = (ch + 26 + (rows - 1) * rowGap) + 'px';
    nodes.forEach((node, i) => {
      const row = rows === 2 && i >= perRow ? 1 : 0;
      const j = row ? i - perRow : i;
      const m = row ? n - perRow : Math.min(n, perRow);
      const total = (m - 1) * step + cw;
      const x0 = (W - total) / 2;
      const off = j - (m - 1) / 2;
      const rot = m > 1 ? off * Math.min(2.6, 22 / m) : 0;
      const y = 12 + row * rowGap + off * off * Math.min(1.1, 7 / m);
      node.style.left = (pad + x0 + j * step) + 'px';
      node.style.top = y + 'px';
      node.style.setProperty('--rot', rot + 'deg');
      node.style.zIndex = i + 1;
    });
  }

  /** Текст статуса и кнопки действий внизу */
  function renderBar() {
    const s = G.s;
    const pnd = s && !s.over ? E.pending(s) : null;
    const st = $('#g-status');
    const btn = $('#g-action');
    let text = '';
    let action = null;
    if (!s) return;
    if (s.players[HUMAN].finished && !s.over) text = '<b>Ты вышел</b> 😎';
    else if (!pnd || G.busy) text = '';
    else if (pnd.kind === 'attack') {
      text = pnd.player === HUMAN ? '<b>Твой ход</b> — выбери карту' : `${esc(name(pnd.player))} ходит…`;
    } else if (pnd.kind === 'defend') {
      if (pnd.player === HUMAN) {
        const canTr = s.players[HUMAN].hand.some((c) => E.canTransfer(s, c.id));
        text = canTr ? '<b>Отбивайся</b>, переводи или бери' : '<b>Отбивайся</b> или бери';
        action = { label: 'Беру', cls: 'take', fn: humanTake };
      } else text = `${esc(name(pnd.player))} отбивается…`;
    } else if (pnd.kind === 'throw') {
      if (pnd.player === HUMAN) {
        if (s.taking) {
          text = `<b>${esc(name(s.defender))} берёт</b> — подкинешь?`;
          action = { label: 'Хватит', cls: 'pass', fn: humanPass };
        } else {
          text = '<b>Подкинь</b> или скажи «Бито»';
          action = { label: s.attacker === HUMAN ? 'Бито' : 'Пас', cls: s.attacker === HUMAN ? 'bito' : 'pass', fn: humanPass };
        }
      } else {
        text = s.taking ? `${esc(name(s.defender))} берёт…` : `${esc(name(pnd.player))} думает…`;
      }
    }
    if (G.selected && !G.busy) {
      const o = humanOptions()[G.selected] || {};
      text = '<b>Куда кладём?</b> Тапни по карте на столе' + (o.transfer ? ' или по столу — перевод' : '');
    }
    st.innerHTML = text;
    if (action && !G.busy && !G.paused) {
      btn.hidden = false;
      btn.textContent = action.label;
      btn.className = 'btn btn-action ' + action.cls;
      G.actionFn = action.fn;
    } else {
      btn.hidden = true;
      G.actionFn = null;
    }
    $('#g-me-ava').classList.toggle('active', !!pnd && pnd.player === HUMAN && !G.busy);
    $('#g-chance').hidden = !(canChance() && App.adAvailable);
  }

  /* =========================================================
     Игра: анимации (FLIP — запоминаем, где карты были, и плавно переносим)
     ========================================================= */

  function captureRects() {
    const map = new Map();
    $$('#scr-game [data-cid]').forEach((node) => {
      map.set(node.dataset.cid, { rect: node.getBoundingClientRect(), w: node.offsetWidth, node });
    });
    return map;
  }

  function playFlip(before, anim) {
    const seen = new Set();
    const deck = $('#g-deck');
    const deckRect = deck.getBoundingClientRect();
    const deckW = deck.offsetWidth;
    const dur = anim.duration || 340;
    $$('#scr-game [data-cid]').forEach((node) => {
      const id = node.dataset.cid;
      seen.add(id);
      const prev = before.get(id);
      let from = prev ? prev.rect : null;
      let fromW = prev ? prev.w : 0;
      let delay = 0;
      if (anim.fromDeck && anim.fromDeck.has(id)) {
        delay = anim.fromDeck.get(id) * (anim.stagger || 70);
        if (!from) { from = deckRect; fromW = deckW; }
      }
      if (!from) return;
      const a = node.getBoundingClientRect();
      const dx = (from.left + from.width / 2) - (a.left + a.width / 2);
      const dy = (from.top + from.height / 2) - (a.top + a.height / 2);
      const sc = Math.max(0.3, Math.min(3, fromW / (node.offsetWidth || 1)));
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sc - 1) < 0.02) return;
      const fin = getComputedStyle(node).transform;
      const finT = fin && fin !== 'none' ? fin : '';
      node.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sc}) ${finT}` },
        { transform: finT || 'none' }
      ], { duration: dur, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
    // Пропавшие карты (ушли в «бито» или сброшены) — летят призраками в отбой
    const disc = $('#g-discard').getBoundingClientRect();
    before.forEach((b, id) => {
      if (seen.has(id)) return;
      ghostFly(b, disc);
    });
  }

  function ghostFly(b, target) {
    const g = b.node.cloneNode(true);
    const r = b.rect;
    g.style.setProperty('--cw', b.w + 'px');
    g.style.left = (r.left + r.width / 2 - b.w / 2) + 'px';
    g.style.top = (r.top + r.height / 2 - b.w * 0.71) + 'px';
    g.style.zIndex = 10;
    const rot = parseFloat(g.style.getPropertyValue('--rot')) || 0;
    $('#fx').appendChild(g);
    const dx = (target.left + target.width / 2) - (r.left + r.width / 2);
    const dy = (target.top + target.height / 2) - (r.top + r.height / 2);
    const anim = g.animate([
      { transform: `rotate(${rot}deg)`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot + 120}deg) scale(.85)`, opacity: 0.2 }
    ], { duration: 460, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' });
    anim.onfinish = () => g.remove();
  }

  function banner(html, small) {
    const b = $('#g-banner');
    b.innerHTML = html;
    b.classList.toggle('small', !!small);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  /* =========================================================
     Игра: ход за ходом
     ========================================================= */

  function speed() { return P.data.flags.fast ? 0.5 : 1; }

  function botDelay(kind) {
    const base = { attack: 900, defend: 750, throw: 620 }[kind] || 700;
    return (base + Math.random() * 350) * speed();
  }

  /** Решить, кто действует дальше, и запустить бота или ждать игрока */
  function step() {
    clearTimeout(G.timer);
    G.timer = null;
    const s = G.s;
    if (!s || G.over || G.busy || G.paused) return;
    if (s.over) { finishGame(); return; }
    // Пока игрок тащит карту — не меняем стол под пальцем
    if (G.drag && G.drag.moved) { G.timer = setTimeout(step, 250); return; }
    const pnd = E.pending(s);
    if (pnd.kind === 'resolve') { G.timer = setTimeout(doResolve, 420 * speed()); return; }
    if (pnd.player === HUMAN) { humanTurnStarted(pnd); return; }
    G.timer = setTimeout(() => botAct(pnd.player), botDelay(pnd.kind));
  }

  function humanTurnStarted(pnd) {
    const s = G.s;
    if (pnd.kind === 'attack' && G.lastTurnBout !== s.bout) {
      G.lastTurnBout = s.bout;
      sfx('turn');
      buzz('light');
    }
    // Подсказки обучения
    if (pnd.kind === 'attack') hint('attack', $('#g-hand'));
    else if (pnd.kind === 'defend') {
      const canTr = s.players[HUMAN].hand.some((c) => E.canTransfer(s, c.id));
      if (canTr && !P.data.flags.hints.transfer) hint('transfer', $('#g-battle'));
      else hint('defend', $('#g-battle'));
    } else if (pnd.kind === 'throw') {
      hint(s.taking ? 'take_throw' : 'throw', $('#g-action'));
    }
    if (s.bout >= 3) hint('emoji', $('#g-opps .opp-ava'));
  }

  function botAct(p) {
    const s = G.s;
    if (!s || s.over || G.over || G.busy || G.paused) return;
    if (G.drag && G.drag.moved) { G.timer = setTimeout(() => botAct(p), 250); return; }
    const pnd = E.pending(s);
    if (!pnd || pnd.player !== p) { step(); return; }
    const act = Bots.decide(s, p, G.bots[p].level);
    let r = act ? Bots.apply(s, p, act) : null;
    if (!r || !r.ok) {
      // Подстраховка на случай ошибки в ИИ: безопасный допустимый ход
      if (pnd.kind === 'defend') r = E.take(s);
      else if (pnd.kind === 'throw') r = E.pass(s, p);
      else r = E.attack(s, p, s.players[p].hand[0].id);
    }
    afterAction(p, r);
    renderGame();
    step();
  }

  /** Звуки, вибрация, реплики и задания после любого действия */
  function afterAction(p, r) {
    const s = G.s;
    if (!r || !r.ok) return;
    switch (r.type) {
      case 'attack':
        sfx('card');
        buzz('light');
        if (p === HUMAN && r.isThrow) quest('throwIn');
        if (p !== HUMAN && r.isThrow && Math.random() < 0.18) say(p, 'bigThrow');
        break;
      case 'defend': {
        const trumpHit = r.card.suit === s.trumpSuit && r.target.suit !== s.trumpSuit;
        sfx(trumpHit ? 'trump' : 'beat');
        buzz('light');
        if (p === HUMAN) {
          if (r.card.rank === 14) quest('defendAce');
          if (r.card.suit === s.trumpSuit) quest('defendTrump');
          if (r.card.rank === 14 && Math.random() < 0.4) {
            const att = r.target && s.table[r.index] ? s.table[r.index].by : -1;
            if (att > 0) setTimeout(() => throwEmoji(att, HUMAN, pick(['👀', '🔥'])), 350);
          }
        } else if (trumpHit && Math.random() < 0.3) say(p, 'trumpHit');
        break;
      }
      case 'transfer':
        sfx('transfer');
        buzz('medium');
        banner('Перевод! 🔁');
        if (p === HUMAN) {
          quest('transfer');
          P.data.stats.transfers++;
          P.save();
          if (r.to !== HUMAN && Math.random() < 0.7) say(r.to, 'transferedToMe');
        } else if (Math.random() < 0.6) say(p, 'transferBot');
        break;
      case 'take':
        sfx('take');
        buzz('medium');
        if (p !== HUMAN) say(p, 'take', true);
        break;
      default:
        break;
    }
  }

  /** Конец захода: «Бито» или «Взял», затем добор из колоды */
  async function doResolve() {
    const s = G.s;
    const token = G.token;
    if (!s || s.over || G.paused || G.busy) return;
    if (G.drag && G.drag.moved) { G.timer = setTimeout(doResolve, 250); return; }
    const pnd = E.pending(s);
    if (pnd.kind !== 'resolve') { step(); return; }
    G.busy = true;
    G.selected = null;
    renderGame({ noFlip: true });
    const took = s.taking;
    const def = s.defender;
    if (took) { banner(def === HUMAN ? 'Взял 😤' : `${esc(name(def))} берёт`); sfx('take'); }
    else { banner('Бито!'); sfx('bito'); }
    await sleep(450 * speed());
    if (token !== G.token) return;

    const info = E.resolve(s);
    if (took && def === HUMAN) {
      G.lastTaken = info.cards.map((c) => c.id);
      buzz('medium');
    }
    const fromDeck = new Map();
    info.draws.forEach((d, i) => fromDeck.set(d.card.id, i));
    renderGame({ fromDeck, stagger: 70 });
    info.draws.forEach((d, i) => setTimeout(() => { if (token === G.token) sfx('deal'); }, i * 70));

    if (!took && def !== HUMAN && Math.random() < 0.35) say(def, 'beaten');
    if (took && def === HUMAN) {
      const bot = 1 + Math.floor(Math.random() * (s.n - 1));
      if (Math.random() < 0.3) say(bot, 'humanTook');
      else if (Math.random() < 0.2) setTimeout(() => throwEmoji(bot, HUMAN, '😂'), 300);
    }

    await sleep(380 + info.draws.length * 70);
    if (token !== G.token) return;
    G.busy = false;
    info.finished.forEach((p) => { if (p !== HUMAN) say(p, 'out', true); });
    if (s.over || s.players[HUMAN].finished) { finishGame(); return; }
    renderGame({ noFlip: true });
    if (took && def === HUMAN && canChance() && App.adAvailable) hint('chance', $('#g-chance'));
    step();
  }

  /* =========================================================
     Игра: действия игрока
     ========================================================= */

  /** Что можно сделать каждой картой: { attack, targets: [индексы], transfer } */
  function humanOptions() {
    const s = G.s;
    const res = {};
    if (!s || s.over || G.over || G.busy || G.paused || s.players[HUMAN].finished) return res;
    E.legalAttackCards(s, HUMAN).forEach((c) => { res[c.id] = { attack: true }; });
    if (s.defender === HUMAN && !s.taking && E.unbeatenCount(s) > 0) {
      s.players[HUMAN].hand.forEach((c) => {
        const t = E.defenseTargets(s, c.id);
        const tr = E.canTransfer(s, c.id);
        if (t.length || tr) res[c.id] = Object.assign(res[c.id] || {}, { targets: t, transfer: tr });
      });
    }
    return res;
  }

  function actionsFor(id) {
    const o = humanOptions()[id];
    const list = [];
    if (!o) return list;
    if (o.attack) list.push({ type: 'attack' });
    (o.targets || []).forEach((i) => list.push({ type: 'defend', index: i }));
    if (o.transfer) list.push({ type: 'transfer' });
    return list;
  }

  function humanAct(cardId, action) {
    const s = G.s;
    if (!s || G.busy || G.paused || G.over) return false;
    let r;
    if (action.type === 'attack') r = E.attack(s, HUMAN, cardId);
    else if (action.type === 'defend') r = E.defend(s, action.index, cardId);
    else if (action.type === 'transfer') r = E.transfer(s, cardId);
    if (!r || !r.ok) {
      sfx('error');
      toast(r ? r.error : 'Так нельзя');
      renderGame({ noFlip: true });
      return false;
    }
    G.selected = null;
    removeHint();
    afterAction(HUMAN, r);
    renderGame();
    step();
    return true;
  }

  function humanTake() {
    const r = E.take(G.s);
    if (!r.ok) return;
    removeHint();
    afterAction(HUMAN, r);
    banner('Беру ✋');
    renderGame({ noFlip: true });
    step();
  }

  function humanPass() {
    const r = E.pass(G.s, HUMAN);
    if (!r.ok) return;
    removeHint();
    sfx('tap');
    renderGame({ noFlip: true });
    step();
  }

  function onCardTap(id, node) {
    if (G.busy || G.paused || G.over) return;
    if (G.selected === id) { G.selected = null; renderGame({ noFlip: true }); return; }
    const acts = actionsFor(id);
    if (!acts.length) {
      node.classList.remove('shake');
      void node.offsetWidth;
      node.classList.add('shake');
      if (isHumanTurn()) sfx('error');
      return;
    }
    if (acts.length === 1) { humanAct(id, acts[0]); return; }
    // У карты несколько вариантов — игрок выбирает цель тапом по столу
    G.selected = id;
    sfx('tap');
    renderGame({ noFlip: true });
    hint('select', $('#g-battle'));
  }

  /** Сыграть карту в указанную цель: { type: 'pair', index } | { type: 'table' } */
  function playDrop(id, target) {
    const acts = actionsFor(id);
    if (!acts.length) return false;
    let act = null;
    if (target.type === 'pair') {
      act = acts.find((a) => a.type === 'defend' && a.index === target.index) ||
        acts.find((a) => a.type === 'transfer') ||
        acts.find((a) => a.type === 'attack');
      if (!act && acts.some((a) => a.type === 'defend')) {
        toast('Этой картой эту не побить');
        sfx('error');
        return false;
      }
    } else {
      act = acts.find((a) => a.type === 'attack') || acts.find((a) => a.type === 'transfer') || bestDefend(acts);
    }
    if (!act) return false;
    return humanAct(id, act);
  }

  /** Если карту бросили на стол «вообще» — бьём самую старшую карту, которую она может побить */
  function bestDefend(acts) {
    const ds = acts.filter((a) => a.type === 'defend');
    if (!ds.length) return null;
    const trump = G.s.trumpSuit;
    ds.sort((x, y) => Bots.value(G.s.table[y.index].a, trump) - Bots.value(G.s.table[x.index].a, trump));
    return ds[0];
  }

  function markTargets(id) {
    clearTargets();
    const o = humanOptions()[id];
    if (!o) return;
    (o.targets || []).forEach((i) => {
      const pr = $(`#g-battle .pair[data-i="${i}"]`);
      if (pr) pr.classList.add('can-beat');
    });
    if (o.attack || o.transfer) $('#g-table').classList.add('drop-ok');
  }

  function clearTargets() {
    $$('#g-battle .pair').forEach((p) => p.classList.remove('can-beat', 'hover'));
    $('#g-table').classList.remove('drop-ok', 'drop-hover');
  }

  /* ---------- Drag & drop ---------- */

  function dropTarget(x, y) {
    for (const pr of $$('#g-battle .pair')) {
      const r = pr.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) {
        return { type: 'pair', index: Number(pr.dataset.i) };
      }
    }
    const handTop = $('#g-hand').getBoundingClientRect().top;
    const tableTop = $('#g-table').getBoundingClientRect().top;
    if (y < handTop - 6 && y > tableTop - 60) return { type: 'table' };
    return null;
  }

  function updateHover(x, y, id) {
    const t = dropTarget(x, y);
    const o = humanOptions()[id] || {};
    $$('#g-battle .pair').forEach((p) => p.classList.remove('hover'));
    $('#g-table').classList.remove('drop-hover');
    if (!t) return;
    if (t.type === 'pair' && ((o.targets || []).includes(t.index) || o.transfer || o.attack)) {
      const pr = $(`#g-battle .pair[data-i="${t.index}"]`);
      if (pr) pr.classList.add('hover');
    } else if (t.type === 'table' && (o.attack || o.transfer || (o.targets || []).length)) {
      $('#g-table').classList.add('drop-hover');
    }
  }

  function onPointerDown(e) {
    const node = e.target.closest('.card');
    if (!node || !G.s || G.over) return;
    Sound.unlock();
    G.drag = { id: node.dataset.cid, node, x0: e.clientX, y0: e.clientY, moved: false, dead: false, pid: e.pointerId };
    try { node.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  }

  function onPointerMove(e) {
    const d = G.drag;
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8 || d.dead) return;
      if (!humanOptions()[d.id]) { d.dead = true; return; }
      d.moved = true;
      G.selected = null;
      d.node.classList.add('dragging');
      d.node.classList.remove('selected');
      markTargets(d.id);
    }
    e.preventDefault();
    d.node.style.transform = `translate(${dx}px, ${dy - 10}px) scale(1.1)`;
    updateHover(e.clientX, e.clientY, d.id);
  }

  function onPointerUp(e, cancelled) {
    const d = G.drag;
    if (!d || e.pointerId !== d.pid) return;
    G.drag = null;
    if (d.moved) {
      const target = cancelled ? null : dropTarget(e.clientX, e.clientY);
      clearTargets();
      if (target && playDrop(d.id, target)) return; // карта улетит на стол из-под пальца
      // Возвращаем карту в руку плавно (через CSS-переход)
      d.node.classList.remove('dragging');
      d.node.style.transform = '';
      if (target) step();
      return;
    }
    if (!cancelled) onCardTap(d.id, d.node);
  }

  /* =========================================================
     Игра: «Второй шанс» за рекламу
     ========================================================= */

  function canChance() {
    return !!(G.s && G.lastTaken && !G.chanceUsed && !G.over && !G.busy && !G.s.over &&
      E.canSecondChance(G.s, HUMAN, G.lastTaken));
  }

  function useChance() {
    if (!canChance()) return;
    setPaused(true);
    Ads.showRewarded(() => {
      if (!G.s) return;
      const r = E.secondChance(G.s, HUMAN, G.lastTaken);
      if (r.ok) {
        G.chanceUsed = true;
        G.lastTaken = null;
        toast('Фух! Куча ушла в отбой 😮‍💨');
        sfx('bito');
        G.paused = false;
        renderGame();
      }
    }, adFail).finally(() => setPaused(false));
  }

  /* =========================================================
     Игра: пауза, сворачивание, сдача
     ========================================================= */

  function setPaused(v) {
    if (!G.s || G.over) return;
    G.paused = v;
    if (v) { clearTimeout(G.timer); G.timer = null; renderBar(); }
    else { renderGame({ noFlip: true }); step(); }
  }

  function openPause() {
    if (!G.s || G.over) return;
    setPaused(true);
    const o = G.opts;
    modal({
      emoji: '⏸',
      title: 'Пауза',
      text: o.tutorial ? 'Обучающая партия' : `${MODE_LABEL[o.mode]} · ${DIFF_LABEL[o.diff]} · ${G.s.n} игрока`,
      buttons: [
        { label: 'Продолжить', cls: 'btn-play', onClick: () => setPaused(false) },
        {
          label: P.data.flags.sound ? '🔊 Звук: вкл' : '🔇 Звук: выкл', keep: true,
          onClick: (btn) => { toggleSound(); btn.textContent = P.data.flags.sound ? '🔊 Звук: вкл' : '🔇 Звук: выкл'; }
        },
        { label: '📖 Правила', onClick: () => showRulesModal() },
        { label: '🏳️ Сдаться', onClick: () => confirmSurrender() }
      ]
    });
  }

  function showRulesModal() {
    const rules = $$('#scr-rules .rule').map((r) => r.outerHTML).join('');
    modal({
      title: 'Как играть',
      html: `<div class="rules" style="text-align:left;margin-bottom:14px">${rules}</div>`,
      buttons: [{ label: 'Продолжить', cls: 'btn-play', onClick: () => setPaused(false) }]
    });
  }

  function confirmSurrender() {
    modal({
      emoji: '🏳️',
      title: 'Сдаться?',
      text: 'Партия засчитается как поражение.',
      buttons: [
        { label: 'Играть дальше', cls: 'btn-play', onClick: () => setPaused(false) },
        { label: 'Сдаться', onClick: () => { G.paused = false; finishGame('surrender'); } }
      ]
    });
  }

  function onHide() {
    Sound.suspend();
    if (App.screen === 'game' && G.s && !G.over && !G.paused) {
      G.autoPaused = true;
      setPaused(true);
    }
  }

  function onRestore() {
    Sound.resume();
    if (G.autoPaused) {
      G.autoPaused = false;
      if (!$('#modal-root').children.length) setPaused(false);
    }
  }

  /* =========================================================
     Реплики и эмодзи
     ========================================================= */

  function say(p, key, force) {
    if (p === HUMAN || !G.bots[p] || !PHRASES[key]) return;
    const now = Date.now();
    if (!force && (G.bubbleCd[p] || 0) > now) return;
    G.bubbleCd[p] = now + 2600;
    const b = $(`.opp[data-p="${p}"] .bubble`);
    if (!b) return;
    b.textContent = pick(PHRASES[key]);
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('show'), 2300);
  }

  function avatarNode(p) {
    return p === HUMAN ? $('#g-me-ava') : $(`.opp[data-p="${p}"] .opp-ava`);
  }

  function openEmojiPicker(p, oppEl) {
    closePicker();
    if (!G.s || G.over) return;
    Sound.unlock();
    const r = $('.opp-ava', oppEl).getBoundingClientRect();
    const pk = el('div', 'emoji-picker');
    EMOJIS.forEach((em) => {
      const b = el('button', null, em);
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closePicker();
        throwEmoji(HUMAN, p, em);
      });
      pk.appendChild(b);
    });
    document.body.appendChild(pk);
    const w = pk.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    pk.style.left = left + 'px';
    pk.style.top = (r.bottom + 10) + 'px';
    G.picker = pk;
    removeHint();
    P.data.flags.hints.emoji = 1;
  }

  function closePicker() {
    if (G.picker) { G.picker.remove(); G.picker = null; }
  }

  function throwEmoji(from, to, emoji) {
    if (!G.s || App.screen !== 'game') return;
    if (from === HUMAN) {
      if (Date.now() < G.emojiCd) { toast('Не так быстро 😅'); return; }
      G.emojiCd = Date.now() + 1200;
      quest('emoji');
    }
    const an = avatarNode(from);
    const bn = avatarNode(to);
    if (!an || !bn) return;
    const a = an.getBoundingClientRect();
    const b = bn.getBoundingClientRect();
    const ax = a.left + a.width / 2 - 17, ay = a.top + a.height / 2 - 17;
    const bx = b.left + b.width / 2 - 17, by = b.top + b.height / 2 - 17;
    const mx = (ax + bx) / 2 + (Math.random() - 0.5) * 60, my = Math.min(ay, by) - 50;
    const f = el('div', 'fly-emoji', emoji);
    $('#fx').appendChild(f);
    sfx('pop');
    const anim = f.animate([
      { transform: `translate(${ax}px, ${ay}px) scale(.6) rotate(0deg)` },
      { transform: `translate(${mx}px, ${my}px) scale(1.4) rotate(200deg)`, offset: 0.5 },
      { transform: `translate(${bx}px, ${by}px) scale(1) rotate(360deg)` }
    ], { duration: 650, easing: 'ease-in-out' });
    anim.onfinish = () => {
      f.remove();
      const burst = el('div', 'emoji-burst', emoji);
      burst.style.left = (bx + 17) + 'px';
      burst.style.top = (by + 17) + 'px';
      $('#fx').appendChild(burst);
      setTimeout(() => burst.remove(), 850);
      sfx('pop');
      if (to === HUMAN) { buzz('light'); return; }
      const opp = $(`.opp[data-p="${to}"]`);
      if (opp) { opp.classList.remove('hit'); void opp.offsetWidth; opp.classList.add('hit'); }
      if (from === HUMAN) {
        if (Math.random() < 0.55) setTimeout(() => say(to, 'emojiReply', true), 350);
        else if (Math.random() < 0.35) setTimeout(() => throwEmoji(to, HUMAN, pick(EMOJIS)), 700);
      }
    };
  }

  /* =========================================================
     Подсказки обучения
     ========================================================= */

  function hint(key, target, vars) {
    if (!target || P.data.flags.hints[key] || G.hintEl) return;
    if (App.screen !== 'game') return;
    let text = HINTS[key];
    if (vars) Object.keys(vars).forEach((k) => { text = text.replace('{' + k + '}', vars[k]); });
    P.data.flags.hints[key] = 1;
    P.save();
    const h = el('div', 'hint', `${text}<small>Понятно ✓</small>`);
    document.body.appendChild(h);
    const r = target.getBoundingClientRect();
    const hw = h.offsetWidth, hh = h.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left + r.width / 2 - hw / 2;
    left = Math.max(12, Math.min(vw - hw - 12, left));
    let top;
    if (target.id === 'g-battle' || target.id === 'g-table') top = r.top + 10; // над картами стола, не закрывая руку и кнопки
    else top = r.top + r.height / 2 > vh * 0.55 ? r.top - hh - 12 : r.bottom + 12;
    top = Math.max(12, Math.min(vh - hh - 12, top));
    h.style.left = left + 'px';
    h.style.top = top + 'px';
    h.addEventListener('click', removeHint);
    G.hintEl = h;
    clearTimeout(G.hintTimer);
    G.hintTimer = setTimeout(removeHint, 7000);
  }

  function removeHint() {
    if (G.hintEl) { G.hintEl.remove(); G.hintEl = null; }
  }

  /* =========================================================
     Конец партии и экран результата
     ========================================================= */

  function finishGame(forced) {
    if (G.over || !G.s) return;
    G.over = true;
    clearTimeout(G.timer);
    removeHint();
    const s = G.s;
    let outcome;
    let durak = -1;
    if (forced === 'surrender') {
      outcome = 'lose';
      durak = HUMAN;
    } else if (s.over) {
      if (s.result.draw) outcome = 'draw';
      else { durak = s.result.durak; outcome = durak === HUMAN ? 'lose' : 'win'; }
    } else {
      // Игрок вышел, а боты ещё играют: быстро доигрываем за них, чтобы узнать дурака
      outcome = 'win';
      const sim = E.cloneState(s);
      Bots.playOut(sim, G.bots.map((b) => (b ? b.level : 'normal')));
      durak = sim.result.draw ? -1 : sim.result.durak;
    }

    const firstTutorial = !!G.opts.tutorial && !P.data.flags.tut;
    const rewards = P.recordGame({ outcome, diff: G.opts.diff, players: s.n, tutorial: firstTutorial });
    if (G.opts.tutorial) { P.data.flags.tut = true; P.save(); }
    quest('game');
    if (outcome === 'win') {
      quest('win');
      if (G.opts.diff === 'pro') quest('winPro');
      if (s.n >= 3) quest('winMulti');
    }
    quest('streak', P.data.stats.streak);
    Ads.onGameFinished();
    P.saveNow();

    if (durak > 0) say(durak, 'durak', true);
    for (let p = 1; p < s.n; p++) if (p !== durak && Math.random() < 0.5) say(p, 'win', true);
    renderGame({ noFlip: true });
    banner(outcome === 'win' ? 'Победа! 😎' : outcome === 'lose' ? (forced ? 'Сдался 🏳️' : 'Эх… 🤡') : 'Ничья 🤝');
    sfx(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
    if (P.data.flags.vibro) VK.hapticNotify(outcome === 'win' ? 'success' : 'warning');
    const token = G.token;
    setTimeout(() => { if (token === G.token) showResult({ outcome, durak, rewards, firstTutorial }); }, 1600);
  }

  function showResult(res) {
    G.result = res;
    const { outcome, durak, rewards } = res;
    const durakName = durak > 0 ? `${G.bots[durak].name} ${G.bots[durak].emoji}` : '';
    const T = {
      win: { emoji: '😎', title: 'Ты не дурак', sub: durakName ? `В дураках остаётся ${durakName}` : 'Красиво сыграно!' },
      lose: { emoji: '🤡', title: 'Сегодня ты дурак', sub: pick(['Бывает. Реванш?', 'Карта не пошла 🙃', 'В следующий раз точно!', 'Даже легенды иногда в дураках']) },
      draw: { emoji: '🤝', title: 'Ничья', sub: 'Карты закончились у всех одновременно' }
    }[outcome];
    const em = $('#r-emoji');
    em.textContent = T.emoji;
    em.classList.remove('anim');
    void em.offsetWidth;
    em.classList.add('anim');
    $('#r-title').textContent = T.title;
    $('#r-sub').textContent = T.sub + (res.firstTutorial ? ' · +50 🪙 за обучение' : '');
    $('#r-coins').textContent = '+' + (rewards.coins + rewards.streakBonus);
    $('#r-xp').textContent = '+' + rewards.xp;
    $('#r-streak').textContent = rewards.streak;
    $('#r-streak-box').hidden = rewards.streak < 1;
    const lv = P.levelInfo();
    $('#r-rank').textContent = lv.rank;
    $('#r-lvl').textContent = `ур. ${lv.level} · ${lv.cur}/${lv.need} XP`;
    $('#r-xpbar').style.width = '0%';
    setTimeout(() => { $('#r-xpbar').style.width = Math.round(100 * lv.cur / lv.need) + '%'; }, 250);

    const dbl = $('#r-double');
    dbl.hidden = outcome !== 'win' || rewards.coins <= 0;
    dbl.dataset.used = '';
    setAdButton(dbl, `🎬 x2 монет (+${rewards.coins} 🪙)`);
    $('#r-again').textContent = G.opts.tutorial ? 'Играть' : 'Ещё раз';
    updateCoins();
    show('result');

    let delay = 600;
    if (rewards.level.levelUp) {
      setTimeout(() => showLevelUp(rewards.level), delay);
      delay += 400;
    }
    // Предложение добавить игру в избранное — после 3-й партии, один раз
    if (P.data.stats.games >= 3 && !P.data.flags.fav && VK.available()) {
      P.data.flags.fav = true;
      P.save();
      setTimeout(askFavorites, delay + 1400);
    }
  }

  function showLevelUp(lv) {
    sfx('level');
    const skins = lv.unlocked && lv.unlocked.length ? `<p>🎨 Новый скин: <b>${lv.unlocked.map((s) => s.name).join(', ')}</b></p>` : '';
    modal({
      emoji: lv.rankUp ? '👑' : '🎉',
      title: `Уровень ${lv.level}!`,
      text: lv.rankUp ? `Новый ранг: <b>${lv.rank}</b>` : `Ранг: ${lv.rank}`,
      html: skins,
      buttons: [{ label: 'Круто!', cls: 'btn-play' }]
    });
  }

  function askFavorites() {
    if (App.screen !== 'result' && App.screen !== 'menu') return;
    modal({
      emoji: '⭐',
      title: 'Нравится игра?',
      text: 'Добавь «Дурак Неон» в избранное, чтобы быстро возвращаться к партиям.',
      buttons: [
        { label: '⭐ В избранное', cls: 'btn-play', onClick: () => VK.addToFavorites().then(() => toast('Добавлено в избранное ⭐')).catch(() => {}) },
        { label: 'Позже' }
      ]
    });
  }

  function doubleCoins() {
    const res = G.result;
    const btn = $('#r-double');
    if (!res || btn.dataset.used) return;
    Ads.showRewarded(() => {
      btn.dataset.used = '1';
      P.addCoins(res.rewards.coins);
      $('#r-coins').textContent = '+' + (res.rewards.coins * 2 + res.rewards.streakBonus);
      btn.hidden = true;
      coinBurst($('#r-coins'));
      toast(`x2! +${res.rewards.coins} 🪙`);
    }, adFail);
  }

  async function playAgain() {
    const again = G.opts && !G.opts.tutorial ? Object.assign({}, G.opts) : {};
    delete again.tutorial;
    await Ads.maybeShowInterstitial(); // только между партиями
    startGame(again);
  }

  async function backToMenu() {
    await Ads.maybeShowInterstitial();
    goMenu();
  }

  /* =========================================================
     Поделиться и пригласить
     ========================================================= */

  function shareText() {
    const r = G.result || { outcome: 'win' };
    const o = G.opts || P.data.setup;
    const mode = `${MODE_LABEL[o.mode] || ''}, соперники «${DIFF_LABEL[o.diff] || ''}»`;
    if (r.outcome === 'win') return `Я не дурак 😎 Победа в «Дурак Неон» (${mode}). Серия побед: ${P.data.stats.streak} 🔥 А ты сможешь?`;
    if (r.outcome === 'lose') return `Сегодня я дурак 🤡 Но реванш уже близко! «Дурак Неон» — заходи сыграть.`;
    return `Ничья в «Дурак Неон» 🤝 Карты кончились у всех сразу — так тоже бывает!`;
  }

  function openShare() {
    const text = shareText();
    if (!VK.available()) {
      // Вне ВК — системное «Поделиться» или копирование текста
      if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => toast('Текст скопирован 📋')).catch(() => toast('Поделиться можно в приложении ВКонтакте'));
        return;
      }
      toast('Поделиться можно в приложении ВКонтакте');
      return;
    }
    modal({
      emoji: '📤',
      title: 'Поделиться результатом',
      text: 'Похвастайся друзьям — пусть попробуют не остаться в дураках!',
      buttons: [
        { label: '📸 В историю', cls: 'btn-play', onClick: () => VK.story(makeStoryImage()).then(() => toast('История готова 🔥')).catch(() => {}) },
        { label: '📝 На стену', onClick: () => VK.wallPost(text).then(() => toast('Опубликовано 🔥')).catch(() => {}) },
        { label: 'Отмена' }
      ]
    });
  }

  function invite() {
    sfx('tap');
    if (!VK.available()) { toast('Приглашать друзей можно в приложении ВКонтакте'); return; }
    VK.invite().then(() => toast('Приглашения отправлены 💌')).catch(() => {});
  }

  /** Картинка для истории ВК 1080×1920 в стиле мема */
  function makeStoryImage() {
    const r = G.result || { outcome: 'win' };
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1920;
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, 1920);
    bg.addColorStop(0, '#24104f');
    bg.addColorStop(0.5, '#0b0a1a');
    bg.addColorStop(1, '#3d0c3f');
    x.fillStyle = bg;
    x.fillRect(0, 0, 1080, 1920);
    const glow = (cx, cy, rad, col) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 1080, 1920);
    };
    glow(180, 300, 600, 'rgba(168,85,247,.45)');
    glow(920, 1650, 650, 'rgba(34,228,208,.3)');
    glow(900, 500, 400, 'rgba(255,79,163,.3)');

    // Веер карт
    const drawCard = (cx, cy, ang, rank, suit, red) => {
      x.save();
      x.translate(cx, cy);
      x.rotate(ang);
      x.shadowColor = 'rgba(0,0,0,.5)';
      x.shadowBlur = 30;
      x.fillStyle = '#fff';
      roundRect(x, -110, -155, 220, 310, 26);
      x.fill();
      x.shadowBlur = 0;
      x.fillStyle = red ? '#f0245f' : '#221a3d';
      x.font = '900 64px Unbounded, Arial, sans-serif';
      x.textAlign = 'center';
      x.fillText(rank, -62, -80);
      x.font = '150px Arial, sans-serif';
      x.fillText(suit, 0, 55);
      x.restore();
    };
    drawCard(380, 470, -0.32, 'Т', '♠', false);
    drawCard(700, 470, 0.32, '6', '♦', true);
    drawCard(540, 430, 0, 'Т', '♥', true);

    const emoji = { win: '😎', lose: '🤡', draw: '🤝' }[r.outcome];
    const title = { win: 'ТЫ НЕ ДУРАК', lose: 'СЕГОДНЯ Я ДУРАК', draw: 'НИЧЬЯ' }[r.outcome];
    x.textAlign = 'center';
    x.font = '260px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.fillText(emoji, 540, 1000);
    x.font = '900 116px Impact, "Arial Black", Unbounded, sans-serif';
    x.lineJoin = 'round';
    const lines = r.outcome === 'win' ? ['Я НЕ ДУРАК'] : title.split(' ').length > 2 ? ['СЕГОДНЯ', 'Я ДУРАК'] : [title];
    lines.forEach((line, i) => {
      const y = 1200 + i * 130;
      x.lineWidth = 18;
      x.strokeStyle = '#000';
      x.strokeText(line, 540, y);
      x.fillStyle = '#fff';
      x.fillText(line, 540, y);
    });
    const lv = P.levelInfo();
    const st = P.data.stats;
    x.font = '600 44px Unbounded, Arial, sans-serif';
    x.fillStyle = '#c9c2ee';
    x.fillText(`${lv.rank} · уровень ${lv.level}`, 540, 1470);
    x.fillText(`Побед: ${st.wins} · Винрейт: ${P.winrate()}%` + (st.streak > 1 ? ` · 🔥${st.streak}` : ''), 540, 1540);
    x.font = '900 84px Unbounded, Arial, sans-serif';
    x.shadowColor = '#a855f7';
    x.shadowBlur = 40;
    x.fillStyle = '#fff';
    x.fillText('ДУРАК НЕОН', 540, 1740);
    x.shadowBlur = 0;
    x.font = '600 40px Unbounded, Arial, sans-serif';
    x.fillStyle = '#22e4d0';
    x.fillText('Сыграй во ВКонтакте', 540, 1810);
    return c.toDataURL('image/jpeg', 0.88);
  }

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t);
    x.arcTo(l + w, t, l + w, t + h, r);
    x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r);
    x.arcTo(l, t, l + w, t, r);
    x.closePath();
  }

  /* =========================================================
     Привязка обработчиков
     ========================================================= */

  function bindUI() {
    // Первый жест пользователя включает звук
    document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });
    document.addEventListener('pointerdown', (e) => {
      if (G.picker && !G.picker.contains(e.target)) closePicker();
    });

    // Меню
    $('#m-play').onclick = () => { sfx('tap'); startGame(); };
    $('#m-sound').onclick = toggleSound;
    $('#m-profile').onclick = () => { sfx('tap'); openProfile(); };
    $('#m-prof').onclick = () => { sfx('tap'); openProfile(); };
    $('#m-shop').onclick = () => { sfx('tap'); openShop(); };
    $('#m-quests').onclick = () => { sfx('tap'); openQuests(); };
    $('#m-rules').onclick = () => { sfx('tap'); openRules(false); };
    $('#m-invite').onclick = invite;
    $('#m-adbonus').onclick = () => {
      if (P.adBonusLeft() <= 0) return;
      Ads.showRewarded(() => { P.useAdBonus(); coinBurst($('#m-adbonus')); renderMenu(); }, adFail);
    };
    [['#seg-mode', 'mode'], ['#seg-diff', 'diff'], ['#seg-players', 'players']].forEach(([sel, key]) => {
      $$(sel + ' button').forEach((b) => {
        b.onclick = () => {
          P.data.setup[key] = key === 'players' ? Number(b.dataset.v) : b.dataset.v;
          P.save();
          sfx('tap');
          markSeg(sel, b.dataset.v);
        };
      });
    });
    $$('[data-back]').forEach((b) => { b.onclick = () => { sfx('tap'); goMenu(); }; });

    // Игра
    const hand = $('#g-hand');
    hand.addEventListener('pointerdown', onPointerDown);
    hand.addEventListener('pointermove', onPointerMove);
    hand.addEventListener('pointerup', (e) => onPointerUp(e, false));
    hand.addEventListener('pointercancel', (e) => onPointerUp(e, true));
    $('#g-table').addEventListener('click', (e) => {
      if (!G.selected) return;
      const pr = e.target.closest('.pair');
      const id = G.selected;
      const ok = playDrop(id, pr ? { type: 'pair', index: Number(pr.dataset.i) } : { type: 'table' });
      if (!ok) { G.selected = null; renderGame({ noFlip: true }); }
    });
    $('#g-action').onclick = () => { if (G.actionFn) G.actionFn(); };
    $('#g-chance').onclick = useChance;
    $('#g-menu').onclick = () => { sfx('tap'); openPause(); };
    $('#g-sound').onclick = toggleSound;

    // Результат
    $('#r-again').onclick = () => { sfx('tap'); playAgain(); };
    $('#r-menu').onclick = () => { sfx('tap'); backToMenu(); };
    $('#r-share').onclick = () => { sfx('tap'); openShare(); };
    $('#r-double').onclick = doubleCoins;

    // Профиль
    $('#set-sound').onchange = (e) => { P.data.flags.sound = e.target.checked; Sound.setEnabled(e.target.checked); P.save(); updateSoundIcons(); };
    $('#set-vibro').onchange = (e) => { P.data.flags.vibro = e.target.checked; P.save(); if (e.target.checked) VK.haptic('medium'); };
    $('#set-fast').onchange = (e) => { P.data.flags.fast = e.target.checked; P.save(); };
    $('#p-tutorial').onclick = () => { P.data.flags.hints = {}; P.save(); startGame({ tutorial: true }); };
    $('#p-fav').onclick = () => {
      if (!VK.available()) { toast('Доступно в приложении ВКонтакте'); return; }
      VK.addToFavorites().then(() => toast('Добавлено в избранное ⭐')).catch(() => {});
    };

    // Правила
    $('#rules-tutorial').onclick = () => { sfx('tap'); P.data.flags.hints = {}; startGame({ tutorial: true }); };
    $('#rules-skip').onclick = () => { P.data.flags.tut = true; P.save(); goMenu(); };

    // Реклама: доступность роликов и пауза звука на время показа
    Ads.onAvailabilityChange((v) => {
      App.adAvailable = v;
      $$('[data-ad]').forEach(applyAdButton);
      if (App.screen === 'game') renderBar();
    });
    Ads.setHooks(() => Sound.suspend(), () => Sound.resume());

    // Сворачивание приложения
    document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); else onRestore(); });
    VK.on('VKWebAppViewHide', onHide);
    VK.on('VKWebAppViewRestore', onRestore);

    // Размеры экрана
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        updateSizes();
        if (App.screen === 'game' && G.s) renderGame({ noFlip: true });
      }, 120);
    });

    // Карты у краёв стола выступают за экран: не даём браузеру «прокрутить» контейнеры с overflow: hidden
    document.addEventListener('scroll', (e) => {
      const t = e.target;
      if (t && t.nodeType === 1 && !t.classList.contains('scroll') && !t.classList.contains('res') && !t.classList.contains('modal')) {
        if (t.scrollLeft) t.scrollLeft = 0;
        if (t.scrollTop) t.scrollTop = 0;
      }
    }, true);

    // Сохранение при закрытии
    window.addEventListener('pagehide', () => P.saveNow());

    // Периодически проверяем, появилась ли реклама (кнопки оживают сами)
    setInterval(() => {
      if (App.screen !== 'game' || canChance()) Ads.isRewardedAvailable(true);
    }, 30000);
  }

  // Для отладки и автотестов
  window.DurakGame = { G, App, startGame, goMenu, finishGame, humanAct, actionsFor, step, makeStoryImage };

  document.addEventListener('DOMContentLoaded', boot);
})();
