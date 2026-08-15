# Invariantes — Total Tools

> **Qué es este documento.** Las reglas del negocio que hoy solo viven dentro
> del código. Romper una de estas sin querer no da error: da un pedido en la
> etiqueta equivocada, un cliente que no recibe su aviso, o una factura de
> Firebase que se dispara.
>
> Si vas a mover código de sitio, **estas son las cosas que tienen que seguir
> siendo verdad al terminar.**

---

## 1. Las etiquetas

Ocho estados fijos, **en este orden**. El orden importa: varias reglas
comparan posiciones dentro de esta lista.

```
NUEVO PEDIDO → EN PROCESO → POR ALISTAR → ALISTADO → ENVIADO
            → LLEGÓ A DESTINO → PENDIENTE DE PAGO → FINALIZADO
```

`index.html` → `FIXED_LABELS`

**Invariantes:**

- **Los ocho fijos siempre van primero**, y las etiquetas personalizadas
  después. Se reconstruye así en cada carga y en cada `_mergeRemote`.
- **Los alias viejos se normalizan al entrar** (`'Nuevo pedido'` → `'NUEVO
  PEDIDO'`, `'EN_DESTINO'` → `'LLEGÓ A DESTINO'`). Ver `LABEL_ALIASES` y
  `_STATUS_MAP`. Un pedido antiguo nunca debe quedarse con el nombre viejo.
- **Los estados terminales del backend son otros tres**: `FINALIZADO`,
  `ANULADO`, `DEVUELTO` (`shalomWebSync.js`). Los dos últimos no existen en la
  lista del panel — un pedido en `ANULADO` sale de la cola de tracking pero el
  panel no sabe pintarlo.

### Subir documento avanza la etiqueta

`index.html` → `autoEstadoPorDoc()`

| Documento | Lleva a |
|---|---|
| ticket | `EN PROCESO` |
| embalado | `ALISTADO` |
| guía | `ENVIADO` |

**Es una escalera que solo sube.** Nunca retrocede: si el pedido ya está más
adelante, no se toca. Gobernado por `S.config.autoEstadoDoc` (por defecto
encendido).

---

## 2. Quién puede mover una etiqueta sola

Tres cosas distintas mueven `ship.status` sin que tú lo pidas. **Si tocas una,
revisa las tres** — es donde más fácil se rompe algo.

| Origen | Dónde | Cuándo |
|---|---|---|
| Subir un documento | `index.html:autoEstadoPorDoc` | escalera monótona, solo sube |
| Guardar la guía Shalom | `tracking.js:_guardarEdicion` | pasa a `ENVIADO` |
| Consulta a Shalom (Motor A) | `tracking.js:aplicarResultado` | según lo que diga Shalom |
| Consulta a Shalom (Motor B) | `shalomWebSync.js:calcularEtiqueta` | ídem, desde el backend |

### El modo de etiquetas

`S.config.trackingEtiquetaModo` — vale para los dos motores:

| Modo | Qué hace |
|---|---|
| `off` | **No mueve ninguna etiqueta.** Solo registra lo que dice Shalom |
| `auto` | Mueve todo, incluido `FINALIZADO` |
| `semi` | Mueve todo **menos** `FINALIZADO` — ese lo cierras a mano |

Compatibilidad: si el campo no existe, se deriva del booleano viejo
`trackingWebCambiaEtiqueta`.

> ⚠️ **Excepción conocida:** `tracking.js:_guardarEdicion` mueve a `ENVIADO`
> **sin consultar el modo**. Aunque tengas `off`, guardar la guía mueve el
> pedido. Está registrado en `DEUDA.md` § T-2.

---

## 3. Cómo se lee lo que dice Shalom

`tracking.js:detectarEstadoAuto` y su copia en `shalomWebSync.js`.

El texto de Shalom se normaliza (minúsculas, sin tildes) y se busca por
palabras clave:

| Devuelve | Palabras clave |
|---|---|
| `FINALIZADO` | entregado · entrega realizada · entrega completa · recogido · recojo completado · delivered |
| `EN_DESTINO` | llegó a destino · en agencia destino · disponible para recojo · disponible para retiro · en agencia de destino · a disposición · en destino · en la agencia |
| `null` | cualquier otra cosa |

> ⚠️ **`null` significa dos cosas distintas**: "Shalom dice en tránsito" y
> "Shalom no devolvió nada". Varias reglas tratan las dos igual. Ver
> `DEUDA.md` § T-3.

### De ahí sale la etiqueta

```
FINALIZADO   → FINALIZADO
EN_DESTINO   → PENDIENTE DE PAGO   si el pedido tiene saldo (cost > 0)
             → LLEGÓ A DESTINO     si no
null         → ENVIADO             solo si aún está en un estado previo
```

Estados previos = `NUEVO PEDIDO`, `EN PROCESO`, `POR ALISTAR`, `ALISTADO`.

---

## 4. Cuándo se consulta a Shalom

### Un solo motor a la vez

`S.config.trackingMotor` — `off` · `api` (Motor A, API paga) · `web` (Motor B,
worker propio).

**Nunca los dos.** El Motor A se apaga solo si el motor activo es `web`
(`tracking.js:autoTrackingCheck` sale al inicio). Si los dos corrieran, se
pisarían las etiquetas y pagarías la API sin necesidad.

### Los intervalos

| Situación | Cada |
|---|---|
| En tránsito | **12 h** |
| Llegó a destino / pendiente de pago | **24 h** |

Configurables desde `panel/config` con
`trackingWebIntervalTransitoH` / `trackingWebIntervalDestinoH`.

### La cola del Motor B

El campo `trackingWebProximaConsulta` es a la vez **el reloj y la marca de
elegibilidad**:

- **Con fecha** → está en la cola; se consulta cuando esa fecha vence.
- **`null`** → fuera de la cola.

> ⚠️ **Al detener un pedido hay que poner `null`, no dejar la fecha vieja.** Si
> se deja una fecha ya pasada, el pedido sale vencido **para siempre** y se
> consulta en cada corrida.

**Otras reglas de la cola:**

- Máximo **25 pedidos por corrida**, con **2 500 ms** de pausa entre consultas
  (gentil con Shalom y su reCAPTCHA).
- Ante error: reintentos espaciados **1 h, 2 h, 4 h, 8 h, 24 h**. Tras **5
  errores seguidos** el pedido sale de la cola marcado para revisión manual.
- Un pedido entra a la cola solo si es **Shalom + tiene guía y código + no está
  en estado terminal**.
- **El scheduler corre cada 30 minutos.**

### Lo visible y la etiqueta son cosas separadas

El **tracking visible** (`trackingStatus`, `trackingHistory`) se escribe
**siempre** que el texto cambie, sin importar el modo de etiquetas. La
**etiqueta interna** (`status`) solo se mueve según el modo.

Y el escritor es **atómico**: `appendTracking()` escribe estado, hora e
historial en el mismo bloque. **Nunca debe quedar un estado sin su hora o sin su
entrada de historial.**

---

## 5. Reglas duplicadas — cuidado al unificar

Estas existen en varios sitios y **no todas las copias son iguales**. Unificar
sin comparar cambiaría comportamiento.

| Regla | Copias | ¿Idénticas? |
|---|---|---|
| `normPeruPhone` | `index.html`, `formulario.html` | **Sí**, byte a byte → seguro unificar |
| `detectarEstadoAuto` | `tracking.js`, `shalomWebSync.js` | Copia intencional (motores aislados) — **comparar antes** |
| escapar HTML | `print.js`, `voz.js`, `formulario.html` (`esc`), `index.html` (`escH`) | **No.** `print.js` y `voz.js` **no escapan la comilla simple** |
| normalizar teléfono a 9 | `config.js:_norm9` vs `index.html:normPeruPhone` | **No.** `_norm9` toma los **últimos** 9 dígitos; `normPeruPhone` los **primeros** |
| Nombres de estados | 13 archivos | Sí, pero copiados a mano |

> ⚠️ **`_norm` significa tres cosas distintas** según el archivo: normalizar un
> teléfono (`config.js`), aplicar formato a un campo del DOM (`index.html`,
> `formulario.html`), y quitar tildes (`shalomWebSync.js`). No asumas nada por
> el nombre.

---

## 6. El código de seguimiento

`print.js:_codigoEnvio` · `formulario.html:codigoSeg`

```
Pedidos desde 2026-08-08  →  últimos 6 dígitos del id (numéricos)
Pedidos anteriores        →  últimos 4 caracteres del id (en mayúsculas)
```

La fecha de corte es `_CODIGO_CUTOFF = '2026-08-08'`. **El mismo código tiene
que salir en la etiqueta impresa, en el mensaje de WhatsApp y en el link de
seguimiento** — si se desincronizan, el cliente no encuentra su pedido.

**El QR de la etiqueta** contiene `telefono#codigo` para los pedidos nuevos, y
solo el teléfono para los antiguos.

---

## 7. Los caminos de guardado

Hay **tres** formas de escribir, y no son intercambiables:

| Función | Escribe local | Marca sucio | Reintenta | Avisa si falla |
|---|:---:|:---:|:---:|:---:|
| `save(id)` / `save([ids])` | ✅ | ✅ | ✅ 3× | punto rojo |
| `_fbSaveShipmentNow(ship)` | ❌ | ❌ | ✅ 3× | **no** |
| `_fbSave(data)` | ❌ | limpia | — | punto rojo |

**Reglas de `save()`:**

- `save('config')` → sube **solo** el documento de configuración
- `save('supp:id')` → solo ese proveedor
- `save(id)` → solo ese pedido
- `save([id1, id2])` → **esos pedidos, con una sola escritura local**
- `save()` **sin argumento** → marca `_dirtyAll` y **sube los ~700 pedidos**

> ⚠️ **`save()` sin id es carísimo.** Solo tiene sentido tras una restauración
> de respaldo. Para varios pedidos usa **siempre la lista**: llamar `save(id)`
> en un bucle de 700 congela el panel **6,5 segundos**, porque cada llamada
> reserializa el estado completo. Con la lista: **8 ms**.

**Y `save` se declara con `const`**, así que no llega a `window` sola. La línea
`window.save = save` al final de su declaración es obligatoria — sin ella,
cuatro módulos dejan de guardar en silencio.

---

## 8. La sincronización

- **El panel consulta cada 5 s** trabajando, **cada 15 s** en reposo (2 min sin
  tocar nada). Se pausa cuando la pestaña está oculta.
- **Solo recarga si `config.ts` cambió** respecto a `_S_TS`. El backend **no
  toca `ts`** a propósito: hacerlo obligaría a releer los ~700 pedidos cada 30
  minutos y destruiría el ahorro de la cola.
- **`formTs` es exclusivo del formulario y del backend.** El panel no lo escribe
  nunca. Sirve para enterarse de que llegó un pedido nuevo.
- **El latido de salud se lee a demanda** (`_fbLeerSalud`), una sola lectura,
  justo por lo anterior.

---

## 9. Privacidad — qué ve el cliente

El formulario es público, así que el endpoint que reconoce al cliente
(`handleClient`) tiene cuatro barreras y **las cuatro tienen que seguir ahí**:

1. Límite de **20 consultas por minuto** por IP.
2. Se devuelve **lo mínimo**: nombre y dirección. Nunca DNI, montos, notas,
   documentos ni historial.
3. Solo pedidos de los **últimos 12 meses**.
4. Respuesta **idéntica (`{}`)** en todos los casos negativos —sin datos, fuera
   de ventana, límite alcanzado o error— para no revelar el porqué.

**Y una regla que parece un detalle pero no lo es:** la dirección sale **solo de
pedidos DELIVERY**. En agencia o encomienda, el campo `address` guarda la
dirección de la **agencia**; ofrecerla como "tu dirección de siempre" mandaría
el próximo pedido a la agencia en vez de a la casa del cliente.

**En el seguimiento público:** el DNI y las notas **sí** se muestran. Las fotos
de entrega y las firmas **no**.

---

## 10. Imágenes

- Las **URL de Firebase Storage** se guardan completas (no pesan).
- Las **imágenes en base64** se reemplazan por `'[img]'` antes de guardar —
  tanto en Firestore (`_slimDoc`) como en localStorage (`_slimStateForLocal`).

> ⚠️ **Consecuencia:** una imagen que quede en base64 **no se guarda en ningún
> sitio**: vive solo en memoria y muere al recargar. Ver `DEUDA.md` § 17.

---

## 11. Seguridad

- **Firestore solo acepta correos de la lista de administradores**
  (`firestore.rules` → `esAdmin()`). Hoy: `admin@totaltools.com`. Una petición
  sin cabecera de autorización recibe **403**.
- **El público no toca Firestore.** Pasa por `formApi` (Admin SDK), que ignora
  las reglas.
- **El token dura 1 hora** y se renueva 5 minutos antes de vencer.
- **Nunca falsificar el token firmado de Shalom ni saltarse su reCAPTCHA.**
