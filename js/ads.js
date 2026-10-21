/**
 * ads.js — вся реклама VK в одном месте.
 *
 * Публичные функции:
 *   Ads.showInterstitial()          — межстраничная реклама (сама по себе, без проверок частоты);
 *   Ads.maybeShowInterstitial()     — межстраничная с правилами: только между партиями,
 *                                     не раньше 2-й партии сессии и не чаще раза в 3 партии;
 *   Ads.showRewarded(onReward, onFail) — реклама за вознаграждение, только по нажатию игрока;
 *   Ads.isRewardedAvailable()       — есть ли сейчас ролик (для кнопок);
 *   Ads.onGameFinished()            — сообщить, что партия закончилась (для подсчёта частоты).
 *
 * Перед каждым показом проверяем наличие рекламы через VKWebAppCheckNativeAds.
 * Любая ошибка или отсутствие рекламы не ломает игру: функции просто возвращают false.
 *
 * Для проверки вне ВК добавьте к адресу ?mockads=1 — реклама будет имитироваться.
 */
(function (global) {
  'use strict';

  var VK = global.VK;
  var MOCK = /[?&]mockads=1/.test(global.location.search);

  var INTERSTITIAL_FIRST_GAME = 2;  // не раньше 2-й партии сессии
  var INTERSTITIAL_EVERY = 3;       // не чаще одного раза в 3 партии
  var AFTER_REWARD_PAUSE = 60000;   // не показываем межстраничную сразу после ролика за награду

  var state = {
    sessionGames: 0,
    lastInterstitialGame: null,
    lastRewardAt: 0,
    busy: false,
    rewardAvailable: null,  // кэш последней проверки
    checkedAt: 0
  };

  var changeListeners = [];
  var hooks = { before: null, after: null };

  /** Проверить наличие рекламы нужного формата */
  function check(format) {
    if (MOCK) return Promise.resolve(true);
    if (!VK || !VK.available()) return Promise.resolve(false);
    return VK.send('VKWebAppCheckNativeAds', { ad_format: format }, 5000)
      .then(function (r) { return !!(r && r.result); })
      .catch(function () { return false; });
  }

  /** Показать рекламу формата format. true — показана (для reward — досмотрена) */
  function show(format) {
    if (MOCK) return mockShow(format);
    return VK.send('VKWebAppShowNativeAds', { ad_format: format }, format === 'reward' ? 180000 : 90000)
      .then(function (r) { return !!(r && r.result); })
      .catch(function () { return false; });
  }

  function setRewardAvailable(v) {
    state.rewardAvailable = v;
    state.checkedAt = Date.now();
    changeListeners.forEach(function (cb) { cb(v); });
  }

  /** Есть ли ролик за вознаграждение (с кэшем на 20 секунд) */
  function isRewardedAvailable(force) {
    if (!force && state.rewardAvailable !== null && Date.now() - state.checkedAt < 20000) {
      return Promise.resolve(state.rewardAvailable);
    }
    return check('reward').then(function (ok) { setRewardAvailable(ok); return ok; });
  }

  function runShow(format) {
    state.busy = true;
    if (hooks.before) hooks.before(format); // например, выключить звук
    return show(format).then(function (ok) {
      state.busy = false;
      if (hooks.after) hooks.after(format);
      return ok;
    });
  }

  /** Межстраничная реклама (только вызывать между партиями!) */
  function showInterstitial() {
    if (state.busy) return Promise.resolve(false);
    return check('interstitial').then(function (ok) {
      if (!ok) return false;
      return runShow('interstitial');
    });
  }

  /** Межстраничная по правилам частоты. Всегда резолвится, игру не блокирует надолго */
  function maybeShowInterstitial() {
    var n = state.sessionGames;
    if (n < INTERSTITIAL_FIRST_GAME) return Promise.resolve(false);
    if (state.lastInterstitialGame !== null && n - state.lastInterstitialGame < INTERSTITIAL_EVERY) return Promise.resolve(false);
    if (Date.now() - state.lastRewardAt < AFTER_REWARD_PAUSE) return Promise.resolve(false);
    return showInterstitial().then(function (shown) {
      if (shown) state.lastInterstitialGame = n;
      return shown;
    });
  }

  /**
   * Реклама за вознаграждение. onReward вызывается только если ролик досмотрен.
   * onFail(reason): 'unavailable' — рекламы нет, 'skipped' — не досмотрел/ошибка.
   */
  function showRewarded(onReward, onFail) {
    if (state.busy) return Promise.resolve(false);
    return check('reward').then(function (ok) {
      if (!ok) {
        setRewardAvailable(false);
        if (onFail) onFail('unavailable');
        return false;
      }
      return runShow('reward').then(function (watched) {
        if (watched) {
          state.lastRewardAt = Date.now();
          if (onReward) onReward();
        } else if (onFail) {
          onFail('skipped');
        }
        // Подгружаем следующий ролик заранее
        isRewardedAvailable(true);
        return watched;
      });
    });
  }

  function onGameFinished() { state.sessionGames++; }

  /* ---------- Имитация рекламы для локальной проверки (?mockads=1) ---------- */

  function mockShow(format) {
    return new Promise(function (resolve) {
      var box = document.createElement('div');
      box.className = 'mock-ad';
      var secs = format === 'reward' ? 3 : 2;
      box.innerHTML = '<div class="mock-ad-inner"><b>Реклама (тест)</b><p>' +
        (format === 'reward' ? 'Ролик за награду' : 'Межстраничная реклама') +
        '</p><span class="mock-ad-timer">' + secs + '</span><button class="btn btn-ghost mock-skip">Закрыть</button></div>';
      document.body.appendChild(box);
      var timer = box.querySelector('.mock-ad-timer');
      var left = secs;
      var iv = setInterval(function () {
        left--;
        timer.textContent = left > 0 ? left : '✓';
        if (left <= 0) { clearInterval(iv); finish(true); }
      }, 1000);
      box.querySelector('.mock-skip').onclick = function () { clearInterval(iv); finish(left <= 0 || format !== 'reward'); };
      var finished = false;
      function finish(ok) {
        if (finished) return;
        finished = true;
        box.remove();
        resolve(ok);
      }
    });
  }

  global.Ads = {
    MOCK: MOCK,
    showInterstitial: showInterstitial,
    maybeShowInterstitial: maybeShowInterstitial,
    showRewarded: showRewarded,
    isRewardedAvailable: isRewardedAvailable,
    onGameFinished: onGameFinished,
    onAvailabilityChange: function (cb) { changeListeners.push(cb); },
    setHooks: function (before, after) { hooks.before = before; hooks.after = after; },
    get sessionGames() { return state.sessionGames; }
  };
})(window);
