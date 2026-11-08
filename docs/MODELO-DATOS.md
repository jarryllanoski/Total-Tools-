# Modelo de datos ordenado — clientes, pedidos y envíos

> **Qué es este documento.** El diseño de la base de datos nueva (pensada para
> D1/SQLite en Cloudflare, sirve igual para cualquier SQL) y las reglas para
> saber cuándo dos pedidos son **la misma persona**. Las cifras salen del
> export real del 7/11/2026 (1 675 pedidos). Aquí **no** van nombres ni DNI de
> clientes: el repositorio es público.

---

## 1. El problema, medido

Hoy cada pedido es un documento suelto en `panel/…` que **copia** los datos
de la persona. No existe "el cliente": existe el texto que se escribió en cada
pedido. Y para reconocer al que vuelve se busca por teléfono o por DNI.

| Hallazgo | Cantidad | Por qué pasa |
|---|---:|---|
| Teléfonos distintos | 1 376 | — |
| DNI válidos distintos | 1 101 | — |
| Teléfonos con más de un pedido | 191 (490 pedidos) | clientes que vuelven: bien |
| **Un teléfono, personas distintas** | **28** | familia, trabajo, tienda, o **tu propio número** usado para registrar pedidos ajenos |
| **Un DNI, nombres distintos** | **11** | ver abajo |
| ↳ DNI `00000000` | 15 personas | se escribe cuando "no hay DNI" → **une a desconocidos** |
| ↳ empresa + persona con el mismo DNI | 4 | quien **compra/factura** (S.A.C., E.I.R.L.) no es quien **recoge** |
| ↳ usuario de Instagram como nombre | 3 | `@usuario` es el **canal**, no el nombre |
| ↳ DNI mal escrito | 1 | dos personas reales, un dígito equivocado |
| Mismo DNI, varios teléfonos | 8 | normal: una persona cambia de número |
| Mismo DNI, nombre escrito distinto | 29 | "Juan Pérez" / "JUAN PERES QUISPE" (ejemplo inventado) |
| DNI basura (`.`, 7 dígitos) | 9 | sin validar al guardar |
| Sin DNI | 340 | delivery / retiro: no siempre hace falta |

**La raíz:** un solo pedido mezcla **cuatro papeles** que pueden ser personas
distintas, y los guarda en los mismos campos:

1. **Quién compra** (puede ser una empresa con RUC).
2. **Quién recibe o recoge** (la persona del DNI en la agencia).
3. **Con quién se habla** (el teléfono / WhatsApp / Instagram).
4. **A dónde va** (domicilio o agencia).

El código ya aprendió parte de esto a golpes (`functions/dniPedido.js`,
`tests/cliente-recurrente.test.js`: *"el teléfono no es la persona"*). El
modelo nuevo lo hace imposible de olvidar porque cada papel tiene su tabla.

---

## 2. Principios

1. **Una persona, una fila.** El pedido apunta a la persona, no la copia.
2. **Pero el envío guarda una FOTO** (snapshot) de lo que se imprimió:
   nombre, DNI, teléfono y dirección **tal como salieron en la etiqueta**.
   Si mañana corriges a la persona, el historial no se reescribe solo.
3. **El DNI identifica, el teléfono solo localiza.** Un teléfono puede ser de
   varias personas; un DNI válido, de una sola.
4. **Nunca se une a dos personas en silencio.** Si hay duda, se pregunta
   (la misma regla que ya usan instancias y agencias).
5. **Los valores "comodín" no existen.** `00000000`, `.`, `-`, `11111111` se
   guardan como *vacío*, no como dato.
6. **El historial no se borra, se agrega.** Los estados de un envío son
   eventos (`envio_eventos`); el estado actual es el último.
7. **IDs que se pueden generar en cualquier equipo** (ULID: ordenables por
   fecha, sin choques, sin pedirle número al servidor) → funciona sin
   conexión y en varios equipos a la vez.

---

## 3. Las tablas

```
personas ──< documentos            (DNI, RUC, CE, pasaporte)
    │   └──< persona_contactos >── contactos   (teléfono, WhatsApp, Instagram)
    │   └──< direcciones
    │
    └──< pedidos ──< pedido_items
             │   └──< pedido_etiquetas >── etiquetas
             │   └──< comprobantes
             └──< envios ──< envio_eventos
                     │   └──< archivos     (guía, ticket, embalado → R2)
                     └──> agencias
```

### 3.1 Personas e identidad

```sql
CREATE TABLE personas (
  id            TEXT PRIMARY KEY,          -- ULID
  tipo          TEXT NOT NULL DEFAULT 'natural'
                CHECK (tipo IN ('natural','empresa')),
  nombre        TEXT NOT NULL,             -- como se muestra: "Juan Pérez Quispe"
  nombre_norm   TEXT NOT NULL,             -- "JUAN PEREZ QUISPE" (sin tildes, mayúsculas)
  verificado    TEXT,                      -- 'reniec' | 'sunat' | NULL
  fusionada_en  TEXT REFERENCES personas(id), -- si se unió a otra (no se borra)
  creado        TEXT NOT NULL,
  actualizado   TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1 -- control de edición simultánea
);
CREATE INDEX ix_personas_nombre ON personas(nombre_norm);

CREATE TABLE documentos (
  persona_id  TEXT NOT NULL REFERENCES personas(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('DNI','RUC','CE','PASAPORTE')),
  numero      TEXT NOT NULL,
  PRIMARY KEY (tipo, numero),              -- ★ un DNI = una persona, garantizado
  CHECK (tipo <> 'DNI' OR (length(numero) = 8 AND numero NOT GLOB '*[^0-9]*'
                           AND numero NOT IN ('00000000','11111111','12345678'))),
  CHECK (tipo <> 'RUC' OR (length(numero) = 11 AND numero NOT GLOB '*[^0-9]*'))
);
CREATE INDEX ix_documentos_persona ON documentos(persona_id);

CREATE TABLE contactos (
  id     TEXT PRIMARY KEY,
  tipo   TEXT NOT NULL CHECK (tipo IN ('telefono','instagram','email','facebook')),
  valor  TEXT NOT NULL,                    -- teléfono en E.164: +51999888777
  UNIQUE (tipo, valor)
);

-- ★ N a N: un teléfono puede ser de varias personas (familia, tienda)
CREATE TABLE persona_contactos (
  persona_id  TEXT NOT NULL REFERENCES personas(id),
  contacto_id TEXT NOT NULL REFERENCES contactos(id),
  ultimo_uso  TEXT,
  PRIMARY KEY (persona_id, contacto_id)
);
CREATE INDEX ix_pc_contacto ON persona_contactos(contacto_id);

CREATE TABLE direcciones (
  id          TEXT PRIMARY KEY,
  persona_id  TEXT NOT NULL REFERENCES personas(id),
  ubigeo      TEXT,                        -- código INEI del distrito
  departamento TEXT, provincia TEXT, distrito TEXT,
  linea       TEXT NOT NULL,
  referencia  TEXT,
  lat REAL, lng REAL,
  ultimo_uso  TEXT
);
```

> **Por qué `documentos` es una tabla aparte y no una columna `dni`:** una
> empresa tiene RUC, un extranjero CE, y una persona con negocio tiene DNI
> **y** RUC (RUC 10 + DNI). La clave primaria `(tipo, numero)` es la que
> garantiza, en la propia base, que un DNI no pueda quedar en dos personas.

### 3.2 Pedidos

```sql
CREATE TABLE pedidos (
  id            TEXT PRIMARY KEY,          -- ULID (los viejos 'id_…' se conservan en id_legado)
  id_legado     TEXT UNIQUE,               -- 'id_1780000000000', 'xl_…'
  numero        INTEGER UNIQUE,            -- N° corto para hablar con el cliente: 1042
  comprador_id  TEXT REFERENCES personas(id),  -- ★ quién compra / factura
  canal         TEXT,                      -- formulario, whatsapp, instagram, tienda
  fecha         TEXT NOT NULL,             -- fecha del pedido (YYYY-MM-DD)
  estado        TEXT NOT NULL,             -- NUEVO PEDIDO, ALISTADO, ENVIADO…
  monto         INTEGER,                   -- ★ en CÉNTIMOS: 34990 = S/ 349.90
  nota          TEXT,
  nota_privada  TEXT,
  creado        TEXT NOT NULL,             -- fecha y HORA (ISO 8601)
  actualizado   TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX ix_pedidos_estado ON pedidos(estado, fecha);
CREATE INDEX ix_pedidos_comprador ON pedidos(comprador_id);

CREATE TABLE pedido_items (
  pedido_id   TEXT NOT NULL REFERENCES pedidos(id),
  linea       INTEGER NOT NULL,
  sku TEXT, descripcion TEXT NOT NULL,
  cantidad    INTEGER NOT NULL DEFAULT 1,
  precio      INTEGER,                     -- céntimos
  PRIMARY KEY (pedido_id, linea)
);

CREATE TABLE etiquetas (id TEXT PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, color TEXT, borrada INTEGER DEFAULT 0);
CREATE TABLE pedido_etiquetas (
  pedido_id TEXT REFERENCES pedidos(id), etiqueta_id TEXT REFERENCES etiquetas(id),
  PRIMARY KEY (pedido_id, etiqueta_id)
);

CREATE TABLE comprobantes (
  id TEXT PRIMARY KEY, pedido_id TEXT NOT NULL REFERENCES pedidos(id),
  tipo TEXT CHECK (tipo IN ('boleta','factura','nota_venta')),
  serie TEXT, correlativo TEXT, url TEXT, total INTEGER,
  UNIQUE (serie, correlativo)
);
```

### 3.3 Envíos (lo que viaja)

```sql
CREATE TABLE agencias (
  id TEXT PRIMARY KEY, courier TEXT NOT NULL, codigo TEXT,
  nombre TEXT NOT NULL, direccion TEXT, ubigeo TEXT, lat REAL, lng REAL,
  activa INTEGER DEFAULT 1,
  UNIQUE (courier, codigo)
);

CREATE TABLE envios (
  id              TEXT PRIMARY KEY,
  pedido_id       TEXT NOT NULL REFERENCES pedidos(id),   -- un pedido puede ir en 2 paquetes
  courier         TEXT NOT NULL,           -- SHALOM, OLVA COURIER, DELIVERY, RETIRO EN TIENDA…
  modalidad       TEXT NOT NULL CHECK (modalidad IN ('agencia','domicilio','retiro')),
  destinatario_id TEXT REFERENCES personas(id),           -- ★ quién recoge (puede ≠ comprador)
  agencia_id      TEXT REFERENCES agencias(id),
  direccion_id    TEXT REFERENCES direcciones(id),
  -- ★ FOTO de lo que se imprimió. No se recalcula: es lo que lleva el paquete.
  snap_nombre TEXT, snap_doc TEXT, snap_telefono TEXT, snap_destino TEXT,
  guia            TEXT,                    -- N° de guía del courier
  codigo          TEXT,                    -- clave de 4 letras de Shalom
  costo           INTEGER,                 -- céntimos
  estado_courier  TEXT,                    -- último estado leído (caché de envio_eventos)
  impreso         TEXT,                    -- cuándo se imprimió la etiqueta
  creado TEXT NOT NULL, actualizado TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (courier, guia)
);
CREATE INDEX ix_envios_pedido ON envios(pedido_id);

-- Historial: SOLO se agregan filas. "Un envío no desanda el camino" se
-- comprueba al insertar, no al leer.
CREATE TABLE envio_eventos (
  id        TEXT PRIMARY KEY,
  envio_id  TEXT NOT NULL REFERENCES envios(id),
  estado    TEXT NOT NULL,
  fuente    TEXT NOT NULL,                 -- 'panel' | 'shalom-api' | 'shalom-local' | 'webhook'
  detalle   TEXT,                          -- JSON crudo del courier, por si hay que revisar
  ts        TEXT NOT NULL
);
CREATE INDEX ix_eventos_envio ON envio_eventos(envio_id, ts);

-- Fotos y documentos. El archivo vive en R2; aquí solo la ficha.
CREATE TABLE archivos (
  id        TEXT PRIMARY KEY,
  envio_id  TEXT NOT NULL REFERENCES envios(id),
  tipo      TEXT NOT NULL CHECK (tipo IN ('guia','ticket','embalado','comprobante','otro')),
  r2_key    TEXT NOT NULL UNIQUE,          -- pedidos/{pedido_id}/{envio_id}/guia-01J….jpg
  sha256    TEXT,                          -- evita subir la misma foto dos veces
  bytes INTEGER, mime TEXT,
  creado    TEXT NOT NULL,
  borrado   TEXT                           -- se marca, no se borra
);
CREATE INDEX ix_archivos_envio ON archivos(envio_id, tipo);
```

> `chkGuia`, `chkTicket`, `chkEmbalado` desaparecen como campos: **el check
> es que exista la foto** en `archivos`. Un dato menos que se puede
> contradecir.

---

## 4. Reglas para reconocer al cliente que vuelve

Se aplican **igual** en el formulario público, en el panel y en la migración.
Viven en un solo módulo (como hoy `functions/dniPedido.js`) con sus pruebas.

| Entra | Qué se hace |
|---|---|
| DNI válido que **ya existe** y el nombre coincide (≥ 2 palabras en común) | **Misma persona.** Se agrega el teléfono/dirección nuevos a sus contactos. |
| DNI válido que ya existe y el nombre **no** coincide | **No se une.** Se marca *"¿DNI mal escrito?"* y se pregunta. Si RENIEC está disponible (`functions/reniecPublico.js`) decide el nombre oficial. |
| DNI válido nuevo | Persona nueva. |
| DNI comodín o basura (`00000000`, `.`, menos de 8 dígitos) | **Se guarda vacío.** Nunca se usa para buscar. |
| Solo teléfono, 1 persona con ese número | Se **sugiere** ("¿Eres Juan?"), el cliente confirma. |
| Solo teléfono, varias personas | Se muestran todas con su DNI y se elige (ya probado en `tests/cliente-recurrente.test.js`). |
| Solo nombre | **Nunca** se une por nombre. |
| RUC (11 dígitos) o "S.A.C.", "E.I.R.L." en el nombre | Persona **tipo empresa** = **comprador**. El que recoge se pide aparte como **destinatario**. |
| Nombre que empieza con `@` | Va a `contactos` como Instagram, y se pide el nombre real. |
| Tu propio número | Se marca en Config como "número de la tienda" y **no** se usa para reconocer clientes. |

**Unir dos personas** (cuando el dueño confirma que son la misma) no borra
nada: la vieja queda con `fusionada_en = id_nueva` y sus pedidos se
re-apuntan. Se puede deshacer.

---

## 5. Por qué escala

| Tema | Cómo queda |
|---|---|
| Volumen | ~3 400 pedidos/año hoy. D1 aguanta 10 GB por base ≈ millones de pedidos. Las fotos van a R2, no a la base. |
| Búsquedas | Índices por DNI, teléfono, estado+fecha y guía: buscar es O(log n), no recorrer todo como hoy (`S.shipments.filter`). |
| Varios equipos a la vez | Columna `version`: si dos equipos editan el mismo pedido, el segundo recibe "cambió mientras editabas" en vez de pisar al primero. |
| Sin conexión | ULID se genera en el teléfono; el pedido se sube después sin chocar. |
| Historial | `envio_eventos` crece solo hacia adelante; nunca se pierde "por qué está en este estado". |
| Más couriers | `courier` + `agencias` son datos, no código: agregar Marvisur u Olva es insertar filas. |
| Reportes | Al ser SQL, "clientes que compraron 3+ veces", "ventas por departamento" son una consulta, no un script. |
| Dinero | En céntimos enteros: `0.1 + 0.2` nunca da `0.30000000000000004`. |

---

## 6. Cómo se pasan los datos actuales

1. **Export completo** de Firestore (no el Excel: le faltan fotos, checks,
   historial, agencia, monto e ítems).
2. **Limpieza automática:** normalizar teléfonos a `+51…`, nombres sin
   tildes para comparar, DNI comodín → vacío, `@usuario` → contacto.
3. **Agrupar personas** con las reglas de la sección 4.
4. **Lista de dudas para el dueño** en Excel: los teléfonos compartidos, los
   DNI con nombres distintos y los DNI basura. Una columna "¿misma persona?
   SÍ/NO". **Aquí sí sirve Excel**: es para decidir, no para guardar.
5. **Cargar** con esas decisiones. Cada pedido conserva su `id_legado` para
   que los links ya enviados por WhatsApp sigan funcionando.
6. **Fotos:** se copian a R2 con la ruta `pedidos/{pedido}/{envio}/…` y se
   registra cada una en `archivos`.
7. **Comprobar:** mismo número de pedidos, mismas sumas de montos, todas las
   fotos con su ficha. Si algo no cuadra, no se corta.
