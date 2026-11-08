# Plan maestro — Total Tools en Cloudflare

> **Qué es este documento.** El plan completo para pasar Total Tools de
> Firebase a Cloudflare con una arquitectura ordenada, probada y documentada.
> Dice **qué haces tú a mano**, **qué hace Claude**, en qué orden y cómo se
> sabe que cada paso está bien. Complementa `docs/MODELO-DATOS.md` (la base
> de datos) y reemplaza el plan suelto de migración que se habló en el chat.
>
> Escrito el 8/11/2026.

---

## 0. Las tres reglas que deciden todo lo demás

1. **Nunca todo de golpe.** Los proyectos grandes no fracasan por mala
   tecnología: fracasan por reescribir todo a la vez y no poder volver atrás.
   Cada fase deja el negocio funcionando y se puede revertir.
2. **Primero el backend y los datos, después la pantalla.** El panel actual
   funciona. Se le cambia *de dónde lee*, no *cómo se ve*. Rediseñar la
   interfaz es otro proyecto, después.
3. **Nada está listo sin evidencia.** Prueba automática en verde + vista
   previa revisada. "Ya debería funcionar" no cuenta.

---

## 1. Arquitectura

### 1.1 Las piezas

```
                    ┌─────────────── Cloudflare ────────────────────────────┐
 Cliente  ──────▶   │  Turnstile ─▶  Worker "api"  (Hono + Zod)             │
 (formulario)       │                   │                                   │
                    │                   ├──▶ D1        base de datos (SQL)  │
 Dueño    ──────▶   │  Access    ─▶     ├──▶ R2        fotos y documentos   │
 (panel)            │  (Google)         ├──▶ KV        caché de lecturas    │
                    │                   ├──▶ Queues    trabajo en segundo   │
                    │                   │              plano (Shalom, fotos)│
                    │  Static Assets    └──▶ Cron      cada 30 min          │
                    │  (index.html, formulario.html, .js)                   │
                    └───────────────────────────────────────────────────────┘
 PC de la tienda: shalom-local  ──▶  POST /api/interno/rastreo (con clave)
```

| Pieza | Para qué | Por qué esta y no otra |
|---|---|---|
| **Workers + Static Assets** | sirve las páginas **y** la API en el mismo dominio | sin CORS, un solo despliegue, vista previa por cada cambio |
| **Hono** | rutas HTTP del Worker | pequeño, rápido, hecho para Workers, tipado |
| **Zod** | valida TODO lo que entra | un dato malo se rechaza en la puerta, no en la etiqueta impresa |
| **D1 (SQLite)** | pedidos, personas, envíos | SQL real: índices, transacciones, consultas de reportes |
| **Drizzle ORM** | hablar con D1 con tipos + migraciones versionadas | el esquema vive en el código y cada cambio es un archivo revisable |
| **R2** | fotos (guía, ticket, embalado) | sin costo de salida; las fotos no inflan la base |
| **KV** | caché de lo que se lee mucho y cambia poco (agencias, config) | lectura en ~ms desde cualquier parte |
| **Queues** | rastreo Shalom, procesar fotos | si algo falla se reintenta solo, sin trabar al usuario |
| **Cron Triggers** | barrido cada 30 min | reemplaza `onSchedule` |
| **Access** | login del panel con Google, lista de correos | Cloudflare hace el login; el Worker solo verifica |
| **Turnstile** | anti-bots del formulario público | reemplaza App Check, gratis |
| **Rate Limiting** | frena abusos del formulario | reemplaza los frenos a mano de `formApi` |

### 1.2 Cómo se ordena el código (capas)

```
total-tools/
├── apps/
│   ├── api/                    Worker
│   │   ├── src/
│   │   │   ├── rutas/          HTTP: recibe, valida con Zod, responde. NADA de lógica.
│   │   │   ├── servicios/      casos de uso: "crear pedido", "registrar en Shalom"
│   │   │   ├── repos/          ÚNICO lugar que habla con D1/R2/KV
│   │   │   ├── db/schema.ts    esquema Drizzle (= docs/MODELO-DATOS.md)
│   │   │   └── index.ts        arma todo + cron + colas
│   │   ├── migraciones/        0001_inicial.sql, 0002_…  (nunca se editan, solo se agregan)
│   │   └── wrangler.jsonc
│   └── web/                    el panel y el formulario actuales
├── packages/
│   └── dominio/                reglas PURAS de negocio, sin base ni red:
│                               dni, cliente que vuelve, agencias, estados, montos
│                               → las usan el Worker Y el navegador (una sola verdad)
├── herramientas/migracion/     scripts Firebase → Cloudflare (sección 4)
├── shalom-local/               lector en la PC de la tienda
├── docs/                       arquitectura, decisiones, invariantes
│   └── decisiones/             ADR: 0001-por-que-d1.md, 0002-…
├── CLAUDE.md                   reglas de trabajo para Claude
└── .github/                    CI, plantilla de pedido y de PR
```

**La regla de las capas:** cada una solo llama a la de abajo.
`rutas → servicios → repos → D1`, y todas pueden usar `dominio`. Así:

- una regla de negocio se prueba **sin base de datos** (milisegundos);
- cambiar D1 por otra base algún día toca **solo** `repos/`;
- un error tiene una sola capa donde buscarlo.

Todo en **TypeScript estricto**. El navegador sigue recibiendo JavaScript
normal (Vite lo compila), pero un campo mal escrito falla al compilar, no en
la tienda.

### 1.3 Velocidad: lecturas y escrituras

| Hoy | Después |
|---|---|
| El panel **descarga todos los pedidos** (1 675 y creciendo) y filtra en el navegador | El servidor devuelve **solo lo que se ve**: pedidos activos + página de 50. Los finalizados se buscan, no se descargan |
| Buscar recorre todo en el navegador | Índices por DNI, teléfono, guía, estado+fecha; búsqueda por nombre con **FTS5** (búsqueda de texto de SQLite) |
| Paginación inexistente | **Paginación por cursor** (`WHERE creado < ? ORDER BY creado DESC LIMIT 50`): igual de rápida en la página 1 que en la 10 000 |
| Cada cambio reescribe el documento entero | Se actualizan **solo las columnas** que cambiaron, en una transacción (`batch`) |
| Dos equipos se pisan | Columna `version`: `UPDATE … WHERE id=? AND version=?`; si no actualizó nada, "cambió mientras editabas" |
| Lecturas repetidas de agencias/config | **KV** con caducidad + `ETag`: si no cambió, responde 304 sin cuerpo |
| Lecturas desde lejos | **D1 read replication** (réplicas de lectura) cuando el volumen lo pida |
| Fotos de 3–5 MB | Se comprimen en el teléfono (ya lo hace `fotos.js`) y se sirven desde R2 con caché larga |

**Lo que se mide antes de optimizar:** cada respuesta registra su tiempo y
cuántas filas leyó D1 (`meta.rows_read`). Se optimiza lo que el registro dice
que es lento, no lo que parece.

### 1.4 ¿Aguanta millones?

Sí, con números honestos:

- Un pedido completo (persona + envío + 3 eventos + 3 fichas de foto) ocupa
  ~3 KB en D1. **Un millón de pedidos ≈ 3 GB**; D1 permite 10 GB por base.
- Las fotos no cuentan: van a R2, que no tiene límite práctico.
- Con índices, buscar un DNI entre millones es igual de rápido que entre mil.
- Si algún día se acerca al límite: una base por año para lo **archivado**
  (los finalizados de hace 2+ años), que se consulta aparte. Está previsto
  en el diseño (los ULID ya traen la fecha), no hay que rehacer nada.

### 1.5 Tres entornos, nunca mezclados

| Entorno | Base | Para qué |
|---|---|---|
| **local** | D1 local (archivo en tu PC) | programar y probar sin internet |
| **preview** | D1 `total-tools-preview` con datos de prueba | cada cambio tiene su URL para revisarla |
| **producción** | D1 `total-tools-prod` | tus clientes |

Los datos reales **nunca** van a local ni a preview.

---

## 2. Calidad: cómo se trabaja

### 2.1 Pruebas (de más rápidas a más lentas)

| Nivel | Herramienta | Qué cuida | Cuándo corre |
|---|---|---|---|
| Unitarias | Vitest | reglas de `dominio/` (DNI, cliente que vuelve, estados) | cada guardado |
| Integración | `@cloudflare/vitest-pool-workers` | el Worker real contra D1 real local: rutas, permisos, transacciones | cada commit |
| De punta a punta | Playwright | en la URL de vista previa: crear pedido, foto, etiqueta, seguimiento | cada PR |
| Las de hoy | `node tests/correr.js` | los invariantes ya ganados | hasta que estén portadas una por una |

**Regla:** un arreglo empieza con una prueba que **falla** mostrando el error;
después se arregla; después la misma prueba pasa. Sin eso, no se acepta.

### 2.2 Candados automáticos

- **CI** (GitHub Actions): tipos, lint (Biome), todas las pruebas.
- **Protección de `main`**: nada entra sin CI verde. Ni siquiera de Claude.
- **Vista previa** por cada PR (Workers Builds).
- **Migraciones de base**: se prueban en preview antes de producción; nunca
  se edita una ya aplicada.

### 2.3 Documentación que se mantiene sola

- `CLAUDE.md`: reglas de trabajo (abajo).
- `docs/decisiones/NNNN-*.md`: cada decisión grande con *qué, por qué, qué se
  descartó*. Dentro de un año sabrás por qué es así.
- Contrato de la API generado desde los esquemas Zod (OpenAPI): la
  documentación de la API no puede quedar desactualizada porque **es** el código.
- Cada PR dice qué cambió, cómo se probó y qué no se hizo.

### 2.4 Reglas para Claude (`CLAUDE.md`)

- **Antes de programar, revisar el pedido:** ¿contradice `INVARIANTES.md`?
  ¿abre un hueco de seguridad? ¿es posible? Si no → **decirlo, explicar por
  qué y proponer alternativa**. No hacerlo a medias.
- Si el pedido es ambiguo, **una pregunta concreta**, no adivinar.
- Prueba que falla primero en todo arreglo.
- "Listo" = pruebas verdes + CI verde + vista previa. Si algo falla, mostrar
  el error.
- Prohibido: desactivar pruebas, subir datos de clientes, tocar producción
  sin permiso explícito.
- Español simple; decir siempre lo que **no** se hizo.

### 2.5 Cómo pides tú (plantilla de issue)

```
Qué quiero:              …
Por qué:                 …
Cómo sé que está bien:   …
```

---

## 3. Quién hace qué

### 3.1 Lo que haces TÚ (no se puede delegar: son tus cuentas y tu dinero)

| # | Tarea | Dónde | Tiempo |
|---|---|---|---|
| T1 | Crear una **Organización** gratis en GitHub (ej. `totaltools-pe`) y un repo **privado** vacío | github.com → *New organization* | 10 min |
| T2 | Instalar la app de Claude en esa organización y agregar el repo a Claude | github.com/apps/claude | 5 min |
| T3 | Cuenta de **Cloudflare** con verificación en 2 pasos | dash.cloudflare.com | 10 min |
| T4 | Comprar o pasar tu **dominio** a Cloudflare (ej. `totaltools.pe`) | Cloudflare → Domains | 15 min + espera DNS |
| T5 | Plan **Workers Paid** (5 USD/mes): más CPU para PDFs, Queues, más límites | Cloudflare → Workers → Plans | 2 min |
| T6 | Conectar el repo a **Workers Builds** (despliegue automático) | Cloudflare → Workers → Create → Import repository | 10 min |
| T7 | **Zero Trust / Access**: login con Google, política con tus 2 correos | Cloudflare → Zero Trust | 20 min |
| T8 | Generar la **clave de servicio de Firebase** para el export y dejarla **solo en tu PC** | Firebase → Configuración → Cuentas de servicio | 5 min |
| T9 | Llenar `Revision_Clientes.xlsx` (SÍ/NO) | Excel | 30–60 min |
| T10 | Escribir los secretos (clave de Shalom, etc.) cuando se te pida: `wrangler secret put` | tu terminal | 5 min |
| T11 | **Revisar cada vista previa** y aprobar los PR | GitHub | por fase |
| T12 | Elegir el **día de corte** (un día flojo, ej. domingo) | — | — |

> **Claude Desktop está bien.** Úsalo en **modo local** (en tu PC) para todo
> lo que toque la clave de Firebase o `shalom-local`: así la clave nunca sale
> de tu computadora. Para el resto da igual local o nube.

### 3.2 Lo que hace CLAUDE

Todo el código, las pruebas, la documentación, los scripts de migración, la
configuración de Cloudflare como código (`wrangler.jsonc`), el CI, y la
verificación de cada paso. Te pide confirmación antes de cualquier cosa que
toque producción.

---

## 4. Pasar los datos limpios de Firebase a Cloudflare

Scripts en `herramientas/migracion/`, en cuatro pasos separados. Cada uno
deja archivos intermedios que se pueden revisar, y **se puede repetir las
veces que haga falta** (los ensayos no ensucian nada).

```
1. EXTRAER    Firestore + Storage ──▶ crudo/*.jsonl + lista de fotos
2. LIMPIAR    crudo + tus SÍ/NO del Excel ──▶ limpio/*.jsonl + informe.html
3. CARGAR     limpio ──▶ D1 (en lotes) + fotos ──▶ R2
4. VERIFICAR  Firestore vs D1: conteos, sumas, cada foto con su ficha
```

**1. Extraer** (en tu PC, con la clave de T8). Todo `panel/**` a JSON tal
cual, sin interpretar nada. La lista de fotos con su ruta y tamaño. Es la
foto exacta del antes; se guarda como respaldo.

**2. Limpiar.** Las reglas de `docs/MODELO-DATOS.md` §4:
- teléfonos a `+51…`; nombres normalizados para comparar (no para mostrar);
- DNI comodín (`00000000`, `.`) → vacío; RUC → persona empresa;
- `@usuario` → contacto Instagram;
- agrupar personas por DNI válido + aplicar tus SÍ/NO del Excel;
- separar comprador / destinatario / envío / eventos / fotos;
- montos a céntimos; fechas a ISO con hora.
- **Informe**: cuántos pedidos, cuántas personas salieron, qué se corrigió y
  qué quedó dudoso. Si algo dudoso no tiene decisión tuya, **se detiene**.

**3. Cargar.** A D1 en lotes con transacción (si un lote falla, no queda a
medias). Fotos de Firebase Storage a R2 con `rclone` (servidor a servidor, no
pasa por tu PC), con la ruta nueva `pedidos/{pedido}/{envio}/…`, y su ficha en
`archivos`.

**4. Verificar** (si algo no cuadra, **no hay corte**):
- mismo número de pedidos y de envíos;
- misma suma de montos y costos;
- cada foto de Firebase tiene su archivo en R2 con el mismo tamaño;
- 50 pedidos al azar comparados campo por campo;
- los links viejos (`id_…`) abren el pedido correcto.

**El día del corte** (~2 horas, día flojo):
1. Panel en "solo lectura" en Firebase (aviso en pantalla).
2. Extraer → limpiar → cargar → verificar **por última vez** (ya ensayado).
3. Cambiar el dominio al Worker nuevo.
4. Probar a mano: crear pedido, foto, etiqueta, seguimiento.
5. Firebase queda **intacto y apagado** 30 días. **Volver atrás = apuntar el
   dominio de nuevo a Firebase** (5 minutos).

---

## 5. Fases y orden

| Fase | Qué | Tú | Claude | Listo cuando |
|---|---|---|---|---|
| **0. Limpiar la casa** | Anonimizar datos de clientes en `tests/`; repo nuevo **sin el historial viejo** | T1, T2 | limpieza + `CLAUDE.md` + plantillas | ningún dato real en el repo |
| **1. Cimientos** | Estructura de carpetas, TypeScript, CI, Worker vacío con `/api/salud`, 3 entornos | T3, T5, T6 | todo | la URL de preview responde y CI está verde |
| **2. Dominio** | Pasar las reglas puras (`dniPedido`, `clienteLookup`, `agencias`, estados…) a `packages/dominio` con sus pruebas | — | todo | las pruebas viejas y nuevas dicen lo mismo |
| **3. Base y API** | Esquema D1 + migraciones; rutas de pedidos, personas, envíos, fotos; Access y Turnstile | T7, T10 | todo | pruebas de integración verdes |
| **4. Ensayo de migración** | Scripts extraer/limpiar/cargar/verificar contra **preview** | T8, T9 | todo | verificación 100 % en preview, dos veces seguidas |
| **5. Panel a la API nueva** | Cambiar las llamadas a Firestore por `api.js`, pantalla por pantalla, **sin cambiar el diseño** | T11 | todo | Playwright recorre el panel completo en preview |
| **6. Formulario y Shalom** | Formulario público, seguimiento, `shalomPuerta`, cron, `shalom-local` apuntando al Worker | T10 | todo | un pedido de prueba hace el recorrido completo |
| **7. Corte** | Sección 4 | T4, T12 | ejecuta y verifica | verificación 100 % en producción |
| **8. Retiro** | 30 días estables → apagar Firebase | confirmar | export final de respaldo | — |
| **9. Después** | Mejorar la interfaz pantalla por pantalla, reportes, lo nuevo | pedir | — | — |

Ritmo realista, trabajando en ratos: **6–10 semanas** hasta el corte. Las
fases 1–3 avanzan sin tocar nada de lo que usan tus clientes hoy.

---

## 6. Costos estimados

| | Mensual |
|---|---|
| Workers Paid (incluye D1, KV, Queues generosos) | 5 USD |
| R2 (fotos: ~1 GB/año al ritmo actual) | ~0 USD (10 GB gratis) |
| Access (hasta 50 usuarios), Turnstile | 0 USD |
| Dominio `.pe` | ~4 USD (anual prorrateado) |
| **Total** | **~9 USD/mes** |

---

## 7. Lo que este plan NO hace (a propósito)

- **No rediseña la interfaz** en la migración (fase 9, aparte).
- **No mueve el rastreo por navegador a la nube:** el reCAPTCHA de Shalom
  bloquea servidores (`docs/SHALOM.md`). Sigue en `shalom-local` o por API.
- **No borra Firebase** hasta 30 días después del corte.
