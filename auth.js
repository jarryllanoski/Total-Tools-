
(function(){

  var FB_API_KEY = (window.FBConfig && window.FBConfig.KEY) || 'AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI';
  var AUTH_URL   = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+FB_API_KEY;
  var IDP_URL    = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key='+FB_API_KEY;
  var REFRESH_URL= 'https://securetoken.googleapis.com/v1/token?key='+FB_API_KEY;

  var GOOGLE_CLIENT_ID = (window.FBConfig && window.FBConfig.GOOGLE_CLIENT_ID) || '';
  var TOKEN_KEY  = 'tt_auth_token';
  var EXPIRY_KEY = 'tt_auth_expiry';
  var EMAIL_KEY  = 'tt_auth_email';
  var INICIO_KEY = 'tt_auth_inicio';

  var SESION_MAX_MS = 12 * 60 * 60 * 1000;

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
      background:#1f6feb;border:none;border-radius:12px;
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

  function _showLogin(){
    _hideOverlay();
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
    setTimeout(function(){
      var el = document.getElementById('authEmail');
      if(el) el.focus();
    }, 100);
  }

  function _montarGoogle(){
    if(!GOOGLE_CLIENT_ID) return;
    var zona = document.getElementById('authGoogleZona');
    if(!zona) return;
    zona.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px">' +
        '<div style="flex:1;height:1px;background:#30363d"></div>' +
        '<span style="font-size:11px;color:#8b949e">o</span>' +
        '<div style="flex:1;height:1px;background:#30363d"></div>' +
      '</div><div id="authGoogleBtn" style="min-height:44px"></div>';

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
      } catch(e){  }
    };
    var poner = function(){ document.head.appendChild(s); };
    if(typeof window.requestIdleCallback === 'function') window.requestIdleCallback(poner, {timeout: 2000});
    else setTimeout(poner, 300);
  }

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
        _alEntrar();
        return;
      }
      var motivo = (d.error && d.error.message) || '';
      _showErr(motivo.indexOf('OPERATION_NOT_ALLOWED') >= 0
        ? 'Falta activar Google como proveedor en Firebase'
        : 'Esa cuenta de Google no está autorizada para este panel');
    } catch(e){
      _showErr('Error de conexión al entrar con Google');
    }
    if(load) load.style.display = 'none';
  }

  function _saveSession(token, expiry, email){
    localStorage.setItem(TOKEN_KEY,  token);
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    localStorage.setItem(EMAIL_KEY,  email);
    if(!localStorage.getItem(INICIO_KEY)){
      localStorage.setItem(INICIO_KEY, String(Date.now()));
    }
  }

  function _sesionVencida(){
    var inicio = parseInt(localStorage.getItem(INICIO_KEY)||'0');
    if(!inicio) return false;
    return (Date.now() - inicio) > SESION_MAX_MS;
  }
  function _saveIdToken(idToken){
    localStorage.setItem('tt_id_token', idToken);
  }
  function _getIdToken(){
    return localStorage.getItem('tt_id_token')||'';
  }

  var CLAVES_DATOS = ['dpanel', 'dpanel_pending', 'dpanel_last_sync', 'dpanel_dirty'];

  function _pendientes(){
    try {
      var raw = localStorage.getItem('dpanel_dirty');
      if(!raw) return 0;
      var o = JSON.parse(raw);
      if(o && o.all) return -1;
      return ((o && o.s) || []).length + ((o && o.p) || []).length;
    } catch(e){ return 0; }
  }

  function _clearSession(conservarDatos){
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(INICIO_KEY);
    localStorage.removeItem('tt_id_token');
    if(conservarDatos) return;
    CLAVES_DATOS.forEach(function(k){
      try { localStorage.removeItem(k); } catch(e){}
    });
  }

  function _expulsar(msg){
    _clearSession(_pendientes() !== 0);
    _showLogin();
    _showErr(msg || 'Tu sesión venció. Ingresa de nuevo.');
  }
  window._authExpulsar = _expulsar;

  function _sinAcceso(correo){
    _hideOverlay();
    var ov = document.createElement('div');
    ov.id = 'authOverlay';
    ov.innerHTML =
      '<div id="authBox">' +
        '<div id="authLogo">' +
          '<div class="logo-icon">🔒</div>' +
          '<div class="logo-name">SIN ACCESO</div>' +
          '<div class="logo-sub">Tu cuenta entró, pero no está autorizada</div>' +
        '</div>' +
        '<div style="font-size:13px;color:#e6edf3;line-height:1.6;' +
             'background:#161b22;border:1px solid #30363d;border-radius:10px;' +
             'padding:12px;margin-bottom:14px">' +
          'Entraste como<br><b style="color:#388bfd;word-break:break-all">' +
          String(correo || 'una cuenta desconocida').replace(/</g, '&lt;') +
          '</b>' +
        '</div>' +
        '<div style="font-size:12px;color:#8b949e;line-height:1.5;margin-bottom:16px">' +
          'Si es la cuenta correcta, falta darle permiso. Si no lo es, sal y ' +
          'entra con la otra.' +
        '</div>' +
        '<button id="authBtn" onclick="window.AuthModule.logout()">Salir y usar otra cuenta</button>' +
        '<div id="authErr"></div>' +
        '<div id="authLoading">Verificando...</div>' +
      '</div>';
    document.body.appendChild(ov);
  }
  window._authSinAcceso = _sinAcceso;

  window._authCorreo = function(){
    try { return localStorage.getItem(EMAIL_KEY) || ''; } catch(e){ return ''; }
  };

  window._authHaySesion = function(){
    try { return !!localStorage.getItem('tt_id_token'); } catch(e){ return false; }
  };

  function _isValidSession(){
    var token  = localStorage.getItem(TOKEN_KEY);
    var expiry = parseInt(localStorage.getItem(EXPIRY_KEY)||'0');
    return !!(token && Date.now() < expiry);
  }

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
      return 'sin_red';
    }
    if(!r.ok) return 'rechazado';
    try {
      var d = await r.json();
      if(d.id_token){
        var expiry = Date.now() + (parseInt(d.expires_in||3600)*1000);
        var email  = localStorage.getItem(EMAIL_KEY)||'';
        _saveSession(d.refresh_token||token, expiry, email);
        _saveIdToken(d.id_token);
        return 'ok';
      }
    } catch(e){}
    return 'rechazado';
  }

  window.AuthModule = {

    async init(){
      if(_sesionVencida() && navigator.onLine !== false){
        _expulsar('Tu sesión venció. Ingresa de nuevo.');
        return;
      }
      if(_isValidSession()){
        _hideOverlay();
        return;
      }
      var res = await _refreshToken();
      if(res === 'ok'){
        _hideOverlay();
        if(typeof window._trasEntrar === 'function'){
          try{ window._trasEntrar(); }catch(e){}
        }
        return;
      }
      if(res === 'rechazado') _clearSession(_pendientes() !== 0);
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
          var expiry = Date.now() + (parseInt(d.expiresIn||3600)*1000);
          _saveSession(d.refreshToken||d.idToken, expiry, email);
          _saveIdToken(d.idToken);
          _alEntrar();
        } else {
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
      var n = _pendientes();
      if(n !== 0){
        var cuantos = n < 0 ? 'Hay cambios' :
          ('Hay ' + n + ' cambio' + (n !== 1 ? 's' : ''));
        var seguir = window.confirm(
            cuantos + ' sin sincronizar con la nube.\n\n' +
            'Cerrar sesión borra el respaldo local y esos cambios SE PIERDEN.\n' +
            'Si esperas a que el punto de Firebase se ponga verde, se guardan.\n\n' +
            '¿Cerrar sesión igual?');
        if(!seguir) return;
      }
      _clearSession();
      location.reload();
    }
  };

  function _showErr(msg){
    var el = document.getElementById('authErr');
    if(el){ el.textContent = msg; el.style.display = 'block'; }
  }

  function _hideOverlay(){
    var ovs = document.querySelectorAll('#authOverlay');
    for(var i = 0; i < ovs.length; i++){
      try { ovs[i].remove(); } catch(e){}
    }
  }

  async function _motivoToken(){
    if(_sesionVencida()) return 'vencida';
    var expiry = parseInt(localStorage.getItem(EXPIRY_KEY)||'0');
    var margin = 5 * 60 * 1000;
    if(Date.now() < expiry - margin) return 'ok';
    return await _refreshToken();
  }

  async function _ensureValidToken(){
    return (await _motivoToken()) === 'ok';
  }

  async function _tokenODetenerse(){
    var motivo = await _motivoToken();
    var tok = '';
    try { tok = localStorage.getItem('tt_id_token') || ''; } catch(e){}
    if(motivo === 'ok' && tok) return tok;
    var causa = (motivo === 'ok') ? 'sin_token' : motivo;
    var e = new Error('sesion:' + causa);
    e.auth = causa;
    throw e;
  }

  function _textoMotivo(e){
    var m = e && e.auth;
    if(!m) return '';
    return (m === 'sin_red')
      ? '📴 Sin conexión — tus cambios quedan guardados aquí y suben al volver'
      : '🔒 Tu sesión venció. Tus cambios están guardados aquí; ingresa de nuevo para subirlos';
  }

  window._authEnsureToken  = _ensureValidToken;
  window._authMotivoToken  = _motivoToken;
  window._authToken        = _tokenODetenerse;
  window._authTextoMotivo  = _textoMotivo;

  var _listo = new Promise(function(r){
    if(document.readyState === 'complete') r();
    else document.addEventListener('DOMContentLoaded', function(){ r(); });
  });

  function _alEntrar(){
    _listo.then(function(){
      _hideOverlay();
      if(typeof window._trasEntrar === 'function'){
        try{ window._trasEntrar(); }catch(e){}
      }
    });
  }

  function _haySesionGuardada(){
    try { return !!localStorage.getItem(TOKEN_KEY); } catch(e){ return false; }
  }

  function _quitarArranque(){
    var a = document.getElementById('arranque');
    if(a) a.remove();
  }
  function _arrancar(){
    Promise.resolve().then(function(){ return window.AuthModule.init(); })
      .catch(function(){}).then(_quitarArranque);
    setTimeout(_quitarArranque, 20000);
  }
  if(!_haySesionGuardada() || document.readyState === 'complete'){
    _arrancar();
  } else {
    document.addEventListener('DOMContentLoaded', _arrancar);
  }

})();
