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
| `POST /track` | dormido | forma ya medida, arriba |
| `POST /track/batch` | dormido | — |
| `GET /agencies` | dormido | — |
| `POST /instances/status` | dormido | forma ya medida, arriba |
| alta de envío | dormido | — |

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

### Cómo se mide el siguiente endpoint

Desde el entorno donde se desarrolla **no se puede llamar a `shalom-api.lat`**
(salida a internet restringida). Así que **mide la función desplegada**:

```js
await Shalom.esquema('validate')   // en la consola del panel
```

Devuelve la **forma** de la respuesta —qué campos vienen y de qué tipo— y **ni
un solo valor**. Con eso se escribe el contrato contra lo que la API devuelve
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

