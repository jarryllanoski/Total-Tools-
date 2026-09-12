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

---

## 2. Nadie mueve una etiqueta sola

**Invariante actual (30 ago 2026): `ship.status` solo cambia cuando el operador
lo cambia.** No hay ninguna ruta automática.

Se retiraron las cuatro que existían:

| Origen retirado | Dónde estaba | Qué hacía |
|---|---|---|
| Subir un documento | `index.html:autoEstadoPorDoc` | boleta → `EN PROCESO`, embalado → `ALISTADO`, guía → `ENVIADO` |
| Guardar la guía Shalom | `tracking.js:_guardarEdicion` | pasaba a `ENVIADO` |
| Respuesta de Shalom | `tracking.js:_aplicarEstadoShalom` | según el modo off/semi/auto |
| Lector local | `shalom-local/subir.js:decidirCambios` | la copia en Node de la regla anterior |

Con ellas se fue el **modo de etiquetas** (`trackingEtiquetaModo`, con sus
valores `off`/`auto`/`semi`) y el selector de **motor de rastreo**
(`trackingMotor`). Los campos siguen existiendo en `panel/config` porque borrar
datos no aporta nada, pero **ya nadie los lee**.

> **Lo que SÍ se conservó:** interpretar lo que dice Shalom para **avisar**.
> `detectarEstadoAuto` sigue viva y alimenta el aviso 🎉 "llegó a destino"
> (`_checkDestinoAlerts`) y los toasts ("puedes finalizarlo", "avisar al
> cliente"). La distinción es deliberada: **informar sí, decidir por ti no.**

> **Si la automatización vuelve** (con la API oficial y sus webhooks), tiene que
> volver por **un solo sitio**, no por cuatro. Esa fue la lección de esta
> limpieza.

---

## 2 bis. Un envío no desanda el camino

**Invariante (11 sep 2026): `ship.trackingStatus` nunca retrocede solo.**

El recorrido tiene un orden y es de una sola dirección:

```
0 origen · registrado → 1 tránsito → 2 destino · reparto → 3 entregado
```

La **etiqueta** (`ship.status`) llevaba años con esta protección. El **texto
del tracking** no la tenía, y por eso una respuesta peor podía pisar una
buena. Pasó dos veces en la vida real (ver `docs/SHALOM.md`): una guía
Entregada volvió a mostrarse como "Demora de envíos", y otra que ya estaba En
destino se quedó en "En tránsito".

**Dónde vive la guarda** — en los dos sitios que escriben, porque son dos
caminos distintos hacia el mismo campo:

| Quién escribe | Dónde | Qué hace al detectar un retroceso |
|---|---|---|
| El panel (botón ⟳, masivo) | `tracking.js:_aplicarEstadoShalom` | no escribe; el aviso lo dice |
| El webhook de Shalom | `functions/index.js:shalomWebhook` | no escribe; lo anota como `RETROCESO_BLOQUEADO` |

**Reglas de la guarda** (las tres importan):

1. **Solo bloquea el retroceso demostrable.** Los dos textos tienen que ser
   reconocibles y el nuevo estrictamente anterior. Un texto que no se sabe
   clasificar **nunca** bloquea — si no, los pedidos hoy mal guardados
   quedarían congelados para siempre en el estado equivocado.
2. **El operador es la excepción.** Un estado puesto a mano (`origen ===
   'manual'`) pasa siempre. La guarda existe para atajar datos, no personas.
3. **Nunca es silenciosa.** Bloquear y callar sería peor que el bug original:
   el panel dice qué llegó y por qué no se aplicó.

**El vocabulario está duplicado a propósito**: `_idxDeTexto` en
`functions/shalomApi.js` (servidor) y `_rangoDeTexto` en `tracking.js`
(navegador). Uno no puede importar al otro. **Si cambias las palabras de uno,
cámbialas en el otro** — hay una prueba que compara las dos listas.

> **Ojo con la demora.** "Demora de envíos" devuelve `null` en las dos copias,
> a propósito: no es un punto del recorrido, es algo que le pasa a un envío en
> camino. Tratarla como punto es exactamente lo que la dejaba pisar un
> "Entregado".

---

## 2 ter. La selección es del dispositivo, no del pedido

**Invariante (12 sep 2026): `seleccion.js` es el único dueño de qué pedidos
están marcados, y eso nunca sale de este navegador.**

Antes la selección era un campo del pedido (`ship.sel`). Parece inofensivo y no
lo es: **el pedido es la cosa que se sincroniza.**

| Puerta | Qué hacía |
|---|---|
| `slimShipment` copia el pedido entero | `sel` subía de acarreo en cualquier guardado |
| `_mergeRemote` reemplaza los pedidos cada 5 s | el `sel` remoto pisaba el local |

Resultado: desmarcabas algo y cinco segundos después volvía solo, o veías
marcado lo que marcó otro vendedor en su pantalla.

**Y no era solo molesto.** `delSelected` leía la selección **dos veces** —una al
abrir el aviso para contar, otra al confirmar para quitar de la pantalla— y
entre las dos cabía un latido. Si la selección cambiaba en medio, desaparecía
de la pantalla un pedido que **nunca entró a la papelera ni se borró de
Firestore**, y el aviso decía otro número.

**Las tres reglas que lo sostienen:**

1. **`sel` no existe en el pedido.** `slimShipment` lo quita en la puerta de
   subida (por si alguien lo vuelve a poner), y `_mergeRemote` suelta el que
   venga de Firestore.
2. **Una acción destructiva lee la selección UNA vez.** `delSelected` congela
   los ids al abrir y usa esa lista para todo: papelera, borrado remoto,
   pantalla y mensaje final.
3. **Marcar no rehace la lista.** `Seleccion` cambia una clase y un carácter en
   la tarjeta que cambió. Medido con 1039 pedidos: 7,5 ms → 0,02 ms de JS, y
   0,54 MB menos a localStorage por clic.

**Los `sel:true` que quedaron guardados en Firestore no se limpiaron.** Son
inertes —ya nadie los lee— y borrarlos de verdad costaría reescribir un millar
de documentos de golpe, que es la tanda que deja el indicador de Firebase en
rojo. Se sueltan en memoria al cargar.

> **La regla para cualquier dato nuevo:**
> ¿de esto depende un cliente o un pedido? → **compartido**, en Firestore.
> ¿solo cambia lo que ves tú en tu pantalla? → **local**, como esto.

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

**Hoy: solo cuando alguien lo pide.** El selector de motor, los intervalos y la
cola del worker se retiraron junto con el rastreo viejo. Quedan dos caminos, los
dos a petición:

| Camino | Quién lo dispara |
|---|---|
| ⟳ Consultar / 🔄 masivo | el operador, desde el panel |
| `shalom-local/subir.js` | el Programador de tareas de Windows, cada 6 h |

`shalom-local` sigue vivo **a propósito** hasta que la integración con la API
oficial esté probada: es lo que mantiene los estados al día mientras tanto. No
mueve etiquetas (§ 2), solo registra.

### Lo visible y la etiqueta son cosas separadas

El **tracking visible** (`trackingStatus`, `trackingHistory`) se escribe siempre
que el texto cambie. La **etiqueta interna** (`status`) no se toca nunca de
forma automática — ver § 2.

Y el escritor es **atómico**: `_escribirTracking()` escribe estado, mensaje,
hora e historial en el mismo bloque. **Nunca debe quedar un estado sin su hora o
sin su entrada de historial.**

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
