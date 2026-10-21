/**
 * vk.js — обёртка над VK Bridge.
 *
 * Все вызовы возвращают Promise и имеют таймаут: вне ВК (обычный браузер) Bridge
 * может не ответить вовсе, и игра не должна из-за этого зависнуть.
 * Если Bridge недоступен, методы сразу отклоняются, а игра использует запасные варианты
 * (localStorage, системное «Поделиться», navigator.vibrate).
 */
(function (global) {
  'use strict';

  /**
   * VK Bridge подключаем с CDN. Если CDN не ответил за 3 секунды или недоступен —
   * берём локальную копию из js/vendor. Так игра не зависнет на загрузке при плохой сети.
   */
  var CDN_URL = 'https://unpkg.com/@vkontakte/vk-bridge@3.0.2/dist/browser.min.js';
  var LOCAL_URL = 'js/vendor/vk-bridge.min.js';

  var bridge = null;
  var embedded = false;

  /** Параметры запуска из адресной строки (vk_app_id, vk_user_id, vk_platform …) */
  var launch = {};
  try {
    new URLSearchParams(global.location.search).forEach(function (v, k) { launch[k] = v; });
  } catch (e) { /* очень старый браузер */ }

  var isWebView = !!(global.AndroidBridge || (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.VKWebAppClose) || global.ReactNativeWebView);

  function loadScript(src, timeoutMs) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var done = false;
      var finish = function (ok) { if (!done) { done = true; resolve(ok); } };
      var t = setTimeout(function () { finish(false); }, timeoutMs);
      s.src = src;
      s.async = true;
      s.onload = function () { clearTimeout(t); finish(!!global.vkBridge); };
      s.onerror = function () { clearTimeout(t); finish(false); };
      document.head.appendChild(s);
    });
  }

  /** Промис готовности: Bridge загружен (или точно недоступен) */
  var ready = (global.vkBridge ? Promise.resolve(true) : loadScript(CDN_URL, 3000).then(function (ok) {
    return ok || global.vkBridge ? true : loadScript(LOCAL_URL, 3000);
  })).then(function () {
    bridge = global.vkBridge || null;
    /*
     * Запущены ли мы внутри ВК: WebView мобильного клиента или iframe на сайте.
     * ВК всегда передаёт параметры запуска (vk_app_id и др.) — без них считаем,
     * что это локальный запуск в браузере, и работаем на запасных вариантах.
     */
    embedded = !!bridge &&
      (typeof bridge.isEmbedded === 'function' ? bridge.isEmbedded() : (isWebView || global.parent !== global)) &&
      (!!launch.vk_app_id || isWebView);
    if (embedded) {
      bridge.subscribe(function (e) {
        var type = e && e.detail && e.detail.type;
        if (type && listeners[type]) listeners[type].forEach(function (cb) { cb(e.detail.data); });
      });
    }
    return embedded;
  });

  var listeners = {};

  function available() { return embedded; }

  /** Отправить метод Bridge с таймаутом */
  function send(method, params, timeoutMs) {
    if (!embedded) return Promise.reject(new Error('VK Bridge недоступен'));
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('Таймаут ' + method));
      }, timeoutMs || 5000);
      bridge.send(method, params || {}).then(function (res) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(res);
      }).catch(function (err) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(err);
      });
    });
  }

  /** Подписка на события ВК (сворачивание приложения и т. п.) */
  function on(eventType, cb) {
    (listeners[eventType] = listeners[eventType] || []).push(cb);
  }

  var VK = {
    ready: ready,
    available: available,
    launch: launch,
    appId: launch.vk_app_id || null,
    platform: launch.vk_platform || 'web',
    send: send,
    on: on,

    /** VKWebAppInit — сообщаем клиенту, что приложение готово */
    init: function () {
      return ready.then(function () {
        if (!embedded) return false;
        return VK._init();
      });
    },

    _init: function () {
      return send('VKWebAppInit', {}, 4000).then(function () {
        // Тёмная тема: светлые иконки статус-бара на мобильных (на десктопе метод не поддерживается)
        send('VKWebAppSetViewSettings', { status_bar_style: 'light', action_bar_color: '#0b0a1a' }, 2000).catch(function () {});
        return true;
      }).catch(function () { return false; });
    },

    /** Имя и аватар игрока */
    getUser: function () {
      return send('VKWebAppGetUserInfo', {}, 4000).then(function (u) {
        return { id: u.id, name: u.first_name || 'Игрок', photo: u.photo_100 || u.photo_200 || null };
      });
    },

    storageGet: function (key) {
      return send('VKWebAppStorageGet', { keys: [key] }, 3500).then(function (res) {
        var item = (res.keys || []).filter(function (k) { return k.key === key; })[0];
        return item ? item.value : '';
      });
    },

    storageSet: function (key, value) {
      return send('VKWebAppStorageSet', { key: key, value: value }, 4000);
    },

    /** Лёгкая вибрация: style = 'light' | 'medium' | 'heavy' */
    haptic: function (style) {
      if (embedded) {
        send('VKWebAppTapticImpactOccurred', { style: style || 'light' }, 1500).catch(function () {});
      } else if (global.navigator && global.navigator.vibrate) {
        try { global.navigator.vibrate(style === 'heavy' ? 30 : style === 'medium' ? 18 : 8); } catch (e) {}
      }
    },

    /** Вибро-уведомление: type = 'success' | 'warning' | 'error' */
    hapticNotify: function (type) {
      if (embedded) {
        send('VKWebAppTapticNotificationOccurred', { type: type }, 1500).catch(function () {});
      } else if (global.navigator && global.navigator.vibrate) {
        try { global.navigator.vibrate(type === 'success' ? [10, 40, 10] : [30]); } catch (e) {}
      }
    },

    /** Ссылка на приложение для постов и приглашений */
    appLink: function () {
      return VK.appId ? 'https://vk.ru/app' + VK.appId : '';
    },

    /** Пост на стену */
    wallPost: function (message) {
      var link = VK.appLink();
      var params = { message: message + (link ? '\n' + link : '') };
      if (link) params.attachments = link;
      return send('VKWebAppShowWallPostBox', params, 120000);
    },

    /** История с картинкой (dataURL base64) и кнопкой-ссылкой на игру */
    story: function (dataUrl) {
      var params = { background_type: 'image', blob: dataUrl, locked: true };
      var link = VK.appLink();
      if (link) params.attachment = { text: 'go_to', type: 'url', url: link };
      return send('VKWebAppShowStoryBox', params, 120000);
    },

    invite: function () {
      return send('VKWebAppShowInviteBox', {}, 120000);
    },

    addToFavorites: function () {
      return send('VKWebAppAddToFavorites', {}, 60000);
    }
  };

  global.VK = VK;
})(window);
