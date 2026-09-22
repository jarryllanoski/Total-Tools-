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
| `seleccion.js` | 159 | Qué pedidos están marcados, **solo en este dispositivo** |
| `errores.js` | 152 | Registro de fallos: qué se rompió y en qué equipo |
| `firebase-config.js` | 7 | Claves del proyecto |

### Nota · Dónde viven los datos (`RAIZ`)

**Todas** las rutas de Firestore salen de una constante, `RAIZ`, en la cabecera
de `index.html`. Ninguna se escribe suelta en medio del código.

No es manía de orden: es la puerta por la que este panel podrá servir a más de
un negocio. El día que haya un segundo, `RAIZ` pasa a valer `negocios/<id>` y no
hay que cazar rutas por cuatro archivos — que es la parte que, **con datos vivos
dentro**, duele de verdad.

**Hoy no se migra nada.** `RAIZ` vale `panel`, y los ~1042 pedidos se quedan
donde están. Mover mil documentos para ganar cero hoy es un riesgo que no se
paga solo.

⚠️ Hay **cuatro** sitios que apuntan a lo mismo y no se enteran entre ellos:

| | |
|---|---|
| `index.html` | `RAIZ` — el panel |
| `functions/index.js` | `CFG_DOC`, `SHIP_COL`, `TOK_COL`, `FORMCFG_COL` |
| `firestore.rules` | `match /panel/{document=**}` |
| `storage.rules` | las rutas de documentos |

Los cuatro cambian juntos, o no cambia ninguno.

### Nota · El diálogo de confirmar (`confirmar()`)

Hay **un solo** diálogo de "¿seguro?" en el panel, y **seis** pantallas lo
usan: borrar pedido, borrar varios, borrar proveedor, vaciar papelera, borrar
link y borrar etiqueta/courier.

Antes, cada una escribía a mano sobre el mismo botón —texto, color, acción y
`disabled`— y tenía que **acordarse de dejarlo limpio para las otras cinco**.
Dos se olvidaron:

| Pantalla | Qué olvidaba |
|---|---|
| Pedido → papelera | al terminar **bien** dejaba el botón en `"Moviendo…"` y **deshabilitado** (solo lo reponía si fallaba) |
| Borrar link · borrar etiqueta | no reponían **ni el texto ni el `disabled`** al abrir |

Resultado: borrabas un pedido y el siguiente borrado de link **nacía muerto**.
Y no fallaba siempre — fallaba según lo que hubieras hecho antes, que es lo
peor que puede hacer un fallo: parece que se arregla solo.

**Ahora nadie toca el botón.** `confirmar({texto|html, textoSi, trabajando,
siFalla, alConfirmar})` lo pone en su sitio al abrir y lo devuelve **siempre**
al terminar, salga bien o mal.

> ⚠️ **La regla, y lo que la sostiene:** `delYes` solo puede aparecer **dos
> veces en todo el proyecto** — el botón en el HTML y la línea que lo toma
> dentro de `confirmar()`. Hay una prueba que se pone roja si alguien le
> escribe encima por su cuenta, y otra que comprueba que las seis pantallas
> siguen pasando por la puerta. Eso es lo que impide que vuelva dentro de seis
> meses.

Y una decisión pequeña que se nota: **si la acción falla, el diálogo NO se
cierra.** El aviso se lee con él delante y se puede reintentar sin volver a
buscar el pedido.

### Nota · Avisos del número de guía (`guias.js`)

Dos avisos, los dos salidos de mirar los 971 pedidos reales:

| Aviso | Por qué existe |
|---|---|
| **El formato** | 484 de 487 guías tienen 8 dígitos. Tres están mal escritas y una, `939726661`, estaba EN TRÁNSITO: su seguimiento llevaba semanas muerto y nadie lo sabía. Un número mal escrito no da error, da silencio. |
| **La guía repetida** | Tres números están en dos pedidos. Dos son el mismo cliente en un solo paquete; el tercero son dos clientes distintos, o sea un tipeo. |

> **Avisan, no impiden.** Repetir una guía es algo que el negocio hace a
> propósito — un retorno a origen reutiliza la misma. Bloquear rompería la
> forma de trabajar; callarse deja pasar el error. Avisar respeta las dos.

`revisar()` es lógica pura y se prueba sola; `vigilar()` es lo que pinta. Va
enganchado en **los dos** sitios donde se escribe una guía (`fShalomGuia` del
formulario y `trkOrdNum` del modal de seguimiento): con uno solo, se cuela por
el otro.

⚠️ El oyente se engancha **una vez** por campo, así que `pintar` lee el id del
pedido **del propio campo** y no de la variable de `vigilar`. Con la variable,
al abrir un segundo pedido se excluiría al equivocado y se avisaría de que la
guía está repetida consigo misma.

### Nota · Registro de errores (`errores.js`)

Varios vendedores usan el panel desde equipos distintos. Sin esto, un fallo en
el teléfono de uno muere en su pantalla y nadie más se entera — que es lo que
convierte cualquier problema intermitente en una cacería a ciegas.

Escribe en `<RAIZ>/errores/items`. **No guarda nada de clientes**: ni nombres,
ni teléfonos, ni direcciones, ni DNI. Un registro de errores es el sitio más
fácil para filtrar datos de personas sin darse cuenta, porque nadie lo revisa.
Por eso `extra` solo admite valores simples: un objeto anidado podría arrastrar
un pedido entero con el cliente dentro.

Tres frenos, porque un bucle de errores cuesta dinero: tope de 20 por sesión,
el mismo error no se repite antes de un minuto, y **nunca lanza** — si falla al
guardar, se calla. Reintentar justo cuando algo va mal es la forma más rápida
de convertir un fallo en una tormenta de escrituras.

### Nota · Las flechas `‹ ›` de la fila de etiquetas

**Cambian la etiqueta activa, una por toque. No desplazan la fila.**

```
‹  ← TODOS · NUEVO PEDIDO · EN PROCESO · … · AVISAR CUANDO LLEGUE →  ›
```

Desplazar era un botón caro para algo que el dedo ya hace. En cambio "etiqueta
anterior / siguiente" no tenía atajo: había que buscar el chip con la vista y
apuntarle. **La fila se mueve igual, pero como consecuencia** —
`renderChips()` llama a `ChipsNav.verActivo()`, que trae el chip activo a la
vista.

**Quién decide vive en `index.html`** (`navFiltro`, `filtroPuedeIr`,
`_secuenciaFiltros`), porque ahí están `_filt` y `S.labels`. `floatpanel.js`
solo pone los botones y los muestra u oculta. Que el carrusel tuviera que
alcanzar un `let` de otro script para decidir sería el acoplamiento que se
rompe en silencio (ver la comprobación de `window.X` en el CI).

Tres decisiones:

- **`TODOS` es la primera posición** del recorrido: es el filtro vacío.
- **Sin dar la vuelta.** De la última no se salta a `TODOS`: el chip `TODOS`
  está siempre visible y a un toque, y que la flecha desaparezca es la señal
  más clara de que llegaste al final.
- **Los chips se pintan al instante; la lista espera 120 ms.** Ir de `TODOS` a
  `ENVIADO` son cinco toques, y montar cinco listas de las que solo miras la
  última es trabajo tirado — sobre todo al pasar de largo por `FINALIZADO`,
  que son 924 tarjetas.

*(Historia: antes las flechas movían 120 px fijos, un número sin relación con
el ancho de ninguna etiqueta —van de ~60 px a ~230 px—, así que dejaban medias
etiquetas cortadas en el borde.)*

**Por qué no `::scroll-button()`** (revisado el 2026-09-12): hace exactamente
esto sin JavaScript y es lo que recomiendan los artículos de este año, pero
**solo funciona en Chrome/Edge 135+ — no es Baseline**. En un navegador sin
soporte las flechas no existirían y nadie sabría por qué. Cuando alcance
Baseline, `_fixChipsScroll` se puede borrar casi entero.

Lo que sí se usa es la mitad universal: **CSS Scroll Snap** (`panel.css`), que
alinea también el deslizamiento con el dedo. Con `proximity`, **no**
`mandatory`: una etiqueta más ancha que la pantalla puede atrapar el
desplazamiento con `mandatory` y dejarte sin poder pasar.

Dos reglas que no se rompen:

1. **Cada flecha se ve si hay etiqueta hacia ese lado**, no según si se puede
   desplazar. En `TODOS` no hay `‹`; en la última etiqueta no hay `›`.
2. **Las flechas viven sobre el carrusel, no sobre la fila.** Estaban sobre la
   fila entera y la izquierda tapaba los ~25 px iniciales del chip `TODOS`, que
   ahí dejaba de responder al toque.

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
