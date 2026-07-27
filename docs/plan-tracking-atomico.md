# Plan senior — Tracking Shalom: escritor atómico por evento

> Estado: **IMPLEMENTADO en el código (commit en `main`). Pendiente el
> `firebase deploy` del backend desde la PC del usuario** (el frontend ya toma
> efecto por GitHub Pages). Ver "Deploy" al final.
>
> Backend: `functions/shalomWebSync.js` (helper `appendTracking` + guardia
> `!mismoTexto || registroIncompleto`), `functions/index.js` (backfill usa el
> append, ahora con historial). Frontend: `tracking.js` (helpers
> `_appendTrackingLocal`/`_registroIncompleto` + override coherente en Motor B).
> Verificado: `scratchpad/test_tracking_backend.js` (10/10) y
> `scratchpad/test_tracking_render.js`.

## Problema observado
Algunos pedidos Shalom muestran **chip + hora + botón Historial**; otros solo el
**chip** (sin hora ni Historial). Ej.: `89568747` (completo) vs `89643906` (solo chip).

## Diagnóstico (raíz)
Condiciones de render (tracking.js):
- **Chip** (`_estadoChip`, ~463): aparece si existe `trackingStatus`.
- **Hora** (~475): aparece solo si existe `trackingLastUpdate`.
- **Botón Historial** (~552): aparece solo si `trackingHistory` no está vacío.

Auditoría de rutas que ESCRIBEN tracking:
| Ruta | status | lastUpdate | history | Resultado |
|---|---|---|---|---|
| Motor A `aplicarResultado` (tracking.js:198-211) | ✅ | ✅ | ✅ (+historialShalom) | completo |
| Motor B `decidirCambios` *cuando cambia* (shalomWebSync.js:165-174) | ✅ | ✅ | ✅ | completo |
| **Backfill** `runShalomWebSync` (index.js:787-793) | ✅ | ✅ | ❌ falta | hora sí, Historial NO |
| **Override local** `_consultarMotorB` (tracking.js:656) | ✅ (local) | ❌ | ❌ | status sin hora/historial |

Conflictos:
1. El backfill NO escribe `trackingHistory`.
2. La guardia `mismoTexto` en `decidirCambios`: si el texto del estado no cambió,
   NO reescribe `lastUpdate`/`history` → un registro incompleto **nunca se repara**
   aunque el scheduler lo consulte cada 30 min. (Causa de `89643906`.)
3. Legacy: clobber pre-`updateMask` dejó `status` sin `lastUpdate`/`history`.
4. Override local parcial (solo status/message).
5. Escritura de tracking DUPLICADA en 3 sitios con campos divergentes → deriva.

## Solución de raíz elegida: escritor atómico por EVENTO
Único camino de escritura del tracking visible:

```
appendTracking(ship, { status, source })
```

Por dentro, en UNA sola operación, deriva y setea el conjunto coherente:
- push a `trackingHistory`: `{ date: nowIso, status, message: status, source }`
- `trackingStatus  = status`
- `trackingMessage = status`
- `trackingLastUpdate = nowIso` (la MISMA entrada del historial)
- `trackingMotorOrigen = source`

Por qué es de raíz: el contrato es "un evento", no "unos campos" → **es imposible
escribir un estado sin su hora ni su historial** (son la misma entrada). Ninguna
ruta puede poner un subconjunto. `trackingStatus`/`lastUpdate` quedan como CACHÉ
derivado del último evento → los lectores (link público, formulario, barra,
observación) **no cambian**.

Descartado: event-sourcing puro (derivar status/lastUpdate al leer). Más limpio
pero toca muchos lectores → más riesgo. No vale para este caso.

## Pasos de implementación

### Backend (functions/) — REQUIERE `firebase deploy`
1. `shalomWebSync.js`: extraer helper `appendTracking(ship, status, source, nowIso)`
   que arma el bloque coherente (status/message/lastUpdate/history/motorOrigen).
   Usarlo dentro de `decidirCambios`.
2. `decidirCambios`: cambiar la guardia. Escribir el bloque visible cuando
   `rawStatus && (!mismoTexto || registroIncompleto)`, con
   `registroIncompleto = !ship.trackingLastUpdate || !(ship.trackingHistory && ship.trackingHistory.length)`.
   → auto-reparación de legacy en la próxima consulta.
3. `index.js` backfill (`runShalomWebSync`:787-793): usar el mismo append
   (incluir `trackingHistory`) en vez del set parcial.

### Frontend (tracking.js) — GitHub Pages (Ctrl+F5)
4. `aplicarResultado`: ya escribe todo; opcional consolidar en un helper local
   coherente (no imprescindible).
5. Override local `_consultarMotorB`/`_motorBConsultarUno` (tracking.js:656): NO
   hacer override parcial. Confiar en `cambios` (que ya trae el bloque coherente)
   o refrescar del backend; si se mantiene el override, setear también
   `trackingLastUpdate`. Idealmente eliminar el override parcial.

### Reparación legacy (opcional)
6. Pasada única (o dejar que el paso 2 los cure con el tiempo): recorrer los Shalom
   con `trackingStatus` pero sin `lastUpdate`/`history` y sembrar un evento
   `{ date: trackingWebUltimaConsulta || now, status: trackingStatus, source: 'repair' }`.

## Verificación (antes de push/deploy)
- Unit `appendTracking`: siempre deja los 5 campos coherentes.
- `decidirCambios`: registro incompleto + `mismoTexto` → se repara (escribe
  lastUpdate + history).
- Backfill: incluye `trackingHistory`.
- Playwright del render: chip + hora + Historial presentes tras una consulta.

## Deploy (cuando se implemente)
- Frontend (`tracking.js`): push a `main` → GitHub Pages → **Ctrl+F5**.
- Backend (en tu PC):
  ```bash
  cd functions
  firebase deploy --only functions:syncShalomWeb,functions:syncShalomWebNow,functions:syncShalomWebTest
  ```

## Notas
- No cambia observación/etiqueta ni el selector de motor. Solo garantiza
  coherencia de los campos visibles + auto-reparación.
- `updateMask` (ya desplegado) evita NUEVOS clobbers; este cambio además SANA los
  registros legacy incompletos.
