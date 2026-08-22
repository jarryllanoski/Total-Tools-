# Shalom — integración de rastreo, tickets, agencias y registro

Este documento explica **por qué** el rastreo automático de Shalom se retiró,
**cómo** quedó el código, y **qué** hace falta para reconectarlo. Léelo antes de
volver a tocar nada de Shalom: aquí está la razón para no repetir caminos que ya
sabemos que no funcionan.

## Resumen en una línea

Todo lo de Shalom pasa ahora por una sola puerta — `shalom.js` — que hoy está
**desconectada a propósito**. La integración nueva irá contra el portal de
empresa `pro.shalom.pe` con la cuenta del negocio.

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

## Cómo quedó el código (estado actual)

### La puerta única — `shalom.js`

`window.Shalom` con cuatro capacidades. Hoy todas responden
`{ok:false, motivo:'DESCONECTADO'}` y avisan al operador con un toast honesto:

| Método | Para qué | Futuro (pro.shalom.pe) |
|---|---|---|
| `consultarGuia(guia, codigo)` | estado de un envío | Operaciones → Seguimiento de envíos |
| `ticket(guia, codigo)` | guía de remisión / ticket | Operaciones → Comprobantes |
| `agencias()` | catálogo de sedes | portal PRO |
| `registrar(pedido)` | crear un envío | Registro individual / masivo |

**Cuando la integración esté lista, se rellenan estos 4 métodos y toda la UI se
enciende sola** — sin tocar un solo botón del panel ni del formulario.

### Quién llama a la puerta

- `tracking.js` — ⟳ Consultar y 🔄 masivo → `Shalom.consultarGuia`.
- `ticket.js` — 🧾 Jalar ticket → `Shalom.ticket`.
- `agencias-extractor.js` — Extraer agencias Shalom → aviso; **Olva sigue igual**.
- `index.html` — Sincronizar / Reprogramar → avisos honestos (cubre también los
  botones de "Estado del sistema" de `alertas.js`, que llaman a esos envoltorios).
- `formulario.html` — el buscador de agencias Shalom usa **solo el catálogo local**
  (`data/agencias-shalom.json`, 542 sedes); ya no hay respaldo en vivo.

### Qué se borró

- Backend: las 7 Cloud Functions Shalom + sus ayudantes + `functions/shalomWebSync.js`.
- Worker: la carpeta `shalomweb-tracker/` (Cloud Run).
- Frontend: el Motor A/B de `tracking.js` (~460 líneas) y la lógica de cola en
  `config.js`.

### Qué se conservó (no es Shalom o es agnóstico al motor)

- `formApi` (formulario público + seguimiento del cliente).
- `agenciasOlva` y `olvaListar` (Olva, sin clave, sin captcha).
- `extraerComprobante` (lee comprobantes apisale).
- El vigilante "llegó a destino" (`detectarEstadoAuto` + `_esDestino` +
  `_checkDestinoAlerts`) y todo el registro manual de estado.

## Para reconectar — la integración nueva (pro.shalom.pe)

`pro.shalom.pe` es el portal de empresa, distinto de la web pública. Es una
aplicación Vue; el HTML inicial es solo un cascarón (`<div id="app">`), así que
**Ctrl+U no sirve** — hay que mirar la pestaña **Network** del navegador.

Datos ya observados en el HTML del portal (con sesión iniciada):

- `<meta name="csrf-token">` — token CSRF por sesión.
- `<meta name="response-key">` — **clave para descifrar las respuestas**, entregada
  por sesión. (En la web pública esta clave estaba oculta; aquí, un cliente
  autenticado la recibe. Ese es el desbloqueo que no existía antes.)
- `<meta name="api-secret">` — secreto HMAC para **firmar las peticiones**.
- reCAPTCHA v3 marcado como **"necesario para los flujos que envían SMS/correo"** —
  es decir, **no** para rastrear ni registrar. El login podría pedirlo.

**Lo que falta capturar** (pestaña Network, sin pegar secretos en ningún chat):
la URL, método, forma del payload y forma de la respuesta de *Seguimiento de
envíos* — para saber si la respuesta llega en JSON legible (integración rápida
sin navegador) o cifrada (navegador real leyendo la barra de 4 pasos).

### Opciones, de mejor a peor

1. **Acceso oficial de Shalom.** Su central: **01 5007878**. Es la vía estable y
   consentida; incluiría registrar pedidos y tickets. Preguntar el precio antes
   de descartar por costo.
2. **Asistente en la PC del operador.** Corre en el navegador del usuario (su IP,
   su nota de reCAPTCHA), a ritmo humano y poco volumen. Solo con la PC encendida.
   No engaña a nadie: es lo que el operador haría a mano.
3. **Pelear contra el detector** (IP residencial, huellas). **No se hará.**

## Reglas que no se rompen

- **Nunca** falsificar el token firmado de Shalom ni resolver/evadir su reCAPTCHA.
- **Nunca** declarar `ok:true` sin un dato real: si no hay estado, `ok:false` con
  un motivo. (La lección más cara: el éxito falso ocultó días de fallo.)
- La contraseña de Shalom Pro va **solo** en Secret Manager, nunca en el
  navegador, el repositorio ni un chat.
- Un solo dueño por capacidad: la regla vive en `shalom.js`, no repartida.
