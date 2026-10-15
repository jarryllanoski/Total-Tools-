/**
 * tests/formulario-fase1.test.js — la pagina del cliente, fase 1
 * ================================================================
 * Tres cambios pedidos por el dueño el 15/10/2026, y ninguno de logica:
 *   · el DNI va PRIMERO (es el unico dato que puede rellenar a los otros)
 *   · la etiqueta de arriba, mas pequeña
 *   · App Check tambien en esta pagina, que hasta hoy no lo tenia
 *
 * ⚠️ Y UNA TRAMPA QUE HABRIA DEJADO A TODOS LOS CLIENTES SIN PODER PEDIR.
 * Ver el bloque de CORS mas abajo: es la prueba que mas importa de este
 * archivo.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ Toda cabecera que el navegador mande, CORS la permite');

  {
    /* AÑADIR UNA CABECERA A UN GET CROSS-ORIGIN LO CONVIERTE EN UNO CON
       PREFLIGHT: el navegador pregunta antes con OPTIONS y, si la cabecera
       no esta permitida, BLOQUEA la peticion. No la rechaza el servidor —
       no llega a salir.

       Desplegar la pagina sin desplegar antes el servidor dejaria a TODOS
       los clientes sin poder pedir. Una medida de seguridad que tumba el
       negocio no es una medida de seguridad.

       Por eso esto no compara textos sueltos: saca las cabeceras que la
       pagina manda DE VERDAD y las busca en la lista del servidor. */
    const form = E.leer('formulario.html');
    const srv = E.leer('functions/index.js');
    const lista = (srv.match(
        /Access-Control-Allow-Headers",\s*\n?\s*"([^"]+)"/) || [])[1] || '';
    ok(!!lista, 'se encuentra la lista de cabeceras permitidas: ' + lista);

    const permitidas = lista.toLowerCase().split(',').map((x) => x.trim());
    // Las que la pagina pone en un objeto `headers` de fetch.
    const manda = [];
    const re = /'(X-[A-Za-z-]+)'\s*:/g;
    let m;
    while ((m = re.exec(form))) {
      if (manda.indexOf(m[1]) < 0) manda.push(m[1]);
    }
    ok(manda.length > 0,
       'la pagina manda al menos una cabecera propia: ' + manda.join(', '));
    const faltan = manda.filter((h) => permitidas.indexOf(h.toLowerCase()) < 0);
    ok(faltan.length === 0,
       '⚠️ y TODAS estan permitidas en CORS. Si falta una, el navegador ' +
       'bloquea la peticion ANTES de salir y el formulario deja de ' +
       'funcionar entero. Faltan: ' + faltan.join(', '));
  }

  bloque('App Check tambien en la pagina del cliente');

  {
    const form = E.leer('formulario.html');
    ok(/<script src="appcheck\.js/.test(form), 'se carga appcheck.js');
    /* ⚠️ SE COMPARAN LAS ETIQUETAS <script>, NO EL TEXTO. Mi primera
       version uso `indexOf('appcheck.js')` y fallo: el comentario de
       encima NOMBRA el archivo, asi que lo encontraba en la prosa y no en
       la carga. Es la misma trampa que ya documenta tests/enlace.test.js —
       buscar un nombre en el fuente no es comprobar que algo pase. */
    const tags = (form.match(/<script src="[^"]+"><\/script>/g) || []);
    const pos = (n) => tags.findIndex((t) => t.indexOf(n) >= 0);
    ok(pos('firebase-config.js') >= 0 && pos('appcheck.js') >= 0 &&
       pos('firebase-config.js') < pos('appcheck.js'),
       'y la config de Firebase se CARGA antes: appcheck.js lee ' +
       '`window.FBConfig` al arrancar, y sin ella se apaga sola');
    ok(/_appCheckToken/.test(form),
       'y se pide el token en las llamadas a la API');
  }
  {
    /* ⚠️ SIN TOKEN SE MANDA IGUAL. Hoy el servidor no lo exige: esto es una
       capa de MEDICION, y un cliente sin reCAPTCHA o sin red no puede
       quedarse sin pedir por ella. */
    const form = E.leer('formulario.html');
    const i = form.indexOf('async function _api(');
    const fn = form.slice(i, i + 1400);
    ok(/if\(t\)\{/.test(fn) || /if\s*\(t\)/.test(fn),
       'la cabecera solo se añade SI hay token');
    ok(/try\{[\s\S]*_appCheckToken[\s\S]*\}catch/.test(fn),
       'y todo el bloque va en try/catch: que App Check falle no puede ' +
       'impedir un pedido');
    const fetchPos = fn.indexOf('await fetch(');
    ok(fetchPos > fn.indexOf('_appCheckToken'),
       'el token se pide ANTES del fetch, no despues');
  }

  bloque('El DNI va primero — y es orden, no logica');

  {
    const form = E.leer('formulario.html');
    const paso1 = form.slice(form.indexOf('data-step="1"'),
        form.indexOf('data-step="2"'));
    const pd = paso1.indexOf('id="f_dni"');
    const pn = paso1.indexOf('id="f_name"');
    const pp = paso1.indexOf('id="f_phone"');
    ok(pd > 0 && pn > 0 && pp > 0, 'los tres campos siguen en el paso 1');
    ok(pd < pn && pn < pp,
       '⚠️ DNI, nombre, telefono — en ese orden. El DNI es el unico dato ' +
       'que puede RELLENAR a los otros: pedirlo al final es pedir que el ' +
       'cliente escriba a mano un nombre que ya ibamos a saber');
  }
  {
    /* Los ids, los mensajes y las reglas son los de antes. Si un id
       cambiara, `submitOrder` leeria undefined y el pedido saldria sin ese
       dato — en silencio. */
    const form = E.leer('formulario.html');
    ['f_dni', 'f_name', 'f_phone', 'err_dni', 'err_name', 'err_phone']
        .forEach((id) => {
          ok(form.indexOf('id="' + id + '"') > 0,
             'sigue existiendo ' + id + ', con el mismo nombre');
        });
    ok(/maxlength="8"/.test(form.slice(form.indexOf('id="f_dni"') - 200,
        form.indexOf('id="f_dni"') + 200)), 'el DNI sigue topado a 8');
  }
  {
    const form = E.leer('formulario.html');
    const v = form.slice(form.indexOf('function wzValidate'),
        form.indexOf('} else if(step===2)'));
    const vd = v.indexOf("'err_dni'");
    const vn = v.indexOf("'err_name'");
    const vp = v.indexOf("'err_phone'");
    ok(vd > 0 && vd < vn && vn < vp,
       'y se valida en el MISMO orden en que se ve: leer la validacion en ' +
       'otro orden que el formulario es como se olvida un campo el dia que ' +
       'se añade uno');
  }

  bloque('La etiqueta de arriba, mas pequeña — con una sola perilla');

  {
    const et = E.leer('narrador/etiqueta.js');
    ok(/--tt-s:\s*\.?\d/.test(et),
       'hay UNA variable de escala, no catorce medidas tocadas a mano');
    const sueltas = (et.match(/#tt-lbl[^']*font-size:\d/g) || []);
    ok(sueltas.length === 0,
       '⚠️ ni un `font-size` suelto en la etiqueta: todos salen de la ' +
       'escala, asi que cambiarla no descuadra las proporciones. Sueltos: ' +
       sueltas.length);
    ok(/width:calc\(74px \* var\(--tt-s\)\)/.test(et),
       'el QR encoge con el resto, no se queda grande en una tarjeta chica');
    const esc = parseFloat((et.match(/--tt-s:\s*(\.?[\d.]+)/) || [])[1]);
    ok(esc > 0.6 && esc < 1,
       'y la escala es menor que 1 pero no ilegible — salio: ' + esc);
  }
  {
    /* Esto es la VISTA PREVIA del formulario. El rotulo que se pega al
       paquete lo hace print.js y no pasa por aqui: encogerlo no puede
       encoger lo que se imprime. */
    const pr = E.leer('print.js');
    ok(pr.indexOf('--tt-s') < 0 && pr.indexOf('tt-lbl') < 0,
       'print.js no comparte nada con la vista previa: la etiqueta que se ' +
       'IMPRIME no cambia de tamaño');
  }
};
