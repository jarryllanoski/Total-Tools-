# Pruebas del panel

```bash
node tests/correr.js              # todas
node tests/correr.js seleccion    # solo las que coincidan con el nombre
```

Sin dependencias: **no hay `npm install`**. La raíz del proyecto no tiene
`package.json` ni `node_modules` a propósito —son `<script>` clásicos que el
navegador carga directo— y una prueba que necesita instalar algo es una prueba
que un día deja de correr.

Corren en CI en cada push (`.github/workflows/ci.yml`).

## Qué cuidan

No son pruebas de "esta función devuelve 4". Cada una existe porque **algo se
rompió de verdad** y no queremos que vuelva:

| Archivo | El fallo que lo originó |
|---|---|
| `seleccion.test.js` | Desmarcabas un pedido y el latido de Firebase te lo devolvía marcado cinco segundos después. Y borrar podía llevarse un pedido de más |
| `vista.test.js` | Montar las 1042 tarjetas para ver las 118 que importan — y que al ocultar los finalizados, buscar dejara de encontrarlos |
| `chips.test.js` | Las flechas movían 120 px fijos, un número sin relación con el ancho de ninguna etiqueta |
| `tracking.test.js` | Una guía Entregada mostrada como "Demora de envíos", y otra En destino que se quedó en "En tránsito" |
| `shalom.test.js` | Que la integración desconectada deje alguna pantalla muda, o que vuelva a colarse una llamada directa a la API saltándose la puerta |

## Cómo escribir una

```js
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {          // async si necesitas await
  const {ok, bloque} = t;

  bloque('Lo que se está probando');
  ok(algo === esperado, 'lo que debe pasar, en cristiano');
};
```

`_entorno.js` trae lo necesario para probar código de navegador en Node:

- `cargar(rel, win, extra)` — evalúa un archivo del proyecto contra un `window`
  de mentira. Prueba **el código que se despliega**, no una copia.
- `trozo(rel, desde, hasta)` — saca una función de dentro de `index.html`.
- `domFalso({ids, tarjetas})` — un DOM mínimo. No es jsdom a propósito: obliga
  a declarar qué se está usando, y eso es información útil.
- `leer(rel)`, `existe(rel)`, `scriptsEnLinea(rel)`.

## Dos reglas

**1. La prueba tiene que poder fallar.** Antes de darla por buena, rómpela a
propósito y comprueba que se pone roja. Una aserción como `ok(x || true, …)`
es peor que no tener prueba: da confianza falsa.

**2. El título dice qué debe pasar, no qué hace el código.** `'un retroceso
bloqueado no agrega al historial'` sirve dentro de seis meses; `'test 4'` no.
