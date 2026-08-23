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

## Qué NO hace todavía (siguientes fases)

- **Fase B:** subir el estado a tu Firestore (necesitará una *clave de servicio*
  de Firebase, que generas tú y se guarda solo aquí, nunca en el repo).
- **Fase C:** correr solo cada X horas (Programador de tareas de Windows / cron)
  y mover etiquetas según tu config.

Cada fase se prueba antes de pasar a la siguiente.

## Privacidad

`.perfil/`, `debug/`, `node_modules/` y `serviceAccount.json` están en
`.gitignore`: nunca se suben al repositorio.
