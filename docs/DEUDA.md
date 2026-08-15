# Deuda conocida — Total Tools

> **Qué es este documento.** Los fallos encontrados en la auditoría de agosto de
> 2026, con su estado. Un fallo escrito aquí ya no es una sorpresa: es una
> decisión pendiente.
>
> Casi todos comparten la misma causa: **algo falla y nadie se entera.** No hay
> aviso, no hay punto rojo, no hay registro. La app parece funcionar.

**Estado:** ✅ arreglado · ⬜ pendiente · 🔵 decisión tomada (se deja así)

---

## Arreglados

### ✅ 12 · `window.save` no existía — 4 módulos sin guardar nada

`save()` se declara con `const`, y **un `const` de nivel superior no se cuelga
de `window`** (a diferencia de las `function`, que sí). Los módulos que
preguntaban `typeof window.save === 'function'` veían `undefined`, y el guardián
escondía el fallo perfectamente.

Lo que estaba muerto:

| Módulo | Consecuencia |
|---|---|
| `respaldo.js:177` | **Restaurar un respaldo no persistía.** Al recargar se perdía entero |
| `print.js:328` | El marcado de "impreso" no sobrevivía a una recarga |
| `notify.js:230` | Igual, desde la campana |
| `tracking.js:365` | **El ciclo de auto-tracking nunca guardó un resultado.** Cada 12 h consultaba Shalom y lo perdía |

**Arreglado** con `window.save = save`. Y como tres de esas llamadas usaban
`save()` **sin id** —que sube los ~700 pedidos—, `save()` acepta ahora una lista
de ids: **8 ms en lote contra 6 483 ms llamando `save(id)` en bucle.**

### ✅ 11 · `_clienteHintUpdate` no existe

**Falsa alarma.** Sí existe, en `config.js:482`.

---

## Pendientes — pérdida silenciosa de escrituras

### ⬜ 13 · El token vence cada hora y las escrituras caen sin avisar

**El más grave.** Si `_refreshToken()` falla (red mala en el momento de
renovar), `_authHeaders()` **degrada a peticiones sin identificar** en vez de
negarse:

```js
const ok = await window._authEnsureToken();
if(ok){ ...devuelve Authorization: Bearer... }
return {};     // ← sin cabecera
```

Y las reglas exigen sesión → **403 a todo lo que escribas durante esa hora**. El
punto sigue verde. Nada avisa.

**Arreglo:** renovar antes de escribir y, si no se puede, **negarse a escribir y
avisar**. Nunca degradar.

### ⬜ 1 · `_fbSaveShipmentNow` falla en silencio absoluto

Tras 3 reintentos solo hace `console.warn`. No escribe en localStorage, no marca
el pedido como sucio, no toca el punto de Firebase, no avisa.

La usan **8 sitios**, y son justo los que mueven etiquetas: cambio por QR
(`index.html:3030`), revertir QR (`3049`), finalizar entrega
(`delivery.js:370`), asignar motorizado (`delivery.js:262`), tracking
(`tracking.js:775, 908, 1012`), y `config.js:728, 735`.

**Es la explicación de "cambié la etiqueta y se regresó sola".**

### ⬜ 2 · El indicador de "datos pendientes" es código muerto

- `#pendingDot` **no existe en el HTML**. No se puede mostrar.
- `dpanel_pending` se **lee** y se pone en `'0'`, pero **nadie la pone nunca en
  `'1'`**.

Consecuencia: la recuperación de `index.html:1426` ("si quedó algo pendiente,
súbelo al reconectar") **nunca se ejecuta**. Un guardado fallido sin conexión no
se reintenta jamás.

### ⬜ 16 · Subir un documento cambia la etiqueta y no la guarda

`storage.js:186` llama a `autoEstadoPorDoc()`, que cambia `ship.status` **en
memoria y sin guardar**. Si cierras el modal sin pulsar Guardar, el archivo
queda en Storage pero el pedido no lo referencia.

### ⬜ 17 · El respaldo a base64 es mentira

Cuando falla la subida a Storage, avisa *"guardando localmente"* y cae a base64.
Pero `_slimDoc` lo reemplaza por `'[img]'` antes de subir a Firestore **y**
`_slimStateForLocal` hace lo mismo antes de escribir en localStorage. **La foto
vive solo en memoria y muere al recargar.**

---

## Pendientes — carreras de sincronización

### ⬜ 4 · Un cambio remoto puede descartarse para siempre

En `_poll`, `_mergeRemote()` sale sin hacer nada si hay un guardado en curso
—pero el llamante **igual anota `_S_TS = remoteTs`**. El panel tira los datos y
marca que los tiene. Ese cambio de otro dispositivo **no se vuelve a pedir**.

### ⬜ 5 · `_isSaving` es un booleano, no un contador

Con dos guardados solapados, el primero en terminar lo libera mientras el
segundo sigue vivo. La protección contra carreras queda abierta justo en el
momento de más tráfico.

### ⬜ 6 · La nube pisa cambios locales, y los pedidos locales desaparecen

`S.shipments = remote.shipments` es un reemplazo total. Un pedido creado sin
internet **desaparece** al recargar, sin rastro.

### ⬜ 7 · `_S_TS` retrocede en el tiempo

`_fbSave` captura `saveTs` al empezar y lo asigna al terminar, pisando un
`_S_TS` más nuevo que `save()` haya puesto durante la subida.

### ⬜ 8 · Fuga de costo al limpiar los sucios

`_fbSave` limpia `_dirtyShips` **entero** al terminar, incluidos los pedidos
marcados *durante* la subida que esa llamada nunca subió. El siguiente guardado
ve el conjunto vacío → sube **los ~700 pedidos**.

---

## Pendientes — la automatización contradice al operador

### ⬜ 3 · Mover una etiqueta hacia atrás se deshace solo

`shalomWebSync.js:138` y `tracking.js:253`:

```js
if (ESTADOS_PREVIOS.indexOf(ship.status) >= 0) return "ENVIADO";
```

Si un pedido tiene guía y lo mueves **hacia atrás** a *Alistado*, *Por alistar*,
*En proceso* o *Nuevo pedido* —lo que hace el escaneo QR—, la siguiente pasada
del Motor B lo empuja de vuelta a `ENVIADO`. **No hay ninguna marca de "esto lo
decidió el operador".**

**Y hay una carrera:** `runShalomWebSync` lee los 25 pedidos **de golpe al
inicio** y luego consulta uno por uno con pausas de 2,5 s. El pedido #20 se
escribe con una foto de minutos antes. Nunca relee antes de escribir.

---

## Pendientes — fragilidad y costo

### ⬜ 19 · Cada edición se escribe dos veces

`config.js:728+729` y `735+736` llaman a `_fbSaveShipmentNow(...)` **y** a
`save(...)`. Dos PATCH del mismo documento por guardado.

### ⬜ 9 · `lsSet` se traga el error de cuota

Cae a una copia en memoria (`_mem`) que muere al recargar. Sin aviso. Con 700
pedidos el estado ya pesa **~887 KB**, y el límite ronda los 5 MB.

### ⬜ 10 · El arranque no resiste un localStorage corrupto

`let S = JSON.parse(lsGet('dpanel')||'{}')` sin `try/catch`. Si esa entrada
queda a medias, **el panel no arranca**: pantalla en blanco.

### ⬜ 20 · 45 `catch` vacíos

Bloques `catch(e){}` donde el error desaparece sin dejar rastro:

| | | | |
|---|---:|---|---:|
| `formulario.html` | 14 | `cotizacion.js` | 4 |
| `index.html` | 8 | `ticket.js` | 2 |
| `voz.js` | 7 | `config.js` | 2 |
| `tracking.js` | 5 | `auth.js` · `notify.js` · `respaldo.js` | 1 c/u |

No todos importan igual. El crítico es **`auth.js:156`**, dentro de
`_refreshToken()`: se traga el error de renovación de token y devuelve `false`,
que es justo el arranque del hallazgo 13.

### ⬜ 18 · Nada vigila la sincronización

El centro de alertas cubre negocio (retrasados, sin guía, sin cerrar). **Ninguna
alerta observa si tus cambios llegan a Firestore.** La clase de fallo más cara
es la única sin cobertura.

### ⬜ 21 · El CI tiene una lista escrita a mano

`ci.yml` revisa los `.js` uno por uno con una lista que ya se desfasó: **no
incluye `alertas.js` ni `cotizacion.js`** — 1 161 líneas que nadie verifica. Un
`*.js` lo arregla.

Y aun arreglado, `node --check` solo confirma que el archivo se puede leer.
**Ninguno de los fallos de este documento lo habría detectado.**

### ⬜ 22 · El `?v=N` depende de que te acuerdes

Si cambias un `.js` y no subes su número, tus clientes siguen con la versión
vieja en caché y tú crees que desplegaste.

---

## Tensiones — decisiones pendientes del dueño

Casos donde "no cambiar el comportamiento" choca con "que sea correcto".

### 🔵 T-1 · Guardar la guía pasa el pedido a ENVIADO

**Decidido:** el pedido debe quedarse en `ALISTADO` hasta su **primera consulta
a Shalom**, manual o automática. Hay **dos** caminos que hay que quitar:

- `tracking.js:770` — guardar el número de guía
- `index.html:1945` — `_DOC_ESTADO.guia:'ENVIADO'`, al subir la **foto** de la guía

Los que **sí** deben seguir moviendo son `tracking.js:255` y
`shalomWebSync.js:138`, que son la consulta de verdad.

*Pendiente de ejecución.*

### ⬜ T-2 · Guardar la guía ignora el modo de etiquetas

`tracking.js:770` mueve a `ENVIADO` **sin pasar por `_puedeMoverEtiqueta()`**.
Aunque tengas el modo en `off` ("solo observar"), te mueve el pedido. Es un
bypass de la propia configuración.

### ⬜ T-3 · `autoEstado === null` significa dos cosas

Significa "Shalom dice en tránsito" **y** "Shalom no devolvió nada". Con la
regla actual, **una consulta que falla y vuelve vacía también mueve el pedido a
`ENVIADO`**. Lo correcto es exigir que Shalom **haya dicho algo**.

### ⬜ T-4 · Las funciones de escapar HTML no son iguales

`print.js` y `voz.js` **no escapan la comilla simple**; `formulario.html` y
`index.html` sí. Unificarlas sería un **arreglo**, no un refactor: un nombre con
apóstrofe puede romper la etiqueta.

### 🔵 T-5 · Los dos normalizadores de teléfono discrepan

`config.js:_norm9` toma los **últimos** 9 dígitos; `index.html:normPeruPhone`
los **primeros**. Para `"051925983268"` dan `925983268` y `051925983`.

Y como el backend (`handleClient`) usa `.slice(-9)` mientras lo que se **guarda**
usa `slice(0,9)`, **un teléfono mal escrito se guarda de una forma y se busca de
otra** → el reconocimiento del cliente falla en silencio.

**Decidido:** se deja como está por ahora. Tocarlo cambiaría las claves de
pedidos antiguos.
