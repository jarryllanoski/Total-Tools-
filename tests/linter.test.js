/**
 * tests/linter.test.js — QUE EL LINTER NO VUELVA A TUMBAR UN DESPLIEGUE
 * ======================================================================
 * `firebase deploy` corre `eslint .` ANTES de subir nada. Un error de estilo
 * no es cosmetico: PARA EL DESPLIEGUE EN SECO, y el dueño se lo come en su
 * terminal despues de esperar el empaquetado.
 *
 * Me paso TRES VECES EN UN DIA, cada vez con una regla distinta:
 *   1 · `/* global btoa, Buffer *\/`  -> no-redeclare (ESLint ya los conoce)
 *   2 · una linea de mas de 80        -> max-len
 *   3 · meter una funcion ENTRE el JSDoc de otra y su cuerpo -> require-jsdoc
 *
 * Las dos primeras las parchee una a una. La tercera demostro que parchear
 * casos no sirve: hay que comprobar LAS REGLAS, sobre TODO functions/, para
 * que la cuarta no exista. Este archivo no sustituye a ESLint —no se puede
 * correr aqui, no hay node_modules— pero cubre las reglas que de verdad me
 * han tumbado despliegues.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./_entorno.js');

/* Los .js de functions/, que son los que pasan por el linter al desplegar. */
function modulos() {
  const dir = path.join(E.RAIZ, 'functions');
  return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => f !== 'eslint.config.js' && f !== '.eslintrc.js');
}

module.exports = async ({bloque, ok}) => {

  const archivos = modulos();

  bloque('max-len: ninguna linea pasa de 80 CARACTERES');

  {
    /* Caracteres, no bytes. Las tildes ocupan 2 y los `─` de los titulos 3,
       asi que medirlo con herramientas de bytes (`awk length`) da lineas
       "largas" que no lo son y esconde las de verdad. Me paso. */
    archivos.forEach((f) => {
      const largas = E.leer('functions/' + f).split('\n')
          .map((l, i) => [i + 1, l.length]).filter((x) => x[1] > 80);
      ok(largas.length === 0,
         f + ': ninguna linea pasa de 80 caracteres' +
         (largas.length ? ' — lineas ' +
           largas.slice(0, 5).map((x) => x[0] + ' (' + x[1] + ')').join(', ') :
           ''));
    });
  }

  bloque('no-redeclare: no se declaran globales que ESLint ya conoce');

  {
    const YA_CONOCIDOS = ['btoa', 'atob', 'Buffer', 'console', 'process',
      'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'setTimeout',
      'clearTimeout', 'setInterval', 'require', 'module', 'exports',
      'fetch', 'AbortSignal', 'crypto'];
    archivos.forEach((f) => {
      const m = E.leer('functions/' + f).match(/\/\* global ([^*]*)\*\//);
      if (!m) return;
      const malos = m[1].split(',').map((x) => x.trim()).filter(Boolean)
          .filter((g) => YA_CONOCIDOS.indexOf(g) >= 0);
      ok(malos.length === 0,
         f + ': no redeclara globales conocidos' +
         (malos.length ? ' — tumbaria el despliegue: ' + malos.join(', ') : ''));
    });
  }

  bloque('require-jsdoc: cada funcion con SU comentario, y pegado a ella');

  {
    /* EL CASO EXACTO QUE ME PASO: meti una funcion nueva ENTRE el JSDoc de
       `llamar` y su cuerpo. Las dos tenian comentario, pero `llamar` se
       quedo con el de la otra encima y el suyo huerfano. ESLint:
       "270:1 error Missing JSDoc comment".
       Por eso no basta con "existe un JSDoc cerca": tiene que ser la linea
       JUSTO ANTERIOR a la funcion. */
    archivos.forEach((f) => {
      const lineas = E.leer('functions/' + f).split('\n');
      const sinDoc = [];
      lineas.forEach((l, i) => {
        /* ⚠️ CON INDENTACION. Mi primera version exigia que `function`
           empezara en la COLUMNA 0, asi que no miraba NINGUNA funcion de
           los modulos UMD —`registroShalom.js`, `pedidoPublico.js`,
           `agencias.js`, `enlaceSeguimiento.js`—, que van dentro de una
           fabrica y por tanto indentadas. Esos son justo los archivos
           nuevos. La guardia existia y no cubria lo que hacia falta. */
        if (!/^\s*(async\s+)?function\s+[A-Za-z_$]/.test(l)) return;
        const previa = (lineas[i - 1] || '').trim();
        if (previa !== '*/' && !/^\/\*\*.*\*\/$/.test(previa)) {
          sinDoc.push(i + 1);
        }
      });
      ok(sinDoc.length === 0,
         f + ': toda funcion de nivel superior lleva su JSDoc pegado' +
         (sinDoc.length ? ' — sin el, lineas ' + sinDoc.join(', ') : ''));
    });
  }

  bloque('valid-jsdoc: el comentario no solo existe, se puede LEER');

  {
    /* CUARTA CLASE DE ERROR DEL LINTER QUE ME MUERDE, y la mas sutil:
       `require-jsdoc` solo exige que HAYA un comentario; `valid-jsdoc`
       exige que ESLint pueda leer sus etiquetas. Y no las lee si estan en
       la misma linea que la descripcion:

           /** Solo digitos. @param {*} v valor @return {string} d *\/   ✗
           /**
            * Solo digitos.
            * @param {*} v valor
            * @return {string} sus digitos
            *\/                                                          ✓

       Mi guardia anterior comprobaba que el JSDoc EXISTIERA y lo daba por
       bueno. Paro un despliegue. Ahora se exige una etiqueta por linea y
       una `@param` por cada parametro de verdad. */
    archivos.forEach((f) => {
      const lineas = E.leer('functions/' + f).split('\n');
      const malos = [];
      lineas.forEach((l, i) => {
        const m2 = l.match(/^\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/);
        if (!m2) return;
        /* ⚠️ EL JSDOC DE UNA SOLA LINEA HAY QUE CAZARLO AQUI, Y SE ME
           ESCAPO A LA PRIMERA: al buscar hacia atras una linea que sea
           exactamente `/**`, un comentario de una linea no la tiene, asi
           que el bucle seguia subiendo y acababa leyendo el comentario de
           la funcion ANTERIOR —que si estaba bien— y daba verde.
           Es el mismo error de siempre: mirar cerca en vez de mirar lo
           que es. */
        const encima = (lineas[i - 1] || '').trim();
        if (/^\/\*\*.*\*\/$/.test(encima)) {
          if (/@(param|returns?)\b/.test(encima)) {
            malos.push('linea ' + i + ': JSDoc de UNA LINEA con etiquetas — ' +
              'ESLint no las lee asi (valid-jsdoc)');
          }
          return;
        }
        let j = i - 1;
        const doc = [];
        while (j >= 0 && lineas[j].trim() !== '/**') {
          doc.unshift(lineas[j]);
          if (doc.length > 60) break;
          j--;
        }
        if (j < 0) return; // sin JSDoc: lo caza la otra prueba
        const txt = doc.join('\n');
        const params = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
        params.forEach((nombre) => {
          const limpio = nombre.replace(/^\.\.\./, '').split('=')[0].trim();
          const re = new RegExp('^\\s*\\*\\s*@param\\s+\\{[^}]*\\}\\s+\\[?' +
            limpio.replace(/\$/g, '\\$'), 'm');
          if (!re.test(txt)) {
            malos.push('linea ' + (i + 1) + ': falta @param ' + limpio);
          }
        });
        /* ⚠️ SE COMPRUEBA LA FORMA, NO LA PRESENCIA. Si HACE FALTA un
           `@return` ya lo decide ESLint, y mi primera version lo exigia mas
           a menudo que el: marcaba `setCORS` (que no devuelve nada) y
           `handleClient` (cuyo `return vacio()` es una salida temprana, no
           un valor). Una regla propia mas dura que la real es ruido, y el
           ruido acaba con que alguien desactive la prueba entera.
           Lo que SI es mio: si el comentario menciona `@return`, tiene que
           estar en su propia linea — porque ahi es donde ESLint no lo lee y
           donde me paro un despliegue. */
        if (/@returns?\b/.test(txt) && !/^\s*\*\s*@returns?\s/m.test(txt)) {
          malos.push('linea ' + (i + 1) +
            ': el @return no esta en su propia linea');
        }
      });
      ok(malos.length === 0,
         f + ': cada funcion documenta sus parametros y su retorno, una ' +
         'etiqueta por linea' +
         (malos.length ? ' — ' + malos.slice(0, 4).join('; ') : ''));
    });
  }

  bloque('quotes: comillas dobles, que es lo que pide la config de Google');

  {
    /* Solo en los modulos que escribi yo con esa convencion. Un literal de
       plantilla si vale (`allowTemplateLiterals: true`). */
    ['pedidoPublico.js', 'enlaceSeguimiento.js', 'agencias.js'].forEach((f) => {
      if (!E.existe('functions/' + f)) return;
      const src = E.leer('functions/' + f)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
      // Comillas simples que envuelven texto, fuera de comentarios.
      const simples = (src.match(/(^|[^\\A-Za-z0-9_$'])'[^'\n]*'/g) || [])
          .filter((x) => !/\\'/.test(x));
      ok(simples.length === 0,
         f + ': usa comillas dobles' +
         (simples.length ? ' — encontradas: ' +
           simples.slice(0, 3).join(' ') : ''));
    });
  }

  bloque('El codigo de functions/ parsea, y con la version que se despliega');

  {
    /* `ecmaVersion: 2018` en la config del linter. Sintaxis mas nueva
       —encadenamiento opcional `?.`, `??`, `catch` sin variable— pasa en
       Node 24 pero ESLint la rechaza al desplegar. */
    archivos.forEach((f) => {
      const src = E.leer('functions/' + f)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
      const nuevos = [];
      if (/\?\./.test(src)) nuevos.push('?. (ES2020)');
      if (/\?\?/.test(src)) nuevos.push('?? (ES2020)');
      if (/catch\s*\{/.test(src)) nuevos.push('catch sin variable (ES2019)');
      ok(nuevos.length === 0,
         f + ': nada mas nuevo que ES2018, que es lo que acepta el linter' +
         (nuevos.length ? ' — ' + nuevos.join(', ') : ''));
    });
  }
};
