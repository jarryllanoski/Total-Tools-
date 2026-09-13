/**
 * La puerta única de Shalom.
 *
 * La integración está desconectada mientras se rehace endpoint por endpoint.
 * Estas pruebas cuidan lo que hace que desconectarla no rompa nada: que la
 * puerta responda siempre lo mismo, que ninguna pantalla se quede muda, y que
 * no vuelva a colarse una llamada directa a la API saltándose la puerta.
 *
 * Ver docs/SHALOM.md.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async (t) => {
  const {ok, bloque} = t;

  const win = {};
  E.cargar('shalom.js', win);
  const S = win.Shalom;

  bloque('Mientras está desconectada, responde igual a todo');
  {
    ok(S.DISPONIBLE === false, 'DISPONIBLE en false — lo miran el auto-check y el extractor');
    const metodos = ['consultarGuia', 'ticket', 'agencias', 'validar',
      'estadoInstancia', 'registrar', 'esquema'];
    ok(metodos.every((m) => typeof S[m] === 'function'),
        'los 7 métodos existen: nadie explota al llamarlos');
    // Se llaman DE VERDAD y se espera su respuesta. Comprobar solo que la
    // función existe dejaría pasar una que devuelve undefined.
    const respuestas = await Promise.all(metodos.map((m) => S[m]()));
    const malas = metodos.filter((m, i) => {
      const r = respuestas[i];
      return !(r && r.ok === false && r.motivo === 'DESCONECTADO');
    });
    ok(malas.length === 0,
        'los 7 devuelven {ok:false, motivo:"DESCONECTADO"}' +
        (malas.length ? ' — fallan: ' + malas.join(', ') : ''));
    ok(respuestas.every((r) => !r.ok), 'ninguno devuelve ok:true sin dato real');
  }

  bloque('Lo local sigue vivo sin conexión');
  {
    ok(JSON.stringify(S.clasificarPaquete(25, 15, 10, 1.5)) ===
       '{"tipo":"S","etiqueta":"Paquete S"}', 'el clasificador de cajas no habla con nadie');
    ok(S.clasificarPaquete(200, 200, 200, 50).tipo === 'OTRA', 'lo que no entra en ninguna caja');
    ok(S.clasificarPaquete(0, 10, 10, 1) === null, 'medidas incompletas → null, no un error');
    ok(S.clasificarPaquete('a', 'b', 'c', 'd') === null, 'basura → null');
    ok(Array.isArray(S.CATALOGO_CAJAS) && S.CATALOGO_CAJAS.length === 5,
        'las 5 cajas oficiales siguen ahí');
    // La caja se elige por dónde ENTRA el paquete, no por su medida mayor:
    // una caja no distingue de qué lado la acuestas.
    ok(S.clasificarPaquete(10, 12, 20, 0.4).tipo === 'XS',
        'da igual el orden de las medidas: entra en XS igual');
  }

  bloque('Nadie llama a la API saltándose la puerta');
  {
    const archivos = ['shalom.js', 'ticket.js', 'tracking.js', 'agencias-extractor.js',
      'config.js', 'index.html', 'delivery.js', 'print.js', 'qrtracking.js'];
    const culpables = archivos.filter((a) => {
      if (!E.existe(a)) return false;
      const codigo = E.leer(a)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/<!--[\s\S]*?-->/g, '');
      return /shalom-api\.lat|api\.shalom|cloudfunctions\.net\/shalom/.test(codigo);
    });
    ok(culpables.length === 0,
        'ningún archivo tiene una URL de Shalom en su código' +
        (culpables.length ? ': ' + culpables.join(', ') : ''));
    ok(!/x-api-key/.test(E.leer('ticket.js')),
        'ticket.js no manda una clave desde el navegador (hubo una rama que lo hacía)');
    ok(!E.existe('functions/shalomApi.js'), 'el cliente del backend sigue borrado');
    const fidx = E.leer('functions/index.js');
    ok(!/exports\.shalomApi|exports\.shalomWebhook/.test(fidx),
        'los dos endpoints del backend siguen fuera');
  }

  bloque('Cada pantalla dice algo honesto');
  {
    ok(/case 'DESCONECTADO':\s*return '🔧 Rastreo Shalom en reconstrucción'/.test(E.leer('tracking.js')),
        'el botón ⟳');
    ok(/Jalar ticket en reconstrucción/.test(E.leer('ticket.js')), 'el botón 🧾');
    ok(/Extraer agencias de Shalom está en reconstrucción/.test(E.leer('agencias-extractor.js')),
        'el extractor, y aclara que el catálogo actual sigue sirviendo');
    ok(/La integración con Shalom se está rehaciendo/.test(E.leer('index.html')),
        'el verificador de sesión');
  }

  bloque('El conocimiento medido no se perdió');
  {
    const doc = E.leer('docs/SHALOM.md');
    ok(/El envoltorio del recorrido se llama \*\*`statuses`\*\*/.test(doc),
        'la trampa del nombre del envoltorio de /track sigue escrita');
    ok(/isLoggedIn/.test(doc), 'y la forma medida de /instances/status');
    ok(/El plan de reconstrucción/.test(doc), 'está el plan endpoint por endpoint');
    const api = E.leer('docs/SHALOM-API.md');
    ok(/X-Shalom-Signature: t=<unix>,v1=<hex>/.test(api), 'la firma del webhook, literal');
    ok(/HMAC-SHA256\("<t>\.<rawBody>"/.test(api), 'y cómo se construye el payload firmado');
    ok(/máximo 50/.test(api) || /MÁXIMO 50/i.test(api), 'el límite del batch');
    ok(/1000 peticiones/.test(api), 'el rate limit');
  }

  bloque('El catálogo offline de agencias');
  {
    ok(E.existe('data/agencias-shalom.json'), 'sigue en data/');
    const ag = JSON.parse(E.leer('data/agencias-shalom.json'));
    const lista = ag.agencias || ag;
    ok(lista.length > 500, 'con sus ' + lista.length + ' sedes');
    ok(lista.every((a) => a && a.nombre), 'todas tienen nombre');
    const con00 = lista.filter((a) => String(a.lat) === '0' && String(a.lng) === '0');
    ok(con00.length === 0, 'ninguna con coordenadas 0,0 (eso mandaba al Golfo de Guinea)');
  }
};
