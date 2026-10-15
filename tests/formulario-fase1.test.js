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
    /* ⚠️ SE BUSCA EL PASO QUE CONTIENE LOS CAMPOS, NO EL NUMERO 1.
       Esta prueba decia «paso 1» a pelo y se puso roja el 15/10/2026, el
       dia que el courier paso a ser el primero y los datos el segundo —
       aunque el orden de los campos, que es lo que comprueba, no habia
       cambiado nada. Una prueba que se rompe cuando algo que no mira se
       mueve es ruido: la proxima vez se arregla sin leerla. */
    const form = E.leer('formulario.html');
    const trozos = form.split(/<div class="wz-step" data-step="/);
    const paso = trozos.find((t) => t.indexOf('id="f_dni"') > 0) || '';
    ok(!!paso, 'los tres campos viven en algun paso del asistente');
    const pd = paso.indexOf('id="f_dni"');
    const pn = paso.indexOf('id="f_name"');
    const pp = paso.indexOf('id="f_phone"');
    ok(pd > 0 && pn > 0 && pp > 0, 'y los tres en el MISMO paso');
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
    // Igual aqui: el bloque que valida el DNI, sea el numero que sea.
    const form = E.leer('formulario.html');
    const todo = form.slice(form.indexOf('function wzValidate'),
        form.indexOf('} else if(step===3)'));
    const bloques = todo.split(/if\(step===\d\)\{/);
    const b = bloques.find((x) => x.indexOf("'err_dni'") > 0) || '';
    const vd = b.indexOf("'err_dni'");
    const vn = b.indexOf("'err_name'");
    const vp = b.indexOf("'err_phone'");
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

  bloque('⚠️ Elegir como recibir es lo PRIMERO que se ve');

  {
    /* Al entrar, el cliente veia una etiqueta EN BLANCO ocupando el primer
       tercio del movil y tres campos debajo. Elegir como quiere recibir el
       pedido es la decision de la que cuelga todo lo demas: que se pregunta
       en el paso 3, y si hay paso 3 siquiera. */
    const form = E.leer('formulario.html');
    const trozos = form.split(/<div class="wz-step" data-step="/);
    const nDe = (marca) => {
      const t = trozos.find((x) => x.indexOf(marca) > 0) || '';
      return t ? Number(t.slice(0, 1)) : 0;
    };
    const pasoCourier = nDe('id="courierCards"');
    const pasoDatos = nDe('id="f_dni"');
    ok(pasoCourier === 1,
       '⚠️ el courier es el paso 1 — salio: ' + pasoCourier);
    ok(pasoDatos === 2,
       'y los datos el 2 — salio: ' + pasoDatos);
  }
  {
    /* ⚠️ LA VALIDACION SE MOVIO CON LA PANTALLA. Si no, el asistente
       validaria el paso equivocado y dejaria pasar un formulario vacio sin
       decir nada — el peor fallo posible aqui, porque no se ve. */
    const form = E.leer('formulario.html');
    const todo = form.slice(form.indexOf('function wzValidate'),
        form.indexOf('} else if(step===3)'));
    const num = (marca) => {
      const re = /if\(step===(\d)\)\{([\s\S]*?)(?=\}\s*else if\(step===|$)/g;
      let m;
      while ((m = re.exec(todo))) {
        if (m[2].indexOf(marca) > 0) return Number(m[1]);
      }
      return 0;
    };
    ok(num("'err_courier'") === 1,
       '⚠️ el paso 1 valida el COURIER, que es lo que ahora se ve ahi');
    ok(num("'err_dni'") === 2,
       'y el paso 2 valida los datos');
  }
  {
    const form = E.leer('formulario.html');
    const i = form.indexOf('cs.addEventListener');
    const fn = form.slice(i, i + 300);
    ok(/_wzStep!==1/.test(fn),
       '⚠️ y el auto-avance al tocar una tarjeta mira el paso 1. Con el 2 ' +
       'viejo, elegir courier no avanzaria y el cliente se quedaria mirando ' +
       'una pantalla que ya respondio');
  }
  {
    const form = E.leer('formulario.html');
    const trozos = form.split(/<div class="wz-step" data-step="/);
    const p1 = trozos.find((x) => x.indexOf('id="courierCards"') > 0) || '';
    ok(p1.indexOf('wzBack()') < 0,
       'la primera pantalla NO tiene «Atras»: un boton que no lleva a ningun ' +
       'sitio es un boton que se toca una vez y ya no se cree');
    const p2 = trozos.find((x) => x.indexOf('id="f_dni"') > 0) || '';
    ok(p2.indexOf('wzBack()') > 0,
       'y la segunda SI, para poder cambiar de courier');
    ok(/Datos de la persona que recibe/.test(p2),
       'con su encabezado: en un envio a agencia quien recoge puede NO ser ' +
       'quien pide, y «tus datos» invita a poner el DNI del que paga');
    ok(/id="f_dni"[^>]*data-wz-focus/.test(p2),
       'y el DNI se enfoca al llegar: ahora se llega TOCANDO una tarjeta, ' +
       'asi que el teclado puede abrirse dentro de ese gesto');
  }
  {
    /* Ninguna tarjeta nace elegida: con 1 courier o con 7, el cliente toca
       y avanza. Era la unica duda real del cambio de orden. */
    const form = E.leer('formulario.html');
    ok(/role="radio" aria-checked="false"/.test(form),
       'ninguna tarjeta viene preseleccionada — no hay salto automatico ni ' +
       'pantalla trabada cuando solo hay un courier');
  }

  bloque('⚠️ La etiqueta no se ve hasta que tiene algo TUYO dentro');

  {
    /* La regla mira el CONTENIDO, no el paso. Lo facil habria sido
       «ocultala en el paso 1», y habria quedado mal el mismo dia que los
       pasos se movieron. */
    const et = E.leer('narrador/etiqueta.js');
    const i = et.indexOf('function update()');
    const fn = et.slice(i, et.indexOf('function place()', i));
    ok(/box\.style\.display = \(name\|\|phone\|\|dni\|\|dest\|\|courier\)/
        .test(fn),
       '⚠️ se ve cuando hay nombre, telefono, DNI, destino o courier — y no ' +
       'cuando el asistente esta en tal paso: asi la regla sigue siendo ' +
       'cierta el dia que los pasos se muevan otra vez');
    ok(!/remName|paintRemitente\(\)[^;]*display/.test(
        fn.slice(fn.indexOf('box.style.display'))),
       'y el REMITENTE no cuenta: esta desde el segundo cero porque es del ' +
       'negocio, y contarlo haria que la etiqueta se viera SIEMPRE — justo ' +
       'lo que se vino a quitar');
  }
};
