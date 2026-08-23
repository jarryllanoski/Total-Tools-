# shalom-local — Lector local del seguimiento de Shalom

Lee el seguimiento **público** de Shalom (`shalom.com.pe/rastrea`) desde **tu PC**,
con tu IP residencial que sí pasa el reCAPTCHA v3. No inicia sesión, no descifra
nada, no falsifica firmas: abre la página pública y lee el estado en pantalla,
como lo harías a mano. El porqué de todo esto está en `../docs/SHALOM.md`.

> **Por qué en tu PC y no en la nube:** un servidor (Cloud Scheduler/Cloud Run)
> usa IP de centro de datos, y el reCAPTCHA de Shalom la bloquea (403 + login).
> Solo una IP residencial —tu PC— lo pasa.

## Dónde correrlo (siempre encendido)

- **La PC de la tienda dejada encendida** — lo más fácil, cero costo.
- **Una Raspberry Pi** (~$50, bajo consumo, ideal para 24/7).
- **Una laptop vieja.**
- ❌ **Un celular Android NO sirve:** Playwright no corre en Android. (El celular
  sí es genial para consultas a mano: su IP móvil puntúa muy alto.)

## Instalar (una sola vez)

Necesitas **Node.js** (https://nodejs.org, versión 18+). Luego, en esta carpeta:

```bash
npm install
npx playwright install chromium
```

## FASE A — probar que tu PC puede leer Shalom

Esto es lo único que aún no sabemos. Corre, con una guía real tuya:

```bash
node rastrear.js --debug 92892656 ABCD
```

Se abre un navegador, busca la guía y:
- Si lee el estado → imprime `✅ Estado: En origen · 22/08/26 16:56`.
- Si Shalom pide login/verificación → `⚠️ BLOQUEADO` (reintenta más tarde).
- Guarda en `./debug/` el **texto** y una **captura** de lo que mostró Shalom.

**Pásame el archivo `.txt` de `./debug/`** (o su contenido). Con eso **calibro el
lector** contra la estructura real y dejamos la lectura fina y confiable.

✅ **Probado el 22/08/26**: la PC pasó el reCAPTCHA y leyó el estado real
correctamente en el primer intento.

## FASE B — subir el estado a tu Firestore

Consulta todos los pedidos Shalom pendientes (guía+código, sin finalizar) y
escribe el resultado, moviendo la etiqueta según tu modo de Config (Apagado /
Semiautomática / Automática) — el mismo aplicador que usa el botón ⟳ del panel.

### Generar la clave (una sola vez, la haces tú)

1. **Firebase Console** → ⚙️ **Configuración del proyecto** → pestaña
   **Cuentas de servicio**.
2. Botón **"Generar nueva clave privada"** → se descarga un `.json`.
3. Renómbralo a **`serviceAccount.json`** y ponlo en esta carpeta
   (`shalom-local/`). Ya está en `.gitignore`: nunca se sube al repositorio ni
   pasa por ningún chat.

### Correrlo

```bash
node subir.js --dry-run     # simulación: muestra qué haría, no escribe nada
node subir.js               # de verdad: consulta y escribe
node subir.js 92678946      # una sola guía puntual
```

Sin la clave, el script se detiene con un mensaje claro (no un error críptico)
diciéndote exactamente qué generar y dónde ponerlo.

**Regla de oro:** si Shalom no dio un dato real (bloqueado o sin estado
reconocible), el pedido **no se toca**. Nunca se finge un estado.

## Qué NO hace todavía (siguiente fase)

- **Fase C:** correr solo cada X horas (Programador de tareas de Windows) sin
  que tengas que ejecutarlo a mano.

Cada fase se prueba antes de pasar a la siguiente.

## Privacidad

`.perfil/`, `debug/`, `node_modules/` y `serviceAccount.json` están en
`.gitignore`: nunca se suben al repositorio.
