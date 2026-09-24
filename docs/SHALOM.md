# Shalom — integración de rastreo, tickets, agencias y registro

## El contrato de `POST /track` — medido, no supuesto

> **Por qué está escrito acá.** La documentación de `api.shalom-api.lat`
> describe qué **enviar** pero no qué **devuelve**. Esta forma se obtuvo
> midiendo una respuesta real el **31/08/2026** con la operación de
> diagnóstico (`Shalom.esquema`). Si algún día el traductor deja de reconocer
> la respuesta, se vuelve a medir en vez de adivinar.

La respuesta trae **dos bloques**:

```
{
  search:   { success, message, data: { …detalles del envío… } },
  statuses: { success, message, data: { …el recorrido… } }
}
```

⚠️ El envoltorio del recorrido se llama **`statuses`** (en inglés), no
`estados`. Ese fue exactamente el motivo de que el primer traductor no lo
reconociera.

### `statuses.data` — el recorrido

Siete claves. Cada una es `null` mientras no ocurra, y un objeto con `fecha`
(a veces `completo`, `cargueros`) cuando ocurre:

| Clave | Barra | Nota |
|---|:--:|---|
| `registrado` | 0 | antes de entrar a la agencia |
| `origen` | 0 | |
| `transito` | 1 | trae `cargueros` |
| `destino` | 2 | |
| `reparto` | 2 | reparto a domicilio: mismo tramo para el cliente |
| `entregado` | 3 | |
| `demora` | — | **no es un paso**: es una condición que se superpone |

### Quién manda: el recorrido, no la redacción

`statuses.message` trae la redacción del propio Shalom ("En tránsito",
"Entregado"). Durante un tiempo esta página decía que `message` **se prefiere
sobre nuestro texto**, y el traductor lo cumplía al pie de la letra: el
`message` pisaba siempre al paso encontrado. Esa regla estaba mal y costó dos
fallos reales, con la misma forma:

| Guía | Shalom en su web | El panel mostraba |
|---|---|---|
| `94790771` | Entregado (08/09, 17:15) | **Demora de envíos** |
| `95046118` | En destino (11/09, 08:34) | **En tránsito** |

En los dos casos el árbol de pasos estaba **bien** y `message` estaba
atrasado o describía otra cosa. La regla correcta:

> **El árbol de pasos es un hecho fechado; `message` es una frase.
> Cuando se contradicen, gana el hecho.**

En concreto, `normalizarTrack` clasifica el `message` con el mismo vocabulario
que los pasos (`_idxDeTexto`) y decide:

| Situación | Qué se muestra |
|---|---|
| `message` concuerda con el paso | **`message`** — es la palabra que el cliente ve en la web |
| `message` contradice al paso | **el texto del paso**, y se anota `discrepancia` |
| `message` no se puede clasificar | **`message`** — una frase desconocida no contradice nada |
| `message` vacío | el texto del paso |

Lo que **no** se hace es callar la contradicción: el campo `discrepancia`
viaja en la respuesta para que se pueda medir si Shalom cambió algo.

#### La demora es una condición, no un estado

`demora` solo se muestra cuando el tramo más avanzado es `transito` o
anterior (`idx <= 1`). Un envío que ya llegó a la agencia no está "demorado":
está listo para recoger, y decir otra cosa manda al cliente a buscar un
paquete que ya está ahí. El dato no se pierde — viaja como `demorado:true`.

#### `search.data.entregado` ya no se guarda para nada

Ese booleano se recogía y no se miraba, que es justo el dato que habría
delatado el primer fallo. Ahora se usa, y **solo hacia adelante**: si Shalom
afirma que se entregó y el árbol todavía no lo registra, se cree la
afirmación (`ascendido:"search.entregado"`). Al revés no — un paso fechado
pesa más que un booleano, así que un `false` nunca deshace un `entregado`.

### `search.data` — detalles del envío

Además del estado, cada consulta trae gratis: `entregado` (booleano, sirve de
contraste con la barra), `monto`, `estado_pago`, `tipo_pago`, `contenido`,
`direccion_entrega`, `aereo`, `fecha_emision`, el `comprobante` (serie y
número), `remitente` y `destinatario` (documento y nombre), y —importante para
registrar envíos— **`origen.id` y `destino.id`, que son los `ter_id`** de las
agencias.



Este documento explica **por qué** el rastreo automático de Shalom se retiró,
**cómo** quedó el código, y **qué** hace falta para reconectarlo. Léelo antes de
volver a tocar nada de Shalom: aquí está la razón para no repetir caminos que ya
sabemos que no funcionan.

## El contrato de `GET /instances` — medido, no supuesto (22 sep 2026) ✅

**Es el que está conectado**, no el `POST /instances/status` de más abajo. Dos
razones, y las dos se descubrieron al ir a conectarlo:

1. El POST exige un `instanceId` que **el panel no tenía guardado en ninguna
   parte**. El GET no pide nada… y lo devuelve.
2. Ese `id` es además la llave que exige `/track/label` para el ticket
   (contradicción 2 de `docs/SHALOM-API.md`) y el registro de envíos. Sacarlo
   aquí desbloquea las tres cosas.

Lo único que aporta el POST sobre el GET es la `url` —dónde quedó parado el
robot—. Si algún día hace falta, se añade con su propia medición.

Forma real, medida con `Shalom.esquema('instances')` contra la API desplegada:

```json
{ "instances": [ {
    "id":        "string",
    "name":      "string",
    "username":  "string",
    "createdAt": "string(####-##-##T##:##:##.###Z)",
    "isLoggedIn": "boolean"
} ] }
```

⚠️ **La documentación la pinta PLANA**; viene envuelta en `instances`. Es la
séptima vez que la doc y la realidad no coinciden en esta API.

### ⚠️ El ESTADO del panel de Shalom NO es la sesión — comprobado

El 22/09/2026 el panel decía **⚠️ sesión caída** y `shalom-api.lat/dashboard/
instances` mostraba **✅ Conectado** en verde. Se midió todo antes de tocar una
línea:

| Fuente | Decía |
|---|---|
| `GET /instances` → `isLoggedIn` | `false` |
| `POST /instances/status` | `false`, `url: https://pro.shalom.pe/login` |
| Su panel, **después de pulsar "Verificar"** | ✅ Conectado |

Los dos endpoints coincidían, así que **no hay ninguno cacheado**: su columna
ESTADO mide *"la instancia está encendida"* (el robot corriendo), no *"la cuenta
tiene sesión"*. Su producto llama igual a dos cosas distintas.

**Y se cerró en las dos direcciones**, que es lo que lo convierte en prueba y no
en teoría: al cerrar sesión y volver a entrar desde su panel, el campo pasó a
`true` y el botón del panel se puso verde. El campo funciona; lo que engaña es
su pantalla.

Moraleja para el registro de envíos: **la única fuente de verdad es
`isLoggedIn`.** Si alguna vez el panel dice "caída" y el de ellos dice
Conectado, el panel tiene razón — y registrar en ese estado falla sin decir por
qué.

### Las tres respuestas que no son "la sesión está caída"

| Caso | Motivo | Por qué va aparte |
|---|---|---|
| `instances: []` | `SIN_INSTANCIA` | No hay cuenta que consultar. Se arregla creando la instancia, no entrando a Shalom |
| más de una | `VARIAS_INSTANCIAS` | No se puede saber cuál usa el panel. Con una dentro y otra fuera, elegir la primera diría "todo bien" y los registros fallarían igual |
| `isLoggedIn` no booleano | `FORMATO_DESCONOCIDO` | El día que llegue la **cadena** `"false"`, un texto no vacío es verdadero: diría "conectada" y fallaría en fila |

`url` va en **null** a propósito: este endpoint no la da, y el panel prefiere
no pintar el enlace antes que inventarse una dirección.

**El `id` no se guarda en ninguna parte.** Pedirlo es una consulta que no gasta
cuota, y un id guardado puede quedar viejo si la instancia se rehace. Menos
estado, y nunca desfasado.

`GET /instances` **sondea** igual que `validate`: puede pasar mientras la
puerta descansa, y como cualquier respuesta buena la reabre, apretar *Verificar
sesión* es también la forma de preguntar "¿ya volvió?".

## El contrato de `GET /public/agencies` — medido, no supuesto (24 sep 2026) ✅

El catálogo de agencias, que devuelve la vida al botón **Extraer agencias**.

**Va la variante PÚBLICA**, y por dos razones medidas:

1. **No consume cuota** (la doc lo dice, y es lo que hace viable refrescar el
   catálogo a diario por nada).
2. **No necesita clave, así que la puerta no se la manda.** Una credencial no
   viaja donde no hace falta.

Sigue pasando por la puerta y no por el navegador porque su API responde
`access-control-allow-origin: https://shalom-api.lat` — medido en las
cabeceras de una respuesta real —, así que un `fetch` desde el panel lo
bloquearía CORS.

### ⚠️ Contradicción nº 8: la pública NO trae "la misma estructura"

La documentación dice que `/public/agencies` tiene *misma estructura* que
`/agencies` (48 campos). Lo medido son **34**, y faltan **`hora_domingo`** y
**`referencia`**.

Se comprobó **antes** de aceptar la pérdida: el formulario lee
`ag.horario || ag.hora_atencion` y `hora_atencion` sí viene; `horarioDom` y la
`referencia` **de la agencia** no las usa nadie (`referencia` en el panel es la
del pedido, otra cosa). Se devuelven vacías en vez de inventar un dato.

### ⚠️ `ter_id` llega como NÚMERO

En el catálogo guardado es **texto** (`"ter_id": "3"`). Se normaliza a texto en
el traductor, en un solo sitio. Sin eso, el día que se verifique la agencia
antes de registrar un envío, `3 !== "3"` **no da error: simplemente falla**, y
un envío sin verificar es un paquete pagado que puede salir a otra ciudad.

### ⚠️ No hay campo `distrito`

La API manda **`zona`**. Es el mismo mapeo que hace `_mapShalom` en el
navegador. Antes de reemplazar el catálogo, el extractor compara con el que ya
está en uso, así que un cambio masivo de distritos se vería antes de aceptar
nada.

### Lo que el traductor se niega a hacer

| Caso | Respuesta | Por qué |
|---|---|---|
| Sin `success: true` | `FORMATO_DESCONOCIDO` | Jamás ok:true sin dato real |
| `data` no es una lista | `FORMATO_DESCONOCIDO` | |
| **Todas se descartan → 0** | `FORMATO_DESCONOCIDO` | 554 que se vuelven 0 no es un catálogo vacío: es que cambió la forma. Reemplazarlo con eso lo deja inservible |
| Una agencia sin `ter_id` | Se descarta, **y se cuenta** en `sinId` | No sirve para registrar. Descartar 4 de 5 en silencio sería un catálogo roto que parece bueno |

Devuelve la lista bajo la clave **`agencias`** —no `lista`— porque es una de las
que `agencias-extractor.js` sabe buscar, y la misma del archivo del catálogo.
Hay una prueba que lo afirma contra el código del extractor, no de memoria.

### La estabilidad de los `ter_id` — medida con dos catálogos reales

Comparando la extracción del **19 jul 2026** con la del **5 sep 2026** (48 días):

| | |
|---|---|
| 546 → 550 agencias · 6 se fueron, 10 llegaron | |
| Mismo departamento/provincia/distrito | **539** (98,7 %) |
| **Se mudaron de ubicación** | **1** |
| Mismo sitio, nombre retocado | 13 |
| Mismo sitio, dirección de calle distinta | 17 |

```
id 671   jul: CALLAO   / CALLAO   / VENTANILLA / POR DEFINIR
         sep: AREQUIPA / AREQUIPA / SACHACA    / VARIANTE UCHUMAYO CO
```

**Shalom recicla los ids de los huecos "POR DEFINIR".** Así que un `ter_id`
guardado hace semanas **no es una promesa**: antes de registrar un envío hay
que comprobar que sigue apuntando donde creemos.

Y la comprobación correcta es por **departamento/provincia/distrito**, no por
nombre: medido contra esos dos catálogos, el distrito da **1 aviso verdadero y
0 falsas alarmas**; el nombre daría **13 falsas alarmas** ("HUARAZ" → "HUARAZ
CO") y el aviso dejaría de leerse.

## El contrato de `POST /instances/status` — medido, no supuesto

Igual que con `/track`, la documentación dice **qué enviar** pero no **qué
devuelve**. Se midió con el botón *Verificar sesión de Shalom Pro*
(Configuración → Configuración Shalom), que enseña la respuesta cruda.

Enviado:

```json
{"instanceId": "<el id de la instancia>"}
```

Recibido (respuesta real, 2026-09-09):

```json
{
  "isLoggedIn": false,
  "username": null,
  "url": "https://pro.shalom.pe/login"
}
```

| Campo        | Tipo          | Qué significa                                      |
|--------------|---------------|----------------------------------------------------|
| `isLoggedIn` | `boolean`     | La cuenta tiene sesión abierta. **Este es el dato que decide si un registro va a funcionar.** |
| `username`   | `string\|null` | Con qué cuenta está dentro. `null` cuando está fuera. |
| `url`        | `string`      | En qué página quedó el robot. `…/login` = se deslogueó. |

### "Instancia encendida" ≠ "sesión viva"

Es la confusión cara de este endpoint. La pantalla de **Instancias** de Shalom
puede decir **Conectado** —el robot está corriendo— mientras `isLoggedIn` es
`false`: el robot corre, pero parado en la pantalla de login. Registrar envíos
en ese estado falla, y falla sin decir por qué.

Por eso el registro automático debe consultar esto **antes** de mandar un lote:
un aviso claro vale más que diez fallos en fila.

### La regla del traductor

`interpretarInstancia()` (en `functions/shalomApi.js`) solo afirma algo cuando
`isLoggedIn` es un booleano de verdad. Si Shalom cambia la forma, devuelve
`{conocido:false}` y el panel vuelve a mostrar la respuesta cruda en lugar de
inventar un "conectado". Es exactamente la regla que faltaba cuando el
traductor de `/track` daba por bueno un formato que ya no existía.


## Resumen en una línea

Todo lo de Shalom pasa por una sola puerta — `shalom.js` — que hoy está
**desconectada a propósito**: la integración se rehace endpoint por endpoint
(ver el plan más abajo). Las dos formas medidas de arriba son el punto de
partida, no se vuelven a medir.

## Por qué se retiró lo anterior

Hubo dos motores, y los dos dependían de la web pública de Shalom:

- **Motor A** — la API paga (`shalom-api.lat`), vía las Cloud Functions
  `shalomTracking` / `shalomTicket` / `agenciasShalom` / `shalomListar`. El plan
  venció.
- **Motor B** — un worker propio en Cloud Run (Playwright, navegador real) que
  abría `shalom.com.pe/rastrea`, leía la pantalla y guardaba el estado. Vía
  `syncShalomWeb` (cada 30 min) + `syncShalomWebNow` + `syncShalomWebTest`.

**El obstáculo no era técnico, era de diseño de Shalom:** su web usa
**reCAPTCHA v3**, que puntúa de forma invisible cada visita (0 a 1). El servidor
del país es quien decide qué mostrar según esa nota:

- Una persona en su PC, con su IP de casa → nota alta → ve el estado.
- Un servidor (Cloud Run, IP de centro de datos) → nota baja → **403 + pantalla
  de "Inicia sesión"**.

Por eso el rastreo fallaba **de forma intermitente** (la nota fluctúa) y, peor,
**en silencio**: el worker devolvía `ok:true` aunque le hubieran dado un 403, así
que el backoff, el latido de salud y las alertas que se construyeron nunca se
activaban. Un pedido podía quedar días congelado sin que nadie se enterara.

Hacer que un servidor saque nota alta significa disfrazarlo de persona (IPs
residenciales, huellas falsas). Eso es engañar al detector y es una carrera que
se pierde a la larga. **No se hace.** La firma del reCAPTCHA v3 está en el HTML
de Shalom:

```html
<!-- reCAPTCHA v3 -->
<script src="https://www.google.com/recaptcha/api.js?render=6LeGp5Et..."></script>
```

## Estado: `/validate` conectado, el resto dormido (13 sep 2026)

| Endpoint | Estado | Dónde |
|---|---|---|
| `GET /validate` | ✅ **conectado** | `functions/shalomPuerta.js` · `Shalom.validar()` |
| `POST /track` | ✅ **conectado** | remedido el 13 sep 2026 |
| `POST /track/batch` | dormido | — |
| `GET /agencies` | dormido | — |
| `POST /instances/status` | dormido | forma ya medida, arriba |
| alta de envío | dormido | — |

> **`soloMedir` es el estado intermedio de cada endpoint: medible antes que
> conectado.** Se puede preguntar su forma con `esquema`, pero pedirlo como
> operación normal responde `SIN_TRADUCTOR`. Sin esa guarda, un endpoint recién
> añadido devolvería su JSON crudo por la puerta del traductor de otro — que es
> exactamente cómo una forma mal entendida llega a la pantalla como si fuera un
> dato bueno.

`Shalom.DISPONIBLE` **sigue en false**. Lo miran el auto-check y el extractor
de agencias, y lo que ellos necesitan es `consultarGuia` y `agencias`.
Encenderlo ahora haría que el auto-check intentara consultar y fallara en cada
tarjeta.

### El camino, y por qué no hay otro

```
navegador → Cloud Function shalomPuerta → api.shalom-api.lat
```

El navegador **nunca** habla con Shalom. Hay una prueba que falla si alguna
vez aparece una URL de Shalom en el código del panel.

**Cuatro barreras, en este orden**, en `shalomPuerta.barreras()`:

| # | Barrera | Si no |
|---|---|---|
| 1 | POST con token de Firebase Auth válido | `401 SIN_SESION` |
| 2 | Correo en `ADMINS` (misma lista que `firestore.rules`) | `403 SIN_PERMISO` |
| 3 | La operación está en `PERMITIDAS` | `NO_PERMITIDO` |
| 4 | Recién entonces se usa la clave | — |

> ⚠️ **El orden entre la 2 y la 3 no es cosmético.** Si la lista blanca se
> mirara primero, a un desconocido se le respondería `NO_PERMITIDO` — y eso le
> confirma qué operaciones existen. Un no-admin siempre se topa con
> `SIN_PERMISO`, pida lo que pida. Hay una prueba dedicada; al reordenar las
> barreras, falla.

Las barreras viven en el módulo y no en `index.js` **para poder probarlas**.
Un límite de seguridad sin pruebas es una intención.

### Los códigos HTTP son de las barreras, no de Shalom

Lo que pase con Shalom viaja siempre en **200** con `{ok:false, motivo}`.
Mezclarlos fue lo que hizo que un fallo de sesión se leyera como *"tu plan
venció"* y se fueran días revisando la cuenta equivocada.

### El contrato de `GET /validate` — medido, no supuesto

**Lo que devuelve de verdad** (medido contra la API el 13 sep 2026 con
`Shalom.esquema('validate')`):

| Campo | Tipo real | ¿En la documentación? |
|---|---|---|
| `valid` | `boolean` | sí |
| `userId` | `string` | **no** |
| `limit` | `null` | sí, pero como número (`1000`) |
| `currentUsage` | `number` | sí |
| `remaining` | `null` | sí, pero como número |
| `message` | `string` | **no** |

Seis campos, no los cuatro documentados. `userId` y `message` no aparecen en
ninguna parte de `SHALOM-API.md`.

**Qué se hace con cada uno:**

- `message` **se devuelve**: es lo que Shalom dice de tu clave, y mostrar sus
  palabras es mejor que inventar las mías.
- `userId` **no**: es un identificador de la cuenta que ninguna pantalla
  necesita, y lo que no hace falta no viaja al navegador.
- Lo desconocido **se ignora**: si Shalom añade un campo mañana, esto sigue
  funcionando en vez de romperse.

### La forma que ve el panel

```
Shalom.validar() → {ok:true, valida:true, limite, usado, restante, ilimitado}
                 → {ok:false, motivo:'BLOQUEADO'|'LIMITE'|'ERROR_SHALOM'|…}
```

> ⚠️ **`limite: null` con `ilimitado: true` es PLAN ILIMITADO, no "sin cuota".**
> La documentación muestra `limit: 1000`; con plan ilimitado Shalom manda
> `null` (contradicción 5 de `SHALOM-API.md`). Traducirlo a `0` diría lo
> contrario de lo que pasa.

Una clave rechazada (`valid:false`) se traduce a `BLOQUEADO`, no a un éxito con
`valida:false`: para quien llama es lo mismo que estar bloqueado, y así hay una
sola forma que manejar.

### El contrato de `POST /track` — remedido el 13 sep 2026

`statuses.data` es un **objeto** con **7 ramas** (la documentación lo pinta
como array). Cada rama es `null` mientras no ocurre, y un objeto con `fecha`
cuando ocurre.

| Rama | Texto que produce | `pasos` |
|---|---|:---:|
| `registrado` | En origen | 0 |
| `origen` | En origen | 0 |
| `transito` | En tránsito | 1 |
| `destino` | En destino | 2 |
| `reparto` | **En reparto** | 2 |
| `entregado` | Entregado | 3 |
| `demora` | — *(no es un paso)* | — |

Extras medidos: `transito` trae `carguero`, `completo` y `cargueros[]`;
**`entregado` trae `cliente:{nombre, documento}`** — quién recibió el paquete.

**Gana el ÚLTIMO de la lista que tenga fecha, no el del número más alto.**
`destino` y `reparto` comparten `pasos:2` y aun así reparto va después.

> ⛔ **`demora` NO ESTÁ EN LA LISTA DE PASOS, y esa ausencia es el arreglo.**
> Cuando la demora podía convertirse en el estado, un paquete **entregado** se
> mostraba como *"Demora de envíos"*: el envío desandaba el camino y había que
> explicárselo al cliente. Viaja aparte, como bandera. No es que el bug esté
> arreglado — es que ya no se puede escribir.

**Una guía sin seguimiento no es una respuesta rara.** Medido con `94578959`
(un retorno a origen): Shalom contesta **200** con `statuses: null` y un
`search` que solo trae `{message, success}`, sin `data`.

> Eso se traduce a **`NO_ENCONTRADO`**, no a `FORMATO_DESCONOCIDO`. La
> diferencia no es cosmética: uno te manda a revisar **el número de guía**, el
> otro a revisar **la integración**. Confundir el lado del panel con el lado de
> Shalom ya costó días una vez.
>
> Pero solo cuando `search` viene delante — esa es la forma medida. Un cuerpo
> vacío no dice "no encontrado": no dice nada, y afirmarlo sería inventar.

**Formato de fecha confirmado en la calibración:** `YYYY-MM-DD HH:MM:SS`
(ej. `2026-09-08 15:48:50`), sin zona horaria. Ordena bien como texto, así que
no hace falta parsearla.

La **fecha se devuelve tal cual** la manda Shalom. No se parsea: su formato no
está medido, y adivinarlo es como se ordenan mal los historiales.

`Shalom.DISPONIBLE` sigue en **false**. El botón ⟳ no la mira, así que ya se
puede consultar a mano — que es como se calibra, guía por guía. El barrido
automático sí la mira, y no se enciende hasta que la calibración esté hecha:
encenderlo antes es soltar 484 consultas confiando en un traductor sin
comprobar.

### Calibración del 14 sep 2026 — 15 guías vivas reales

No se dio por bueno el traductor hasta contrastarlo contra guías de verdad:

| Resultado | |
|---|---|
| Traducidas correctamente | **14 de 15** |
| `94578959` (retorno a origen) | `NO_ENCONTRADO` — correcto: Shalom no tiene seguimiento de esa guía |
| Guías con `demora` | **7**, y **ninguna** apareció retrocedida |
| Formato de fecha | `YYYY-MM-DD HH:MM:SS`, confirmado |

La fila de `92760569` es la que cierra el caso: llegó con **demora Y entregado
a la vez**. Es exactamente la combinación que antes se mostraba como *"Demora
de envíos"* encima de un Entregado. Ahora dice Entregado.

Tres pedidos quedaron detectados como desactualizados en el panel
(`92760569` y `94391161` → Entregado; `95045598` → En destino).

### Por qué el barrido del navegador NO se enciende

`autoTrackingCheck()` (en `tracking.js`) tiene dos trancas: `AUTO_CHECK_ACTIVO`
y `Shalom.DISPONIBLE`. **Las dos siguen en false, y es definitivo, no
provisional.**

Ese barrido consulta **al abrir el panel**: con ~70 guías vivas son ~70
consultas en cada apertura, y el doble si se abre en la PC y en el celular.
Peor: no corre si nadie abre el panel, que es justo cuando hace falta.

La Fase 3 lo reemplaza por un barrido **en el servidor**, con horario
configurable, que corre solo. Cuando esté, este ciclo se borra.

## El interruptor — la puerta se apaga sola y se reenciende

`functions/interruptor.js`. Estado compartido en Firestore: **`panel/shalom`**.

| Estado | Qué pasa |
|---|---|
| **ABIERTA** | pasa todo |
| **CERRADA** | tras **5 fallos seguidos del servicio**. Se responde al instante, **sin llamar a Shalom**, durante **10 minutos** |
| **A PRUEBA** | pasado el descanso pasa **UNA** consulta. Si entra, se abre; si falla, otro descanso |

Reabrir de golpe mandaría las 484 guías contra un servicio que sigue caído. Y
si la consulta de prueba falla, **se cierra sin volver a contar hasta cinco**:
ya sabemos que sigue caído, gastar cuatro consultas más es regalarlas.

### ⛔ Qué apaga la puerta y qué no

Solo los fallos **del servicio**: `SIN_RED` · `ERROR_SHALOM` · `BLOQUEADO` ·
`LIMITE`.

> **Nunca los del dato.** Una guía que no existe es información *correcta*
> sobre esa guía. Si `NO_ENCONTRADO` contara, cinco guías mal escritas seguidas
> —y hay tres en la base— dejarían al negocio sin seguimiento durante diez
> minutos. Es la misma lección que ya costó días dos veces: no confundir el
> lado del dato con el lado del proveedor.

`FORMATO_DESCONOCIDO` tampoco cuenta: es un problema de traducción, no de
disponibilidad, y cerrar la puerta lo escondería en vez de mostrarlo.

### Preguntar "¿ya volvió?" es lo que la reenciende

`validate` **se salta el descanso** a propósito: es una consulta, no toca
ningún envío, y es la única forma de preguntar si Shalom volvió sin esperar los
diez minutos a ciegas. La documentación de Shalom recomienda exactamente eso
ante un 429. Y como cualquier respuesta buena reabre la puerta, **preguntar es
también lo que la reenciende**.

El interruptor **manual** (`encendida`) manda sobre todo: ni el diagnóstico se
lo salta. Apagada es apagada, o el interruptor mentiría.

### Detalles que no son obvios

- **Sin documento, la puerta está ABIERTA.** Un `panel/shalom` que no existe
  todavía no puede dejar el seguimiento apagado sin que nadie lo decidiera.
- **Si el estado no se puede leer, se deja pasar.** Una puerta que se cierra
  porque no pudo leerse a sí misma es peor que no tener puerta.
- **No se escribe en Firestore por gusto:** una consulta buena estando ya
  abierta no escribe nada.
- El estado se cachea **15 s** en memoria para que un barrido de 484 guías no
  cueste 484 lecturas, y se actualiza a mano tras cada escritura — así, dentro
  de un mismo barrido, el conteo de fallos es exacto.

### El interruptor en Config

Un solo interruptor, **🚪 Puerta a Shalom**, en la sección Shalom. Es el
maestro: apagado, ni el botón ⟳ consulta.

Debajo del nombre va **el estado REAL**, que no siempre coincide con el
interruptor:

| | |
|---|---|
| 🟢 | Abierta — el rastreo de Shalom funciona |
| ⏸️ | Pausada sola: Shalom falló varias veces. Reintenta en N min |
| 🔌 | Apagada **por ti** — no se consulta nada |

> Decir solo "encendido/apagado" escondería el caso del medio: la puerta puede
> estar **pausada sola** aunque tú la tengas encendida. Y los tres textos dicen
> cosas distintas a propósito — una la decidiste tú, la otra la máquina, y
> confundirlas hace buscar el arreglo donde no está.

**El panel no le pisa la mano al motor.** `_fbEncenderPuerta()` escribe
**solo** `encendida`. La cuenta de fallos y el descanso son del servidor; hay
una prueba que falla si el navegador intenta tocarlos.

## El barrido programado

`functions/barrido.js` + `exports.barridoShalom`. Cloud Scheduler dispara
**cada 30 minutos** y la función decide si le toca.

> **Por qué cada 30 min y no cuatro crones fijos.** Los disparos que no tocan
> **no consultan nada a Shalom** — cuestan 48 invocaciones y 48 lecturas al
> día, contra límites gratuitos de 66.000 y 50.000. A cambio, los horarios son
> **un texto en Config** que se cambia sin volver a desplegar. Cuatro entradas
> de cron atarían cada cambio de horario a un despliegue.

Zona fija `America/Lima`: "8am" es 8am aquí, sin cuentas con UTC. Perú no
cambia la hora, así que tampoco se corre medio año.

### A quién NO se consulta, y cuánto ahorra

| Razón | Por qué |
|---|---|
| Shalom ya dijo **Entregado** | es la última rama del árbol: no hay nada después |
| etiqueta **FINALIZADO** | el pedido está cerrado |
| **guía mal escrita** | se sabe de antemano que va a fallar; se lista para corregirla |
| consultado hace < 50 min | defensa contra un disparo repetido |

De 484 guías entran ~71 → **284 consultas al día**, y baja solo: cada pedido
que llega a Entregado sale de la lista para siempre.

### Detalles que no son obvios

- **Arranca en SIMULACRO.** Decide todo igual y no escribe: deja el informe de
  qué habría cambiado. Mover 71 etiquetas a ciegas y corregirlas a mano después
  no es una opción.
- **Si nada cambió, no se escribe nada** — ni la hora de la consulta. Estampar
  "te miré y no había novedad" 284 veces al día es pagar por no-noticias.
- **Si la puerta se cierra a mitad del barrido, se corta.** Seguir sería
  pedirle 60 veces más a un servicio caído que nos diga que sigue caído.
- **`retryCount: 0`.** Un barrido perdido se recupera en el horario siguiente;
  uno repetido consultaría todo dos veces.
- El historial se escribe con **el mismo formato que el panel**
  (`{date, status, message, source}`): un tercer formato haría ilegible la
  mitad de las entradas.
- `/track/batch` bajaría las 284 consultas a 8, y **no se usa todavía**: la
  documentación avisa que empareja por posición y no está medido qué pasa si
  una guía falla. Con plan ilimitado, la eficiencia no aprieta lo suficiente
  como para arriesgar escribir el estado de un pedido en otro.

### El botón "Correr ahora"

`exports.barridoAhora` (POST, token + admin). Es **el mismo barrido**:
`_correrBarrido(true)`. Dos copias acabarían barriendo distinto según quién lo
dispare, y el informe que se mira antes de encenderlo dejaría de describir lo
que hace el que corre solo.

Se salta **el reloj**, no el interruptor: si el seguimiento automático está
apagado, responde `BARRIDO_APAGADO`. Y solo por POST — un barrido no se
dispara abriendo una URL.

## El webhook — etapa 4a: recibir y medir · ⏸ APARCADO

`functions/webhook.js` + `_shalomWebhook`, detrás de `WEBHOOK_ACTIVO = false`.

> ## ⏸ Aparcado el 22 de septiembre de 2026 — léelo antes de tocar nada
>
> **La función no está desplegada.** Se retiró a propósito.
>
> **Por qué.** Shalom nunca llegó a registrar la URL: su formulario del panel
> (`shalom-api.lat/dashboard/webhooks`) devolvía *"URL requerida"* con el campo
> lleno — un fallo suyo, no nuestro (su propia documentación dice que una URL
> mal escrita da **400 "URL inválida"**, no ese mensaje). Sin URL registrada no
> llegaba un solo aviso… pero la función seguía viva en internet, y **cada
> petición rechazada costaba una escritura a Firestore** (ver `docs/DEUDA.md`
> § 24). Cero beneficio, costo real y creciente si alguien daba con la URL.
>
> **Qué se conserva.** Todo: `functions/webhook.js`, el manejador completo en
> `functions/index.js`, las pruebas de `tests/webhook.test.js` y el contrato
> medido de más abajo. No se borró una línea.
>
> **Por qué un interruptor y no borrar el `exports`.** Retirar el despliegue a
> mano no basta: el siguiente `firebase deploy --only functions` habría vuelto
> a crear la función sola y la puerta pública reaparecía sin que nadie se
> enterara. El `exports` cuelga ahora de `WEBHOOK_ACTIVO`, y hay una prueba que
> comprueba que no queda ningún export suelto.
>
> **Para revivirlo, en este orden:**
> 1. Arreglar el contador de rechazos (`docs/DEUDA.md` § 24). Hay una prueba
>    que falla sola si se enciende sin arreglarlo.
> 2. `WEBHOOK_ACTIVO = true` y `firebase deploy --only functions:shalomWebhook`.
> 3. Registrar la URL con `PUT /webhooks` **desde la terminal, no desde su
>    panel**, y guardar el `whsec_…` que devuelve —solo se muestra ahí— directo
>    en Secret Manager.
> 4. Suscribir cada guía con `POST /tracking/subscriptions`: **registrar la URL
>    no basta**, sin suscripción no llega nada.
>
> **Verificado, no supuesto.** El 22/09/2026, con la función ya retirada, se
> consultó `GET /webhooks` con la clave real:
>
> ```
> HTTP/1.1 200 OK
> {"success":true,"configured":false,"webhook":null}
> ```
>
> No quedó nada registrado del lado de Shalom apuntando a una URL muerta. El
> formulario de su panel nunca llegó a guardar nada.
>
> **Lo que también queda aparcado por dependencia:** la suscripción automática
> de guías. Las suscripciones solo alimentan al webhook; sin él no sirven de
> nada.

> ⚠️ **Es la única puerta pública sin autenticación del sistema.** Cualquiera
> en internet puede llamarla. Lo único que separa un aviso de Shalom de uno
> inventado es la firma.

### La firma

```
X-Shalom-Signature: t=<unix>,v1=<hex>
v1 = HMAC-SHA256("<t>.<cuerpo CRUDO>", whsec_…)
```

> **Firmamos solo el cuerpo durante días.** Es sobre `"<t>.<cuerpo>"`, y el
> cuerpo **crudo** (`req.rawBody`): reparsear el JSON y volver a serializarlo
> da los mismos datos y **otros bytes**, así que la firma no cuadra nunca — con
> el mismo síntoma que una firma mal calculada, que es lo que hace perder días.

| Defensa | Por qué |
|---|---|
| **Ventana de 5 min** sobre `t` | sin ella, quien grabe UNA llamada válida puede reenviarla para siempre |
| **Comparación en tiempo constante** | `===` se rinde en el primer byte distinto; midiendo tiempos se reconstruye la firma |
| **Tope de 64 KB** | un aviso de estado son cientos de bytes, no megas |
| **Sin secreto, no pasa nada** | ni para probar |
| **`create()` para descartar repetidos** | mirar y marcar en UNA operación: entre medio no cabe un segundo intento. Shalom reintenta, y aplicar dos veces duplica historiales |
| **401 corto y sin detalle** | decir *qué* falló ayuda a quien está probando la puerta |

Y **no se escribe en la base de datos antes de verificar**. De un aviso sin
firma no se guarda ni el cuerpo: si no está firmado, no hay razón para creer
nada de lo que trae.

### ⛔ Por qué NO traduce todavía

El webhook habla **otro idioma** que `/track`:

```
/track                    →  "En tránsito"   (español)
/tracking/subscriptions   →  "IN_TRANSIT"    (inglés, código)
```

**El mapa completo de códigos no está documentado en ninguna parte.**
Adivinarlo sería repetir el fallo que costó días — esta vez escribiendo solo y
de madrugada.

Así que la etapa 4a **mide**: anota la **forma** del evento (tipos, sin
valores) y los **códigos** que trae. Un valor solo se guarda si es
`MAYÚSCULAS_CON_GUION`, que nunca es un nombre ni una dirección. Con eso se
levanta el vocabulario sin guardar un dato de nadie.

### Lo que viene

**4b** — traducir con el mapa medido, **por el mismo `functions/etiquetas.js`**
que usa el barrido: un solo sitio decide la etiqueta, así que webhook y barrido
no pueden decidir distinto.

**4c** — suscribir las guías vivas, suscribir al crear un pedido, desuscribir
al entregarse. Y el barrido baja de 4 corridas al día a 1 o 2: pasa de hacer el
trabajo a **vigilar que el webhook no se haya caído en silencio**.

### Cómo se mide el siguiente endpoint

Desde el entorno donde se desarrolla **no se puede llamar a `shalom-api.lat`**
(salida a internet restringida). Así que **mide la función desplegada**:

```js
await Shalom.esquema('validate')   // en la consola del panel
```

Devuelve la **forma** de la respuesta —qué campos vienen y de qué tipo— y **ni
un solo valor**. Con una excepción medida a propósito: los textos que son
**puro número** (fechas, montos) revelan su patrón con los dígitos tapados —
`"2026-09-08 15:30"` sale como `"string(####-##-## ##:##)"`. Hacía falta: el
formato de fecha decide si se puede ordenar bien y no está documentado.
Cualquier texto con letras —un nombre, una dirección— sale como `"string"` a
secas. Con eso se escribe el contrato contra lo que la API devuelve
de verdad, sin que ningún dato de un cliente salga del servidor. La
documentación y la realidad ya se contradijeron **seis veces**; esta es la
herramienta para no volver a creerle a la documentación.

Para añadir un endpoint: entra en `PERMITIDAS`, se mide con `esquema`, se
escribe su `traducir…()` con pruebas, y recién entonces se enchufa el método
en `shalom.js`.

---

## Antecedente: por qué se desconectó todo (13 sep 2026)

Se retiró **toda** la lógica de API: el cliente (`functions/shalomApi.js`), los
dos endpoints del backend (`shalomApi`, `shalomWebhook`) y la llamada directa
que quedaba en `ticket.js`. La clave anterior se rota — estuvo en capturas.

**Lo medido de arriba NO se borra.** Volver a medir lo que ya está medido sería
pagar dos veces: la forma real de `/track` y de `/instances/status` es el punto
de partida del endpoint 1 y del 5.

### Por qué se rehace en vez de parchear

Dos fallos con la misma raíz costaron días, y los dos venían de traducir sin
contrato: `statuses.message` pisando el árbol de pasos, y una demora tapando un
`Entregado`. El traductor se escribió contra **una** respuesta medida y se dio
por bueno. Eso no se arregla con otro parche: se arregla con un método.

### El seam que hace posible desconectar sin romper nada

`shalom.js` es la **puerta única**: la interfaz no sabe que Shalom existe, le
habla a la puerta. Con los métodos devolviendo `DESCONECTADO`, cada pantalla ya
sabe qué decir sin tocar una línea:

| Pantalla | Qué muestra hoy |
|---|---|
| ⟳ Consultar (tarjeta y masivo) | 🔧 Rastreo Shalom en reconstrucción |
| 🧾 Jalar ticket | 🔧 Jalar ticket en reconstrucción |
| 🏢 Extraer agencias Shalom | En reconstrucción — el catálogo actual sigue sirviendo |
| 🔌 Verificar sesión de Shalom Pro | La integración se está rehaciendo |

**Reconectar = rellenar los métodos de `shalom.js`.** Nada más.

### Lo que sigue funcionando sin Shalom

- Las guías, códigos y estados **ya guardados** en cada pedido
- El **link de seguimiento** del cliente (lee lo guardado, no consulta)
- El **catálogo de 550 agencias** en `data/agencias-shalom.json` y su buscador
- Las **medidas del paquete** y el clasificador de cajas (es local)
- El auto-check ya estaba apagado (`AUTO_CHECK_ACTIVO = false`)

---

## El plan de reconstrucción

Cada endpoint se cierra por completo antes de empezar el siguiente. Un endpoint
está **hecho** cuando cumple los seis pasos:

| | Paso | Por qué |
|---|---|---|
| 1 | **Leer** la sección de la documentación y **copiarla** a `docs/SHALOM-API.md` | Ya se perdió una vez |
| 2 | **Medir** la respuesta real con `esquema` (tipos, nunca valores) | La documentación dice qué enviar, no qué devuelve |
| 3 | **Escribir el contrato** en este archivo, con la fecha | Es lo que faltaba |
| 4 | **Traducir** contra el contrato, con pruebas de cada forma | No contra una hipótesis |
| 5 | **Calibrar**: guías reales de cada estado, comparadas con la web de Shalom | El traductor deja de ser mi criterio |
| 6 | **Conectar** el método de `shalom.js` y probarlo en el panel | La puerta se abre al final |

### El orden, y por qué

| # | Endpoint | Qué desbloquea | Riesgo |
|---|---|---|---|
| 1 | `GET /validate` | Que la clave nueva sirve y cuánto plan queda | Ninguno: no toca pedidos |
| 2 | `POST /track` | El botón ⟳ — el que más usas | Medio: es el que falló dos veces |
| 3 | `POST /instances/status` | Saber si la sesión de Shalom Pro está viva | Ninguno |
| 4 | `GET /agencies` | Actualizar el catálogo offline | Bajo |
| 5 | Ticket (PNG) | El botón 🧾 | Bajo |
| 6 | **Webhook** | Que el panel se entere **solo** | Alto: escribe sin que nadie mire |
| 7 | Registro de envíos | Alta automática con las medidas | Alto: gasta dinero real |

**`/validate` primero** porque valida la clave sin tocar nada: si algo está mal
—clave, plan, red— se sabe en la primera llamada y no en la quinta.

**El webhook antes que el registro** porque consultar nunca es *fresco*: tu dato
es tan viejo como tu último clic. La frescura solo la da el webhook.

### Reglas que no se negocian

1. **La clave vive en Secret Manager.** Nunca en el navegador, nunca en el
   repositorio, nunca en una captura.
2. **Tres barreras** antes de hablar con Shalom: token de Firebase Auth válido,
   correo en la lista de administradores (la misma de `firestore.rules`), y
   lista blanca de operaciones. No un proxy ciego.
3. **Jamás `ok:true` sin dato real.** El éxito falso ocultó días de fallo.
4. **Un envío no desanda el camino** (`docs/INVARIANTES.md`, § 2 bis).
5. **La etiqueta del pedido no se mueve sola** (§ 2). Informar sí, decidir no.
6. **El error dice su causa**, y las causas del panel van separadas de las de
   Shalom: mandar a revisar la factura cuando lo que venció fue tu sesión es lo
   que hace perder una tarde.
7. **Reintentos con espera creciente y jitter**, y timeout en toda llamada.
8. **Idempotencia en lo que cuesta dinero.** Registrar un envío dos veces se
   paga dos veces: clave de idempotencia por pedido, verificada en el servidor.
9. **El webhook**: firma sobre el **cuerpo crudo**, comparación en tiempo
   constante, deduplicación con un `create()` atómico.
10. **Medir antes de traducir.** Siempre.

