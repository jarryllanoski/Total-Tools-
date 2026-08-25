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

## FASE C — que corra solo cada 6 horas

`correr.bat` es lo que ejecuta el Programador de tareas. No llames a `node`
directamente desde el Programador: el `.bat` resuelve las rutas absolutas (el
Programador **no** hereda la carpeta de trabajo — causa nº1 de "funciona a mano
pero programado no"), comprueba que Node exista y deja constancia en `logs/`.

### Probar el .bat primero

```powershell
.\correr.bat
```
Debe hacer lo mismo que `node subir.js`. Revisa que se creó `logs\arranques.log`.

### Registrar la tarea (una sola vez)

1. Menú Inicio → **Programador de tareas** → **Crear tarea…** (no "tarea básica").
2. **General**
   - Nombre: `Total Tools — Seguimiento Shalom`
   - ⚠️ Dejar marcado **"Ejecutar solo cuando el usuario haya iniciado sesión"**.
     **NO** marcar *"Ejecutar aunque el usuario no haya iniciado sesión"*: el
     navegador necesita un escritorio visible y con esa opción falla siempre.
3. **Desencadenadores** → Nuevo…
   - Diariamente, empezar a las **07:00**
   - ✅ **Repetir cada: 6 horas** · durante: **1 día** (o "indefinidamente")
4. **Acciones** → Nueva…
   - Acción: *Iniciar un programa*
   - Programa: `C:\Users\Windows 11\Desktop\Total-Tools-\shalom-local\correr.bat`
   - **Iniciar en**: `C:\Users\Windows 11\Desktop\Total-Tools-\shalom-local`
5. **Condiciones**
   - ✅ **Reactivar el equipo para ejecutar esta tarea** (la PC se suspende sola)
   - ❌ Desmarcar *"Iniciar la tarea solo si el equipo está conectado a la corriente"*
     si es una laptop y quieres que corra con batería.
6. **Configuración**
   - ✅ **Ejecutar la tarea lo antes posible tras un inicio programado omitido**
     (si la PC estuvo apagada, recupera al encender)
   - ✅ Detener la tarea si se ejecuta más de: **1 hora**

Con eso corre a las **07:00 · 13:00 · 19:00 · 01:00**.

### Cómo saber que está funcionando

- **Desde el panel (o tu celular):** el 🔔 centro de alertas muestra *"Seguimiento
  automático: Activo · Última corrida hace 2 h"*, con sus KPIs y los problemas
  agrupados. El latido viaja a Firestore, así que **lo ves sin tener la PC
  delante**.
- **En la PC:** `logs\2026-08.log` tiene el resumen de cada corrida.

### Detalles que ya están resueltos

- **Candado**: si una corrida sigue viva, la siguiente se salta (nunca dos
  navegadores golpeando Shalom a la vez). Se limpia solo si el proceso murió.
- **Registro mensual** con borrado automático de lo que pase de 3 meses.
- **La ventana del navegador se ve** a propósito: un navegador visible puntúa
  mejor en el reCAPTCHA de Shalom que uno oculto. Dura ~3 minutos.
- **Espera de Internet real**: al despertar de la suspensión, Windows a veces
  tarda en reconectar el Wi-Fi aunque el ícono ya diga "conectado". `subir.js`
  comprueba con una petición real antes de abrir el navegador (hasta 2 min de
  reintentos); si no hay red, se salta la corrida con un aviso claro en vez de
  quedarse pegado.
- **Vigía de 20 minutos**: si algo se cuelga igual (perfil de navegador
  bloqueado por una corrida anterior que no cerró bien, etc.), el script se
  fuerza a cerrar solo a los 20 min, liberando el candado. Así nunca queda un
  `node.exe` zombie bloqueando las siguientes corridas.

### Si ves varias corridas "colgadas" (`node.exe` acumulados)

Si el Administrador de tareas muestra varios `node.exe` en ejecución (busca
"node" en el buscador de arriba) y el 🔔 centro de alertas dice "hace muchas
horas" en vez de cada 6h, revisa también en el Programador de tareas,
Propiedades de la tarea → pestaña **Configuración**:

- ✅ **"Detener la tarea si se ejecuta más de: 1 hora"** — respaldo a nivel de
  Windows además del vigía interno.
- **"Si la tarea ya se está ejecutando"** → debe decir **"No iniciar una nueva
  instancia"** (no "en paralelo") — así una corrida colgada no deja que se
  amontonen varias más.

Termina los `node.exe` colgados a mano una vez (Finalizar tarea) — con el
vigía y la espera de Internet ya en el código, no debería volver a pasar.

## Privacidad

`.perfil/`, `debug/`, `node_modules/` y `serviceAccount.json` están en
`.gitignore`: nunca se suben al repositorio.
