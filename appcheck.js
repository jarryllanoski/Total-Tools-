(function (global) {
  'use strict';

  var SDK_VERSION = '12.18.0';
  var BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';

  var SITE_KEY = '6LfAxKwtAAAAAA8jTMPvioWwx2CHCWSOwVHa5twb';

  var _appCheckPromise = null;

  function _init() {
    if (_appCheckPromise) return _appCheckPromise;
    _appCheckPromise = (async function () {
      var cfg = global.FBConfig || {};
      if (!cfg.KEY || !cfg.PRJ || !cfg.APP_ID) return null;
      try {
        var appMod = await import(BASE + 'firebase-app.js');
        var acMod = await import(BASE + 'firebase-app-check.js');
        var app = appMod.initializeApp({
          apiKey: cfg.KEY,
          authDomain: cfg.AUTH_DOMAIN,
          projectId: cfg.PRJ,
          appId: cfg.APP_ID
        });
        var appCheck = acMod.initializeAppCheck(app, {
          provider: new acMod.ReCaptchaEnterpriseProvider(SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        return {appCheck: appCheck, getToken: acMod.getToken};
      } catch (e) {
        console.warn('[AppCheck] no se pudo inicializar (se sigue sin él):', e && e.message);
        return null;
      }
    })();
    return _appCheckPromise;
  }

  global._appCheckToken = async function () {
    try {
      var ctx = await _init();
      if (!ctx) { _appCheckPromise = null; return ''; }
      var r = await ctx.getToken(ctx.appCheck,  false);
      return (r && r.token) || '';
    } catch (e) {
      return '';
    }
  };

  function _enLogin() {
    try { return !!document.getElementById('authOverlay'); } catch (e) { return false; }
  }
  function _cuandoLibre(fn) {
    if (typeof global.requestIdleCallback === 'function') global.requestIdleCallback(fn, {timeout: 4000});
    else setTimeout(fn, 1500);
  }
  function _alInteractuar(fn) {
    var hecho = false;
    var una = function () {
      if (hecho) return;
      hecho = true;
      ['pointerdown', 'keydown', 'focusin', 'touchstart'].forEach(function (e) { document.removeEventListener(e, una, true); });
      fn();
    };
    ['pointerdown', 'keydown', 'focusin', 'touchstart'].forEach(function (e) { document.addEventListener(e, una, {capture: true, passive: true}); });
  }
  if (document.documentElement.getAttribute('data-appcheck') === 'interaccion') _alInteractuar(_init);
  else if (!_enLogin()) _cuandoLibre(_init);

})(window);
