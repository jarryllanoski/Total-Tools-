# Plan de Seguridad y Producción — Total Tools

Estado del plan de auditoría enterprise. Proyecto Firebase: `total-tools-24ce8`.

---

## ✅ Completado y desplegado

| # | Fix | Tipo | Estado |
|---|-----|------|--------|
| C-1 | `handleConfig` ya no expone el PIN de admin | Backend | ✅ Desplegado |
| C-2 | XSS almacenado en el panel (escH/escU en cardHTML) | Frontend | ✅ En vivo |
| A-1 | Rate-limit al crear pedidos (10/min por IP) | Backend | ✅ Desplegado |
| M-3 | Límite de tamaño de campos en `pickOrderFields` | Backend | ✅ En main (deploy pendiente) |
| A-2* | `handleTrack` no devuelve teléfono/costo/notas/GPS | Backend | ✅ En main (deploy pendiente) |
| — | Eliminado código muerto (shalom.js, RECUPERACION_BACKEND, scripts) | Repo | ✅ En vivo |
| — | CI/CD: lint automático en cada push (`.github/workflows/ci.yml`) | DevOps | ✅ En vivo |
| — | Cache-busting consistente + `hosting.ignore` endurecido | Config | ✅ En vivo |

\* A-2 parcial. El cierre total requiere migración (ver abajo).

---

## Noviembre 2026 — Consola y links

| Paso | Qué | Estado |
|------|-----|--------|
| Consola | Alerta de presupuesto S/ 59 al mes (50/90/100 % real y 100 % previsto) | ✅ |
| Consola | Clave del navegador limitada a web.app, firebaseapp.com y github.io | ✅ |
| Consola | Registro de cuentas cerrado, protección de enumeración activa | ✅ |
| Consola | PITR 7 días y copia diaria con 98 días de retención | ✅ |
| Consola | Verificación en 2 pasos (Google y GitHub) | ⏸️ pendiente |
| L1 | Token del formulario con `crypto.getRandomValues` (22 caracteres, sin sesgo) | ✅ |
| L1 | El servidor no crea pedidos sin token (`SIN_LINK`, antes del freno por IP) | ✅ |
| L1 | `formulario.html` sin token muestra «Pide tu link» con botón a WhatsApp | ✅ |
| CI | Publicar en Firebase desde GitHub con Workload Identity Federation, sin claves; el servidor solo cuando cambia `functions/` | ✅ |
| L2 | Links generales con nombre, pausa, vencimiento, tope diario y contador | Descartado por ahora |
| L3 | IP real del cliente desde la derecha de X-Forwarded-For (`functions/ipCliente.js`); antes se tomaba la que escribe el cliente | ✅ |
| L3 | Frenos en memoria para alta, link, configuración, autocompletado y agencias; el DNI conserva el freno exacto en Firestore | ✅ |
| L3 | Alta: campo trampa (rechaza sin gastar el link) y marcas `alertas` por falta de App Check o llenado en menos de 4 s; el panel muestra «⚠️ revisar» | ✅ |
| L3 | Autocompletado solo con el link personal de ese mismo celular; si no, no responde ni consulta la base | ✅ |
| L4 | Seguimiento con id antiguo solo mientras el pedido siga abierto (`enlace.aceptaLegado`); freno propio de 20 por minuto | ✅ |
| L4 | El botón 🔗 del panel da un token seguro a los pedidos antiguos (`trackLegado: true`): el link viejo del cliente sigue hasta que se cierre | ✅ |
| CI | Se retira la comprobación manual de `?v=`: la construcción pone la huella de cada archivo | ✅ |
| L5 | «¿Eres tú?»: los datos del último pedido viven solo en el celular del cliente (`tt_mis_datos`, 180 días, DNI y celular tapados en pantalla, «No soy yo» los borra) | ✅ |
| L6 | Ataque simulado (código en cada campo) sobre panel, seguimiento, etiqueta e impresión; cerrados: guía de Shalom en el botón QR, copiar teléfono, imprimir por courier, links `javascript:` y documentos | ✅ |
| L6 | `escJs` seguro dentro de `onclick`, `escU` con lista de esquemas, y todos los limpiadores escapan comillas | ✅ |
| L6 | El servidor limpia el pedido del formulario por tipo (`functions/pedidoForm.js`): estado, fecha, links, documentos y montos los pone él | ✅ |
| L6 | CSP de lista blanca en las tres páginas (`<meta>`, igual en Firebase y GitHub Pages) y `frame-ancestors 'none'` en Firebase; conexiones solo a servidores con nombre exacto | ✅ |
| L6 | Prueba de inventario: un servicio externo nuevo en el código sin sumarlo a la CSP hace fallar las pruebas | ✅ |

---

### Publicar

Cada push a `main` corre `.github/workflows/firebase.yml`: pruebas, identidad sin claves, web y, si cambió `functions/`, servidor.
La cuenta `github-action-1237310279` solo se puede usar desde `jarryllanoski/Total-Tools-` en `refs/heads/main`.
Roles: firebasehosting.admin, cloudfunctions.admin, run.admin, cloudscheduler.admin, secretmanager.viewer, artifactregistry.reader,
serviceusage.serviceUsageConsumer, firebase.viewer, y Service Account User solo sobre las cuentas de Compute y de App Engine.
Desde una PC sigue funcionando `firebase deploy --only hosting` y `firebase deploy --only functions`.

---

## Ola 3 — Infraestructura (requiere TU consola de Google Cloud)

Estos pasos NO son código; se configuran una sola vez en la consola.

### 1. Backup automático de Firestore (PITR + backups programados)

**Point-in-Time Recovery (recupera datos de cualquier momento de los últimos 7 días):**
```bash
gcloud firestore databases update --database="(default)" \
  --enable-pitr --project=total-tools-24ce8
```

**Backup diario programado (retención 14 días):**
```bash
gcloud firestore backups schedules create \
  --database="(default)" \
  --recurrence=daily \
  --retention=14d \
  --project=total-tools-24ce8
```

Verificar: `gcloud firestore backups schedules list --database="(default)"`

> Con esto, aunque se borren pedidos por error (como el incidente del 2 jul),
> se pueden recuperar. Es la red de seguridad #1 para producción.

### 2. Monitoreo de errores (alertas de Cloud Functions)

Opción simple (sin código, gratis) — alerta por email si las funciones fallan:
1. Consola → **Monitoring → Alerting → Create Policy**
2. Métrica: `Cloud Function → Execution count` con filtro `status = error`
3. Condición: más de 5 errores en 5 min
4. Canal de notificación: tu email

Opción avanzada (más adelante): integrar **Sentry** en `functions/index.js`
y en el frontend para trazas detalladas.

### 3. Restringir la API Key de Firebase (defensa extra)

La web API key es pública por diseño, pero conviene restringirla por dominio:
1. Consola Google Cloud → **APIs y servicios → Credenciales**
2. Abrir la key `AIzaSy...`
3. Restricciones de aplicación → **Referentes HTTP** → agregar:
   - `https://jarryllanoski.github.io/*`
   - `https://totaltoolspe.com/*` (si aplica)

---

## Pendiente — Requiere decisión de negocio

### A-2 completo — Tokens de seguimiento no adivinables

**Problema:** el link `?seg=id_<timestamp>` usa el ID del pedido, que es
secuencial y adivinable. Alguien podría enumerar y ver pedidos ajenos
(nombre, dirección, DNI — que la vista SÍ muestra al cliente dueño).

**Por qué no está cerrado:** el arreglo total requiere tokens aleatorios y
dejar de aceptar el ID directo. Pero los links `?seg=id_...` **ya enviados
a clientes por WhatsApp** dejarían de funcionar. Rompe producción visible.

**Migración propuesta (sesión dedicada):**
1. `handleCreate`: generar `trackToken` aleatorio (24+ chars) y guardarlo
   en el pedido + un doc mapa `panel/trackmap/items/{token}` → `{orderId}`.
2. `handleTrack`: resolver por `trackToken` (no por ID directo).
3. Período de gracia: seguir aceptando IDs viejos N semanas, luego cortar.
4. Links nuevos usan el token aleatorio.

Mitigación ya aplicada (A-2 parcial): el tracking ya no expone teléfono,
costo, notas privadas ni GPS, reduciendo el daño de una enumeración.

### Fase 5 — SaaS multi-empresa

Convertir la app en plataforma multi-tenant (varias empresas, roles,
planes, facturación) **no es una tarea de código incremental** — es una
reconstrucción de arquitectura (semanas) con decisiones de negocio:

- Multi-tenant: `tenants/{tenantId}/panel/...` + aislamiento por reglas
- Auth con roles (Firebase Auth + custom claims: owner/operador/lector)
- Planes y límites por tenant, facturación (Stripe)
- Migración de los datos actuales al modelo multi-tenant

Se planea como proyecto aparte cuando el negocio lo requiera.

---

## Otras mejoras de menor prioridad (Fase 3/4 restante)

- Minificar/bundlear assets (436 KB en 17 requests → reducir round-trips)
- Virtualizar `render()` del panel (hoy regenera todo el DOM con innerHTML)
- Mover `trash` de `panel/config` a subcolección (evita límite de 1 MB)
- Tests automatizados de las Cloud Functions
- Actualizar ESLint 8 → 9
