/**
 * appcheck.js — Firebase App Check para Total Tools
 * ====================================================
 * Adjunta una prueba a cada petición que dice "esto viene del panel real",
 * no de un script suelto con un token de sesión robado. El token de sesión
 * (auth.js) demuestra QUIÉN sos; App Check demuestra DESDE DÓNDE se llama.
 * Son capas independientes — cada una puede fallar sin tumbar la otra.
 *
 * ESTADO: en observación (Supervisión), no en bloqueo. Firestore todavía
 * acepta peticiones sin este token — Firebase solo mide qué porcentaje viene
 * con prueba válida. El bloqueo (Aplicar) se activa aparte, desde la consola,
 * después de confirmar varios días que el 100% de las peticiones reales llega
 * verificado. Por eso todo acá está diseñado para fallar EN SILENCIO: si algo
 * sale mal, el panel sigue funcionando exactamente igual que sin este archivo.
 *
 * Por qué import() dinámico y no <script type="module">: el resto del panel
 * son <script src> clásicos cargados en un orden que ya es un contrato (ver
 * docs/ARQUITECTURA.md). Meter un módulo ES real obligaría a repensar ese
 * orden. import() es una función: corre en cualquier script, sin convertir
 * este archivo ni a index.html en módulos.
 */
(function (global) {
  'use strict';

  var SDK_VERSION = '12.18.0';
  var BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';

  // Clave de sitio de reCAPTCHA Enterprise. Es pública — viaja en cualquier
  // botón de reCAPTCHA de la web, igual que la API key de Firebase de al
  // lado. Lo secreto (la clave del lado de Google que verifica la firma)
  // nunca sale de los servidores de Google; nada de eso pasa por acá.
  var SITE_KEY = '6LfAxKwtAAAAAA8jTMPvioWwx2CHCWSOwVHa5twb';

  var _appCheckPromise = null;

  /* Inicializa Firebase App + App Check una sola vez. Devuelve la instancia
     de App Check, o null si algo falló (sin conexión, config incompleta,
     etc.) — nunca lanza, para que quien llama pueda seguir sin este dato. */
  function _init() {
    if (_appCheckPromise) return _appCheckPromise;
    _appCheckPromise = (async function () {
      var cfg = global.FBConfig || {};
      if (!cfg.KEY || !cfg.PRJ || !cfg.APP_ID) return null; // config a medias
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

  /* API pública: el token actual de App Check, o '' si no se pudo obtener.
     _authHeaders() de index.html lo adjunta como cabecera X-Firebase-AppCheck
     en cada petición a Firestore, junto al token de sesión. */
  global._appCheckToken = async function () {
    try {
      var ctx = await _init();
      if (!ctx) return '';
      var r = await ctx.getToken(ctx.appCheck, /*forceRefresh*/ false);
      return (r && r.token) || '';
    } catch (e) {
      return ''; // cualquier fallo: seguir sin el token, no romper la app
    }
  };

  // Arranca en cuanto el archivo carga; el token queda listo (cacheado, con
  // auto-refresco) antes de que la primera petición lo pida.
  _init();

})(window);
