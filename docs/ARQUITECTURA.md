# Arquitectura — Total Tools

> **Qué es este documento.** El mapa del código: qué hay en cada archivo, cómo
> se hablan entre ellos, y hacia dónde vamos. Si vuelves a este proyecto dentro
> de seis meses, empieza por aquí.
>
> Estado a 15 de agosto de 2026. Las cifras están **medidas sobre el código**,
> no estimadas.

---

## 1. Qué es la app

Panel de gestión de envíos para un negocio de herramientas en Perú.

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Panel** | `index.html` — el administrador ve y mueve pedidos | GitHub Pages |
| **Formulario** | `formulario.html` — el cliente pide y hace seguimiento | GitHub Pages |
| **Backend** | `functions/` — Cloud Functions (Firebase) | despliegue aparte |
| **Worker** | `shalomweb-tracker/` — navegador real en Cloud Run | despliegue aparte |
| **Datos** | Firestore + Firebase Storage | `total-tools-24ce8` |

**No hay paso de compilación.** Los `.js` se sirven tal cual. Por eso cada
`<script src>` lleva `?v=N`: **si cambias un archivo y no subes su número, tus
clientes siguen con la versión vieja en caché.**

---

## 2. Cómo se comunican los archivos hoy

**Por el objeto `window`.** No hay `import`. Cada archivo cuelga sus funciones
de `window` y los demás las buscan ahí.

```
index.html  publica 170 nombres  ·  usa 58 de otros
config.js   publica 93           ·  tracking.js publica 38
```

Consecuencias que hay que tener presentes al tocar cualquier cosa:

- **El orden de los 19 `<script src>` es un contrato**, y solo está escrito en
  la secuencia de las etiquetas. Mover una línea puede romper la app.
- **Un nombre que falta no da error**, simplemente no pasa nada. Así estuvo
  `window.save` muerto durante meses (ver `DEUDA.md`).
- **Los 240 `onclick=` del HTML** llaman a nombres globales concretos. Renombrar
  una función obliga a barrer el HTML.

> ⚠️ **Regla mientras esto siga así:** si añades una función que otro archivo va
> a usar, cuélgala con `window.miFuncion = miFuncion`. Y si la declaras con
> `const` o `let`, **no llega a `window` sola** — solo las `function` lo hacen.

---

## 3. Inventario — qué hace cada archivo

### Panel (raíz)

| Archivo | Líneas | Qué hace |
|---|---:|---|
| `index.html` | 3 219 | Página + **2 380 líneas de JavaScript**: estado global `S`, capa Firestore, render de tarjetas, estadísticas, QR, voz |
| `config.js` | 1 559 | **Nueve cosas distintas** (ver aviso abajo) |
| `tracking.js` | ~640 | UI de tracking Shalom: tarjeta, edición de guía, historial, avisos "llegó a destino". El rastreo pasa por `shalom.js` (ver docs/SHALOM.md) |
| `shalom.js` | ~65 | Puerta única a Shalom (consultar/ticket/agencias/registrar); hoy desconectada |
| `cotizacion.js` | 785 | Cotizaciones y comprobantes |
| `print.js` | 644 | Etiquetas y listas para imprimir |
| `floatpanel.js` | 570 | Mini paneles flotantes (solo PC) |
| `voz.js` | 496 | Asistente de voz |
| `ayuda.js` | 468 | Ayuda dentro del panel |
| `delivery.js` | 417 | Rutas de motorizado |
| `alertas.js` | 376 | Centro de alertas |
| `loading-screen.js` | 361 | Pantalla de carga del seguimiento del cliente |
| `notify.js` | 353 | Campana de notificaciones |
| `storage.js` | 347 | Subida de documentos a Firebase Storage |
| `dashboard.js` | 344 | Métricas |
| `qrtracking.js` | 291 | Lectura de QR para tracking |
| `auth.js` | 266 | Sesión y renovación de token |
| `agencias-extractor.js` | 261 | Extractor de catálogos de agencias |
| `respaldo.js` | 259 | Respaldo y restauración |
| `ticket.js` | 223 | Ticket de Shalom en PNG |
| `firebase-config.js` | 7 | Claves del proyecto |

> ⚠️ **`config.js` no es configuración.** Dentro conviven: PIN de seguridad,
> papelera, WhatsApp, documentos adjuntos, enlaces y deuda, reconocimiento de
> cliente, Excel/CSV, links compartidos… y **`openForm()` + `saveShipment()`**,
> que son el corazón del negocio. Si buscas dónde se guarda un pedido, está
> aquí. Es el primer archivo que hay que partir.

### Backend (`functions/`)

| Archivo | Qué hace |
|---|---|
| `index.js` | Cloud Functions: `formApi`, `olvaListar`, `agenciasOlva`, `extraerComprobante`. (Las 7 funciones Shalom se retiraron — ver docs/SHALOM.md) |
| `clienteLookup.js` | Reconocer al cliente que vuelve, por teléfono |
| `olvaNormalizar.js` | Traduce la agencia cruda de Olva al formato del catálogo |
| `comprobante.js` | Lectura de comprobantes |

### Datos que no son código

| Archivo | Qué es |
|---|---|
| `data/agencias-shalom.json` | Catálogo de agencias Shalom |
| `data/agencias-olva.json` | 430 agencias Olva (413 con coordenadas, 25 departamentos) |
| `firestore.rules` | Solo entran los correos de la lista de administradores |
| `storage.rules` | Reglas de los archivos subidos |

---

## 4. Dónde viven los datos

```
panel/config                    configuración, etiquetas, couriers, papelera, salud
panel/shipments/items/{id}      un documento por pedido
panel/suppliers/items/{id}      proveedores
panel/tokens/items/{id}         links de cliente
panel/trash/items/{id}          papelera
panel/forms/configs/{id}        fotos del formulario
```

**Las escrituras usan `updateMask`** (`fsPatch` en `index.html`). Eso significa
que un PATCH toca **solo los campos enviados** y respeta el resto del documento.
Es la propiedad que evita que dos dispositivos se pisen mutuamente. **No la
pierdas al refactorizar.**

> Sin `updateMask`, un PATCH de Firestore **reemplaza el documento entero** y
> borra los campos que no mandaste.

---

## 5. A dónde vamos — las cuatro capas

El destino es un **monolito modular**: un solo despliegue, dividido por dentro
en módulos con fronteras declaradas. Regla única: **cada capa solo llama hacia
abajo, nunca hacia arriba.**

```
CAPA 4   index.html · formulario.html          solo estructura visual
   ↓
CAPA 3   pedidos/ ruta/ tracking/ agencias/    lo que hace el negocio
         compartir/ impresion/ avisos/ informes/
   ↓
CAPA 2   datos/                                lo único que habla con Firebase
   ↓
CAPA 1   dominio/                              reglas puras — compartido con functions/
```

**La capa 1 es la que más valor tiene.** Los módulos ES nativos funcionan igual
en el navegador y en Node, así que un solo `dominio/estados.js` lo pueden leer
el panel, el formulario **y las Cloud Functions**. Con eso desaparecen las reglas
duplicadas que hoy pueden desviarse entre sí (ver `INVARIANTES.md` § 5).

### Dónde caería cada cosa

```
dominio/     estados.js  telefono.js  codigo.js  shalom-lectura.js  texto.js
datos/       firestore.js  escritura.js  archivos.js  sesion.js
pedidos/     formulario.js  documentos.js  tarjeta.js  qr-mover.js  papelera.js
tracking/    consulta.js  aplicar.js  pantalla.js
ruta/ agencias/ compartir/ impresion/ avisos/ informes/
```

### La lógica para decidir dónde va algo

Cuatro preguntas **en orden**. La primera que dé "sí" manda:

1. ¿Funciona sin pantalla y sin internet? → `dominio/`
2. ¿Habla con Firebase o Storage? → `datos/`
3. ¿Pertenece a una función concreta del negocio? → esa carpeta
4. ¿Es solo estructura visual? → se queda en el `.html`

**Desempate — la prueba del cambio:** *"si mañana Shalom cambia sus estados,
¿cuántos archivos toco?"* Hoy: **13**. Después: **1**.

---

## 6. Reglas de trabajo

Estas cuatro son las que evitan volver al punto de partida:

1. **Se agrupa por lo que hace, no por lo que es.** Nada de `utils/`,
   `helpers/`, `common/`. Ahí es donde muere la cohesión — es exactamente cómo
   `config.js` llegó a tener nueve responsabilidades. Si algo "no encaja en
   ninguna carpeta", le falta su propia carpeta.

2. **La prueba del nombre.** Si el nombre del archivo no describe *todo* lo que
   hay dentro, hay que partirlo.

3. **Los errores se ven o no se atrapan.** Un `catch` que no avisa ni registra
   queda prohibido. Es el origen de casi toda la deuda de `DEUDA.md`.

4. **Nunca mover y editar en el mismo commit.** Un commit "mover" contiene solo
   cortar y pegar. Si una línea cambia, va en otro commit. Así el diff se
   revisa de un vistazo.

---

## 7. Cómo se verifica que un cambio no rompió nada

Como todo se publica en `window`, **el comportamiento externo del panel es
medible**: es la lista de nombres que hay en `window` con su tipo (unos 509
contando los del propio navegador), más el HTML que se pinta.

El procedimiento que se usó en el paso de `window.save`, y que conviene repetir
en cada movimiento de código:

1. Servir la versión **anterior** (`git archive HEAD`) y la **nueva** a la vez.
2. Abrir las dos y capturar: nombres de `window` con su tipo, número de botones,
   número de pestañas, y el HTML con los `<script>` quitados.
3. La regla: **0 nombres perdidos, 0 tipos cambiados, HTML visible idéntico.**

Un nombre que desaparece es un módulo que dejó de funcionar en silencio.

---

## 8. Documentos relacionados

| Documento | Para qué |
|---|---|
| `INVARIANTES.md` | Las reglas del negocio que no se deben romper sin querer |
| `DEUDA.md` | Los fallos conocidos y su estado |
| `PLAN-SEGURIDAD.md` | Auditoría de seguridad y producción |
| `plan-tracking-atomico.md` | Diseño del escritor atómico de tracking |
