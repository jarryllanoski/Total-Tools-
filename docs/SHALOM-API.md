# Shalom API — documentación de referencia

> **Por qué existe este archivo.** El contrato de un servicio externo tiene que
> vivir en el repositorio, no en un chat ni en capturas de pantalla. Ya se
> perdió una vez y costó volver a medir cosas que ya estaban medidas.
>
> **Base URL:** `https://api.shalom-api.lat`
> **Autenticación:** cabecera `x-api-key: sk_…` (excepto los `/public/*`)
> **Recogido el:** 2026-09-13
> **Fuentes:** el `SKILL.md` oficial (parte 1) y la documentación web
> `shalom-api.lat/docs`, última actualización 2026-09-08 (parte 2).

---

# PARTE 1 · SKILL.md oficial, literal

> Obtenido de `https://raw.githubusercontent.com/ronnaldrangel/shalom-api-skill/main/SKILL.md`
> (el dominio `shalom-api.lat` está bloqueado por el proxy de red del entorno).
> Es el archivo que ellos publican para agentes de IA — 24 endpoints con sus
> respuestas reales y reglas anti-alucinación.

## Autenticación y Validación

Toda solicitud requiere el header `x-api-key: sk_...` (excepto `GET /public/agencies`). Valida antes de operar:

```bash
curl "https://api.shalom-api.lat/validate" -H "x-api-key: TU_API_KEY"
```

**Respuesta:** `{ "valid": true, "limit": 1000, "currentUsage": 137, "remaining": 863 }`

Rate limit: 1000 peticiones/minuto. Al superarlo: `429` con datos de uso.

## Endpoints Esenciales

### Rastreo de Envíos

**`POST /track`** — Rastrea una guía individual
- Parámetros: `orderNumber` (8 dígitos), `orderCode` (4 caracteres)
- Respuesta: objeto con `search` y `statuses[]`

**`POST /track/batch`** — Rastrea hasta 50 guías
- Parámetro: `orders[]` (máximo 50)
- Respuesta: array de resultados

**`GET /track/voucher`** — Descarga comprobante
- Parámetros: `orderNumber`, `orderCode`, `format` (image|pdf)
- Respuesta: binario (PNG o PDF)

**`GET /track/label`** — Descarga etiqueta de envío
- Parámetros: `orderNumber`, `orderCode`
- Respuesta: PDF binario

### Agencias y Cobertura

**`GET /agencies`** — Listado completo (requiere key)
- Parámetro: `q` (filtro por texto)
- Retorna: 552 agencias con coordenadas, teléfono, horarios

**`GET /agencies/search`** — Búsqueda avanzada (requiere key)
- Filtros: `departamento`, `provincia`, `aereo`, `near` (lat,lng), `radius_km`, `per_page`
- Retorna: agencias ordenadas por cercanía con `distancia_km`

**`GET /public/agencies`** — Listado público (sin key)
- No consume cuota; misma estructura que `/agencies`

**`GET /public/agencies/search`** — Búsqueda pública (sin key)
- Mismos filtros que `/agencies/search`

### Ubicaciones (UBIGEOS)

**`GET /locations/departments`** — Todos los departamentos
**`GET /locations/departments/{depId}/provinces`** — Provincias por departamento
**`GET /locations/departments/{depId}/provinces/{provId}/districts`** — Distritos

### Instancias (Shalom Pro)

**`POST /instances`** — Crea instancia
- Parámetro: `name` (descriptivo)
- Retorna: `instanceId` (UUID)

**`GET /instances`** — Lista instancias del usuario
**`DELETE /instances`** — Elimina instancia
**`POST /instances/status`** — Verifica login (requiere `instanceId`)
**`POST /instances/login`** — Autentica en pro.shalom.pe
- Resuelve reCAPTCHA v3 automáticamente
- Parámetros: `instanceId`, `username`, `password`

**`POST /instances/logout`** — Cierra sesión y limpia credenciales

### Crear Envíos (Shalom Pro)

**`POST /account/register`** — Registra envío individual
- Campos requeridos: `instanceId`, `origen` (int), `destino` (int/string con "0" para aéreo), `documento`, `name`, `firstname`, `lastname`, `phone`
- Opcional: `content`, `cantidad`, `clave`, `declaracion_jurada`, `costo`

**`POST /account/register-bulk`** — Registra envíos masivos
- Parámetros: `instanceId`, `shipments[]`, `securityCode`
- Cada envío requiere: `recipientDoc`, `recipientPhone`, `origin`, `destination`, `content`

**`POST /account/pending-shipments`** — Obtiene envíos pendientes
**`POST /account/get-user`** — Datos del usuario autenticado

### Cotización y Consultas

**`POST /account/quote`** — Calcula tarifa
- Parámetros: `origin` (int/string), `destination` (int/string)
- Respuesta: cacheada ~5 minutos

**`GET /account/dni/{dni}`** — Consulta RENIEC
- Parámetro: 8 dígitos
- Retorna: espejo de datos registrales

## Webhooks de Tracking

### Registro y Configuración

**`PUT /webhooks`** — Registra URL y genera secreto
```json
{ "url": "https://tu-servidor.com/webhooks/shalom" }
```
- Respuesta: `whsec_...` (secreto completo, mostrado solo aquí)

**`GET /webhooks`** — Obtiene configuración (secreto enmascarado)
**`DELETE /webhooks`** — Elimina webhook

### Suscripciones y Notificaciones

**`POST /tracking/subscriptions`** — Suscribe a cambios de estado
- Parámetros: `orderNumber`, `orderCode`
- Retorna: `subscription` con ID y estado

**`GET /tracking/subscriptions`** — Lista suscripciones activas
**`DELETE /tracking/subscriptions`** — Cancela suscripción
- Parámetros (querystring): `orderNumber`, `orderCode`

### Firma de Webhooks

Webhooks llegan con header:
```
X-Shalom-Signature: t=<unix>,v1=<hex>
```

Construcción: `v1 = HMAC-SHA256("<t>.<rawBody>", whsec_...)`

Verificación (Node.js):
```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';
const [t, v1] = header.split(',');
const expected = createHmac('sha256', secret)
  .update(`${t.replace('t=', '')}.${rawBody}`)
  .digest('hex');
timingSafeEqual(Buffer.from(v1.replace('v1=', '')),
                Buffer.from(expected));
```

## Códigos de Error

| Código | Significado |
|--------|-------------|
| 400 | Petición malformada |
| 401 | API key ausente/inválida |
| 403 | Plan expirado/sin permisos |
| 404 | Recurso inexistente |
| 429 | Rate limit o cuota agotada |
| 500 | Error interno |

## Reglas Anti-Alucinación

- Usa **solo** endpoints documentados en https://shalom-api.lat/docs
- `orderNumber`: exactamente 8 dígitos
- `orderCode`: exactamente 4 caracteres
- `near`: formato `lat,lng` con signo (ej. -12.046,-77.043)
- Batch máximo: 50 guías por solicitud
- Cachea agencias hasta 24 h (se actualizan diariamente)
- Para tracking continuo: **webhooks**, no polling
- Operaciones *(Shalom Pro)*: requieren `instanceId` + credenciales
- Ante `429`: backoff exponencial + consulta `GET /validate`

## Recursos

- Documentación: https://shalom-api.lat/docs
- Integraciones: n8n · WooCommerce · Shopify
- Directorio: https://shalom-api.lat/agencias
- Para LLMs: https://shalom-api.lat/llms.txt

---

# PARTE 2 · Detalles que el SKILL.md NO trae

> Recogidos de la documentación web (`shalom-api.lat/docs`), sección por
> sección. El SKILL.md es un resumen; estos detalles son los que deciden si el
> código funciona o no.

## Cuenta y plan (a 2026-09-13)

| | |
|---|---|
| Plan | **Pro** — S/59/mes, activo hasta 29/9/2026 |
| Consultas | **Ilimitadas** (`limit` y `remaining` llegan `null`) |
| Instancias | **1 máxima** — ya usada |
| Incluye | Agencias en tiempo real · Tracking · Crear pedidos y detalles |

⚠️ **`limit` y `remaining` pueden ser `null` con plan ilimitado.** El código
debe tratar `null` como "sin límite", nunca como cero.

## `POST /track`

- `orderNumber`: string, 8 dígitos, patrón `^[0-9]+$`
- `orderCode`: string, 4 caracteres
- ⚠️ **Las respuestas se cachean unos minutos** para no golpear el sistema
  origen. Es la explicación más probable de los desfases que vimos contra la
  web de Shalom.
- Errores: **400** (formato) · **404** (guía inexistente **o aún no registrada
  en Shalom** — en una guía recién creada puede ser normal, no un error tuyo)

### Forma REAL medida el 2026-08-31 (no la que pinta la doc)

```
{ search:   { success, message, data: {…detalles del envío…} },
  statuses: { success, message, data: { registrado, origen, transito,
              destino, entregado, reparto, demora } } }
```

⚠️ El envoltorio se llama **`statuses`** (inglés), y en la respuesta real es un
**objeto**, aunque la documentación lo pinta como array `[ { … } ]`.

Cada clave del árbol es `null` mientras no ocurre, y un objeto con `fecha` (a
veces `completo`, `cargueros`) cuando ocurre.

| Clave | Barra | Nota |
|---|:--:|---|
| `registrado` | 0 | antes de entrar a la agencia |
| `origen` | 0 | |
| `transito` | 1 | trae `cargueros` |
| `destino` | 2 | |
| `reparto` | 2 | reparto a domicilio |
| `entregado` | 3 | |
| `demora` | — | **no es un paso**: es una condición que se superpone |

`search.data` trae además: `entregado` (booleano), `monto`, `estado_pago`,
`tipo_pago`, `contenido`, `direccion_entrega`, `aereo`, `fecha_emision`,
`comprobante`, `remitente`, `destinatario`, y **`origen.id` / `destino.id`, que
son los `ter_id`** de las agencias.

## `POST /track/batch`

- **Máximo 50** por petición · "control de flujo y concurrencia"
- ⚠️ **La respuesta empareja POR POSICIÓN**: cada elemento del array
  corresponde a la orden enviada en el mismo orden.

  **Riesgo sin medir:** si una guía falla, ¿ocupa su casilla o el array viene
  más corto? Si viene más corto, todo lo que va detrás se desplaza y se
  escribiría el estado de un pedido en otro. **Medir antes de usar**: un lote
  con guía buena, guía inventada y guía buena. Si el emparejamiento posicional
  no es fiable, cruzar por el `orderNumber` que devuelve cada `search`.

## `GET /track/voucher` — comprobante

`?orderNumber=…&orderCode=…&format=image|pdf` → binario (`image/png` por defecto)

⚠️ El ejemplo JavaScript de su documentación **está mal**: hace `res.json()`
sobre una respuesta binaria. Va con `res.blob()` o `arrayBuffer()`.

## `GET /track/label` — etiqueta / rótulo *(Shalom Pro)*

**El SKILL.md se queda corto aquí.** La documentación web dice:

- `instanceId` **obligatorio** — el rótulo se genera con la sesión del usuario
- `ose_id` **recomendado** — *funciona también con guías pendientes*
- `orderNumber` + `orderCode` como alternativa a `ose_id`
- Devuelve `application/pdf`
- Internamente pide un token temporal (`POST /rotulo/token`) y descarga una URL
  firmada con la sesión de la instancia

Distinto de `/track/voucher`: **voucher = comprobante, label = rótulo para
pegar en el paquete.**

## `GET /agencies`

- `{success, message, total: 552, query, data:[…]}` · **48 campos por agencia**
- `ter_id`, `ter_abrebiatura`, `zona`, `ter_zona`, `provincia`, `departamento`,
  `latitud`, `longitud` (**como texto, no número**), `direccion`, `telefono`,
  `hora_atencion`, `hora_domingo`, `estadoAgencia`, `nombre`, `lugar_over`,
  `ter_aereo`, `dep_id`, `prov_id`, `dist_id`, `ubi_id`…
- Se actualiza **a diario**; omite rutas aéreas de origen/destino

## `GET /agencies/search`

`q` · `departamento` · `provincia` · `aereo` (true|false) · `near` (`lat,lng`)
· `radius_km` · `per_page` (1–500, default 100)

→ `{success, total, returned, data:[…]}` — **solo 8 campos**, no los 48.
`distancia_km` aparece **solo** si se usa `near`. `total` = antes del límite,
`returned` = devueltos.

**Para el catálogo offline usar `/agencies`; para buscar en vivo,
`/agencies/search`.**

Errores: **400** (`near` mal formado o `per_page` fuera de 1–500) ·
**429** (rate limit — *"espera y reintenta con backoff"*)

## `GET /public/agencies` y `/public/agencies/search`

Sin API key, sin consumir cuota, misma estructura.

⚠️ Ellos los llaman *"para la landing de demostración"*. Un endpoint de demo se
puede limitar o quitar sin avisar. **No apoyar el formulario del cliente en
ellos**; el catálogo offline en `data/` no depende de que nadie esté vivo.

## Ubicaciones (ubigeos)

```
/locations/departments                          → 15 = LIMA
/locations/departments/15/provinces             →  1 = LIMA
/locations/departments/15/provinces/1/districts →  2 = ANCON, ubi_id 150102
```

→ `{items:[{id, name, ubi_id}]}` · **404** si el departamento o provincia no existe.

Dos numeraciones que no hay que confundir: **`id`** es el correlativo interno
de Shalom (el que se manda al crear un envío) y **`ubi_id`** es el ubigeo real
de 6 dígitos. Coinciden con los `dep_id`/`prov_id`/`dist_id` de cada agencia.

## Instancias

Una instancia es **una cuenta Shalom Pro conectada**. La plataforma mantiene la
sesión con **navegador headless + cookies** y hace **auto-login cuando expira,
si guardaste credenciales**.

| Endpoint | Devuelve |
|---|---|
| `GET /instances` | todas: `id, name, username, createdAt, isLoggedIn` |
| `POST /instances/status` | una: `isLoggedIn, username, **url**` |

Lo único que aporta el POST es la **`url`** — dónde quedó parado el robot
(`…/login` = se deslogueó). Ninguno consume cuota.

Errores: **403** (límite de instancias alcanzado) ·
**401** (*"la sesión expiró **sin credenciales guardadas** para auto-login"*)

⚠️ **Ese 401 es el fallo más repetido de esta API.** Guardar las credenciales
en la instancia es lo que hace que la sesión se recupere sola.

## Crear envíos

### `POST /account/register` (individual)

`instanceId` · `origen` (**ter_id**) · `destino` (ter_id, o `"052"` con prefijo
0 = aéreo) · `documento` · `name` · `firstname` · `lastname` · `phone`
Opcionales: `content` · `cantidad` · `clave` (**clave de recojo**) ·
`declaracion_jurada` (`''` | `Artículos de uso personal` | `Documentos` |
`Ropa` | `Electrodomésticos`) · `aereo` (0|1) · `costo`

`tipo_pago` se fija a REMITENTE por defecto; remitente/remitente_id salen del perfil.

`content` acepta `"PAQUETE XS"` y **automatiza tipo y costo** — encaja con el
catálogo de cajas de `shalom.js:clasificarPaquete`.

### `POST /account/register-bulk` (masivo) — **el recomendado**

`instanceId` · `shipments[]` · `securityCode` (4 dígitos)
Por envío, **obligatorio**: `recipientDoc` · `recipientPhone` · `origin` ·
`destination` · `content`
Opcional: `contactDoc` · `contactPhone` · `grr` · `height` · `width` ·
`length` · `weight` · `quantity`

**Por qué es mejor que el individual, incluso para un solo envío:**

1. **No pide el nombre del destinatario, solo el DNI** → RENIEC lo resuelve. Se
   evita partir `"RONALD EDGAR RANGEL ANTON"` en tres campos, que es adivinar.
2. **Acepta las medidas del paquete** (`height`, `width`, `length`, `weight`) —
   los cuatro campos que el panel ya captura.
3. `origin`/`destination` son **nombres de ciudad** (`"LIMA"`, `"PIURA"`), con
   auto-resolución de agencias.

`content` es **enum de productos permitidos por Shalom (solo mayúsculas)**.

### ⚠️ NO HAY CLAVE DE IDEMPOTENCIA

Ningún campo evita registrar dos veces. **Registrar dos veces se paga dos
veces**, y en un lote de 20 son 40 envíos.

**La defensa es `POST /account/pending-shipments`:** ante un fallo de red, en
vez de reintentar a ciegas se **consulta** si el envío ya se creó.

```
register-bulk → pending-shipments (confirmar) → track/label (rótulo PDF)
```

### `POST /account/get-user`

`{instanceId}` → perfil de la cuenta · **cacheado 24 h en Redis por instancia**.
De aquí salen `remitente` y `remitente_id`.

Errores de la sección: **400** (falta campo requerido, o `destination` sin
prefijo `0` para aéreo) · **401** (sesión expirada sin credenciales guardadas)

## Cotizar y DNI

`POST /account/quote` — `{origin, destination}` (**ter_id**) → tarifa ·
cacheado ~5 min · **no requiere `instanceId`** (funciona con la sesión caída)

`GET /account/dni/{dni}` — espejo RENIEC · los campos vienen de
**Olva Courier → RENIEC** · **400** (no son 8 dígitos) · **404** (no encontrado)

### ⚠️ Tres convenciones distintas para origen/destino

| Endpoint | Campos | Significado |
|---|---|---|
| `/account/register` | `origen` / `destino` | **ter_id** (número) |
| `/account/register-bulk` | `origin` / `destination` | **nombre de ciudad** ("LIMA") |
| `/account/quote` | `origin` / `destination` | **ter_id** (número) |

Mismos nombres en inglés con significados distintos. Es una trampa que no da
error: mandas un `ter_id` donde esperaban `"LIMA"` y a saber qué pasa. Cada uno
va con su tipo marcado y su prueba.

## Webhooks

### El ciclo completo

```
PUT /webhooks                 → registrar URL, capturar el secreto
POST /tracking/subscriptions  → SUSCRIBIR CADA GUÍA (sin esto no llega nada)
   … Shalom avisa al cambiar el estado …
DELETE /tracking/subscriptions → soltar la guía al entregarse
```

⚠️ **Registrar la URL no basta: hay que suscribir cada guía.** Es la razón por
la que antes no llegaba ningún evento útil.

`POST /tracking/subscriptions` → `{success, subscription:{id, orderNumber,
orderCode, lastStatus: null, active: true, createdAt}}`

`lastStatus` lo mantienen **ellos**, así que el aviso llega solo cuando de
verdad cambia. `DELETE` lleva los parámetros **en la querystring**, no en el
body (el POST sí usa body).

`PUT /webhooks` → `{success, message, webhook:{url, secret:"whsec_…", enabled}}`
⚠️ **El secreto solo se devuelve completo en esa respuesta**; el `GET` lo
enmascara (`secretPreview`). Al regenerarlo hay que capturarlo en el momento y
meterlo directo en Secret Manager.

Errores: **400** (URL inválida o guía mal formada) · **401** (falta autenticación)

### ⚠️ El webhook habla OTRO vocabulario

```
/track                    →  "En tránsito"   (español, texto para el cliente)
/tracking/subscriptions   →  "IN_TRANSIT"    (inglés, mayúsculas, código)
```

Dos idiomas para el mismo estado. Si se traduce uno y no el otro, dos fuentes
escriben textos distintos para el mismo paquete y la guarda de no-retroceso
compara cosas que no son comparables.

**Un solo normalizador para los dos.** El mapa completo de códigos
(`IN_TRANSIT` y cuáles más) no está documentado: hay que medirlo con un evento
real.

## Errores y límites (global)

Forma: `{"error":"mensaje", "details":"opcional", "message":"opcional"}` + el
código HTTP correcto. **Rate limit: 1000 peticiones por minuto.**

| | |
|---|---|
| **400** | Petición malformada: falta un campo, `orderNumber` no tiene 8 dígitos… |
| **401** | Sin autenticación o API key inválida |
| **403** | Sin permisos: plan expirado o funcionalidad no incluida en tu plan |
| **404** | Guía inexistente, DNI desconocido, ruta mal escrita |
| **429** | Rate limit o cuota agotada · cuerpo `{limit, currentUsage, remaining:0}` |
| **500** | Error interno **o del sistema origen** · reintenta con backoff exponencial |

Ese 500 *"o del sistema origen"* importa: a veces el que falla es **Shalom**, no
ellos. El aviso al operador tiene que distinguirlo.

---

# PARTE 3 · Contradicciones detectadas

Cosas donde la documentación se contradice a sí misma o con lo medido. Se
resuelven midiendo, nunca eligiendo la que más guste.

| # | Dónde | Contradicción |
|---|---|---|
| 1 | `/track` | La doc pinta `statuses` como **array**; lo medido es un **objeto** |
| 2 | `/track/label` | El SKILL.md solo pide `orderNumber`+`orderCode`; la web exige **`instanceId`** |
| 3 | `DELETE /instances` | El texto dice *"requiere API key de instancia"*; los 4 ejemplos usan la normal |
| 4 | `/public/*` | Dice que no requieren key, pero todos los ejemplos la mandan |
| 5 | `/validate` | El ejemplo muestra `limit: 1000`; con plan ilimitado llegan `null` |
| 6 | Errores de "Crear envíos" | El 400 mezcla nombres en español (`origen`) con `destination` en inglés |

---

# PARTE 4 · Endpoints que NO entran en la lista blanca del panel

Cinco endpoints de mantenimiento que se usan una vez cada muchos meses y que,
por error o por un clic mal puesto, dejarían el sistema roto en silencio. Se
ejecutan desde el panel de Shalom API, a mano, sabiendo lo que se hace.

| Endpoint | Qué rompe |
|---|---|
| `DELETE /instances` | Borra la instancia y su sesión persistida (tienes **una**) |
| `POST /instances/logout` | Borra la sesión **y las credenciales guardadas** → se acaba el auto-login |
| `POST /instances/login` | Obligaría a que tus credenciales de Shalom Pro pasen por tu sistema |
| `DELETE /webhooks` | Deja el panel ciego **sin que salte ningún error** |
| `DELETE /tracking/subscriptions` | *(masivo)* dejaría de avisar de guías vivas |

El panel solo **lee** el estado y avisa cuando algo hace falta.
