'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const fo = E.leerCrudo('formulario.html');
  const se = E.leerCrudo('seguimiento.html');

  bloque('El formulario no espera a reCAPTCHA');
  {
    const comun = E.leerReal('cliente/comun.js');
    ok(/const CON_APPCHECK = \{reniec: true\};/.test(comun) && /if\(CON_APPCHECK\[action\] && typeof window\._appCheckToken === 'function'\)/.test(comun),
       'App Check solo en la consulta de DNI (es la unica que el servidor verifica)');
    const fidx = E.leerReal('functions/index.js');
    ok((fidx.match(/await appCheckOk\(req\)/g) || []).length === 1, 'y el servidor lo verifica en un solo lugar');
    const ac = E.leerReal('appcheck.js');
    ok(/getAttribute\('data-appcheck'\) === 'interaccion'\) _alInteractuar\(_init\)/.test(ac), 'reCAPTCHA llega con la primera interaccion');
    ok(/<html lang="es" data-appcheck="interaccion">/.test(fo), 'el formulario lo pide asi');
  }

  bloque('Un solo viaje al servidor para abrir el link');
  {
    const fidx = E.leerReal('functions/index.js');
    const tok = fidx.slice(fidx.indexOf('async function handleToken'), fidx.indexOf('function telefonoDe'));
    ok(/out\.cfg = soloCampos\(c\.data\(\), FORMCFG_PUBLICO\)/.test(tok), 'el link trae su configuracion');
    ok(/if \(!out\.cfg \|\| !telefonoDe\(out\.cfg\)\) out\.vivo = await configViva\(\);/.test(tok), 'y la general solo si le falta el celular');
    ok(/catch \(e\) \{\s*console\.warn\("token: sin config adjunta:/.test(tok), 'si falla esa lectura, el link igual responde');
    const fb = E.leerReal('cliente/form-base.js');
    ok(/if\(data\.cfg \|\| data\.vivo\) _cfgAdjunta = \{cfg: data\.cfg \|\| null, vivo: data\.vivo \|\| null\};/.test(fb), 'el formulario la guarda');
    ok(/if\(adj && adj\.cfg\)\{\s*cfg = adj\.cfg;\s*\} else if\(cfgId\)\{/.test(fb) && /const live = \(adj && adj\.vivo\) \|\| await/.test(fb),
       'y solo pide lo que falte (con un servidor viejo, todo sigue como antes)');
  }

  bloque('Nada bloquea el primer pintado del cliente');
  {
    const sinc = (h) => (h.match(/<script src="[^"]+"><\/script>/g) || []);
    ok(sinc(fo).length === 1 && /narrador\/loader\.js/.test(sinc(fo)[0]), 'formulario: solo la pantalla de carga va sincrona');
    ok(sinc(se).length === 1 && /loading-screen\.js/.test(sinc(se)[0]), 'seguimiento: igual');
    ok(fo.indexOf('functions/agencias.js') < fo.indexOf('cliente/comun.js') && fo.indexOf('cliente/comun.js') < fo.indexOf('cliente/form-arranque.js'),
       'el orden se mantiene (defer respeta el orden)');
    ok(/<main class="container" id="app">[\s\S]*?<\/main>/.test(fo) && /<main class="container" id="app">[\s\S]*?<\/main>/.test(se), 'contenido dentro de <main>');
  }

  bloque('Contraste y tamano legibles');
  {
    const css = E.leerReal('cliente/cliente.css');
    ok(/--text2:#7d8493/.test(css), 'gris secundario con contraste 5,3');
    ok(/\.btn-wa\{[^}]*background:linear-gradient\(135deg,#0d6e5f,#0f7f3c\)/.test(css) && !/#25d366/i.test(E.leerReal('cliente/seguimiento.js')),
       'botones de WhatsApp con texto blanco legible');
    ok(/\.brand-foot \.bf-soc \.bf-item\{font-size:12px\}/.test(css), 'pie a 12 px y sin transparencia');
  }
};
