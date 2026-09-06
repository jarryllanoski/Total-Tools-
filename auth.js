/**
 * auth.js — Módulo de autenticación para Total Tools
 * Usa Firebase Authentication (Email/Password)
 * Para desactivar: quitar <script src="auth.js"> del index.html
 */

(function(){

  /* ── CONFIG ─────────────────────────────────────────────────────── */
  var FB_API_KEY = (window.FBConfig && window.FBConfig.KEY) || 'AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI';
  var AUTH_URL   = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+FB_API_KEY;
  var IDP_URL    = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key='+FB_API_KEY;
  var REFRESH_URL= 'https://securetoken.googleapis.com/v1/token?key='+FB_API_KEY;

  /* Identificador público de la app ante Google (NO es un secreto: viaja en
     cualquier botón "Entrar con Google" del mundo). Sale de la consola de
     Firebase al activar Google como proveedor. Mientras esté vacío, el botón
     de Google no se muestra y el ingreso con contraseña sigue igual: así
     activar esto nunca puede dejar a nadie afuera. */
  var GOOGLE_CLIENT_ID = (window.FBConfig && window.FBConfig.GOOGLE_CLIENT_ID) || '';
  var TOKEN_KEY  = 'tt_auth_token';
  var EXPIRY_KEY = 'tt_auth_expiry';
  var EMAIL_KEY  = 'tt_auth_email';

  /* ── CSS ─────────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = `
    #authOverlay {
      position:fixed;inset:0;z-index:99999;
      background:#0d1117;
      display:flex;align-items:center;justify-content:center;
      padding:24px;
    }
    #authBox {
      width:100%;max-width:360px;
      background:#161b22;border:1px solid #30363d;
      border-radius:20px;padding:32px 24px;
    }
    #authLogo {
      text-align:center;margin-bottom:24px;
    }
    #authLogo .logo-icon {
      font-size:48px;margin-bottom:8px;
    }
    #authLogo .logo-name {
      font-family:'Syne',sans-serif;font-weight:800;
      font-size:22px;color:#e6edf3;letter-spacing:1px;
    }
    #authLogo .logo-sub {
      font-size:12px;color:#8b949e;margin-top:4px;
    }
    .auth-label {
      font-size:10px;font-weight:700;color:#8b949e;
      letter-spacing:1px;text-transform:uppercase;
      margin-bottom:6px;margin-top:14px;display:block;
    }
    .auth-input {
      width:100%;background:#0d1117;border:1.5px solid #30363d;
      border-radius:10px;color:#e6edf3;font-size:15px;
      padding:13px 14px;outline:none;box-sizing:border-box;
      font-family:inherit;transition:border-color .15s;
    }
    .auth-input:focus { border-color:#388bfd; }
    #authBtn {
      width:100%;margin-top:20px;padding:14px;
      background:#388bfd;border:none;border-radius:12px;
      color:#fff;font-weight:700;font-size:15px;
      font-family:'Syne',sans-serif;cursor:pointer;
      transition:opacity .15s;
    }
    #authBtn:active { opacity:.85; }
    #authBtn:disabled { opacity:.5;cursor:not-allowed; }
    #authErr {
      margin-top:12px;padding:10px 14px;
      background:rgba(247,129,102,.1);border:1px solid rgba(247,129,102,.25);
      border-radius:8px;font-size:12px;color:#f78166;
      display:none;text-align:center;
    }
    #authLoading {
      text-align:center;margin-top:12px;
      font-size:12px;color:#8b949e;display:none;
    }
  `;
  document.head.appendChild(style);

  /* ── HTML ────────────────────────────────────────────────────────── */
  function _showLogin(){
    var ov = document.createElement('div');
    ov.id = 'authOverlay';
    ov.innerHTML = `
      <div id="authBox">
        <div id="authLogo">
          <div class="logo-icon">📦</div>
          <div class="logo-name">TOTAL TOOLS</div>
          <div class="logo-sub">Panel de gestión</div>
        </div>
        <label class="auth-label">Correo</label>
        <input class="auth-input" id="authEmail" type="email" 
               inputmode="email" autocomplete="email" 
               placeholder="correo@ejemplo.com">
        <label class="auth-label">Contraseña</label>
        <input class="auth-input" id="authPass" type="password"
               autocomplete="current-password"
               placeholder="••••••••"
               onkeydown="if(event.key==='Enter') document.getElementById('authBtn').click()">
        <button id="authBtn" onclick="AuthModule.login()">Entrar al panel</button>
        <div id="authGoogleZona"></div>
        <div id="authErr"></div>
        <div id="authLoading">Verificando...</div>
      </div>
    `;
    document.body.appendChild(ov);
    _montarGoogle();
    // Focus al campo de email
    setTimeout(function(){
      var el = document.getElementById('authEmail');
      if(el) el.focus();
    }, 100);
  }

  /* ── ENTRAR CON GOOGLE ────────────────────────────────────────────
     Es más seguro que un código enviado al correo: un código se puede pedir
     por teléfono haciéndose pasar por soporte, y la víctima lo dicta sin
     darse cuenta. El flujo de Google no se puede dictar — y si la cuenta
     tiene verificación en dos pasos, ese factor ya está incluido.
     Convive con el ingreso por contraseña a propósito: si algo del lado de
     Google no está configurado, siempre queda la puerta que ya funcionaba. */
  function _montarGoogle(){
    if(!GOOGLE_CLIENT_ID) return;           // sin configurar: ni se muestra
    var zona = document.getElementById('authGoogleZona');
    if(!zona) return;
    zona.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px">' +
        '<div style="flex:1;height:1px;background:#30363d"></div>' +
        '<span style="font-size:11px;color:#8b949e">o</span>' +
        '<div style="flex:1;height:1px;background:#30363d"></div>' +
      '</div><div id="authGoogleBtn"></div>';

    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = function(){
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: function(resp){ _entrarConGoogle(resp && resp.credential); }
        });
        google.accounts.id.renderButton(
            document.getElementById('authGoogleBtn'),
            {theme:'filled_black', size:'large', width:312,
             text:'signin_with', shape:'pill'});
      } catch(e){ /* si Google falla, queda el ingreso por contraseña */ }
    };
    document.head.appendChild(s);
  }

  /* Canjea el identificador de Google por una sesión de Firebase. Desde acá
     todo sigue igual que con contraseña: mismo token, mismo almacenamiento,
     mismas reglas de Firestore. */
  async function _entrarConGoogle(credencial){
    if(!credencial){ _showErr('No se pudo leer la cuenta de Google'); return; }
    var load = document.getElementById('authLoading');
    var err  = document.getElementById('authErr');
    if(err)  err.style.display = 'none';
    if(load) load.style.display = 'block';
    try {
      var r = await fetch(IDP_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          postBody: 'id_token='+encodeURIComponent(credencial)+'&providerId=google.com',
          requestUri: location.origin,
          returnIdpCredential: true,
          returnSecureToken: true
        })
      });
      var d = await r.json();
      if(d.idToken){
        var expiry = Date.now() + (parseInt(d.expiresIn||3600)*1000);
        _saveSession(d.refreshToken||d.idToken, expiry, d.email||'');
        _saveIdToken(d.idToken);
        _hideOverlay();
        return;
      }
      // Autenticó con Google pero Firebase lo rechazó. Se muestra el correo:
      // sin ese dato, "no autorizado" obliga a adivinar con cuál entró.
      var motivo = (d.error && d.error.message) || '';
      _showErr(motivo.indexOf('OPERATION_NOT_ALLOWED') >= 0
        ? 'Falta activar Google como proveedor en Firebase'
        : 'Esa cuenta de Google no está autorizada para este panel');
    } catch(e){
      _showErr('Error de conexión al entrar con Google');
    }
    if(load) load.style.display = 'none';
  }

  /* ── AUTH ────────────────────────────────────────────────────────── */
  function _saveSession(token, expiry, email){
    localStorage.setItem(TOKEN_KEY,  token);     // refreshToken para renovar
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    localStorage.setItem(EMAIL_KEY,  email);
  }
  function _saveIdToken(idToken){
    localStorage.setItem('tt_id_token', idToken);
  }
  function _getIdToken(){
    return localStorage.getItem('tt_id_token')||'';
  }

  /* Borra la sesión Y los datos del negocio que quedan cacheados en el
     navegador. Antes solo borraba las claves de sesión: los ~950 pedidos
     —con nombres, teléfonos, DNI y direcciones— seguían en localStorage
     después de cerrar sesión, legibles con F12 por cualquiera que se sentara
     en la PC. La sesión cerrada daba una sensación de seguridad que los datos
     no respaldaban.
     El modo sin conexión se conserva mientras la sesión está viva, que es
     cuando de verdad hace falta; al cerrarla no queda rastro. */
  var CLAVES_DATOS = ['dpanel', 'dpanel_pending', 'dpanel_last_sync'];

  function _clearSession(){
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem('tt_id_token');
    CLAVES_DATOS.forEach(function(k){
      try { localStorage.removeItem(k); } catch(e){}
    });
  }

  function _isValidSession(){
    var token  = localStorage.getItem(TOKEN_KEY);
    var expiry = parseInt(localStorage.getItem(EXPIRY_KEY)||'0');
    return !!(token && Date.now() < expiry);
  }

  /* Devuelve 'ok' | 'rechazado' | 'sin_red'.
     La distinción importa: si el servidor RECHAZA el token, la sesión murió de
     verdad y hay que limpiar. Si simplemente no hubo red, la sesión puede
     seguir siendo válida — borrar ahí dejaría sin modo sin conexión justo
     cuando hace falta, que es cuando no hay internet. */
  async function _refreshToken(){
    var token = localStorage.getItem(TOKEN_KEY);
    if(!token) return 'rechazado';
    var r;
    try {
      r = await fetch(REFRESH_URL, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(token)
      });
    } catch(e){
      return 'sin_red'; // no se pudo preguntar: no se concluye nada
    }
    if(!r.ok) return 'rechazado';
    try {
      var d = await r.json();
      if(d.id_token){
        var expiry = Date.now() + (parseInt(d.expires_in||3600)*1000);
        var email  = localStorage.getItem(EMAIL_KEY)||'';
        _saveSession(d.refresh_token||token, expiry, email);
        _saveIdToken(d.id_token); // guardar nuevo idToken
        return 'ok';
      }
    } catch(e){}
    return 'rechazado';
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  window.AuthModule = {

    async init(){
      // Si ya tiene sesión válida, mostrar app directamente
      if(_isValidSession()){
        _hideOverlay();
        return;
      }
      // Intentar refrescar token guardado
      var res = await _refreshToken();
      if(res === 'ok'){
        _hideOverlay();
        return;
      }
      // El servidor rechazó el token: la sesión murió de verdad, así que no
      // deben quedar datos del negocio en el navegador. Si en cambio fue falta
      // de red ('sin_red'), NO se borra nada: puede ser una sesión sana sin
      // internet, y ese es justo el caso en que el modo sin conexión sirve.
      if(res === 'rechazado') _clearSession();
      _showLogin();
    },

    async login(){
      var email = (document.getElementById('authEmail').value||'').trim();
      var pass  = (document.getElementById('authPass').value||'').trim();
      var btn   = document.getElementById('authBtn');
      var err   = document.getElementById('authErr');
      var load  = document.getElementById('authLoading');

      if(!email||!pass){
        _showErr('Completa todos los campos');
        return;
      }

      btn.disabled = true;
      err.style.display = 'none';
      load.style.display = 'block';

      try {
        var r = await fetch(AUTH_URL, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email, password:pass, returnSecureToken:true})
        });
        var d = await r.json();

        if(d.idToken){
          // Login exitoso — guardar idToken para requests y refreshToken para renovar
          var expiry = Date.now() + (parseInt(d.expiresIn||3600)*1000);
          _saveSession(d.refreshToken||d.idToken, expiry, email);
          _saveIdToken(d.idToken);
          _hideOverlay();
        } else {
          // Error de Firebase
          var msg = 'Correo o contraseña incorrectos';
          if(d.error){
            var code = d.error.message||'';
            if(code.includes('TOO_MANY_ATTEMPTS')) msg = 'Demasiados intentos. Espera unos minutos';
            else if(code.includes('USER_DISABLED'))  msg = 'Usuario desactivado';
            else if(code.includes('NETWORK'))        msg = 'Sin conexión. Verifica tu internet';
          }
          _showErr(msg);
          btn.disabled = false;
          load.style.display = 'none';
        }
      } catch(e){
        _showErr('Error de conexión. Verifica tu internet');
        btn.disabled = false;
        load.style.display = 'none';
      }
    },

    logout(){
      _clearSession();
      location.reload();
    }
  };

  function _showErr(msg){
    var el = document.getElementById('authErr');
    if(el){ el.textContent = msg; el.style.display = 'block'; }
  }

  function _hideOverlay(){
    var ov = document.getElementById('authOverlay');
    if(ov) ov.remove();
  }

  /* ── TOKEN VÁLIDO PARA REQUESTS ─────────────────────────────────── */
  // Renovar token automáticamente si está por vencer (menos de 5 min)
  async function _ensureValidToken(){
    var expiry = parseInt(localStorage.getItem(EXPIRY_KEY)||'0');
    var margin = 5 * 60 * 1000; // 5 minutos antes de vencer
    if(Date.now() < expiry - margin) return true; // token válido
    // _refreshToken pasó a devolver un motivo ('ok'|'rechazado'|'sin_red');
    // acá el contrato es booleano, así que se traduce en vez de devolverlo
    // crudo — un texto no vacío sería siempre verdadero y "sin red" pasaría
    // por token renovado.
    return (await _refreshToken()) === 'ok';
  }

  // Exponer para que index.html la use antes de cada request
  window._authEnsureToken = _ensureValidToken;

  /* ── INIT AUTOMÁTICO ─────────────────────────────────────────────── */
  // Esperar a que el DOM esté listo
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      AuthModule.init();
    });
  } else {
    AuthModule.init();
  }

})();
