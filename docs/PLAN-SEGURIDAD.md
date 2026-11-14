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
| L2 | Links generales con nombre, pausa, vencimiento, tope diario y contador | Pendiente |
| L3 | Anti-bots al enviar: App Check, campo trampa, tiempo mínimo, tope por celular | Pendiente |
| L4 | Seguimiento con id antiguo solo mientras el pedido siga abierto | Pendiente |
| L5 | Autocompletado guardado en el celular del cliente («¿Eres tú?»); el servidor ya no da nombres por celular | Pendiente |
| L6 | Revisión de escapado del texto del cliente y CSP de lista blanca | Pendiente |

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
