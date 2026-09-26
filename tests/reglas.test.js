/**
 * tests/reglas.test.js — las reglas de Firestore y de Storage
 * ============================================================
 * Las reglas son lo único que separa tus datos de cualquiera con una cuenta
 * de Google. No se pueden ejecutar desde aquí, pero sí se puede afirmar lo
 * que dicen — y sobre todo, que las DOS listas de administradores no se
 * separen: están duplicadas por obligación (Storage no puede leer de
 * Firestore sin pagar una lectura por petición), y una lista duplicada que
 * nadie compara se desincroniza sola.
 */
'use strict';
const E = require('./_entorno.js');

/* Los correos de una lista `email in [...]`, en el orden que estén. */
function admins(texto) {
  const m = /email in \[([^\]]+)\]/.exec(texto);
  if (!m) return null;
  return (m[1].match(/'([^']+)'/g) || []).map((x) => x.replace(/'/g, ''));
}

module.exports = async ({bloque, ok}) => {
  const fs = E.leer('firestore.rules');
  const st = E.leer('storage.rules');

  bloque('Las dos listas de administradores dicen lo mismo');

  {
    const a = admins(fs);
    const b = admins(st);
    ok(a && a.length >= 1, 'firestore.rules tiene su lista');
    ok(b && b.length >= 1, 'storage.rules también');
    ok(a && b && a.slice().sort().join(',') === b.slice().sort().join(','),
       'y son IDÉNTICAS. Están duplicadas porque Storage no puede leer de ' +
       'Firestore sin pagar una lectura por petición, así que lo único que ' +
       'impide que se separen es esta línea' +
       (a && b ? '\n      firestore: ' + a.join(', ') +
                 '\n      storage  : ' + b.join(', ') : ''));
  }

  bloque('Un correo sin verificar no es un administrador');

  {
    /* Con correo/contraseña, Firebase deja crear una cuenta con CUALQUIER
       correo sin comprobar que sea tuyo. Sin `email_verified`, alguien que
       supiera uno de estos correos se registraba con él y entraba. */
    [['firestore.rules', fs], ['storage.rules', st]].forEach(([n, t]) => {
      ok(/email_verified == true/.test(t),
         n + ' exige el correo verificado — sin eso, la lista se puede ' +
         'reclamar registrándose con uno de esos correos');
    });
  }

  bloque('Storage: leer sí, escribir solo los administradores');

  {
    /* La lectura es pública a propósito: estas URLs se mandan por WhatsApp y
       el formulario de seguimiento las muestra. Son documentos de envío, no
       secretos. */
    ok((st.match(/allow read:\s*if true;/g) || []).length === 2,
       'los dos caminos se leen sin sesión: el cliente tiene que poder ver ' +
       'su guía desde WhatsApp');
    ok(!/allow write:\s*if request\.auth != null;/.test(st),
       'pero YA NO se escribe con solo tener sesión. Eso dejaba subir ' +
       'archivos a cualquiera con una cuenta de Google: pisar las fotos de ' +
       'las guías, llenar el bucket');
    ok((st.match(/allow write:\s*if esAdmin\(\);/g) || []).length === 2,
       'los dos exigen ser administrador');
    ok(/match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/.test(st),
       'y lo que no está declarado se deniega: un camino nuevo no nace abierto');
  }

  bloque('Nadie escribe en Storage desde fuera del panel');

  {
    /* Si el formulario público subiera algo, exigir administrador lo habría
       roto. No sube: la única subida del proyecto está en storage.js, y
       formulario.html no lo carga. Las Cloud Functions usan el Admin SDK y
       se saltan estas reglas. */
    const pub = E.leer('formulario.html');
    ok(pub.indexOf('uploadType=media') < 0 && pub.indexOf('StorageModule') < 0,
       'el formulario público no sube nada a Storage, así que exigir ' +
       'administrador no le quita nada al cliente');
    ok(!/<script[^>]*src="storage\.js/.test(pub),
       'ni siquiera carga storage.js');
    ok(E.leer('storage.js').indexOf('uploadType=media') > 0,
       'la única subida del proyecto sigue estando en storage.js');
  }
};
