(function(global){
  'use strict';

  var MAX = 6;
  var HOSTS_GOOGLE = ['g.page', 'search.google.com', 'www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'];
  var _v = null;
  var _cargando = false;

  function _vacia(){
    return {activa: true, promos: [], sorteo: {activo: false, titulo: '', texto: '', link: '', hasta: ''}, resenas: {link: ''}};
  }

  function _box(){ return document.getElementById('vitrinaBox'); }

  function _fila(p, i){
    return '<div class="vit-promo">'
      + '<img src="' + escU(p.img) + '" alt="" loading="lazy">'
      + '<div class="vit-campos">'
      + '<input class="fi" maxlength="60" placeholder="Título (ej. Amoladora 42V)" value="' + escH(p.titulo || '') + '" oninput="Vitrina.cambiar(' + i + ',\'titulo\',this.value)">'
      + '<div class="vit-dos"><input class="fi" inputmode="decimal" placeholder="Precio S/" value="' + escH(p.precio || '') + '" oninput="Vitrina.cambiar(' + i + ',\'precio\',this.value)">'
      + '<input class="fi" inputmode="decimal" placeholder="Antes S/ (opcional)" value="' + escH(p.antes || '') + '" oninput="Vitrina.cambiar(' + i + ',\'antes\',this.value)"></div>'
      + '<label class="vit-hasta">Hasta <input class="fi" type="date" value="' + escH(p.hasta || '') + '" onchange="Vitrina.cambiar(' + i + ',\'hasta\',this.value)"></label>'
      + '</div>'
      + '<button type="button" class="cfl-btn cfl-btn-del" title="Quitar" onclick="Vitrina.quitar(' + i + ')">🗑️</button>'
      + '</div>';
  }

  function _pintar(){
    var box = _box();
    if(!box) return;
    if(!_v){ box.innerHTML = '<div class="cfg-ttl">🛍️ Promos y sorteo del seguimiento</div><div class="tgl-s">Cargando…</div>'; return; }
    var s = _v.sorteo || {};
    box.innerHTML = '<div class="cfg-ttl">🛍️ Promos y sorteo del seguimiento</div>'
      + '<div class="tgl-s" style="margin:-4px 0 8px">Nauti las muestra a tus clientes cada vez que abren su seguimiento. Usa las imágenes de tu catálogo.</div>'
      + '<div class="tgl-row"><div><div class="tgl-n">Mostrar en el seguimiento</div><div class="tgl-s">Apágalo para ocultar todo sin borrar nada</div></div>'
      + '<div class="tgl' + (_v.activa !== false ? ' on' : '') + '" onclick="Vitrina.alternar()"></div></div>'
      + '<div class="vit-lista">' + (_v.promos || []).map(_fila).join('') + '</div>'
      + ((_v.promos || []).length < MAX
        ? '<label class="vit-agregar">➕ Agregar promo (imagen)<input type="file" accept="image/*" hidden onchange="Vitrina.subir(this)"></label>'
        : '<div class="tgl-s">Máximo ' + MAX + ' promos a la vez.</div>')
      + '<div class="cfg-ttl" style="margin-top:14px">🎉 Sorteo</div>'
      + '<div class="tgl-row"><div><div class="tgl-n">Sorteo activo</div><div class="tgl-s">Nauti invita a participar con el link de tu app de sorteos</div></div>'
      + '<div class="tgl' + (s.activo ? ' on' : '') + '" onclick="Vitrina.alternarSorteo()"></div></div>'
      + '<div class="fg"><input class="fi" maxlength="60" placeholder="Título (ej. Sorteo de una amoladora)" value="' + escH(s.titulo || '') + '" oninput="Vitrina.sorteo(\'titulo\',this.value)"></div>'
      + '<div class="fg"><input class="fi" maxlength="140" placeholder="Texto corto (ej. Participa gratis, sorteamos el 30/11)" value="' + escH(s.texto || '') + '" oninput="Vitrina.sorteo(\'texto\',this.value)"></div>'
      + '<div class="fg"><input class="fi" maxlength="500" placeholder="https://… link para participar" value="' + escH(s.link || '') + '" oninput="Vitrina.sorteo(\'link\',this.value)"></div>'
      + '<label class="vit-hasta">Hasta <input class="fi" type="date" value="' + escH(s.hasta || '') + '" onchange="Vitrina.sorteo(\'hasta\',this.value)"></label>'
      + '<div class="cfg-ttl" style="margin-top:14px">⭐ Reseñas de Google</div>'
      + '<div class="tgl-s" style="margin:-4px 0 8px">Cuando un pedido se finaliza, el cliente califica su compra en el seguimiento y Toby lo invita a publicarla en Google. Pega aquí el link «Pedir reseñas» de tu Perfil de Empresa de Google (si lo dejas vacío, se abre tu ficha en Google Maps).</div>'
      + '<div class="fg"><input class="fi" maxlength="500" placeholder="https://g.page/r/…/review" value="' + escH((_v.resenas && _v.resenas.link) || '') + '" oninput="Vitrina.resenas(this.value)"></div>'
      + '<button type="button" class="cfg-save" style="width:100%;margin-top:12px" onclick="Vitrina.guardar(this)">💾 Guardar promos y sorteo</button>';
  }

  async function abrir(){
    if(_cargando) return;
    _cargando = true;
    _pintar();
    try{
      var d = global._fbLeerVitrina ? await global._fbLeerVitrina() : null;
      _v = Object.assign(_vacia(), d || {});
      _v.sorteo = Object.assign(_vacia().sorteo, (d && d.sorteo) || {});
      _v.resenas = Object.assign(_vacia().resenas, (d && d.resenas) || {});
      _v.promos = Array.isArray(_v.promos) ? _v.promos.slice(0, MAX) : [];
    }catch(e){
      _v = _vacia();
      toast('⚠️ No se pudieron leer las promos: ' + e.message);
    }finally{
      _cargando = false;
      _pintar();
    }
  }

  function cambiar(i, k, val){ if(_v && _v.promos[i]) _v.promos[i][k] = String(val || '').trim(); }
  function sorteo(k, val){ if(_v) _v.sorteo[k] = String(val || '').trim(); }
  function resenas(val){ if(_v) _v.resenas = {link: String(val || '').trim()}; }

  function _linkGoogleOk(u){
    if(!u) return true;
    try{
      var x = new URL(u);
      return x.protocol === 'https:' && HOSTS_GOOGLE.indexOf(x.hostname) >= 0;
    }catch(e){ return false; }
  }
  function alternar(){ if(!_v) return; _v.activa = _v.activa === false; _pintar(); }
  function alternarSorteo(){ if(!_v) return; _v.sorteo.activo = !_v.sorteo.activo; _pintar(); }
  function quitar(i){ if(!_v) return; _v.promos.splice(i, 1); _pintar(); }

  function _comprimir(file){
    return new Promise(function(ok, mal){
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function(){
        var esc = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * esc); c.height = Math.round(im.naturalHeight * esc);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function(b){ b ? ok(new File([b], 'promo.jpg', {type: 'image/jpeg'})) : mal(new Error('no se pudo comprimir')); }, 'image/jpeg', 0.82);
      };
      im.onerror = function(){ URL.revokeObjectURL(url); mal(new Error('imagen no válida')); };
      im.src = url;
    });
  }

  async function subir(input){
    var f = input && input.files && input.files[0];
    input.value = '';
    if(!f || !_v) return;
    if(!/^image\//.test(f.type)){ toast('⚠️ Elige una imagen'); return; }
    if(_v.promos.length >= MAX){ toast('⚠️ Máximo ' + MAX + ' promos'); return; }
    toast('⏳ Subiendo imagen…');
    try{
      var chica = await _comprimir(f);
      var id = 'p' + Date.now().toString(36);
      var doc = await StorageModule.uploadFile(chica, 'promos', id, 'recursos');
      _v.promos.push({img: doc.d, titulo: '', precio: '', antes: '', hasta: '', activa: true});
      _pintar();
      toast('✅ Imagen lista: escribe el título y el precio');
    }catch(e){
      toast('⚠️ No se pudo subir: ' + e.message);
    }
  }

  async function guardar(btn){
    if(!_v || !global._fbGuardarVitrina) return;
    var sinTitulo = _v.promos.filter(function(p){ return !p.titulo; }).length;
    if(sinTitulo){ toast('⚠️ Falta el título en ' + sinTitulo + ' promo(s)'); return; }
    var s = _v.sorteo;
    if(s.activo && !/^https:\/\/\S{4,}$/i.test(s.link || '')){ toast('⚠️ El sorteo necesita un link que empiece con https://'); return; }
    if(s.activo && !s.titulo){ toast('⚠️ Escribe el título del sorteo'); return; }
    var rl = (_v.resenas && _v.resenas.link) || '';
    if(!_linkGoogleOk(rl)){ toast('⚠️ El link de reseñas debe ser de Google (g.page, maps.app.goo.gl o google.com)'); return; }
    if(btn) btn.disabled = true;
    try{
      await global._fbGuardarVitrina({activa: _v.activa !== false, promos: _v.promos, sorteo: s, resenas: {link: rl}, actualizado: new Date().toISOString()});
      toast('✅ Guardado. Tus clientes lo verán en 1 minuto');
    }catch(e){
      toast('⚠️ No se guardó: ' + e.message);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  global.Vitrina = {abrir: abrir, cambiar: cambiar, sorteo: sorteo, alternar: alternar, alternarSorteo: alternarSorteo,
    resenas: resenas, quitar: quitar, subir: subir, guardar: guardar, MAX: MAX};
})(window);
