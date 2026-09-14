/**
 * tests/interruptor.test.js — la puerta que se apaga sola y se reenciende
 * =======================================================================
 * Lo que pidió el negocio, literal: "si Shalom API deja de funcionar, que solo
 * apague la puerta y siga con otras formas; y cuando regrese la API, que la
 * prenda y siga funcionando bien".
 *
 * La decisión central que se prueba aquí una y otra vez: SOLO apagan los
 * fallos del SERVICIO. Una guía que no existe es información correcta sobre
 * esa guía — cinco guías malas seguidas no pueden dejar al negocio sin
 * seguimiento. Es la misma lección que ya costó días dos veces: no confundir
 * el lado del dato con el lado del proveedor.
 */
'use strict';
const path = require('path');
const I = require(path.join(__dirname, '..', 'functions', 'interruptor.js'));

const T = 1000000;                      // "ahora" de mentira, estable
const ok = () => ({ok: true});
const falla = (m) => ({ok: false, motivo: m});

/* Aplica una tanda de resultados seguidos y devuelve el estado final. */
function correr(estado, resultados, ahora) {
  let e = I.normalizar(estado);
  resultados.forEach((r) => {
    const llave = I.decidir(e, ahora);
    if (!llave.pasa) return;            // cerrada: ni se llama
    const cambios = I.tras(e, r, ahora, llave.probando);
    if (cambios) e = I.normalizar(Object.assign({}, e, cambios));
  });
  return e;
}

module.exports = async ({bloque, ok: afirmar}) => {

  bloque('Sin estado guardado, la puerta está abierta');

  afirmar(I.decidir(I.normalizar(null), T).pasa === true,
      'un documento que no existe no puede dejar el seguimiento apagado');
  afirmar(I.normalizar(undefined).encendida === true, 'por defecto, encendida');
  afirmar(I.normalizar({fallos: -3, cerradaHasta: 'x'}).fallos === 0,
      'y un estado corrupto se lee como abierto, no como cerrado');

  bloque('Cinco fallos del servicio la cierran');

  {
    const e = correr(null, [falla('ERROR_SHALOM'), falla('ERROR_SHALOM'),
      falla('ERROR_SHALOM'), falla('ERROR_SHALOM')], T);
    afirmar(e.fallos === 4 && e.cerradaHasta === 0,
        'con cuatro fallos sigue abierta: un tropiezo aislado no apaga nada');
    afirmar(I.decidir(e, T).pasa === true, 'y se sigue consultando');
  }
  {
    const e = correr(null, new Array(5).fill(falla('SIN_RED')), T);
    afirmar(e.cerradaHasta === T + I.DESCANSO_MS, 'al quinto se cierra');
    const d = I.decidir(e, T + 1000);
    afirmar(d.pasa === false && d.motivo === 'PUERTA_CERRADA',
        'y deja de llamar a Shalom: una caída suya no cuesta 484 consultas');
    afirmar(d.reabre === T + I.DESCANSO_MS, 'diciendo a qué hora reabre');
  }
  {
    const e = correr(null, [falla('SIN_RED'), falla('SIN_RED'), ok(),
      falla('SIN_RED'), falla('SIN_RED'), falla('SIN_RED')], T);
    afirmar(e.cerradaHasta === 0,
        'el contador son fallos SEGUIDOS: uno bueno en medio lo reinicia');
    afirmar(e.fallos === 3, 'y sigue contando desde ahí');
  }

  bloque('Lo que NO apaga la puerta');

  ['NO_ENCONTRADO', 'SIN_DATO', 'FORMATO_DESCONOCIDO', 'SIN_TRADUCTOR',
    'NO_PERMITIDO'].forEach((m) => {
    const e = correr(null, new Array(20).fill(falla(m)), T);
    afirmar(e.cerradaHasta === 0 && e.fallos === 0,
        'veinte ' + m + ' seguidos no cierran nada: es del dato, no del servicio');
  });
  afirmar(I.MOTIVOS_DE_SERVICIO.indexOf('NO_ENCONTRADO') < 0,
      'NO_ENCONTRADO no está en la lista de fallos del servicio');
  afirmar(I.MOTIVOS_DE_SERVICIO.join(',') === 'SIN_RED,ERROR_SHALOM,BLOQUEADO,LIMITE',
      'y la lista es corta y explícita: sin red, error suyo, clave, cuota');

  bloque('Se reenciende sola — pero de a una');

  {
    const cerrada = I.normalizar({cerradaHasta: T + I.DESCANSO_MS});
    const antes = I.decidir(cerrada, T + I.DESCANSO_MS - 1);
    afirmar(antes.pasa === false, 'durante el descanso no pasa nada');
    const justo = I.decidir(cerrada, T + I.DESCANSO_MS);
    afirmar(justo.pasa === true && justo.probando === true,
        'cumplido el descanso pasa UNA, marcada como consulta de prueba');
  }
  {
    const cerrada = I.normalizar({cerradaHasta: T});
    const c = I.tras(cerrada, ok(), T, true);
    afirmar(c.cerradaHasta === 0 && c.fallos === 0,
        'si la prueba entra, la puerta se abre del todo');
    afirmar(I.decidir(I.normalizar(c), T).pasa === true, 'y vuelve a pasar todo');
  }
  {
    const cerrada = I.normalizar({cerradaHasta: T});
    const c = I.tras(cerrada, falla('ERROR_SHALOM'), T, true);
    afirmar(c.cerradaHasta === T + I.DESCANSO_MS,
        'si la prueba falla, otro descanso');
    afirmar(c.fallos === 0,
        'sin contar hasta cinco: ya sabemos que sigue caído, gastar cuatro ' +
        'consultas más es regalarlas');
  }

  bloque('El interruptor manual manda sobre todo');

  {
    const apagada = I.normalizar({encendida: false});
    const d = I.decidir(apagada, T);
    afirmar(d.pasa === false && d.motivo === 'APAGADA', 'apagada a mano: no pasa');
    afirmar(I.decidir(apagada, T, true).pasa === false,
        'ni el diagnóstico se la salta — apagada es apagada, o el interruptor ' +
        'mentiría');
  }
  {
    const apagada = I.normalizar({encendida: false, cerradaHasta: T + 999});
    afirmar(I.decidir(apagada, T).motivo === 'APAGADA',
        'y si además estaba cerrada sola, se dice lo que el operador decidió');
  }

  bloque('Preguntar "¿ya volvió?" es lo que la reenciende');

  {
    const cerrada = I.normalizar({cerradaHasta: T + I.DESCANSO_MS});
    afirmar(I.decidir(cerrada, T, true).pasa === true,
        'validate se salta el descanso: es UNA consulta y no toca ningún envío');
    afirmar(I.decidir(cerrada, T, false).pasa === false,
        'pero consultar una guía sigue sin pasar');
    const c = I.tras(cerrada, ok(), T, false);
    afirmar(c && c.cerradaHasta === 0,
        'y si esa consulta entra, la puerta se abre: preguntar la reenciende');
  }

  bloque('No se escribe en Firestore por gusto');

  afirmar(I.tras(I.normalizar(null), ok(), T, false) === null,
      'una consulta buena estando ya abierta no escribe nada');
  afirmar(I.tras(I.normalizar(null), falla('NO_ENCONTRADO'), T, false) === null,
      'ni un fallo del dato');
  afirmar(I.tras(I.normalizar({fallos: 2}), ok(), T, false) !== null,
      'pero si había fallos contados, se limpian');
};
