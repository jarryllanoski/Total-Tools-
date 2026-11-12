# Notas del código

Comentarios que vivían en el código hasta la Fase 3 (12/11/2026), guardados aquí con el archivo y la línea donde estaban. El código se dejó sin comentarios; el porqué de cada decisión queda en este archivo y en el resto de docs/.

## appcheck.js

- L1: appcheck.js — Firebase App Check para Total Tools
  ====================================================
  Adjunta una prueba a cada petición que dice "esto viene del panel real",
  no de un script suelto con un token de sesión robado. El token de sesión
  (auth.js) demuestra QUIÉN sos; App Check demuestra DESDE DÓNDE se llama.
  Son capas independientes — cada una puede fallar sin tumbar la otra.
  
  ESTADO: en observación (Supervisión), no en bloqueo. Firestore todavía
  acepta peticiones sin este token — Firebase solo mide qué porcentaje viene
  con prueba válida. El bloqueo (Aplicar) se activa aparte, desde la consola,
  después de confirmar varios días que el 100% de las peticiones reales llega
  verificado. Por eso todo acá está diseñado para fallar EN SILENCIO: si algo
  sale mal, el panel sigue funcionando exactamente igual que sin este archivo.
  
  Por qué import() dinámico y no <script type="module">: el resto del panel
  son <script src> clásicos cargados en un orden que ya es un contrato (ver
  docs/ARQUITECTURA.md). Meter un módulo ES real obligaría a repensar ese
  orden. import() es una función: corre en cualquier script, sin convertir
  este archivo ni a index.html en módulos.
- L28: Clave de sitio de reCAPTCHA Enterprise. Es pública — viaja en cualquier
- L29: botón de reCAPTCHA de la web, igual que la API key de Firebase de al
- L30: lado. Lo secreto (la clave del lado de Google que verifica la firma)
- L31: nunca sale de los servidores de Google; nada de eso pasa por acá.
- L36: Inicializa Firebase App + App Check una sola vez. Devuelve la instancia
       de App Check, o null si algo falló (sin conexión, config incompleta,
       etc.) — nunca lanza, para que quien llama pueda seguir sin este dato.
- L43: config a medias
- L66: API pública: el token actual de App Check, o '' si no se pudo obtener.
       _authHeaders() de index.html lo adjunta como cabecera X-Firebase-AppCheck
       en cada petición a Firestore, junto al token de sesión.
- L72: Si falló (red lenta, script de reCAPTCHA que no cargó), la próxima
           vez se VUELVE a intentar en vez de quedarse sin App Check hasta
           recargar la página (30/10/2026).
- L76: forceRefresh
- L79: cualquier fallo: seguir sin el token, no romper la app
- L83: Arranca en cuanto el archivo carga; el token queda listo (cacheado, con
- L84: auto-refresco) antes de que la primera petición lo pida.

## auth.js

- L1: auth.js — Módulo de autenticación para Total Tools
  Usa Firebase Authentication (Email/Password)
  Para desactivar: quitar <script src="auth.js"> del index.html
- L9: ── CONFIG ───────────────────────────────────────────────────────
- L15: Identificador público de la app ante Google (NO es un secreto: viaja en
       cualquier botón "Entrar con Google" del mundo). Sale de la consola de
       Firebase al activar Google como proveedor. Mientras esté vacío, el botón
       de Google no se muestra y el ingreso con contraseña sigue igual: así
       activar esto nunca puede dejar a nadie afuera.
- L26: Duración máxima de una sesión. Hasta ahora la sesión NO vencía nunca: el
       token se renovaba solo indefinidamente, así que una laptop robada con el
       panel abierto seguía abierta para siempre. Doce horas cubre una jornada
       completa —se entra una vez al día— sin dejar la puerta abierta de noche.
- L32: ── CSS ───────────────────────────────────────────────────────────
- L93: ── HTML ──────────────────────────────────────────────────────────
- L95: IDEMPOTENTE A LA FUERZA. Dos pantallas de login con el mismo id es lo
         que dejó a alguien tecleando su contraseña una y otra vez: entraba bien,
         se quitaba una, y seguía mirando la otra. Que no puedan existir dos no
         depende de que nadie llame dos veces — depende de aquí.
- L126: Focus al campo de email
- L133: ── ENTRAR CON GOOGLE ────────────────────────────────────────────
       Es más seguro que un código enviado al correo: un código se puede pedir
       por teléfono haciéndose pasar por soporte, y la víctima lo dicta sin
       darse cuenta. El flujo de Google no se puede dictar — y si la cuenta
       tiene verificación en dos pasos, ese factor ya está incluido.
       Convive con el ingreso por contraseña a propósito: si algo del lado de
       Google no está configurado, siempre queda la puerta que ya funcionaba.
- L141: sin configurar: ni se muestra
- L164: si Google falla, queda el ingreso por contraseña
- L171: Canjea el identificador de Google por una sesión de Firebase. Desde acá
       todo sigue igual que con contraseña: mismo token, mismo almacenamiento,
       mismas reglas de Firestore.
- L199: Autenticó con Google pero Firebase lo rechazó. Se muestra el correo:
- L200: sin ese dato, "no autorizado" obliga a adivinar con cuál entró.
- L211: ── AUTH ──────────────────────────────────────────────────────────
- L213: refreshToken para renovar
- L216: El inicio se marca UNA vez, al entrar de verdad. Renovar el token no lo
- L217: reinicia: si lo hiciera, la sesión volvería a no vencer nunca, que es
- L218: justo lo que se está corrigiendo.
- L224: ¿Pasaron ya las 12 horas desde que entró?
- L227: sesión vieja, sin marca: no se expulsa
- L237: Borra la sesión Y los datos del negocio que quedan cacheados en el
       navegador. Antes solo borraba las claves de sesión: los ~950 pedidos
       —con nombres, teléfonos, DNI y direcciones— seguían en localStorage
       después de cerrar sesión, legibles con F12 por cualquiera que se sentara
       en la PC. La sesión cerrada daba una sensación de seguridad que los datos
       no respaldaban.
       El modo sin conexión se conserva mientras la sesión está viva, que es
       cuando de verdad hace falta; al cerrarla no queda rastro.
- L247: ¿Quedó algo sin subir a la nube? Se mira el registro que deja save():
       si hay ids ahí, son cambios que viven SOLO en este navegador.
       Devuelve -1 cuando el registro dice "subir todo" y no se puede contar.
- L264: sin esto, el próximo ingreso
- L265: heredaría la hora vieja y
- L266: vencería al instante: bucle.
- L267: ver _expulsar()
- L273: SESIÓN VENCIDA A MITAD DE TRABAJO — no es lo mismo que cerrar sesión.
       Cerrar sesión es una decisión: se borra todo, incluidos los datos de
       clientes cacheados. Vencer es un accidente, y la misma persona va a
       volver a entrar en diez segundos. Si aquí se borrara el respaldo, un
       cambio que no alcanzó a subir desaparecería sin que nadie lo decidiera.
  
       Por eso los datos se conservan SOLO si hay algo pendiente. Si no hay
       nada pendiente son una copia sin valor y se borran, que es lo que
       protege la privacidad cuando alguien se sienta en la PC.
- L289: ── ENTRÓ, PERO NO TIENE ACCESO ──────────────────────────────────────
       Un 403 de Firestore puede significar dos cosas MUY distintas:
         · tu sesión venció  → vuelve a entrar y listo;
         · tu cuenta no está autorizada → volver a entrar no arregla nada.
       Desde el 403 no se pueden distinguir. Y tratar la segunda como la primera
       manda al usuario a un bucle: entra bien, se le dice "tu sesión venció",
       vuelve a entrar, y otra vez. Sin entender nunca qué pasa.
  
       Así que no se adivina: se dice lo que SÍ se sabe —con qué correo entró— y
       se le dan las dos salidas. El correo es el dato que resuelve el problema:
       casi siempre entró con la cuenta equivocada.
- L330: El correo con el que se entró. Es lo único accionable cuando algo falla
       por permisos: casi siempre se entró con la cuenta equivocada.
- L336: ¿HABÍA una sesión? Es la pregunta que convierte un 403 en un diagnóstico.
       Un 403 de Firestore significa "tu sesión venció" solo si existía una. Sin
       token guardado es el estado normal de quien todavía no ha entrado.
- L349: Devuelve 'ok' | 'rechazado' | 'sin_red'.
       La distinción importa: si el servidor RECHAZA el token, la sesión murió de
       verdad y hay que limpiar. Si simplemente no hubo red, la sesión puede
       seguir siendo válida — borrar ahí dejaría sin modo sin conexión justo
       cuando hace falta, que es cuando no hay internet.
- L365: no se pudo preguntar: no se concluye nada
- L374: guardar nuevo idToken
- L381: ── API PÚBLICA ───────────────────────────────────────────────────
- L385: Sesión de más de 12 h: se cierra, PERO solo si hay red para volver a
- L386: entrar. Expulsar sin conexión sería lo peor de los dos mundos: no
- L387: podría iniciar sesión (el login necesita internet) y encima perdería
- L388: los datos locales justo durante el corte. Sin red se deja seguir y se
- L389: vuelve a evaluar cuando la conexión regrese.
- L390: ★ Por _expulsar(), no por _clearSession() a secas: si quedó algo sin
- L391: subir, el respaldo se conserva. Vencer la sesión con el panel
- L392: cerrado y perder por eso un cambio que nunca llegó a la nube sería
- L393: una pérdida que nadie decidió.
- L398: Si ya tiene sesión válida, mostrar app directamente
- L403: Intentar refrescar token guardado
- L407: La sesión revivió renovando el token: la carga del arranque pudo
- L408: haber fallado antes de que eso terminara.
- L414: El servidor rechazó el token: la sesión murió de verdad, así que no
- L415: deben quedar datos del negocio en el navegador. Si en cambio fue falta
- L416: de red ('sin_red'), NO se borra nada: puede ser una sesión sana sin
- L417: internet, y ese es justo el caso en que el modo sin conexión sirve.
- L418: Misma regla que en _expulsar(): si hay algo sin subir, el respaldo se
- L419: conserva. Un token rechazado mata la sesión, no el trabajo de quien la
- L420: tenía — y esa persona va a volver a entrar.
- L450: Login exitoso — guardar idToken para requests y refreshToken para renovar
- L456: Error de Firebase
- L476: Cerrar sesión BORRA el respaldo local, y con él lo que no alcanzó a
           subir. Antes se hacía en silencio: un cambio hecho sin conexión se
           perdía por cerrar sesión, sin aviso y sin forma de recuperarlo.
- L501: querySelectorAll y no getElementById: éste devuelve SOLO la primera, y
- L502: dejar una segunda escondida detrás es exactamente el bug que hubo.
- L509: ── TOKEN VÁLIDO PARA REQUESTS ───────────────────────────────────
- L510: Devuelve el MOTIVO: 'ok' | 'vencida' | 'rechazado' | 'sin_red'.
       Un booleano no alcanza. "No tengo token" tiene tres causas con tres
       arreglos distintos —esperar a que vuelva internet, volver a entrar, o
       nada porque pasaron las 12 h— y decirle a alguien "revisa tu conexión"
       cuando lo que murió fue su sesión es lo que hace perder una tarde.
- L516: Si la sesión ya cumplió sus 12 h, no se renueva más. Sin esto, alguien
- L517: trabajando sin parar la extendería indefinidamente y el límite no
- L518: existiría en la práctica.
- L521: 5 minutos antes de vencer
- L522: token válido
- L523: 'ok' | 'rechazado' | 'sin_red'
- L526: Renovar token automáticamente si está por vencer (menos de 5 min)
- L528: El contrato de acá es booleano y tiene 5 consumidores, así que se
- L529: traduce el motivo en vez de devolverlo crudo — un texto no vacío sería
- L530: siempre verdadero y "sin red" pasaría por token renovado.
- L534: ★ LA PUERTA. Devuelve el idToken listo para usar, o LANZA.
       Nunca devuelve vacío, y ese es todo el punto. Antes cada sitio que
       necesitaba el token hacía su propia versión de «lo intento y si no sale,
       mando la petición igual»: la petición salía SIN IDENTIFICAR, las reglas
       la rechazaban con 403, y nada avisaba. Se podía trabajar una hora entera
       sin que subiera nada, con el punto en verde.
       El error lleva `.auth` con el motivo, para que quien lo atrape pueda
       decir cuál de los tres problemas es en vez de "sin conexión" a todo.
- L547: Motivo 'ok' pero sin token guardado: la sesión dice estar viva y no hay
- L548: con qué firmar. Es el mismo agujero, así que la misma negativa.
- L555: Las palabras las decide UN SOLO SITIO. Si cada pantalla escribe su
       propia versión, tarde o temprano una dice "revisa tu conexión" ante una
       sesión vencida y manda a buscar el problema donde no está.
       Devuelve '' si el error no es de sesión, para que quien llama use su
       propio mensaje sin tener que saber de motivos.
- L568: Exponer para que index.html la use antes de cada request
- L574: ── INIT AUTOMÁTICO ───────────────────────────────────────────────
- L575: Esperar a que el DOM esté listo
- L576: `window.AuthModule.init()` y no `AuthModule.init()`. En el navegador las
       dos funcionan —una propiedad de window es un nombre global—, pero apoyarse
       en eso ya salió caro dos veces en este proyecto: `save` declarado con
       const que no llegaba a window, y `Seleccion` usado sin prefijo desde el
       repintado. Escribirlo explícito cuesta siete letras.

## cliente/cliente.css

- L1: cliente/cliente.css — estilos del formulario y del seguimiento (Fase 2,
     10/11/2026). Antes iban dentro de formulario.html; ahora las dos páginas
     comparten este archivo, y el navegador lo guarda una sola vez.
- L9: HEADER
- L14: PROGRESS DOTS
- L20: WIZARD CONTAINER
- L28: STEP HEADER
- L33: FIELDS
- L35: ★ DNI Y NOMBRE (30/10/2026): escanear, aparecer, iluminarse.
- L62: 3 opciones por fila. La rejilla es de 6 columnas y cada tarjeta ocupa 2:
     así las que sobran en la última fila se pueden CENTRAR (con 3 columnas
     reales no se puede, harían falta medias columnas).
- L67: ★ «ESTOY ENCIMA» en las tarjetas de envío (30/10/2026): con mouse se
     elevan y se iluminan; con el dedo se hunden al presionar.
- L70: Sobrantes de la última fila: CENTRADOS, del mismo tamaño que el resto.
     Estirar la última a todo el ancho (como se hacía con 2 columnas) miente
     sobre la jerarquía: parecería la opción importante. Funciona con cualquier
     número de couriers, que el operador activa y desactiva desde el panel.
- L74: sobra 1
- L75: sobran 2
- L86: COURIER GRID
- L88: ★ «ESTOY ENCIMA» — UN estilo, UNA clase (.tocando), para envíos, días y
     sedes (30/10/2026). En PC la pone el mouse al pasar por encima; en celular
     (no hay «pasar por encima») la pone el dedo al apoyarse. Mismo efecto en
     todos los dispositivos, sin duplicar reglas por :hover / :active.
- L101: DATE CHIPS
- L106: ★ TOCAR Y ELEGIR SE SIENTE (30/10/2026). Microinteracciones breves
     (≤0,3 s), UNA vez por elección; vibración solo al ELEGIR (Android).
- L110: El dedo apoyó: respuesta AL INSTANTE (el navegador demora :active en
     filas que se deslizan). Si el dedo se mueve, se quita y no elige.
- L136: AGENCY CASCADE
- L140: ★ El BOTÓN NATIVO <geolocation> (Chrome 144+). Chrome dibuja su texto e
     ícono y limita el estilo; IGNORA box-sizing y añade relleno lateral
     propio: con width:100% + ese relleno se sale de la pantalla y Chrome lo
     declara inválido («intersection_out_of_viewport_or_clipped») y NO
     responde al toque. Por eso relleno lateral 0. Medido en Chromium 153.
- L151: ★ «LLÉVAME A LA LUPA» (30/10/2026): si la ubicación sigue bloqueada, no
     se repite el error; el buscador se ilumina y queda listo para escribir.
- L153: El encabezado del buscador SIEMPRE dice qué buscar. Cuando el cliente
     llega aquí porque la ubicación no se pudo, se enciende (azul + 👇).
- L161: ★ En el paso de la sede la etiqueta de arriba no se ve (30/10/2026): una
     pantalla, una tarea. Vuelve en el paso 4 ya con la sede en DESTINO.
- L169: ★ «TÚ ESTÁS AQUÍ» QUE LATE (30/10/2026): el mismo punto azul con halo de
     Google Maps o Waze. El cliente ya lo conoce: se reconoce al instante y ve
     las sedes rojas a su alrededor. Solo CSS: ni batería ni red.
- L174: La lupa late mientras no hay sede elegida: invita sin gritar. Al escribir
     o elegir se queda quieta (lo que late siempre se termina ignorando).
- L188: ★ «ESTOY ENCIMA» (30/10/2026): con mouse se ilumina al pasar; con el
     dedo (no hay «pasar por encima») se hunde al presionar, como un botón
     físico. Cada toque responde en menos de 0,1 s: se siente instantáneo.
- L208: BUTTONS
- L214: ★ CONFIRMACIÓN (30/10/2026)
- L245: Lo amarillo ENTRA (no aparece de golpe) y la mano señala el botón sin parar.
- L256: SUCCESS
- L268: TRACKING PAGE
- L277: TRACK ROWS
- L283: SPINNERS / LOADING
- L287: Pin "buscando ubicación": late/rebota mientras geolocaliza (feedback en el botón, no abajo)
- L294: ERROR
- L297: UNCONFIGURED
- L303: REFRESH ROW
- L308: SMALL LINK
- L323: Section divider
- L326: DELIVERY ADDRESS OPTIONS
- L337: Botón de ayuda: rellena el cuadro de dirección, no lo reemplaza
- L340: Chip: coordenadas adjuntas, quitables por el cliente
- L343: ★ DELIVERY CON MAPA (30/10/2026): el punto se VE y se puede corregir.
- L357: ★ UN mapa de delivery, DOS modos (30/10/2026):
       · MIRAR: el pin queda fijo en el punto; mover la vista no lo mueve.
         Mismo tamaño que el mapa de sedes. Celular: dos dedos (un dedo baja
         la página). PC: mouse.
       · AJUSTAR (solo con el botón «Ajustar punto»): pin fijo al centro y se
         mueve el mapa. PC: en el MISMO recuadro, al mismo tamaño. Celular:
         pantalla completa (ahí un dedo arrastra sin atascar la página).

## cliente/comun.js

- L1: cliente/comun.js — LO QUE COMPARTEN EL FORMULARIO Y EL SEGUIMIENTO
  ===================================================================
  Fase 2 (10/11/2026). El seguimiento vivía dentro de formulario.html y
  cada cliente que solo quería ver su pedido descargaba el formulario
  entero (~240 KB). Ahora son dos páginas, y esto es lo que las dos usan:
    · la puerta a la Cloud Function (`_api`), con App Check;
    · la configuración pública del negocio (`CFG`);
    · la cabecera, el pie de marca y la hoja de ayuda con Toby;
    · el código de seguimiento y el tipo de envío (una sola regla).
  
  ⚠️ SCRIPT CLÁSICO A PROPÓSITO, SIN ENVOLVER. Sus declaraciones son
  globales y así el código de cada página las usa por su nombre, igual que
  cuando estaban en el mismo archivo — moverlas no cambió ni una llamada.
  `let CFG` es global de script: la página que la carga la asigna.
  Va al FINAL del <body>: `app` necesita que #app ya exista.
- L20: ─── CLOUD FUNCTION (proxy seguro: el público ya no toca Firestore directo) ───
- L27: ★ LA PRUEBA DE QUE ESTO VIENE DE ESTA PÁGINA.
       Se adjunta a TODAS las llamadas, no solo a las nuevas: así el panel de
       Firebase puede medir qué porcentaje del tráfico real llega verificado
       antes de que nadie piense en bloquear. Si no hay token —sin red,
       reCAPTCHA caído, navegador viejo— se manda la petición IGUAL y sin la
       cabecera: hoy el servidor no la exige, y el cliente no se queda sin
       pedir por una capa que es de medición.
- L41: El 429 NO es un error tecnico: es el freno por IP haciendo su trabajo, y
       trae en el cuerpo el motivo en palabras. Reventar aqui lo convertiria en
       un "Error al buscar: API 429" que no le dice nada a nadie.
- L49: Tu app usa ruta fija
- L51: ─── STATUS MAP ──────────────────────────────────────────────────
- L61: aliases minúsculas para compatibilidad con pedidos viejos
- L72: ─── COURIER EMOJI ───────────────────────────────────────────────
- L86: "Encomienda" se renombró a "Otras Agencias" en la interfaz.
     La clave interna y los campos siguen siendo 'encomienda' (sin migración
     de datos ni cambios en formApi). Detectamos ambos nombres para ser
     compatibles con configuraciones (panel) que aún digan "Encomienda".
- L97: ─── DOM HELPERS ─────────────────────────────────────────────────
- L108: ─── LOAD CONFIG (vía Cloud Function) ─────────────────────────────
- L111: ─── HEADER HTML ─────────────────────────────────────────────────
- L113: Tu app guarda name y phone directo en CFG (no en CFG.config)
- L116: ayudaTipo: 'track' = ayuda de seguimiento, cualquier otro = ayuda del formulario
- L118: En el FORMULARIO la marca y la dirección ya van en el REMITENTE de la etiqueta
- L119: viva → aquí se omiten (evita duplicar) y la etiqueta sube. En SEGUIMIENTO no
- L120: hay etiqueta → se muestran marca + dirección como siempre.
- L128: ─── Ayuda del formulario: TOBY, con el formato de Heavy ────────────
     30/10/2026. La guía anterior describía otro formulario (nombre primero,
     «Confirmar abre WhatsApp», «si no envías el WhatsApp no lo procesamos»).
     Era falso: el pedido queda REGISTRADO al confirmar, y WhatsApp solo trae
     el link de seguimiento. Ahora la ayuda sale del estado real:
       · los pasos que ESTE cliente ve (retiro en tienda no tiene destino);
       · el paso donde está, resaltado;
       · Toby explica lo de ESE paso y ESE tipo de envío.
     Solo presentación: no lee ni escribe nada en la nube. Si la imagen no
     carga, queda el globo de texto.
- L169: Toby (narrador/toby.js, compartido con el seguimiento y el panel). Sin el
     script —falla de red— queda el texto en una nota. `texto` ya escapado.
- L175: El primer nombre, escapado, para saludar («¡Hola, Jarlyn!»).
- L183: La hoja de ayuda: UNA para el formulario y el seguimiento.
- L210: Pie de marca (mismo en formulario, éxito y seguimiento). Solo diseño.
     Iconos como SVG en línea (vectoriales, instantáneos): no dependen de la
     fuente de emojis ni de la red → sin parpadeo/cuadros al cargar.
- L232: Código de seguimiento — la regla vive en functions/codigoSeguimiento.js, la
     MISMA que usa la etiqueta impresa (Fase 6, 11/11/2026): el código del
     WhatsApp, del seguimiento y de la etiqueta salen de un solo sitio.
- L240: El TIPO de envío de un courier: agencia · encomienda · retiro · delivery.
     Una sola regla para el formulario (al elegir) y el seguimiento (la ayuda
     y el narrador hablan según el tipo del pedido que se mira).
- L249: Name-based RETIRO/OTRAS AGENCIAS takes priority over stored configType

## cliente/form-agencias.js

- L1: cliente/form-agencias.js — el buscador de sedes (Shalom, Olva…) y elegir sede
  ==============================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── BUSCADOR DE AGENCIAS (Shalom, Olva, …) ─────────────────────────
     Una sola fuente de datos por courier: JSON local (rápido, sin red) →
     caché de localStorage (24h) → Cloud Function en vivo (respaldo). El mismo
     widget/lógica sirve para cualquier courier que esté en este mapa; agregar
     uno nuevo = una entrada más, sin tocar el resto del buscador.
- L20: meta.generado
- L22: Sin respaldo en vivo: la función agenciasShalom se retiró (el portal de
- L23: Shalom exige reCAPTCHA v3). El buscador usa solo el catálogo local, que
- L24: es rápido y funciona sin red. Ver docs/SHALOM.md.
- L42: por courier: catálogo normalizado
- L43: por courier: últimos resultados mostrados
- L44: por courier: agencia elegida (objeto completo)
- L51: ★ VERSIÓN DEL CATÁLOGO (`cfg.version`) = fecha de `meta.generado` del
       JSON. Al actualizar data/agencias-shalom.json se cambia allí y en
       config.js (SHALOM_CATALOGO_V); una prueba exige que coincidan. Sin esto,
       un navegador que ya tenía la lista la seguía usando hasta 24 h.
- L56: 1. Intentar cache localStorage (24h) — y de la MISMA versión del catálogo.
- L66: 2. Intentar JSON local ./data/agencias-<courier>.json
- L68: `?v=`: que el navegador no sirva la copia vieja del archivo.
- L84: 3. Fallback: Cloud Function en vivo (solo si el courier la tiene; Shalom ya
- L85: no — se queda con el catálogo local cargado arriba).
- L109: La lupa late solo mientras el cliente aún no busca ni elige.
- L119: Escribir para buscar OTRA sede deshace la elección ENTERA. Antes solo se
       vaciaba la dirección y la lista habría seguido marcando «Seleccionada»
       una sede que el pedido ya no tenía.
- L126: el cliente escribió: invalida cualquier "cerca de mí" en curso
- L133: Buscador vacío: vuelve la lista por cercanía, si había desde dónde medir.
- L140: Sin filtro: vuelve la vista de todo el Perú, con pines NO tocables.
- L150: Distancia en km entre dos coordenadas (haversine, client-side).
- L157: ═══ ELEGIR SEDE: ubicación, mapa y lista (31/10/2026) ════════════════
     UNA VERDAD: la LISTA (_agCache[key]). Todo lo demás solo decide QUÉ
     lista se ve:
       · «Usar mi ubicación» → las más cercanas a ti;
       · tocar el mapa       → nada (sin filtro avisa los dos caminos);
       · escribir            → las que coinciden;
       · tocar un pin        → esa sede, elegida, ARRIBA de la lista.
     Elegir es UNA puerta (_agElegir), venga de un pin o de una fila: dos
     caminos serían dos maneras de perder el ter_id que necesita el registro
     en Shalom. Si algo falla (permiso, red, mapa), lo demás sigue. Cero
     lecturas en la nube: catálogo local y distancias en el teléfono.
- L168: invalida resultados tardíos si el cliente ya escribió
- L169: guard doble-toque
- L170: {la, lo, tipo:'tu'|'sede'} desde dónde se mide
- L171: clave de la sede elegida (ter_id, o nombre+dirección)
- L172: cuántas sedes cercanas se listan
- L174: Lógica PURA de la lista (sin DOM): se prueba sola.
- L183: fuera de Perú = dato malo
- L186: «LIMA / LIMA / CARABAYLLO / AV JOSE SACO ROJAS» → «Shalom Carabayllo
       (Av Jose Saco Rojas)». Olva («TIENDA CHACHAPOYAS - JR…») queda tal cual,
       en minúsculas bonitas.
- L203: Las `n` más cercanas a un punto, con su distancia. Las que no tienen
       coordenadas no entran (no se puede decir que estén cerca).
- L211: La elegida, PRIMERA. Si no estaba en la lista, se añade arriba.
- L227: Al llegar al paso: el mapa con TODAS las sedes (para tocar tu zona), y si
     el cliente YA había dado permiso de ubicación, se ubica solo, sin
     preguntar nada. Nunca se pide permiso sin que el cliente toque algo.
- L232: volvió al paso: su sede sigue arriba
- L243: El paso de la sede se pinta al elegir el courier (paso 1), pero se VE en
     el paso 3. Iniciarlo entonces dibujaría el mapa en un contenedor oculto
     —Leaflet lo mide en cero y sale gris al aparecer— y se miraría la
     ubicación fuera de contexto. Se espera a que el paso esté en pantalla.
- L264: Estado del botón principal: el texto dice lo que GANA el cliente.
- L265: UN texto para los dos botones
- L272: Si no se pudo ubicar: se dice QUÉ hacer, sin callejón sin salida.
- L273: La ubicación no llegó. Mensaje amable y DOS salidas concretas, distinto
     según la CAUSA (30/10/2026). Hay dos interruptores que el celular confunde:
       · 'sitio'  → Chrome tiene la página bloqueada (🔒 › Permisos). La página
                    NO puede volver a preguntar: solo el cliente lo cambia.
       · 'gps'    → el permiso está, pero el celular tiene la ubicación apagada.
       · 'pregunta' → cerró el aviso del navegador sin responder.
     Antes salía el MISMO texto para todo, y al reintentar se repintaba igual:
     parecía que el botón no hacía nada.

## cliente/form-arranque.js

- L1: cliente/form-arranque.js — lo que llaman los botones (window.X), efectos al tocar y el ARRANQUE
  ================================================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── EXPOSE GLOBALS ──────────────────────────────────────────────
- L13: Movidos aquí desde su módulo (Fase 5): se asignan cuando YA existen
     todas las funciones, sin importar en qué módulo viven.
- L47: Dirección de entrega — una sola verdad (el textarea)
- L54: ★ Funciones que faltaban exponer (por eso sus onclick no funcionaban)
- L63: ★ «ESTOY ENCIMA» (.tocando) — el efecto SIGUE al puntero en todos los
     dispositivos (30/10/2026):
       · mouse / lápiz: se marca la tarjeta por la que pasa y se quita al salir;
       · dedo: se marca la tarjeta que está JUSTO DEBAJO del dedo y va
         cambiando mientras se desliza (como el mouse en PC). Se usan los
         eventos de toque (touchmove), que siguen llegando aunque la pantalla
         se esté desplazando — los de puntero se cortan al empezar el scroll.
         Una consulta por cuadro (requestAnimationFrame). Al soltar se queda
         0,26 s para que se vea.
     Deslizar ilumina pero NO elige: solo un toque genera el clic.
- L83: ── Dedo
- L88: En el hueco entre dos tarjetas no hay ninguna debajo: se queda la
- L89: última (sin parpadeo) hasta que el dedo llegue a otra o se suelte.
- L101: ── Mouse y lápiz (con respaldo para navegadores sin PointerEvent)
- L103: Tras un toque, algunos equipos (laptops táctiles) emiten un «mouse»
- L104: fantasma en la misma posición: se ignora un instante.
- L123: iOS Safari solo aplica :active (el «hundirse» al tocar) si hay un oyente
- L124: de toque en la página. Pasivo: no frena el scroll.
- L127: Arranque AL FINAL: todo lo de arriba ya existe (ver INIT).

## cliente/form-asistente.js

- L1: cliente/form-asistente.js — el asistente paso a paso
  =====================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── ASISTENTE PASO A PASO (solo presentación) ──────────────────────
     El formulario se muestra por pasos para que sea más rápido de llenar y
     nada tape a nada. NO cambia la validación ni el envío: submitOrder()
     sigue siendo el guardián final. Cada "Continuar" reusa las MISMAS reglas
     para no dejar avanzar con errores. Todo va en try/catch: si algo fallara,
     el formulario sigue funcionando.
- L19: ★ UN SOLO ENVÍO CONFIGURADO (30/10/2026): preguntar «¿Cómo quieres
     recibir tu pedido?» con una sola respuesta es un paso de más. Se elige
     solo, se salta el paso 1 y arriba se dice cuál es. Con 2 o más, igual
     que siempre. Lo decide renderForm con la lista ya filtrada por la
     configuración (o por la «foto» del link personalizado).
- L29: ESPACIO ENTRE LA BARRA DE PROGRESO Y EL PASO. Su UNICO dueño es
- L30: .wz-progress: es el bloque cuyo trabajo es encabezar el paso, asi que le
- L31: toca declarar cuanto aire deja debajo. Antes tambien lo declaraba
- L32: .agc-box (margin-top:14px) y los dos margenes se FUNDIAN —ganaba el
- L33: mayor—, asi que tocar uno solo no hacia nada. Ese margin-top se quito por
- L34: redundante: .agc-box es siempre el primer hijo de su paso.
- L35: El colapso de margenes se DEJA a proposito: hace que el hueco sea el mayor
- L36: de lo que pida cada lado, asi un bloque que necesite mas aire (Retiro en
- L37: tienda pide 18px) lo conserva sin tener que listarlo aqui.
- L59: Valida SOLO los campos del paso, con las mismas reglas que submitOrder.
- L62: ⚠️ EL ORDEN DE ESTOS BLOQUES SIGUE AL DE LA PANTALLA, SIEMPRE.
       El 15/10/2026 el courier paso a ser el paso 1 y los datos el 2, y estos
       dos cuerpos se intercambiaron con ellos. Las reglas no cambiaron ni una
       coma: lo unico que se movio es a que numero responden.
       Si un dia vuelven a moverse los pasos y esto no se mueve, el asistente
       validaria la pantalla equivocada y dejaria pasar un formulario vacio
       sin decir nada. Hay una prueba que compara los dos ordenes.
- L73: Se valida en el MISMO orden en que se ve. No cambia el resultado
         —`_wzErr` marca todos los campos malos a la vez, no se para en el
         primero— pero leer la validación en otro orden que el formulario es
         cómo se olvida un campo el día que se añade uno.
- L77: DNI OBLIGATORIO (8 dígitos) para todos — coincide con el "*" del campo.
- L102: misma fuente que submitOrder y la etiqueta
- L116: Enfoca el primer campo de texto VISIBLE del paso activo (si lo hay) para que
- L117: salga el teclado y parpadee el cursor. DEBE llamarse dentro del gesto del
- L118: usuario (toque) para que iOS abra el teclado. Devuelve true si enfocó algo.
- L119: En pasos sin campo de texto (courier, fecha, delivery antes de elegir modo,
- L120: retiro) no enfoca nada → el paso sube al inicio como antes.
- L125: Campos marcados a propósito con data-wz-focus (buscador Shalom, agencia
- L126: manual OLVA, ciudad de Otras Agencias). Evita enfocar por error un campo
- L127: secundario (ej. DNI en la cascada, o Referencia en delivery) o un select.
- L131: dentro del gesto → abre el teclado; el navegador ya sube el campo
- L132: Red de seguridad: recentra el campo sobre el teclado tras su animación,
- L133: por si algún navegador no lo subió solo (que no lo tape el teclado).
- L140: «← Atrás» no aparece en el primer paso: no hay a dónde volver.
- L145: Paso de la sede CON mapa (no el manual de Olva): la etiqueta se oculta.
- L157: muestra los errores y no avanza
- L159: doFocus=true: enfoca el primer campo del paso siguiente. wzNext se llama
- L160: dentro del gesto (botón "Continuar" o toque del courier), así el teclado
- L161: abre también en iPhone.
- L170: el form no está en modo asistente
- L173: Enter avanza en los campos de texto del paso 1 (avance "mixto")
- L177: Auto-avance al elegir courier (elección clara → siguiente paso). INMEDIATO
- L178: y dentro del gesto (pickCourier→dispatch change): sin setTimeout, para que
- L179: al enfocar el primer campo del paso 3 el teclado abra también en iPhone.
- L180: onCourierChange (onchange inline) ya corrió antes y dejó visible el bloque
- L181: correcto (agencia/otras/delivery), así que wzFocusFirst enfoca el campo justo.
- L182: Un solo envío: se elige ANTES de escuchar el cambio (sin auto-avance ni
- L183: teclado al abrir) y se empieza en el paso 2.
- L187: El courier es el paso 1 desde el 15/10/2026 (antes el 2).
- L192: nunca romper el formulario

## cliente/form-base.js

- L1: cliente/form-base.js — estado, arranque (init), link de registro, configuración, ayuda y la pantalla del formulario
  ====================================================================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── GLOBAL STATE ────────────────────────────────────────────────
- L17: ★ Exponer selDate globalmente desde el inicio para evitar ReferenceError
- L36: ─── INIT ──────────────────────────────────────────────────────────
     ⚠️ Se DECLARA aquí y se LLAMA al final del script (30/10/2026). Antes
     corría en este punto, cuando aún no existían los `let`/`const` de más
     abajo: así nació el «Iniciando fábrica…» colgado (TDZ). Llamarla al
     final cierra esa familia de fallos entera, no solo el caso que se vio.
- L42: El seguimiento (?seg=) ya se redirigió a seguimiento.html en el <head>.
- L44: Link de registro con token de prefill (?t=TOKEN)
- L48: Fallback: localStorage (último pedido en este dispositivo)
- L60: ─── TOKEN CHECK (link de registro) ───────────────────────────────
- L78: Válido — mostrar form con prefill
- L83: La foto de configuración de ESTE link, tal como la guardó el panel en
         el token. Manda sobre la de la URL: la URL la puede editar el cliente,
         el token no. Los tokens viejos no la traen y se sigue con la URL.
- L103: pantalla final de link → ocultar loader
- L106: El id de la foto que trae el TOKEN. Vacío si el link es viejo o no hay
     token: entonces se usa el de la URL, como siempre.
- L121: Sin snapshot, snapshot fallido, o snapshot sin teléfono del negocio →
- L122: completar con la config en vivo. Garantiza el botón de WhatsApp.
- L138: Config resuelta (o timeout) y form renderizado → recién ahora ocultar el
- L139: loader, cubriendo el doble-render por debajo (sin flash ni spinner básico).
- L144: Lo que dice Toby y los pasos, según el estado. PURA: se prueba sola.
- L219: Emoji representativo según el courier (íconos sin imágenes externas)
- L232: Ícono SVG por tipo de entrega para las tarjetas de courier. Vectorial:
     nítido, instantáneo, sin depender de la fuente de emojis (sin parpadeo).
- L246: Datos del negocio para la etiqueta viva (REMITENTE). Se lee del mismo CFG.
- L254: Couriers: usar config de Firebase o defaults de tu app
- L260: Orden por prioridad para el cliente (solo presentación; no toca lógica).
- L266: Otras Agencias
- L291: Tarjetas de courier VISIBLES (el cliente elige de un vistazo). El <select>
- L292: #f_courier queda oculto como fuente de la verdad: las tarjetas solo lo
- L293: escriben y disparan 'change' → misma lógica de siempre.
- L479: Pre-fill from token
- L483: Asistente paso a paso (solo presentación; no cambia la lógica)

## cliente/form-courier.js

- L1: cliente/form-courier.js — elegir cómo recibir el pedido
  ========================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── COURIER SELECTION ───────────────────────────────────────────
- L13: Tocar una tarjeta: escribe en el <select> oculto y dispara 'change'
- L14: (misma lógica de siempre + auto-avance del asistente). Solo diseño.
- L30: El formulario "publica" el tipo de courier para las capas de presentación
- L31: (boleta / narrador), que así no dependen de la visibilidad de los campos.
- L56: Siempre: la propia función decide (solo aplica a delivery con dirección
- L57: previa). Llamarla en TODOS los casos evita dejar el atajo montado al
- L58: cambiar a agencia/retiro — invisible por el padre, pero estado sucio.
- L60: Tarjeta visual con el ícono del courier elegido
- L69: Una línea (solo existe con un único envío): cómo le llegará, sin preguntar.
- L72: Sin repetir: «RETIRO EN TIENDA · Retiro en tienda» dice lo mismo dos veces.
- L81: Atajo del cliente recurrente: NO es otro modo — solo rellena el mismo
     cuadro de dirección. Por eso no hay estado "known" ni pantalla de
     confirmación que haya que deshacer.
- L122: ★ Couriers con catálogo propio (Shalom, Olva): un solo buscador dinámico,
- L123: la fuente de datos cambia según el courier (AGENCY_SOURCES). Agregar un
- L124: courier nuevo con catálogo = una entrada más ahí, nada se duplica aquí.
- L192: ★ Agencias sin catálogo propio: entrada manual (el selector antiguo por
- L193: departamento se retiró el 30/10/2026: Shalom y Olva usan el buscador).
- L212: Entrada manual de agencia (OLVA y agencias sin base de datos)

## cliente/form-datos.js

- L1: cliente/form-datos.js — teléfono, DNI → nombre, y la regla del nombre
  ======================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── NORMALIZACIÓN DE TELÉFONO (misma regla del panel) ──────────────
     Borra no-dígitos, quita el prefijo Perú (+51) si sobra y corta a 9. Se aplica
     por delegación a cualquier input con clase "phone-norm" (aquí: f_phone). Corre
     en captura, ANTES del oninput inline, así onPhoneInput recibe el valor ya
     limpio y pegar "+51 984..." deja de romper la validación de 9 dígitos.
- L23: Contador vivo de Notas. Tope 600 = mismo límite que el servidor (formApi),
     así el cliente NUNCA envía algo que el servidor recorte en silencio.
- L40: ─── PHONE DETECTION ──────────────────────────────────────────────
- L51: El link va con el celular: solo si el link personalizado es de ESE
           número el servidor devuelve nombre completo y dirección. Si no,
           solo el primer nombre (sin fuga de datos por celular).
- L69: ★ EL DNI RELLENA EL NOMBRE — 15/10/2026.
     Lo pidio el dueño, y para el negocio es claro: un nombre escrito a mano
     llega con faltas, sin tildes o con el apellido delante, y eso es justo lo
     que Shalom rechaza al registrar el envio.
  
     Automatico y no con un boton: el dueño lo pidio asi («al poner dni
     consulte reniec»), y un boton mas es una cosa mas que explicar en una
     pantalla que ya tiene cuatro pasos.
  
     ⚠️ LO QUE ESCRIBIO EL CLIENTE NO SE PISA. Se rellena si el campo esta
     vacio, o si lo que hay lo puso una consulta anterior. Si el cliente
     corrigio su nombre a mano —se llama distinto a lo que dice su documento,
     o usa su nombre de siempre— eso es SUYO y manda. Un formulario que
     deshace lo que acabas de escribir es un formulario del que te vas.
  
     ⚠️ Y SI EL DNI CAMBIA, EL NOMBRE AUTOMATICO SE BORRA. Un nombre pegado a
     otro documento es el nombre de otra persona, y de ahi sale una etiqueta
     con el DNI de uno y el nombre de otro — que ya paso una vez en el panel,
     por otro camino.
- L90: Comparar nombres como los escribe la gente: sin tildes, sin dobles
     espacios y sin importar mayusculas. «Jose  Lino» y «JOSÉ LINO» son la
     misma persona, y marcarlas como distintas seria dar un aviso de
     discrepancia donde no hay ninguna — el aviso que se da de mas es el que
     nadie lee cuando de verdad importa.
- L99: ¿Lo escrito es una versión corta del nombre oficial? («Jarlyn Llanos»
     frente a «JARLYN LLANOS ARTEAGA»): todas sus palabras están en el DNI.
- L105: ★ EL NOMBRE EMPIEZA CON LETRA (30/10/2026). Números o símbolos AL INICIO
     se quitan mientras escribe (o al pegar «123Juan» → «Juan»); después de la
     primera letra se permite lo demás. Para seguir: al menos 2 letras.
- L115: escribe el cliente: manda él
- L125: ★ LA MARCA DEL NOMBRE — se recalcula, nunca se recuerda (30/10/2026).
       · coincide → el campo se ilumina en verde con su ✓ y «✓ Nombre según tu
         DNI» (sin repetir el nombre: está en su campo);
       · NO coincide → una SUGERENCIA, no una alarma: el nombre del DNI y un
         botón grande para usarlo; mantener el propio es un enlace pequeño
         (lo correcto es lo más fácil). Si se parece, «Completa tu nombre»;
       · eligió mantener el suyo → una línea discreta, por si cambia de idea.
- L163: El nombre «aparece» letra por letra (≈0,4 s), el campo se ilumina y suena
     el ding. Con «reducir movimiento», de golpe.
- L180: «Ding»: dos notas suaves (<0,2 s) hechas por el navegador (sin descargar
     nada). UNA vez por DNI, nunca con la página en segundo plano.
- L204: ★ REINTENTAR CON CABEZA (30/10/2026). Una falla TEMPORAL (Shalom lento,
     App Check que no llegó, «demasiadas») ya no es «No encontramos ese DNI»:
     se reintenta solo hasta 2 veces (~1,2 s y ~2,5 s, con algo de azar para no
     chocar con otros). «No encontrado», el tope diario o un DNI inválido no se
     insisten. Si el cliente cambia el DNI a mitad, se abandona. Mismo criterio
     de «temporal» que el servidor (functions/reniecPublico.js).
- L215: cambió el DNI: se abandona
- L218: no se insiste
- L222: Mensaje según la CAUSA, con [Reintentar] cuando tiene sentido.
- L232: ★ EL DNI RELLENA EL NOMBRE — 15/10/2026 (animado el 30/10/2026).
     ⚠️ LO QUE ESCRIBIO EL CLIENTE NO SE PISA: se rellena solo si el campo
     esta vacio; si hay algo distinto, se SUGIERE (ver _dniMarca).
     ⚠️ Y SI EL DNI CAMBIA, EL NOMBRE AUTOMATICO SE BORRA: un nombre pegado a
     otro documento es el nombre de otra persona.
     Mientras consulta: el campo «escanea» y dice «Buscando en RENIEC…».
- L244: El nombre que puso el DNI (completo o a medio aparecer) se va con él.
- L262: Nunca se bloquea el pedido: se dice la causa y el cliente escribe
           su nombre completo (o reintenta).
- L274: aparece, se ilumina y suena
- L277: había un nombre: coincide o se sugiere
- L288: Con solo el primer nombre (`parcial`) no se rellena: un nombre a medias
- L289: en una etiqueta de envío es peor que el campo vacío.

## cliente/form-delivery.js

- L1: cliente/form-delivery.js — delivery: dirección, punto en el mapa y enlace de mapa
  ==================================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── DIRECCIÓN DE ENTREGA — UNA SOLA VERDAD ─────────────────────────
     El textarea #addrManualInput ES la dirección: no hay "modos" ni copias.
     · El botón de ubicación RELLENA ese mismo cuadro (si está vacío) y adjunta
       las coordenadas; el texto del cliente siempre manda.
     · Las coordenadas viven aparte y SOBREVIVEN a la edición del texto — antes
       se borraban al corregir, que es justo cuando el cliente está precisando
       su dirección. Se ven en el mapa de delivery, que él puede quitar.
     La usan submitOrder, el validador del asistente y la etiqueta viva.
- L25: Al escribir: si ya hay texto, se limpia el error. Único punto de validación.
- L37: Navegador in-app (webview) donde la geolocalización suele bloquearse.
- L42: Adquisición robusta y REUTILIZABLE de ubicación. Pre-chequea el permiso (para
- L43: no fallar en silencio cuando está denegado) y hace DOS etapas: alta precisión
- L44: y, si falla por timeout/no-disponible, baja precisión (wifi/celda). Nunca se
- L45: cuelga (timeouts) y siempre resuelve por onOk o onErr.
- L46: onErr(codigo) con codigo: 'denegado' | 'no_soporta' | 'inseguro' | 'fallo'.
- L47: opc.rapida: UNA petición de baja precisión (wifi/antena), máx. 8 s, y vale
- L48: una posición de los últimos 5 min. Para elegir una agencia (km) sobra; el
- L49: GPS fino es para el delivery, que llama sin opciones y sigue igual.
- L72: timeout / no disponible → reintento en baja precisión
- L75: Pre-chequeo de permiso (si la API existe): denegado → no llamar, guiar.
- L85: ═══ DELIVERY: la ubicación de la PUERTA (30/10/2026) ═══════════════════
     Misma tubería que las sedes (_ubicNativo, _ubicMensaje…), con precisión
     fina, y un mapa para VER y CORREGIR el punto: un GPS en interiores falla
     ±200 m y eso manda al motorizado a otra cuadra.
       · con ubicación → vista previa + «¿Es aquí tu casa?» [Sí] [Ajustar];
         si la precisión es mala (>100 m), se abre el ajuste;
       · sin ubicación → mensaje por causa + «marca tu casa en el mapa»;
       · el cuadro de dirección sigue siendo LA dirección: el punto la
         acompaña (gpsCoords), y solo se sugiere texto si está vacío.
     Nunca se pone un punto sin un toque del cliente.
- L96: centro por defecto si no hay punto
- L98: El botón de siempre (navegadores sin el nativo).
- L112: El nativo, conectado UNA vez a la tubería compartida.
- L116: La pista «Agrega el número» se va cuando ESCRIBE el cliente (solo
- L117: eventos reales: rellenar por código no dispara 'input').
- L133: MISMA pantalla en celular y PC (30/10/2026): nada se abre solo. Antes,
       con más de 100 m de error (la PC por wifi da ±110) se abría el ajuste
       y salía un aviso amarillo; en el celular (GPS) no — el mismo link se
       veía distinto. Ajustar es siempre decisión del cliente.
- L145: segundo intento sin suerte: al cuadro de dirección
- L150: ═══ LOS DATOS DE DELIVERY: DOS COSAS, CADA UNA EN SU SITIO ════════════
       · La DIRECCIÓN escrita (#addrManualInput) — obligatoria; es lo que van
         a leer la etiqueta, el WhatsApp y el panel (order.address).
       · El PUNTO en el mapa (_gpsLat/_gpsLon → order.gpsCoords) — opcional;
         es el enlace de Google Maps del WhatsApp.
     Se ayudan, nunca se pisan:
       · con punto, la dirección se LLENA SOLA (ver _dlvSugerirDireccion) y
         sigue al punto mientras el cliente no la toque;
       · lo que escribe el cliente es suyo: el punto ya no lo cambia ni lo borra;
       · número, Mz/Lt y referencia: opcionales, sugeridos en gris.
- L161: dirección ya consultada por punto (no repetir consultas)
- L163: EL punto de entrega: una sola función lo pone, venga del GPS o del ajuste.
- L176: El texto que puso el punto se va con el punto; el del cliente se queda.
- L189: La respuesta de OpenStreetMap → {calle, numero, zona}.
- L199: UNA consulta por punto (recordada), solo con el punto que sigue vigente:
     lo que pide el servicio gratuito de OpenStreetMap.
- L201: ★ CON PUNTO, LA DIRECCIÓN SE LLENA SOLA (30/10/2026). El punto ya es la
     ubicación exacta (va en el enlace del WhatsApp): el texto es la ayuda
     para leerla y NO debe frenar al cliente. Se escribe lo mejor que haya
     —calle + barrio, o solo barrio, o «Punto marcado en el mapa» si el
     servicio no responde— y ese texto SIGUE al punto mientras el cliente no
     lo toque (_dlvTextoAuto). Apenas escribe algo, el texto es suyo.
- L216: ya es otro punto
- L219: lo escrito por el cliente manda
- L225: zoom=17: nivel de CALLE (trae la avenida más cercana, no solo el barrio).
- L229: el cliente nunca queda bloqueado
- L232: ── EL mapa de delivery: uno, creado una vez, con dos modos ──
- L260: MIRAR: el pin fijo en el punto (no se toca).
- L275: Cambiar de modo: lo único que cambia es quién manda sobre el mapa.
- L282: el aviso de «mirar» no sigue encima
- L292: En AJUSTAR solo se ve el pin del centro: el del punto y su círculo se ocultan.
- L299: «◎ Volver a mi punto» aparece si la vista se alejó del punto.
- L313: «¿Es aquí tu casa?» → [Sí] [Ajustar]; confirmado → «¡Listo!».
- L336: AJUSTAR: SOLO desde su botón (o «marca tu casa» sin ubicación). Sin
     punto previo, empieza en Lima. Cancelar deja todo como estaba.
- L369: ★ ENLACE DE MAPA — UNA forma para todo el formulario: el formato oficial
     de Google Maps URLs (abre la app en Android/iPhone y la web en PC; gratis,
     sin clave; la coma va codificada). 6 decimales ≈ 10 cm. Coordenadas raras
     o fuera del Perú → sin enlace. Lo usan el chip «Ver mapa» y el WhatsApp.

## cliente/form-enviar.js

- L1: cliente/form-enviar.js — confirmar el pedido, el WhatsApp y la confirmación en el sitio
  ========================================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── SUBMIT ──────────────────────────────────────────────────────
- L13: ─── Mensaje de WhatsApp (centralizado y mejorado) ────────────────
- L14: Construye el texto del pedido para WhatsApp con mejor formato.
- L23: ★ La PUERTA, tocable: solo en delivery y solo si el cliente dio o
       confirmó su punto. Sale de order.gpsCoords — lo MISMO que guarda el
       pedido: el panel y el WhatsApp no pueden decir dos cosas distintas.
- L28: DNI: fuente única = order.dni (llega en todos los couriers). La etiqueta
- L29: solo cambia el matiz según el tipo de envío.
- L36: N° de factura/boleta: lo puso la tienda en el link y lo devuelve el
       servidor al crear el pedido (el cliente no lo escribe). Solo letras,
       números y guion — ya viene limpio, pero se vuelve a filtrar.
- L44: no hay dirección del cliente: decirlo, no «—»
- L47: Mensaje con formato mejorado (negritas de WhatsApp con *, secciones claras)
- L56: Con factura/boleta, ESE es el código: sale solo él. Sin ella, el
         código de seguimiento de siempre.
- L67: Con número del negocio → mensaje directo al negocio.
- L68: Sin número (caso extremo) → abre WhatsApp con el mensaje listo para enviar.
- L91: Validación de agencia: si es OLVA/manual, leer directo del campo (robusto)
- L94: Modo manual (OLVA): tomar lo escrito directamente
- L96: sincronizar por si acaso
- L110: DNI (paso 1): obligatorio para todos (8 dígitos) — red de seguridad.
- L117: Encomienda: validate ciudad
- L138: fuente única (misma que usa la boleta)
- L147: DNI único del paso 1
- L153: Dirección final: para agencia usar la dirección de la agencia, para delivery usar la del cliente
- L156: la dirección de la agencia va en address
- L162: La identificación sobrevive solo si la dirección final es literalmente
       la que puso el selector. Se compara el TEXTO y no se confía en eventos:
       entre elegir y enviar puede haber pasado un cambio de courier, una
       edición a mano o un relleno automático, y cualquiera de los tres deja el
       id apuntando a otra agencia. Misma regla que el panel.
- L206: sin telón: el botón avanza y la etiqueta «se imprime»
- L209: Crear el pedido vía Cloud Function (el público ya no escribe Firestore directo)
- L218: id real asignado por el servidor
- L223: La «impresión» se ve al menos 0,9 s: si el servidor responde al
- L224: instante, el sello no cae antes de que se entienda qué pasa.
- L234: ─── CONFIRMACIÓN EN EL SITIO (30/10/2026) ───────────────────────────
     Sin telón ni cambio de pantalla. El pedido YA se registró (llega al
     panel); aquí se celebra y se lleva al cliente a WhatsApp:
       1. mientras registra: el botón avanza y la etiqueta «se imprime»;
       2. al responder: los pasos se recogen, cae el sello «✓ REGISTRADO»
          con el código, confeti breve y vibración — el PICO (regla del pico
          y el final: es lo que se recuerda);
       3. abajo, WhatsApp con la verdad: barra «falta 1 toque», la burbuja
          con lo que se va a enviar (sin sorpresas) y el beneficio real (el
          link de seguimiento). Si vuelve sin enviarlo, se le recuerda; si lo
          tocó, «¿Ya lo enviaste?».
     ⚠️ Nada de mentir: el pedido está registrado aunque no envíe WhatsApp, y
     no hay contadores falsos ni bloqueos.
- L260: El sello y el confeti: el momento que se recuerda.
- L288: detiene la actualización de la etiqueta
- L289: Ocultar los inputs del formulario (todos los pasos + la barra de progreso)
- L308: 06/11/2026: sin la burbuja (repetía lo que ya dice la etiqueta de
       arriba). La señal del dedo «👆» sale YA, apenas cae el sello: es el
       siguiente paso y no hay por qué esperar. Si en 25 s no lo tocó, el
       botón vuelve a llamar (una vez).
- L313: 06/11/2026: primero el sello, la meta y el botón; lo amarillo entra
       1 s DESPUÉS. Algo que aparece a destiempo atrae la vista justo cuando
       el cliente ya leyó «registrado» y busca qué sigue. El primer mensaje es
       de META CERCANA («solo falta este paso»: lo casi terminado se termina);
       el recordatorio (25 s o al volver sin enviarlo) es de PÉRDIDA (sin
       enviarlo no hay link). Las dos cosas son ciertas.
- L322: Tocó «Enviar por WhatsApp».
- L324: Recordatorio honesto: sin enviarlo no le llega su link.
- L336: Volvió de WhatsApp (o de otra app): si lo tocó, «¿Ya lo enviaste?»;
     si no, el recordatorio.

## cliente/form-fecha.js

- L1: cliente/form-fecha.js — los días de envío
  ==========================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ─── DATE CHIPS ──────────────────────────────────────────────────
- L52: Solo un toque REAL del cliente anima y vibra: el formulario preelige la
       primera fecha con un clic del programa (isTrusted=false).
- L61: ★ La decisión, dicha con todas sus palabras («sale el martes 3 de
       noviembre»): quita la duda de haber tocado el día equivocado.
- L72: Microinteracciones compartidas (fecha y sede).
- L75: Vibración corta SOLO al elegir (no en cada toque). Android; iPhone no la tiene.

## cliente/form-sedes-mapa.js

- L1: cliente/form-sedes-mapa.js — el mapa de sedes y elegir una (fila o pin)
  ========================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ★ EL MAPA NO FILTRA (30/10/2026). Antes, tocar un punto vacío listaba
     las sedes de esa zona: un toque sin querer (o en la vista de todo el
     Perú) mandaba al cliente a otra ciudad. Ahora los filtros salen SOLO de
     dos caminos: su ubicación o la lupa. Tocar el mapa sin filtro avisa
     cuáles son, sin mover nada.
- L43: 1. Buscar en cache local
- L48: POR PALABRAS, no por frase literal. Antes se buscaba la consulta entera
- L49: como una sola cadena, asi que "Lima Miraflores" daba CERO: en el texto
- L50: pone "lima / lima / miraflores" y esas dos palabras nunca van seguidas.
- L51: Y "san juan lurigancho" tampoco, porque el nombre real lleva un "de" en
- L52: medio. Con palabras sueltas el orden da igual y los conectores sobran.
- L53: Se descartan las de 1 letra (harian coincidir todo); si no queda
- L54: ninguna, se usa la consulta entera como una sola palabra.
- L59: coincide por nombre/ubicación (prioritario)
- L60: coincide solo por dirección (relleno)
- L65: Con UNA sola palabra estos tres niveles dan exactamente el mismo
- L66: resultado que la version anterior: las busquedas de una palabra no
- L67: cambian en nada.
- L68: empieza con lo buscado, tal cual
- L69: cada palabra empieza una palabra
- L70: todas, en nombre/ubicación
- L78: Tope 40: cubre cualquier departamento salvo Lima (186). El dropdown scrollea.
- L80: Relleno por dirección solo si falta para llenar, CON GUARDA:
- L81: - si hay coincidencias por ubicación → solo del MISMO departamento (no mezcla zonas).
- L82: - si NO hay ninguna (búsqueda por landmark/dirección pura) → permite todas
- L83: (si no, devolvería 0 y rompería ese caso).
- L89: Aviso solo cuando hay MUCHAS por ubicación (caso Lima): guiar a afinar.
- L93: 2. Si no hay resultados, consultar API (Shalom ya no la tiene → se omite)
- L132: La elegida, SIEMPRE arriba (aunque una búsqueda o un toque cambie el resto).
- L135: ★ ELEGIDA = LISTA RECOGIDA (30/10/2026): queda solo «✓ Tu sede» y un
       «Cambiar sede». Así no se toca otra al desplazarse, y ver SU sede fija
       refuerza la decisión. «Cambiar» la vuelve a abrir.
- L139: Distancias desde el punto de referencia, si lo hay y la sede no la trae.
- L152: El nombre ya está en la tarjeta de abajo: el encabezado solo celebra.
- L169: El momento de elegir es un pequeño pico (regla del pico y el final).
- L176: true SOLO justo después de que el cliente elige
- L182: ★ CONTINUAR DICE EN QUÉ ESTADO ESTÁS (30/10/2026): sin sede, apagado y
     «Elige una sede para continuar»; con sede, «Continuar con esta sede →».
     Solo en el paso de la sede con mapa; en lo demás, el de siempre.
- L196: Gradiente de meta: con la sede elegida la barra avanza un poco más y
       dice «¡Ya casi!». Sin sede vuelve a su sitio.
- L210: Tocó Continuar sin sede: en vez de un error rojo, se le lleva a los dos
     caminos (ubicación y lupa), iluminados. Sin teclado: elige él.
- L220: ─── EL MAPA DE SEDES ──────────────────────────────────────────────────
     ⚠️ EL MAPA NO ES OTRA FORMA DE ELEGIR: tocar un pin pasa por la MISMA
     puerta que tocar una fila (_agElegir). Pines ROJOS dibujados aquí (sin
     descargar imágenes); tu ubicación es un PUNTO azul que no se puede tocar.
  
     ⚠️ Y LA LISTA MANDA. El mapa solo aparece si Leaflet carga y hay
     coordenadas. Las sedes sin coordenadas (19 en Shalom) salen en la lista y
     se eligen igual. Si el CDN está caído, el formulario funciona igual.
  
     En la PC se arrastra con el mouse (dragging) y la rueda hace zoom SOLO
     tras hacer clic dentro del mapa: si no, la rueda atraparía la página.
  
     No cuesta ni una llamada: `latitud` y `longitud` ya venían en el
     catálogo local, cacheado con su versión.
- L236: Carga Leaflet UNA vez y solo cuando hace falta (perezoso: quien pide a
      domicilio no llega a este paso).
- L250: sin mapa, con lista
- L260: Fuera de Perú es un dato malo, no una sede lejana: un cero o un signo
- L261: cambiado mandaría el mapa al Atlántico y escondería todo lo demás.
- L266: Celular: con UN dedo sobre un mapa que no se arrastra, se avisa «Usa dos
     dedos» (dos dedos mueven y acercan; un dedo desplaza la página).
- L278: Teselas de OpenStreetMap: UNA definición para todos los mapas.
- L283: El pin rojo (SVG en línea). `grande` = la elegida.
- L290: opc.todas: el mapa de bienvenida con TODAS las sedes (para tocar tu zona);
     sin él, las de la lista que se está viendo.
- L294: Se lee YA (antes del await): agMostrar baja la bandera al terminar.
- L318: ★ CELULAR: el mapa se mueve con DOS dedos (30/10/2026). Con uno,
           deslizar la página sobre el mapa movía el mapa y el cliente quedaba
           atrapado. Un dedo desplaza la página; tocar un pin sigue igual; dos
           dedos mueven y acercan. En la PC se arrastra con el mouse.
- L324: con el mouse en la PC
- L325: la rueda NO atrapa la página…
- L330: …salvo después de hacer clic en el mapa; al salir se apaga.
- L333: Tocar el mapa SIN filtro: aviso de los dos caminos, sin mover nada.
- L337: ★ PINES TOCABLES SOLO CON FILTRO (30/10/2026). En la vista de todo el
         Perú los ~540 pines se amontonan y se tocaba uno al azar. Ahí solo se
         VEN (cobertura); tocar el mapa acerca esa zona y lista sus sedes. Con
         ubicación, búsqueda o zona tocada, los pocos que quedan sí se tocan.
- L351: LA MISMA PUERTA que la lista: la sede, no un índice que cambia.
- L356: ★ DÓNDE ESTÁS TÚ — un PUNTO azul, no un pin: no se elige ni se toca.
- L359: Halo que late (CSS .ag-yo-halo) + el punto encima. Ninguno se toca.
- L376: Las 8 más cercanas encuadradas (no las 20: quedarían muy chiquitas).
- L381: El contenedor nace oculto y Leaflet mide mal lo que no se ve.
- L384: Un mapa que revienta no puede llevarse por delante el formulario.
- L389: Señalar la elegida en el mapa (lo hace agMapaPintar al repintar la lista:
     pin grande y delante). Se conservan estas dos por compatibilidad.
- L396: el mapa nunca puede romper la eleccion
- L402: Tocar una fila de la lista.
- L408: ★ LA ÚNICA PUERTA PARA ELEGIR (fila o pin). Guarda lo que el pedido
     necesita —igual que siempre— y repinta la lista con la elegida ARRIBA y
     marcada. No avanza de paso: el cliente lo ve y pulsa «Continuar» (en un
     mapa es fácil tocar un pin por error).
- L415: Solo cuando ELIGE el cliente (no al volver al paso): animación y vibración.
- L429: ★ LA AGENCIA IDENTIFICADA: sin el ter_id, registrar el envío en Shalom
       es imposible. Ver functions/agencias.js.
- L435: La lista que se ve: la actual si ya la incluía; si no (pin del mapa de
- L436: bienvenida), las cercanas a ESA sede. En las dos, la elegida arriba.
- L453: Escrita a mano no hay agencia identificada, y no se adivina.
- L463: El mapa SE QUEDA (es el que ayuda a volver a elegir); solo se cierra
- L464: el globo de la que estaba elegida.
- L472: Vaciar el TEXTO, no solo ocultarlo: la etiqueta viva lo lee con textContent,
- L473: que devuelve el texto aunque el elemento este oculto. Sin esto, al pulsar la
- L474: ✕ la etiqueta seguia mostrando la sede borrada y parecia un fallo de la app.

## cliente/form-ubicacion.js

- L1: cliente/form-ubicacion.js — la ubicación del cliente (sedes y delivery)
  ========================================================================
  Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
  (y antes, el script en línea de formulario.html), envuelto en una función.
  Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
  sí por su nombre, como el panel. El orden de los <script> es el de
  ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
- L12: ═══ UBICACIÓN COMPARTIDA: sedes (Shalom, Olva) y delivery ═══════════════
     UNA tubería para pedir la ubicación, venga del botón nativo <geolocation>
     o del de siempre: mensajes por causa, «Buscando…» visible, vigía de 15 s
     y reintento solo cuando el cliente lo arregla. Cada flujo pone su
     ALTERNATIVA (la lupa en sedes; marcar en el mapa en delivery).
- L24: ★ Si el cliente lo PERMITE desde el 🔒, se ubica solo: sin otro toque.
- L34: ★ Encendió el GPS desde el panel del celular y volvió: se reintenta UNA vez
     sola. No pide permiso nuevo: el permiso ya estaba dado.
- L41: La CAUSA, no el código del navegador. Dos interruptores que el celular
     confunde: el permiso de la página (🔒) y el GPS del teléfono.
- L48: sin API de permisos: lo más probable
- L49: permiso dado pero sin posición
- L51: Qué reintentar y cuándo: al permitir desde el 🔒 (sitio/pregunta) o al
     volver con el GPS encendido (gps).
- L57: El mensaje: la causa con su arreglo + la alternativa del flujo.
- L74: ★ EL BOTÓN NATIVO <geolocation> (Chrome 144+). Si el navegador no lo
     conoce, devuelve false y se ve el botón de siempre (va dentro). Si lo
     conoce, su toque pide la ubicación (y, si estaba bloqueada, Chrome deja
     permitirla ahí mismo) y el resultado va a `h`:
       h.inicio()  h.vigente()  h.exito(pos)  h.error(codigo, estado)
       h.invalido() → Chrome lo declaró inválido: pedir por el camino de siempre.
- L83: El toque se nota (igual que el botón de siempre): mínimo 0,7 s.
- L87: Si Chrome lo declara INVÁLIDO (tapado, recortado, estilo prohibido)
         su toque no pide nada: «no pasa nada» otra vez. Entonces se pide por
         el camino de siempre, dentro del mismo toque.
- L92: Vigía: si el navegador no responde nada en 15 s (bloqueo silencioso,
         aviso que nunca salió), no se queda en «Buscando…» para siempre.
- L109: Cerró el aviso del navegador sin responder.
- L117: ── Sedes: el fallo, con la LUPA como alternativa ──
- L126: Llevar al cliente a lo que SÍ funciona: el buscador, iluminado y con el
     cursor listo. Repetir el mismo error frustra; esto convierte el fallo en
     avance.
- L137: ⚠️ EL TECLADO TAPABA EL BUSCADOR (visto en un Android real): se subía
       ANTES de que el teclado terminara de abrirse, y al abrirse lo tapaba.
       Se vuelve a subir cuando la pantalla visible se encoge (teclado
       abierto) y, por si el navegador no avisa, a los 450 ms.
- L151: Ya falló y el navegador SIGUE con la ubicación bloqueada: a la lupa,
- L152: sin preguntar otra vez (la respuesta sería la misma).
- L157: ★ CADA TOQUE SE NOTA: «Buscando…» se ve al menos 0,7 s aunque la
       respuesta sea instantánea. Si el error vuelve en milisegundos, el
       cliente cree que el botón no hizo nada.
- L166: el cliente ya escribió: manda eso
- L174: ★ UNA SOLA TUBERÍA (30/10/2026): el botón nativo y el de siempre entregan
     aquí. Lista, mapa, mensajes por causa y el salto a la lupa son los mismos
     venga de donde venga la posición.
- L179: Fuera de Perú (VPN, dato raro): no se ordena por algo que no sirve.
- L181: No sale del navegador: solo ordena la lista y pinta tu punto.
- L193: segundo intento sin suerte: a la lupa
- L195: Sedes: el botón nativo conectado a la tubería compartida. El token es
     el de la lista: si el cliente ya escribió en la lupa, manda la lupa.
- L208: Compatibilidad: el nombre de antes sigue funcionando.

## cliente/seguimiento.js

- L1: cliente/seguimiento.js — EL SEGUIMIENTO DEL CLIENTE (seguimiento.html)
  =====================================================================
  Fase 2 (10/11/2026). Antes vivía dentro de formulario.html: quien abría
  su link de seguimiento descargaba el formulario entero. Ahora esta página
  carga solo lo suyo (+ cliente/comun.js, que comparte con el formulario).
  
  Los links viejos (`formulario.html?seg=…`) siguen abriendo: el formulario
  los redirige aquí ANTES de cargar nada.
  
  Lee 1 documento por consulta (action=track). Se refresca cada 30 s solo
  mientras la pestaña está a la vista, y nunca si el pedido está terminado.
  La clave de recojo NO llega a esta página (functions/pedidoPublico.js).
- L35: tracking renderizado → ocultar loader del form
- L38: ─── Ayuda de la vista de SEGUIMIENTO (explica los estados) ────────
- L39: ★ SEGÚN EL TIPO DE ENVÍO DE ESTE PEDIDO, con los nombres que el cliente VE
     en su pantalla (NUEVO PEDIDO, ENVIADO, LLEGÓ A DESTINO…). Antes era una
     sola ayuda con nombres inventados («Recibido», «Preparando») que no
     aparecían en ningún sitio, y le decía «ya puedes recogerlo» a un pedido
     de delivery.
     ⚠️ LA CLAVE DE RECOJO NO SE MENCIONA NUNCA: es secreta, no viaja al link
     (functions/pedidoPublico.js) y no se comparte por aquí.
     Lógica pura (sin DOM): devuelve {estados, faq} con texto YA escapado.
- L70: k: los estados del panel que caen en cada fila (para marcar «ESTÁS AQUÍ»).
- L85: ★ TOBY habla del estado REAL de este pedido (30/10/2026): lo mismo que
       dice su fila, con el saludo. Una sola verdad: la fila y Toby salen del
       mismo texto. Nunca la clave de recojo.
- L88: Ya en Shalom (10/11/2026): manda el estado de SHALOM, no la etiqueta
       del panel. `shalom` es {estado} cuando el envío tiene guía; si no, nada.
- L92: Ya en Shalom: la lista explica las etapas de SHALOM (las del bloque de
       seguimiento), no las etiquetas del panel, y marca en cuál va.
- L158: ─── TRACKING PAGE ───────────────────────────────────────────────
- L171: El auto-refresh se decide en buscarPedido: solo si el pedido NO está finalizado
- L174: ── EL SONDEO NO CORRE CON LA PESTAÑA ESCONDIDA ────────────────────────
     Esta pagina se refresca sola cada 30 s. Una pestaña olvidada en segundo
     plano hacia 2.880 peticiones al dia —una invocacion de Cloud Function y
     una lectura de Firestore cada una— para actualizar algo que nadie estaba
     mirando. Y encima comia del freno por IP: con el CGNAT de Claro y
     Movistar, las pestañas olvidadas de varios clientes podian empujar contra
     el tope a los que SI estaban mirando.
  
     Parar mientras esta escondida y actualizar al volver da exactamente el
     mismo servicio: cuando el cliente mira, el dato esta fresco.
  
     ⚠️ ESTA DECLARACION VA ANTES DE `clearTrackRefresh()`, Y NO ES ESTILO.
     La puse debajo y ROMPI EL FORMULARIO PUBLICO EN PRODUCCION. `init()`
     corre al evaluar el script y llama a `renderForm()` -> `clearTrackRefresh()`,
     que asigna esta variable. Un `let` todavia no inicializado lanza
     ReferenceError («Cannot access before initialization»), asi que el
     formulario de pedidos no pintaba nada. En la pagina de SEGUIMIENTO no se
     veia, porque alli hay un `await` antes y para entonces ya existe — por eso
     probe el seguimiento, lo vi bien, y el fallo paso.
  
     ⚠️ 30/10/2026: Y MOVERLA NO BASTABA. Lo que importa no es que esté antes
     de la FUNCIÓN, sino antes de la LLAMADA, y `init()` está mucho más arriba
     (corre al evaluar el script). Con `let`, abrir el formulario SIN link
     (sin ?t=) seguía reventando en «Iniciando fábrica…»: medido en un
     navegador real. `var` existe desde el primer instante del script.
- L210: ─── SEARCH PEDIDO (por token único, lee 1 documento) ────────────
- L225: ★ Congelar finalizados: si está entregado, no auto-refrescar ni consultar Shalom
- L231: nadie esta mirando: no se gasta nada
- L239: ⚠️ EL FRENO NO ES UN LINK ROTO, y decirselo asi al cliente lo manda a
         buscar el problema donde no esta: revisar el link, escribir por
         WhatsApp, pensar que perdio su pedido. Lo unico que pasa es que hay
         que esperar un minuto. Misma regla que `Shalom.textoMotivo()`: ningun
         motivo se calla, y ninguno miente.
         No se apaga el auto-refresco: el siguiente tiro ya pasa.
- L269: ── TRACKING SHALOM EN SEGUIMIENTO DEL CLIENTE ───────────────────
- L270: ★ COPIAR, DE VERDAD. Casi todos los clientes abren el link desde
     WhatsApp, y su navegador interno a menudo RECHAZA el portapapeles
     moderno: `writeText` devuelve una promesa que falla, y el try/catch de
     antes no la veía — decía «✓ Copiado» sin haber copiado nada. Ahora:
     moderno → si falla, el método clásico → y solo se dice «Copiado» si
     alguno funcionó. Si ninguno, se enseña el texto para copiarlo a mano.
- L305: Guía + código de Shalom, juntos y legibles para pegar en un chat o en la
     app de Shalom. Se leen de data-* del botón: nada del pedido viaja dentro
     de un onclick como código. La CLAVE DE RECOJO no está aquí ni en ningún
     lado de esta página: no viaja al link (functions/pedidoPublico.js).
- L320: Deriva la fase del recorrido a partir del estado LITERAL de Shalom.
     El estado se muestra tal cual (exacto); la fase solo define color, icono,
     posicion en el stepper y si corresponde una pildora de indicacion.
     ★ Fase 6 (11/11/2026): QUÉ etapa es lo decide functions/shalomEstado.js,
     la MISMA regla con la que el panel mueve las etiquetas. Aquí solo queda
     cómo se VE cada etapa. Antes había dos reglas y «En reparto» salía aquí
     como «en camino» con el panel ya en LLEGÓ A DESTINO.
- L345: «En reparto»: ya salió de la agencia de destino hacia el cliente.
- L359: ★ UNA SOLA REGLA, en functions/dniPedido.js. Esto leía las copias y se
       saltaba `dni`, que es el que corrige el panel: a un cliente cuyo pedido
       se hubiera corregido se le decía que fuera a la agencia con el
       documento VIEJO.
- L367: "actualizado hace X" en el header
- L381: HERO: el titulo es EXACTAMENTE el estado de Shalom
- L402: MINI-STEPPER del recorrido (solo si la fase es valida)
- L421: GUIA + CODIGO
- L443: ★ LO QUE EL NARRADOR NECESITA SABER, PUBLICADO EN LA TARJETA.
     El narrador (narrador/narrador.js) solo lee el DOM. Esperaba la etapa real
     de Shalom en `data-shalom-st` y esta página NUNCA la ponía: Delfi leía
     solo la etiqueta del panel, y con Shalom en «Entregado» y el panel aún
     en ENVIADO seguía diciendo «ya salió de nuestra tienda».
       data-tipo        agencia · encomienda · retiro · delivery (misma regla
                        que el formulario: _tipoEnvioDe).
       data-shalom-st   SOLO pedidos Shalom con estado visible (si el dueño
                        apagó «Mostrar en el link del cliente», el servidor no
                        lo manda y aquí no hay nada). Etapas del narrador:
                        origen/camino → 2 · destino → 3 · entregado → 4. El
                        narrador solo la usa si va MÁS adelante que el panel.
       data-tienda-dir  retiro en tienda: la dirección de Config (campo
                        «Ciudad»), para decir dónde pasar a recoger.
- L465: Ya en Shalom (con guía): la etiqueta del panel no se muestra, así que
       el narrador necesita saberlo por aquí (11/11/2026: Delfi se callaba).
- L474: ★ UNA SOLA FILA DE DNI, y su rotulo deducido del TIPO DE ENVIO.
       Habia tres filas distintas —una por cada copia del mismo dato— y cada
       una se pintaba segun que campo estuviera lleno. Un pedido a agencia
       creado desde el panel nunca tiene `dniRecoger`, asi que al cliente se le
       decia «DNI» a secas en vez de «DNI para recoger»; y uno corregido en el
       panel le mostraba el documento VIEJO, que es con el que se habria
       presentado en la agencia. La regla vive en functions/dniPedido.js.
- L485: Con N° de factura/boleta, el código que ve el cliente es ESE —el mismo
       de su WhatsApp y de la etiqueta—. Sin él, el de siempre. Se filtra
       igual que en el mensaje: solo letras, números y guion.
- L491: Bloque de seguimiento Shalom (línea de tiempo propia del courier). El estado
- L492: grande (badge) ya comunica el avance para todos, así que no hay barra genérica.
- L495: La ayuda «¿Cómo sigo mi pedido?» habla del tipo de envío de ESTE pedido.
- L500: ★ YA EN SHALOM → SOLO LOS ESTADOS DE SHALOM (10/11/2026). Con guía, la
       etiqueta del panel (POR ALISTAR, ALISTADO…) ya no le dice nada útil al
       cliente y puede contradecir a Shalom: se esconde, y manda el bloque de
       Shalom. Sin guía, todo como siempre.
- L564: ─── ARRANQUE ─────────────────────────────────────────────────────────
     Con token: se busca. Sin token —alguien abrió la página a mano—, al
     formulario, que es lo que tiene sentido ofrecer.
- L573: Lo que se llama desde un onclick del HTML.
- L576: ⚠️ Faltaba: el botón «Copiar» de la guía llamaba a `_copyGuia`, que vivía
     dentro del formulario sin salir a `window` — el botón no hacía nada.

## firebase-config.js

- L1: firebase-config.js — Configuración centralizada de Firebase para Total Tools
- L8: Identificador de la app ante Google, para el botón "Entrar con Google".
- L9: NO es un secreto: viaja en cualquier botón de Google de la web. Sale de
- L10: Firebase Console → Authentication → Google → ID de cliente web.
- L11: Mientras esté vacío, el botón no aparece y el ingreso por contraseña
- L12: funciona igual — así activarlo nunca puede dejar a nadie afuera.
- L15: Identificadores de la app web ante Firebase (App Check los necesita para
- L16: saber CUÁL app está pidiendo el token). Ninguno es secreto: son los mismos
- L17: que Firebase muestra en cualquier snippet de inicialización público.

## formulario.html

- L20: ★ APP CHECK EN LA PÁGINA DEL CLIENTE — 15/10/2026.
       Hasta hoy solo lo cargaba el panel. Esta página llama a `formApi`, que
       crea pedidos y consulta datos, y cualquiera podía llamarla con `curl`:
       el token decía QUIÉN eres (aquí nadie, es pública) pero nada decía DESDE
       DÓNDE. App Check lo dice: la petición viene de esta página de verdad.
  
       ⚠️ EN OBSERVACIÓN, NO EN BLOQUEO. El servidor todavía NO rechaza a quien
       no lo manda. Ponerlo a bloquear de golpe dejaría fuera a un cliente con
       un navegador raro o con reCAPTCHA caído, y perder un pedido de verdad es
       peor que el ataque del que protege. Se mide primero.
       Lo NUEVO sí nacerá bloqueado: una puerta que todavía no existe no tiene
       clientes a los que dejar fuera. Ver `action=reniec`.
  
       `appcheck.js` falla en silencio por diseño: sin red o sin reCAPTCHA
       devuelve '' y el formulario sigue funcionando igual que sin este archivo.
- L35: La primera consulta (configuración) va a este servidor: abrir la
       conexión mientras carga la página ahorra el saludo TLS (cientos de ms
       en datos móviles).
- L51: Lo que el formulario comparte con el seguimiento (Fase 2).
- L6: ★ LOS LINKS DE SEGUIMIENTO VIVEN EN seguimiento.html (10/11/2026).
     Hay miles de `formulario.html?seg=…` enviados por WhatsApp: tienen que
     seguir abriendo para siempre. Se redirigen AQUÍ, antes de descargar nada
     del formulario. `replace` no deja esta página en el historial (el botón
     «atrás» no rebota).

## functions/agencias.js

- L3: functions/agencias.js — LA AGENCIA DE DESTINO DE UN PEDIDO, IDENTIFICADA
  ==========================================================================
  Registrar un envío en Shalom exige el `ter_id` de la agencia de destino
  (`POST /account/register`). Ese id **solo se puede saber con certeza en el
  instante en que se elige la agencia de la lista**: después solo queda el
  texto de la dirección, y emparejar por texto es adivinar — en Lima hay
  siete "SJL" y tres en "Los Jardines".
  
  ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
  Lo usan TRES: el panel, el formulario público (los dos lo cargan como
  `functions/agencias.js`) y la Cloud Function que recibe los pedidos del
  formulario. Una copia por lado divergiría, y divergir AQUÍ significa que el
  servidor acepte un id que el panel habría rechazado — o al revés. Es el
  mismo motivo por el que `etiquetas.js` está aquí.
  
  LA REGLA QUE NO SE NEGOCIA
    El id y el texto no pueden divergir NUNCA. Cualquier cosa que cambie la
    dirección por una vía que no sea elegir de la lista **borra el id**.
  
  ⚠️ UN `ter_id` NO ES UNA PROMESA. Medido con dos catálogos reales (19 jul y
  5 sep 2026, 48 días): 539 de 546 estables, pero el id 671 pasó de
  CALLAO/VENTANILLA ("POR DEFINIR") a AREQUIPA/SACHACA — Shalom recicla los
  ids de los huecos. Por eso `verificar()` se llama ANTES de gastar dinero, y
  compara por **departamento/provincia/distrito**, no por nombre: contra esos
  mismos catálogos, el distrito da 1 aviso verdadero y 0 falsas alarmas; el
  nombre daría 13 falsas ("HUARAZ" → "HUARAZ CO") y el aviso dejaría de
  leerse.
  
  NO TOCA NADA VIEJO: un pedido sin estos campos funciona exactamente igual
  que hoy, y `limpiar()` devuelve {} —no nulls— cuando no había nada que
  borrar, para que abrir y guardar un pedido antiguo no le añada ni un campo.
- L37: global globalThis, window
- L49: Texto comparable: mayúsculas, sin tildes, sin espacios de sobra. Así
  "Cañete" y "CAÑETE" no se cuentan como una mudanza.
  @param {*} s texto
  @return {string} texto normalizado
- L61: ¿Es un `ter_id` con forma de tal? Solo dígitos.
  
  Importa que sea texto y no número: la API los devuelve como NÚMERO y el
  catálogo los guarda como TEXTO, y `3 !== "3"` no da error — simplemente
  no encuentra la agencia, y un envío sin verificar es un paquete pagado.
  @param {*} x candidato
  @return {boolean} true si sirve
- L76: La ubicación de una agencia, en la forma que se compara.
  @param {Object} ag agencia del catálogo
  @return {string} "DEPARTAMENTO|PROVINCIA|DISTRITO"
- L83: `distrito` en el catálogo guardado, `zona` en la respuesta cruda de la
- L84: API. Este módulo lo comparten el panel, el formulario público y el
- L85: servidor, y no todos reciben la misma forma: aceptar las dos evita que
- L86: una ubicación quede vacía y la verificación no pueda comparar nada.
- L91: De qué catálogo es un courier. Olva y Shalom tienen espacios de ids
  distintos: el 3 de uno no es el 3 del otro, y mezclarlos manda el paquete
  a donde no es.
  @param {*} nombre nombre del courier
  @return {string} 'SHALOM' | 'OLVA' | ''
- L105: Los campos que se guardan al ELEGIR una agencia de la lista. Es el único
  momento en que el id se conoce sin adivinar.
  @param {Object} ag agencia del catálogo
  @param {*} courier nombre del courier
  @return {?Object} los cuatro campos, o null si no hay id utilizable
- L116: Sin saber de qué catálogo es, el id no significa nada: el 3 de Olva no
- L117: es el 3 de Shalom.
- L128: ¿Este pedido tiene agencia identificada?
  @param {Object} pedido pedido
  @return {boolean} true si se puede registrar
- L137: Lo que hay que escribir para BORRAR la identificación.
  
  Devuelve `{}` —nada— cuando el pedido no tenía ninguna. Eso es lo que
  hace que abrir un pedido antiguo y guardarlo **no le añada campos
  vacíos**: si no había nada que borrar, no se escribe nada.
  @param {Object} pedido pedido
  @return {Object} campos a escribir
- L158: ¿El id guardado sigue apuntando a donde creemos? Se llama ANTES de
  registrar, que es antes de gastar dinero.
  @param {Object} pedido pedido con los campos de agencia
  @param {Array<Object>} catalogo catálogo vigente
  @return {Object} {ok:true, agencia} o {ok:false, motivo, de, a}
- L175: Seis ids desaparecieron del catálogo entre julio y septiembre. Un id que
- L176: ya no existe no se puede verificar, y no verificado no se registra.

## functions/barrido.js

- L3: functions/barrido.js — a quién se consulta, y cuándo
  =====================================================
  La parte del barrido programado que se puede probar sin red, sin Firestore
  y sin esperar a las 11:30: decidir si toca correr, y armar la lista.
  
  POR QUÉ EL RELOJ SE MIRA AQUÍ Y NO EN EL CRON
  Cloud Scheduler dispara cada 30 minutos y esta función decide si le toca.
  Suena a desperdicio y no lo es: los disparos que no tocan NO consultan nada
  a Shalom, y a cambio los horarios pasan a ser un texto en Config que se
  cambia sin volver a desplegar. Cuatro entradas de cron fijas atarían cada
  cambio de horario a un despliegue.
  
  Solo funcionan las horas EN PUNTO y Y MEDIA — es a lo que dispara el cron.
  Una hora suelta (08:15) se ajusta a la ranura más cercana en vez de no
  ejecutarse nunca en silencio.
- L21: Las cuatro de fábrica.
- L24: Zona del negocio. Fija: "8am" es 8am en Perú, sin cuentas con UTC.
- L27: Minutos que tienen que pasar para volver a consultar la misma guía.
      No es un intervalo: es la defensa contra que el Scheduler dispare dos
      veces la misma ranura (reintentos) y se consulte todo por duplicado.
- L32: Una guía de Shalom: 8 dígitos, o 9 que empiecen por 1.
      Medido el 13/10: 484 de 487 tenían 8. Pero Shalom numera en orden y en
      octubre de 2026 pasó el 99.999.999: sus guías nuevas son 100761787,
      101038480… Con la regla de 8 cada envío nuevo caía en «mal escrita» y el
      seguimiento automático dejó de mirarlos sin avisar a nadie.
      9 dígitos que NO empiezan por 1 siguen siendo un error de tipeo —el caso
      real fue 939726661, un dígito de más—, porque la serie nueva empieza en
      100.000.000. La MISMA regla está en guias.js (los avisos del panel); una
      prueba comprueba que las dos dicen lo mismo.
- L43: La formula de las etiquetas. La MISMA que usa el panel.
- L45: Qué significa lo que dice Shalom: la MISMA regla en todos lados (Fase 6).
- L47: ¿Se consulta esta guía? La MISMA regla que el panel (situacion).
- L49: Horas sin movimiento tras las que la guía del panel se da por muerta.
      Sale de la regla única: no hay un segundo número que pueda divergir.
- L53: Ajusta una hora a la ranura de 30 minutos más cercana.
  @param {string} hhmm por ejemplo "8:15"
  @return {?string} "08:30", o null si no se entiende
- L73: Lee el texto de horas de Config. Devuelve las de fábrica si no hay nada
  usable: quedarse sin ninguna hora apagaría el barrido en silencio.
  @param {*} texto "08:00, 11:30, 16:30, 19:00"
  @return {Array<string>} horas normalizadas, ordenadas y sin repetir
- L91: La hora local del negocio, como "HH:MM".
  @param {Date} fecha momento
  @param {string} [zona] zona horaria
  @return {string} "08:00"
- L101: Algunos entornos devuelven "24:00" a medianoche; se normaliza.
- L105: ¿Le toca correr a esta hora?
  @param {Array<string>} horas horas configuradas (ya normalizadas)
  @param {string} hhmm hora local actual
  @return {boolean} true si toca
- L116: A quién se consulta, y por qué se saltó al resto.
  
  Las cuatro razones para NO consultar, en orden de cuánto ahorran:
    · Shalom ya dijo ENTREGADO — es la última rama del árbol, no hay nada
      después. Preguntar otra vez no puede traer nada nuevo.
    · la etiqueta es FINALIZADO — el pedido está cerrado.
    · la guía está mal escrita — se sabe de antemano que va a fallar, así que
      se lista para corregirla en vez de gastar 4 consultas diarias en ella.
    · se consultó hace un momento — defensa contra un disparo repetido.
  @param {Array<Object>} pedidos todos los pedidos
  @param {number} ahora Date.now()
  @return {Object} {consultar, guiasMalas, saltados}
- L153: ⏰ GUÍA MUERTA: la regla es la ÚNICA de registroShalom.situacion
         (la misma del botón Consultar y del ticket). Registrada por el panel,
         sin movimiento y pasadas 72 h: no se dejó en la agencia y Shalom la
         dio por vencida. Al registrarla de nuevo cambia la hora y vuelve.
- L174: Por dejar: «Shalom no la conoce» es lo esperado (envío pendiente).
           Con movimiento: Shalom YA la conocía, así que «no la conoce» huele
           a Shalom caído y cuenta para el interruptor (index.js).
- L185: Suma los campos de seguimiento que toca escribir para un pedido.
  No escribe: devuelve lo que HABRIA que escribir, para que el simulacro
  pueda decidir exactamente igual sin tocar nada. Y por eso vive aqui y no en
  index.js: una decision que ninguna prueba puede alcanzar es una decision sin
  red.
  
  Si nada cambio, devuelve null y NO se escribe nada — ni siquiera la hora de
  la consulta. Estampar "te mire y no habia novedad" en 71 pedidos, cuatro
  veces al dia, es pagar 284 escrituras diarias por no-noticias.
  @param {Object} pedido datos actuales del pedido
  @param {Object} res respuesta ya traducida de /track
  @param {string} modo apagado | semi | auto
  @return {?Object} {campos, etiqueta} o null si no hay nada que cambiar
- L205: El texto del seguimiento tampoco desanda el camino. Es la misma guarda
       que el panel: una respuesta peor no pisa a una buena.
- L217: Mismo formato que escribe el panel (_escribirTracking en tracking.js):
- L218: un tercer formato de historial haria ilegible la mitad de las entradas.

## functions/clienteLookup.js

- L3: clienteLookup.js — Elegir los datos del cliente que vuelve.
  
  Logica PURA (sin Firestore) para poder probarla aislada. La usa
  handleClient de index.js.
  
  Dos reglas que evitan errores caros:
   1. Ventana de 12 meses: un cliente de hace anos no se expone ni se
      autocompleta con datos viejos.
   2. La direccion sale SOLO de pedidos DELIVERY. En agencia/encomienda el
      campo `address` guarda la direccion de la AGENCIA (ej. "SHALOM CERCADO
      LIMA..."); ofrecerla como "tu direccion de siempre" mandaria el proximo
      pedido a la agencia en vez de al domicilio del cliente.
- L20: @param {Object} p pedido
  @return {boolean} true si el pedido es a domicilio
- L29: Devuelve el MINIMO necesario para reconocer al cliente, o null.
  @param {Array} pedidos pedidos con ese telefono
  @param {number} nowMs ahora en ms
  @return {?{name: string, address: string}} datos o null

## functions/codigoSeguimiento.js

- L3: functions/codigoSeguimiento.js — EL CÓDIGO CORTO DE UN PEDIDO (una regla)
  ==========================================================================
  Fase 6 (11/11/2026). El «#123456» que ve el cliente en su WhatsApp, en su
  link de seguimiento y en la ETIQUETA impresa tiene que ser el mismo. Se
  calculaba en dos sitios (cliente/comun.js y print.js) y divergían en un
  caso: un pedido antiguo SIN fecha de creación salía con 6 dígitos en el
  link y con 4 en la etiqueta. Ahora la regla vive aquí.
  
    · Pedidos desde el 2026-08-08: los últimos 6 dígitos del id.
    · Antes (o sin fecha, que solo pasa en los antiguos): los últimos 4
      caracteres del id, en mayúsculas. NO se tocan: hay etiquetas impresas.
  Determinístico: mismo pedido → mismo código, sin guardar nada.
  (Con N° de factura/boleta, ESE es el código: functions/nroComprobante.js.)
- L19: global globalThis, window
- L27: Desde esta fecha, 6 dígitos.
- L30: El código de un pedido.
  @param {*} id el id del pedido (id_1762790000000)
  @param {*} createdAt su fecha de creación, ISO
  @return {string} 6 dígitos, o 4 caracteres en los antiguos; "" sin id

## functions/comprobante.js

- L3: comprobante.js — Modulo aislado (Fase 1).
  
  Descarga un comprobante PDF de API Sale, extrae su texto y parsea los
  productos (codigo interno / descripcion / cantidad). Detecta formato
  ticket y A4. NO escribe en Firestore ni toca otras funciones: solo
  descarga, lee y devuelve.
  
  El parser es la misma logica validada con muestras reales (ticket y A4,
  con y sin codigo, con codigos raros tipo WAY1A10).
- L18: Version del parser: si se mejora, se sube este numero para reprocesar.
- L19: v3: arreglo A4 multi-item (EAN guion, cantidad y descripcion multilinea).
- L22: Hash SHA-256 de la URL (para idempotencia).
- L26: Busca, entre los links de un pedido, el del comprobante API Sale.
- L36: ── Seguridad: solo se permite este dominio y estas rutas (anti-SSRF) ──────
- L39: 8 MB
- L40: 20 s
- L42: Valida que la URL sea segura para descargar. Devuelve {ok, motivo?, url?}.
- L60: Descarga el PDF con timeout, limite de tamano y validacion de tipo/firma.
- L86: Extrae el texto plano del PDF.
- L92: ── Parser (basado en el texto REAL de pdf-parse: columnas pegadas) ─────────
- L93: Codigo interno: 2-6 letras + un digito + alfanumerico (WAY1A10, THT1320503).
- L107: Extrae el codigo interno del inicio de un texto. {codigo, resto}.
- L115: Arma un item a partir de lineas de descripcion + cantidad (+ ean opcional).
- L125: Ticket: la cantidad viene en lineas sueltas (numero, luego "UND", luego
- L126: precios); la descripcion son las lineas previas.
- L154: saltar numero + unidad
- L155: saltar precios
- L164: A4: cada producto viene pegado "ITEM+CANT UND EAN"; en las lineas
- L165: siguientes va el codigo interno + descripcion (puede ocupar varias
- L166: lineas). ITEM = numero de fila secuencial; CANT = lo que sigue al ITEM.
- L167: El EAN puede ser un guion "-" cuando el producto no tiene codigo de barras.
- L192: precio
- L193: "No asignado"
- L201: Detecta el formato (ticket vs A4) y devuelve la lista de productos.
- L212: Orquesta todo: valida -> descarga -> extrae texto -> parsea.

## functions/credenciales.js

- L3: functions/credenciales.js — LAS CREDENCIALES DE SHALOM PRO
  ===========================================================
  Guardarlas y leerlas. Nada más — quien habla con Secret Manager es
  `functions/index.js`; aquí viven las DECISIONES, y por eso esto se prueba
  entero sin red y sin Google.
  
  ⚠️ POR QUÉ ESTO EXISTE, Y POR QUÉ NO ES «la contraseña en el navegador»
  
  Shalom pide usuario y contraseña EN TEXTO PLANO para `POST
  /instances/login`: no tienen OAuth ni intercambio de token. Y su API
  bloquea al navegador por CORS. Así que la contraseña real tiene que
  llegarles por alguien. No hay truco criptográfico que lo evite: la
  pregunta no es SI viaja, sino DÓNDE DESCANSA y CUÁNTAS VECES viaja.
  
    la otra aplicación del dueño → la guarda en su base de datos, y te la
                                   RELLENA en el formulario cada vez que
                                   entras. Eso es poder leerla.
    usar y olvidar               → la escribes CADA VEZ que la sesión se
                                   cae. Viaja muchas veces, y de madrugada
                                   no hay nadie para escribirla.
    esto                         → la escribes UNA vez. Va a Secret
                                   Manager, la misma caja fuerte que la
                                   clave de la API, y el servidor entra
                                   solo a partir de ahí.
  
  Una contraseña que se escribe una vez se expone una vez.
  
  ⚠️ WRITE-ONLY. No hay forma de pedirla de vuelta desde el navegador: la
  operación `guardarCredenciales` SOLO guarda, y no existe su pareja de
  lectura en la lista blanca. Ni disfrazada de diagnóstico. En pantalla se
  ve «guardada ✓» y el correo, nunca la clave.
  
  ⚠️ Y NO CON `defineSecret()`. Ese fija la versión al desplegar: si el
  panel guarda una contraseña nueva, la función seguiría usando la vieja
  hasta el próximo deploy — justo lo contrario de lo que se quiere. Se lee
  la versión `latest` en el momento de la petición, con una caché corta.
  De regalo: como ya no van declaradas en `secrets: [...]`, un secreto que
  todavía no existe deja de romper el despliegue.
- L44: global globalThis, window
- L55: Texto limpio.
  @param {*} x lo que sea
  @return {string} cadena recortada
- L64: ¿Sirve esto como credencial?
  
  ⚠️ LO VACÍO SE RECHAZA AQUÍ Y NO EN SECRET MANAGER. Al dueño le pasó
  con la terminal: pulsó Enter sin escribir (el campo va enmascarado y no
  se ve nada) y Google contestó «Secret Payload cannot be empty» — un
  error de Google sobre un descuido suyo. Dicho aquí, el aviso habla su
  idioma y señala el campo.
  @param {Object} c {usuario, clave}
  @return {Array<string>} lo que falta, en palabras; vacío si está bien
- L89: No se valida la fuerza —es la contraseña de ELLOS, no nuestra— pero
           menos de cuatro caracteres es casi siempre un dedo que resbaló.
- L96: Guardar. Escribe una versión nueva de cada secreto; la anterior se
  queda en el historial de Secret Manager, que es justo lo que permite
  volver atrás si te equivocas de cuenta.
  @param {Object} deps {escribir, ahora, auditar}
  @param {Object} c {usuario, clave}
  @return {Promise<Object>} {ok, motivo, detalle, usuario}
- L115: El fallo típico y su arreglo, dichos juntos: sin permiso para
           escribir secretos, Google devuelve PERMISSION_DENIED y el mensaje
           no dice qué rol falta.
- L128: La auditoría registra QUIÉN y CUÁNDO, nunca el valor. Un registro que
         guardara la contraseña sería una segunda copia fuera de la caja
         fuerte, que es exactamente lo que se quiere evitar.
- L135: una auditoría que falla no anula lo guardado
- L140: Leer. SIEMPRE de Secret Manager, sin caché.
  
  ⚠️ AQUÍ HUBO UNA CACHÉ DE 60 s, Y FALLÓ EL 11/10/2026 DE LA PEOR
  MANERA: el dueño guardó sus credenciales, el panel dijo «Guardada ✓», y
  al pulsar «Conectar» le contestó «faltan las credenciales».
  
  La caché guardaba también el NEGATIVO —«aquí no hay nada»— durante un
  minuto, y `guardar` solo la limpiaba en LA INSTANCIA que atendió el
  guardado. Cloud Functions corre varias:
  
    1. pulsa Conectar antes de guardar → la instancia A lee, no hay
       nada, y cachea el «no hay»
    2. guarda → lo atiende la instancia B, que sí escribe
    3. pulsa Conectar → vuelve a caer en A → le sirve el «no hay» viejo
  
  Una caché cuya invalidación no cruza de instancia no es una caché: es
  un dato viejo con fecha de caducidad. Y el negativo es el peor de los
  dos para guardar, porque la acción que lo vuelve falso —guardar— es
  justo la que el dueño acaba de hacer.
  
  Se quita entera, no se arregla. Esto se lee solo al pulsar «Conectar»,
  un botón que se aprieta a mano unas pocas veces al día: dos lecturas de
  Secret Manager no se notan, y a cambio la respuesta es siempre la de
  ahora. Una caché que ahorra lo que no cuesta y puede mentir no vale lo
  que pesa.
  @param {Object} deps {leer}
  @return {Promise<?Object>} las credenciales, o null si no hay
- L176: ⚠️ AQUÍ SE TRAGABAN TODOS LOS ERRORES, Y ESO NOS DEJÓ CIEGOS DOS
           DÍAS. El comentario decía «que no existan todavía no es un error» —
           cierto— pero estaba implementado como «cualquier cosa que falle no
           es un error». Permiso denegado, proyecto mal resuelto, la API de
           Google caída: todo acababa saliendo por pantalla como «faltan las
           credenciales», que manda a guardarlas otra vez y no arregla nada.
  
           Un `catch` que convierte causas distintas en el mismo síntoma no
           simplifica: borra la información que hacía falta para arreglarlo.
  
           Ahora solo NO ENCONTRADO significa «todavía no hay». Lo demás sube
           con su motivo, y quien llame lo enseña.

## functions/cuentaShalom.js

- L3: functions/cuentaShalom.js — LA CUENTA DE SHALOM PRO DEL PANEL
  ==============================================================
  Rehecho el 11/11/2026 (reemplaza a instanciaShalom.js y
  puertaInstancias.js). Dos operaciones, y el navegador no ve nada más:
  
    conectar → con el correo y la contraseña de Shalom Pro (escritos ahora
               o los guardados en Secret Manager): encuentra TU instancia,
               la crea si no existe, entra solo si hace falta y guarda en
               el servidor cuál es.
    estado   → ¿la instancia guardada sigue conectada?
  
  LA REGLA DE ORO: el panel solo usa la instancia cuyo `username` es TU
  correo de Shalom Pro. La cuenta de la API puede tener instancias de otros
  negocios; nunca se elige «la primera», «la única» ni «la conectada». Y el
  navegador nunca recibe la lista: solo «conectada · tu correo».
  
  POR QUÉ SE REHIZO (el fallo del 11/11/2026): la instancia del panel estaba
  CONECTADA en Shalom, pero el panel tenía guardado otro id. «Conectar»
  buscaba por un correo fijo en el código, y aunque la encontraba, SIEMPRE
  volvía a iniciar sesión: ese login falló, y como falló nunca guardaba el id
  bueno. Ahora, si ya está conectada, solo se guarda su id.
  
  Según su documentación, la API guarda las credenciales cifradas en la
  instancia y vuelve a entrar sola cuando la sesión vence: conectando una
  vez, se mantiene. Listar, crear, entrar y ver el estado NO consumen cuota.
  
  Lógica pura: las llamadas a Shalom y a Firestore llegan en `deps`, para
  probarla con las respuestas reales sin red.
- L34: El nombre con el que el panel crea su instancia (si no existe).
- L37: Texto recortado, o "".
  @param {*} v valor
  @return {string} texto
- L47: El id de una instancia recién creada, venga donde venga en la respuesta.
  @param {*} json respuesta de POST /instances
  @return {string} el id, o ""
- L63: Cuál de la lista es la TUYA. Solo por tu correo; nunca otra.
  @param {Array} lista instancias traducidas {id, nombre, usuario, conectada}
  @param {string} correo tu correo de Shalom Pro
  @param {string} idGuardado la que el panel tenía guardada, si alguna
  @return {Object} {estado: una|ninguna, instancia}
- L77: Varias con TU correo: TODAS son de tu cuenta de Shalom Pro (p. ej.
         otra app tuya conectada con el mismo correo), así que usar cualquiera
         registra en TU cuenta. Nunca se para: se elige siempre igual.
         Orden: la guardada → la del panel (su nombre) → una conectada → la
         primera. Entre iguales, por id (estable: siempre la misma).
- L96: Una creada por el panel que nunca llegó a entrar no tiene correo: se
       reconoce por SU nombre y por no tener usuario (nunca una ajena).
- L103: Conectar la cuenta.
  @param {Object} deps {listar, crear, entrar, estado, guardarCuenta}
  @param {Object} opc {usuario, clave, idGuardado, recienEscritas}
  @return {Promise<Object>} {ok, conectada, usuario, id} o {ok:false, motivo,
    detalle} — nunca la contraseña, nunca otras instancias
- L147: ★ YA CONECTADA → NO SE VUELVE A ENTRAR. Solo se guarda cuál es.
       Excepción: si ACABAS de escribir la contraseña, se entra para que
       Shalom guarde la nueva (y la use al reconectar solo).
- L154: Aquí un rechazo es la contraseña, no la clave de la API.
- L171: La instancia es TUYA (por correo): se guarda aunque falte confirmar.
- L181: ¿Sigue conectada la instancia guardada? Gratis.
  @param {Object} deps {estado}
  @param {Object} opc {idGuardado, usuarioGuardado, hayCredenciales}
  @return {Promise<Object>} {ok, conectada, usuario, motivo}

## functions/dniPedido.js

- L3: functions/dniPedido.js — EL DNI DE UN PEDIDO. UNO, Y SOLO UNO.
  ================================================================
  ⚠️ EL FALLO DEL 13/10/2026, Y POR QUÉ UN DATO NO PUEDE TENER TRES CASAS
  
  El dueño corrigió un pedido en el panel: el destinatario pasó de CLIENTE A
  (DNI XXXXXXXX) a CLIENTE B (DNI XXXXXXXX). El
  nombre cambió en todas partes. **El DNI de la etiqueta no.** Imprimió a las
  5:51 p. m. un rótulo con el nombre nuevo y el documento viejo.
  
  Un pedido guardaba el mismo dato en TRES campos:
  
    dni               el formulario lo escribe siempre
    dniRecoger        además, si el envío es a agencia
    dniDestinatario   además, si es encomienda
  
  Y cada uno de los nueve sitios que lo leían usaba su propio orden:
  
    etiqueta grande   dniRecoger ⟶ dni        → el VIEJO
    lista impresa     dniRecoger              → el corregido no salía nunca
    seguimiento       dniRecoger ⟶ dniDest.   → al cliente se le decía que
                                                fuera con el documento viejo
    registro Shalom   dni                      → el NUEVO
  
  Así que la etiqueta pegada al paquete y la guía de Shalom llevaban
  documentos distintos: en la agencia no se lo entregan a nadie.
  
  El formulario público YA lo tenía claro —su comentario dice «DNI: fuente
  única = order.dni»— y la línea de abajo seguía haciendo tres copias. La
  intención era correcta; el código no la siguió. Un dato con tres copias y
  sin dueño no es un dato duplicado: es un dato que todavía no se ha
  contradicho.
  
  ⚠️ LA BISAGRA: «NO EXISTE» NO ES LO MISMO QUE «ESTÁ VACÍO»
  
  Los cinco lectores rotos usaban `a || b || c`, y ese encadenado no
  distingue las dos cosas. Aquí sí:
  
    dni AUSENTE (la clave no está)  → se miran las copias viejas
    dni PRESENTE, aunque valga ''   → manda él, y punto
  
  Y de esa distinción dependen los dos casos que se contradicen:
  
    · un pedido de antes de que existiera el campo `dni` cae a `dniRecoger`
      y SIGUE IMPRIMIENDO EXACTAMENTE IGUAL QUE HOY;
    · un pedido al que le BORRASTE el DNI a propósito se queda sin DNI, en
      vez de resucitar el anterior.
  
  Con `||` el segundo caso falla en silencio: borrar un documento haría
  reaparecer el de otra persona en la etiqueta. Borrar es una decisión, y
  una decisión no se deshace sola.
  
  ⚠️ NO SE NORMALIZA EL TEXTO. Solo se recortan los espacios. Quitar lo que
  no sean dígitos parecía más limpio hasta caer en el carné de extranjería,
  que lleva letras: lo habríamos destrozado. Quien necesita ocho dígitos
  —el registro en Shalom— ya los exige por su cuenta.
- L61: global globalThis, window
- L69: Texto recortado.
  @param {*} x lo que sea
  @return {string} cadena sin espacios a los lados, o ""
- L78: El DNI de un pedido. **El único sitio donde se decide cuál es.**
  @param {Object} p el pedido
  @return {string} el documento, o "" si no hay
- L85: PRESENTE manda, aunque esté vacío: ver la bisagra, arriba.
- L92: Cómo se llama ese documento en pantalla.
  
  ⚠️ SE DEDUCE DEL TIPO DE ENVÍO, NO DE QUÉ COPIA ESTÉ LLENA. Antes el
  seguimiento público decía «DNI para recoger» solo porque existía
  `dniRecoger` — así que un pedido a agencia creado desde el panel, que
  nunca tiene esa copia, le decía «DNI» a secas al cliente. El rótulo
  seguía al campo en vez de seguir al hecho.
  @param {Object} p el pedido
  @return {string} "DNI" · "DNI para recoger" · "DNI destinatario"
- L113: Las copias viejas que ESTE pedido ya tenía, puestas al día.
  
  ⚠️ SOLO LAS QUE YA TENÍA, y esa es toda la regla. Si el pedido nunca
  tuvo `dniRecoger`, abrirlo y guardarlo no se lo añade: el dueño pidió
  que lo de hoy no le estrene campos a lo de ayer. Pero si lo tenía, se
  reescribe —vacío incluido— porque una copia que se queda atrás es
  exactamente lo que imprimió el documento de otra persona.
  
  Es la misma regla que ya usa `shalomClave` al guardar.
  @param {Object} previo el pedido tal como estaba guardado
  @param {string} dni el documento que se está guardando
  @return {Object} los campos a escribir; {} si no hay ninguno

## functions/enlaceSeguimiento.js

- L3: functions/enlaceSeguimiento.js — EL TOKEN DEL LINK DE SEGUIMIENTO
  ===================================================================
  El link que el cliente recibe por WhatsApp lleva un token. Ese token es lo
  único que separa su pedido —nombre, dirección, documento— del resto del
  mundo: la página es pública a propósito, porque obligar a un cliente a
  iniciar sesión para ver dónde está su paquete no es una opción.
  
  ⚠️ EL FALLO QUE ESTE ARCHIVO CIERRA
  El token ERA `id_` + el reloj en milisegundos (`Date.now()`). Eso no es un
  secreto: es un número que avanza solo y que cualquiera puede recorrer.
  Quien tuviera UN link sabía aproximadamente cuándo se crearon los demás. Y
  `handleTrack` no tenía freno de peticiones, así que nada —absolutamente
  nada— impedía probar millones de valores hasta dar con pedidos ajenos.
  
  ⚠️ LA REGLA QUE MANDA SOBRE TODO LO DEMÁS
  **Los links ya enviados tienen que seguir abriendo. Para siempre.** Hay
  más de mil pedidos con su link ya en el WhatsApp de alguien. Cambiar el
  formato y romperlos sería arreglar un problema que nadie ha sufrido
  causando uno que sufrirían todos. Por eso hay DOS formas válidas, no una.
  
  ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
  Lo usan los dos lados: el panel (`config.js`) genera el token al crear un
  pedido, y la Cloud Function lo valida al recibir una consulta. Una copia
  por lado divergiría, y divergir aquí significa que el servidor rechace un
  token que el panel acaba de fabricar. Mismo motivo que `agencias.js` y
  `etiquetas.js`.
  
  NO EXISTE UN SERVICIO DE GOOGLE PARA ESTO, y conviene saberlo para no
  buscarlo: Firebase Dynamic Links se apagó en agosto de 2025 y nunca sirvió
  para esto; las Signed URLs de Cloud Storage solo firman archivos de un
  bucket. Lo que hace Google por dentro es exactamente lo de aquí abajo:
  pedirle bytes al generador criptográfico.
- L38: global globalThis, window
- L46: LA FORMA VIEJA — los links que ya están en el WhatsApp de tus clientes.
  
  NO EXIGE NINGÚN PREFIJO, y eso es una corrección pagada con un fallo
  real. La primera versión exigía `id_`, porque medí los ids del panel con
  un script que reemplazaba las letras por `a` — así que `id_` y `xl_`
  salían los dos como `aa_` y la medición **destruyó justo el dato que
  importaba**. Los pedidos importados de Excel empiezan por `xl_`, su link
  dejó de abrir, y la tabla que yo mismo pedí no lo mostraba.
  
  La lección no es "añadir `xl_`": es que **enumerar prefijos es apostar a
  haberlos visto todos**. Lo que esta reja tiene que impedir es texto que
  se cuele en una ruta de base de datos (`/`, `..`) y basura que cueste
  una lectura. Para eso no hace falta saber qué prefijos existen.
  
  Y aceptar de más aquí no abre ninguna puerta: lo que pase esta reja
  todavía tiene que EXISTIR en la base de datos, y los pedidos nuevos
  están protegidos aparte por `aceptaLegado()`.
- L67: LA FORMA NUEVA — 128 bits del generador criptográfico.
  
  ⚠️ POR QUÉ LLEVA EL PREFIJO `t1_` Y NO ES AL AZAR A SECAS.
  Sin prefijo, un token al azar podría empezar por `id_` de pura
  casualidad: una vez cada 262.144. El servidor lo tomaría por un id
  viejo, buscaría un documento que no existe, y el cliente vería "link no
  disponible" sin que nadie entendiera por qué. Un fallo así aparece meses
  después, le toca a una persona de cada tantas, y es imposible de
  reproducir. El prefijo lo vuelve **imposible por construcción**, no
  improbable — que es la diferencia entre un diseño y una apuesta.
  
  El `1` es la versión. Si algún día hace falta otro formato, será `t2_` y
  los `t1_` seguirán abriendo, igual que hoy siguen abriendo los `id_`.
- L85: 128 bits
- L87: El generador criptográfico, en una variable y no leído directo, para que
       las pruebas puedan comprobar que SE USA DE VERDAD. No es un adorno: ya
       pasó en este proyecto que una prueba comprobaba que el código
  mencionaba* `getRandomValues`, la mención seguía ahí en una rama
       muerta, y lo que corría de verdad era `Math.random()`. Un texto en el
       fuente no prueba nada; solo el comportamiento lo hace.
- L95: Lee o cambia el generador criptográfico. Cambiarlo es cosa de pruebas.
  @param {Object} [nuevo] con qué sustituirlo
  @return {Object} el que está puesto
- L105: Bytes → base64 apto para URL, sin depender de Buffer (el panel no lo
  tiene) ni de btoa (Node no lo tenía hasta hace poco).
  @param {Uint8Array} bytes los bytes
  @return {string} texto seguro en una URL
- L119: Un token nuevo, al azar de verdad.
  
  ⚠️ SI NO HAY GENERADOR CRIPTOGRÁFICO, LANZA. No cae a `Math.random()`.
  `Math.random` produce una secuencia que se deduce a partir de las
  anteriores: un token así sería adivinable, o sea exactamente el fallo
  que estamos cerrando, pero disimulado. Fallar a gritos es la única
  opción honesta — un pedido sin token se nota; uno con token de mentira,
  no.
  
  @return {string} token nuevo
- L141: ¿Qué clase de token es esto? Se responde SIN tocar la base de datos.
  
  Es la primera reja y la más barata: hoy, cualquier texto —`token=x`,
  `token=`, basura de un robot— provoca una lectura de Firestore que se
  paga. Mirar la forma primero hace que un barrido automático no cueste
  nada.
  
  Y cierra algo más: el token se pega a una ruta de base de datos
  (`panel/shipments/items/<token>`). Una barra dentro del token cambia esa
  ruta. Hoy no se puede llegar a `panel/config` —está en dos segmentos y
  aquí se parte de tres—, así que no era una fuga; pero concatenar texto
  de fuera a una ruta sin validarlo es como empiezan las que sí lo son.
  
  @param {*} token lo que llegó en la URL
  @return {string} 'nuevo' | 'legado' | 'invalido'
- L165: ¿Se puede abrir este pedido con un token de la forma vieja?
  
  ⚠️ AQUÍ ESTABA LA PUERTA TRASERA, y casi deja el arreglo en nada.
  Un pedido nuevo guarda un token al azar, pero su **id de documento**
  sigue siendo `id_` + el reloj: cambiar el id obligaría a tocar el panel
  entero, los enlaces guardados y el respaldo. Si el servidor siguiera
  aceptando el id de cualquiera, el pedido nuevo se abriría por su id
  adivinable **igual que antes** y el token al azar sería decoración.
  
  La regla, entonces:
    · pedido CON token nuevo  → solo se abre por el token
    · pedido SIN token (ayer) → se sigue abriendo por su id, para siempre
  
  Y ante la duda, **se abre**. Dejar a un cliente sin ver su pedido por
  una duda mía es peor que aceptar un id que de todas formas ya era
  público ayer.
  
  @param {Object} pedido el documento leído de Firestore
  @return {boolean} true si el id viejo vale para este pedido
- L191: Con qué token se arma el link de ESTE pedido.
  
  Vive aquí y no en cada botón porque hay DOS sitios que copian links —la
  tarjeta del panel y la vista de seguimiento— y si uno se quedara con el
  id, la mitad de los links que salieran seguirían siendo adivinables sin
  que nada lo indicara. Una regla, un sitio.
  
  @param {Object} pedido el pedido
  @return {string} el token para el `?seg=`, o '' si no hay pedido

## functions/etiquetas.js

- L3: functions/etiquetas.js — QUÉ ETIQUETA LE TOCA A UN PEDIDO
  ==========================================================
  La fórmula del negocio, en un solo sitio.
  
  ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
  Lo usan los DOS: el panel (que lo carga como `functions/etiquetas.js`) y el
  barrido programado del servidor. Una copia en cada lado divergiría, y
  divergir AQUÍ significa que el barrido mueva una etiqueta que el panel
  habría rechazado — de madrugada, sin nadie delante. Un archivo raro de ver
  en el árbol es mejor que dos reglas que deciden si tus pedidos retroceden.
  
  LA FÓRMULA (del manual del panel, ajustada en un punto):
    existe la guía / En origen / En tránsito → ENVIADO
    En destino · En reparto                  → LLEGÓ A DESTINO
    …y si queda saldo                        → PENDIENTE DE PAGO
    Entregado                                → FINALIZADO
    …y si queda saldo                        → PENDIENTE DE PAGO
  
  ⚠️ EL PUNTO AJUSTADO: el manual decía «Demora de envíos → ENVIADO». Esa
  línea es la que hacía que un pedido en LLEGÓ A DESTINO saltara hacia atrás
  al demorarse. La demora ya no es un estado sino una bandera: se AVISA (el
  cliente la ve en su link) y no mueve nada. La etiqueta sigue al paso real.
- L28: global globalThis, window
- L33: En el navegador, functions/shalomEstado.js se carga ANTES.
- L37: El orden del recorrido. Su ÍNDICE es lo que define "avanzar".
- L43: Dónde está una etiqueta en la escalera. -1 = no está.
  @param {string} etiqueta nombre de la etiqueta
  @return {number} índice o -1
- L52: Cuánto ha avanzado el envío según el TEXTO de Shalom, 0..3.
  null = no se puede clasificar, y entonces no se decide nada con él.
  
  Vive aquí y no en tracking.js porque el barrido necesita exactamente la
  misma respuesta. Una demora devuelve null a propósito: no es un punto del
  recorrido, así que no puede ni adelantar ni hacer retroceder a nadie.
  @param {string} texto estado tal como lo dice Shalom
  @return {?number} 0..3 o null
- L63: Fase 6 (11/11/2026): la regla vive en functions/shalomEstado.js, la
         MISMA que usa el seguimiento del cliente. Antes había dos, y «En
         reparto» movía la etiqueta a destino mientras al cliente le decía
         «en camino».
- L71: ¿Le queda saldo por cobrar? `cost` es lo que ya calcula el formulario
  (monto − adelanto); si falta, se recalcula de los dos campos.
  @param {Object} pedido el pedido
  @return {boolean} true si debe algo
- L89: La etiqueta que le tocaría por el recorrido, SIN mirar dónde está hoy.
  @param {number} rango 0..3
  @param {Object} pedido el pedido (para el saldo)
  @return {?string} etiqueta o null
- L101: Entregado CON saldo no se cierra. Shalom entregó el paquete, pero a ti
           no te pagaron: cerrar ese pedido solo es un error de negocio que la
           máquina no debe poder cometer. Se queda esperándote.
- L109: LA DECISIÓN COMPLETA. Único punto por el que pasan el panel y el barrido.
  Devuelve null cuando no hay que mover nada — que es la mayoría de veces.
  @param {Object} pedido el pedido tal como está guardado
  @param {Object} res respuesta ya traducida de /track
  @param {string} modo apagado | semi | auto
  @return {?Object} {nueva, porQue} o null
- L130: EN MODO SEMI, FINALIZADO LO CIERRAS TÚ — pero el pedido igual avanza
         hasta donde puede sin cerrarse.
  
         Antes esto devolvía null y el pedido se quedaba QUIETO. Lo vio el
         simulacro: tres pedidos que Shalom daba por entregados seguían en
         ENVIADO. Y no era solo feo — en cuanto se guarda `trackingStatus:
         "Entregado"`, el barrido deja de consultarlos (ya no pueden traer nada
         nuevo), así que se habrían quedado en ENVIADO para siempre.
  
         Si está entregado, como mínimo llegó a destino. Eso se puede afirmar.
- L143: ya está ahí
- L145: ⚠️ UNA ETIQUETA QUE NO ESTÁ EN LA ESCALERA NO SE TOCA JAMÁS.
         "RECLAMOS, DEVOLUCIONES, GARANTÍA", "AVISAR CUANDO LLEGUE", "RETORNO A
         ORIGEN"… son etiquetas tuyas, puestas a mano para algo que el recorrido
         de Shalom no sabe. Si no se puede ubicar en la escalera, no se puede
         saber si moverla sería avanzar o retroceder — y ante la duda, no se
         mueve. Sin esta regla, un pedido en RECLAMOS volvería a ENVIADO solo.
- L154: Un envío no desanda el camino.

## functions/fechaPedido.js

- L3: functions/fechaPedido.js — LAS DOS FECHAS DE UN PEDIDO.
  =======================================================
    envío      `date`: el día programado para despachar («2026-10-28»).
    registro   el día en que ENTRÓ el pedido, sacado de `createdAt`.
  
  ⚠️ `createdAt` ESTÁ EN HORA UNIVERSAL, NO DE PERÚ. Un pedido registrado
  el 26/10 a las 8:00 p. m. en Lima se guarda «2026-10-27T01:00:00Z».
  Cortar los diez primeros caracteres lo mandaría al día siguiente — justo
  los pedidos que llegan de noche. Aquí se convierte a la hora de Lima.
  
  ⚠️ LA IMPORTACIÓN DE EXCEL GUARDA «AAAA-MM-DDT00:00:00.000Z»: un día sin
  hora. Convertido a Lima caería en el día ANTERIOR (medianoche UTC son las
  7:00 p. m. del día previo). Ese patrón exacto se toma tal cual.
  
  Solo lee: no escribe nada en ningún pedido.
- L21: global globalThis, window
- L33: «AAAA-MM-DD» de un instante, en la hora de Lima.
  @param {Date} d instante
  @return {string} el día, o "" si la fecha no vale
- L40: en-CA da «AAAA-MM-DD» directamente.
- L45: Día de envío.
  @param {Object} p el pedido
  @return {string} el `date` guardado, o ""
- L51: Tal cual está guardado: es lo que comparaba la búsqueda antes de este
- L52: módulo, y con «Fecha de envío» tiene que dar EXACTAMENTE lo mismo.
- L56: Día de registro, en hora de Lima.
  @param {Object} p el pedido
  @return {string} «AAAA-MM-DD», o "" si no tiene `createdAt`
- L70: Hoy, en Lima.
  @param {Date} [ahora] para las pruebas
  @return {string} «AAAA-MM-DD»
- L79: La fecha que manda según el campo elegido en la búsqueda avanzada.
  @param {Object} p el pedido
  @param {string} campo "registro" | "envio" (por defecto, envío)
  @return {string} «AAAA-MM-DD», o ""
- L89: ¿El pedido cae en el rango? Desde/hasta vacíos no limitan. Sin fecha
  en el campo elegido, no entra (si hay algún límite puesto).
  @param {Object} p el pedido
  @param {string} campo "registro" | "envio"
  @param {string} desde «AAAA-MM-DD» o ""
  @param {string} hasta «AAAA-MM-DD» o ""
  @return {boolean} si entra
- L107: El día «AAAA-MM-DD» corrido `n` días (negativo = atrás).
  @param {string} dia «AAAA-MM-DD»
  @param {number} n días
  @return {string} «AAAA-MM-DD», o "" si `dia` no vale
- L120: El instante en que EMPIEZA un día de Lima, en ISO universal — para
  compararlo con fechas guardadas en UTC (`usedAt`, `createdAt`).
  Perú no cambia de hora desde 1994: medianoche de Lima = 05:00 UTC.
  @param {string} dia «AAAA-MM-DD»
  @return {string} «AAAA-MM-DDT05:00:00.000Z», o "" si `dia` no vale

## functions/index.js

- L15: Modulo aislado de extraccion de comprobantes.
- L17: Seleccion de datos del cliente recurrente (logica pura, testeable aparte).
- L20: Puerta unica a la API de Shalom (lista blanca + traduccion).
- L22: El interruptor: cuando apagar la puerta y cuando reencenderla (logica pura).
- L24: Verificar la firma de los avisos de Shalom (logica pura, sin red).
- L26: A quien consulta el barrido y cuando (logica pura).
- L29: Que etiqueta le toca a un pedido. LO COMPARTE CON EL PANEL: ver la
- L30: cabecera de etiquetas.js — dos copias de esta regla divergirian.
- L46: ── Rutas Firestore (deben coincidir exactamente con el panel) ─────────────
- L50: ★ FASE 2 · LA HORA DE CAMBIO (functions/sincro.js). TODA escritura del
     servidor sobre un pedido pasa por aquí y graba `_mts` con la hora del
     servidor: es lo que el panel consulta para traer solo lo cambiado. Una
     escritura que no la grabe sería invisible para el panel hasta su carga
     completa de seguridad — hay una prueba que recorre este archivo y falla
     si alguna escritura en SHIP_COL no pasa por `_conMts`.
- L57: Los mismos campos, más la hora de cambio del servidor.
  @param {Object} campos lo que se escribe
  @return {Object} copia con `_mts`
- L68: La clave de Shalom vive en Secret Manager. Nunca en el codigo ni en el
- L69: navegador. Se pone con: firebase functions:secrets:set SHALOM_API_KEY
- L72: El secreto del webhook. `PUT /webhooks` lo devuelve COMPLETO una sola vez;
- L73: despues queda enmascarado. Se pone con:
- L74: firebase functions:secrets:set SHALOM_WEBHOOK_SECRET
- L77: ── LAS CREDENCIALES DE SHALOM PRO ───────────────────────────────────────
     Viven en Secret Manager, la misma caja fuerte que la clave de la API. El
     dueño las escribe UNA vez desde el panel; a partir de ahí el servidor
     entra solo en Shalom — que es lo único que hace que la sesión no se caiga
     de madrugada sin nadie delante.
  
     ⚠️ NO CON `defineSecret()`, Y EL MOTIVO ES EL QUE LO HACE FUNCIONAR.
     Ese fija la versión al DESPLEGAR: si el panel guarda una contraseña
     nueva, la función seguiría usando la vieja hasta el próximo deploy —
     justo lo contrario de lo que se quiere. Se lee la versión `latest` en el
     momento de la petición, con la caché corta de `credenciales.js`.
  
     De regalo: como ya no van en `secrets: [...]`, un secreto que todavía no
     existe deja de romper el despliegue. Al dueño le acaba de pasar.
- L92: El cliente de Secret Manager, creado una sola vez.
  @return {Object} el cliente
- L105: El id del proyecto.
  
  ⚠️ SE LO PREGUNTAMOS A LA LIBRERIA, no lo deducimos. Antes esto leia
  `GCLOUD_PROJECT` / `GCP_PROJECT` / `FIREBASE_CONFIG` a mano, y en
  Cloud Functions de 2ª generacion —que por dentro es Cloud Run— ninguna
  de las tres esta garantizada. `getProjectId()` sale de las credenciales
  con las que la funcion ya esta autenticada: es la misma fuente que usa
  el cliente para hablar con Google, asi que no puede discrepar.
  Las variables quedan de respaldo por si la metadata tarda.
  @return {Promise<string>} el id del proyecto
- L122: abajo el respaldo
- L128: Lee la versión MÁS NUEVA de un secreto.
  @param {string} nombre del secreto
  @return {Promise<string>} su valor
- L140: Escribe una versión nueva. Crea el secreto si es la primera vez.
  
  Las versiones viejas se quedan en el historial de Secret Manager: eso es
  lo que permite volver atrás si el dueño se equivoca de cuenta.
  @param {string} nombre del secreto
  @param {string} valor lo que se guarda
  @return {Promise<void>} nada
- L151: ⚠️ CREAR PUEDE FALLAR Y NO PASA NADA, A PROPÓSITO.
       Dos motivos, y los dos son normales:
         · el secreto YA EXISTE — el caso de todas las veces menos la primera;
         · la cuenta de servicio no tiene permiso para CREAR secretos, porque
           el dueño le dio los permisos estrechos (añadir versión + leer) en
           vez de `admin`. Eso es mejor, no peor: así la función nunca puede
           borrar un secreto, ni el día que alguien se equivoque de línea.
       Quien manda es `addSecretVersion` de abajo: si de verdad no se puede
       escribir, falla ahí y el error llega entero. Tragarse este no esconde
       nada — solo deja de exigir un permiso que no hace falta.
- L165: ver arriba
- L173: ⚠️ ESTA LISTA DEBE COINCIDIR CON firestore.rules (funcion esAdmin).
- L174: Son dos archivos distintos que expresan la misma regla: si se cambian por
- L175: separado, alguien puede escribir en Firestore pero no hablar con Shalom, o
- L176: al reves. Al tocar una, tocar la otra.
- L177: ⚠️ Solo cuentas de Google: esAdminDe exige el correo VERIFICADO, y un
- L178: registro con contrasena nunca lo esta. Misma regla que firestore.rules.
- L185: EL ÚNICO CAMINO HACIA SHALOM: interruptor → llamada → interruptor.
  
  Lo usan el panel (a traves de shalomPuerta) y el barrido programado. Si el
  barrido tuviera su propia llamada, seria un segundo camino que se salta el
  interruptor — y entonces una caida de Shalom volveria a costar cientos de
  consultas, justo de madrugada y sin nadie mirando.
  @param {string} destino operacion de la lista blanca
  @param {Object} datos cuerpo para las operaciones POST
  @param {boolean} [diagnostico] true para `esquema` y `validate`
  @return {Promise<Object>} {ok:true, json} o {ok:false, motivo, …}
- L199: `instances` sondea igual que `validate`: es UNA consulta, no toca
       ningun envio y no gasta cuota, asi que puede pasar mientras la puerta
       descansa. Y como cualquier respuesta buena la reabre, apretar
       "Verificar sesion" es tambien la forma de preguntar "¿ya volvio?".
- L215: El estado de una guía desde el «Seguimiento de envíos» de TU Shalom Pro:
  el respaldo cuando /track falla del lado de shalom-api. Baja la lista
  entera (máx. 10 páginas de 20) UNA vez por `memo`: los horarios la piden
  una sola vez por corrida. Lee la sesión de Pro: no pasa por el buscador
  público que rechaza a shalom-api.
  @param {string} guia número de guía
  @param {Object} [memo] {filas} compartido entre llamadas
  @return {Promise<?Object>} {ok:true, estado, pasos, fuente} o null
- L251: ¿Es esta guía un envío PENDIENTE de tu cuenta de Shalom Pro? Una guía
  pendiente no sale en el rastreo público (/track dice «no la conozco»),
  pero sí en esta lista. Una consulta por llamada: `memo` la guarda para
  que la consulta por horarios la pida UNA sola vez por corrida.
  @param {string} guia número de guía
  @param {Object} [memo] {lista} compartido entre llamadas
  @return {Promise<?boolean>} true/false, o null si no se pudo mirar
- L280: Un fallo del servicio que la llamada no pudo ver por sí sola (p. ej.
  «Shalom no conoce» una guía que YA conocía): cuenta para el interruptor
  igual que un ERROR_SHALOM.
  @return {Promise<void>}
- L293: El ticket (binario) por la MISMA puerta: respeta el interruptor —si la
  puerta está apagada o pausada tras fallos, no se llama— y cuenta como una
  consulta más para abrirla o cerrarla.
  @param {Object} datos {orderNumber, orderCode}
  @return {Promise<Object>} {ok:true, bytes, tipo} o {ok:false, motivo}
- L312: Guarda bytes en el bucket con un token de descarga (el MISMO esquema de
  URL que usa el panel al subir: `…/o/<ruta>?alt=media&token=…`). No usa
  URLs firmadas: esas piden un permiso de IAM extra a la cuenta de servicio.
  @param {string} ruta "shipments/<id>/guia.png"
  @param {Buffer} bytes contenido
  @param {string} tipo content-type
  @return {Promise<string>} URL de descarga
- L333: ── EL INTERRUPTOR DE LA PUERTA ───────────────────────────────────────────
     El estado vive en Firestore para que lo compartan todos los dispositivos y
     sobreviva al reinicio de la funcion. Se cachea unos segundos en memoria
     para que un barrido de 484 guias no cueste 484 lecturas — y se actualiza a
     mano tras cada escritura, asi que dentro de un mismo barrido el conteo de
     fallos es exacto.
- L343: El estado de la puerta, de cache o de Firestore.
  @return {Promise<Object>} estado normalizado
- L357: Si no se pudo leer, NO se bloquea a nadie: normalizar(null) deja la
- L358: puerta abierta. Una puerta que se cierra porque no pudo leerse a si
- L359: misma es peor que no tener puerta.
- L366: Guarda los cambios del interruptor y refresca la cache.
  @param {Object} cambios campos a escribir
  @return {Promise<void>}
- L382: ── CORS ───────────────────────────────────────────────────────────────────
- L390: Aplica headers CORS a la respuesta, reflejando el origen solo si está
  en la lista permitida (o es localhost en cualquier puerto).
  @param {Object} req request
  @param {Object} res response
- L403: ⚠️ CADA CABECERA QUE EL NAVEGADOR MANDE TIENE QUE ESTAR AQUÍ, Y ESTO
       CASI ROMPE EL FORMULARIO ENTERO EL 15/10/2026.
  
       Añadir `X-Firebase-AppCheck` a las llamadas de la página del cliente
       convierte un GET simple en uno con preflight: el navegador pregunta
       primero con OPTIONS y, si la cabecera no está permitida AQUÍ, BLOQUEA
       la petición de verdad. No la rechaza el servidor — no llega a salir.
  
       Es decir: desplegar la página sin desplegar antes esta línea deja a
       TODOS los clientes sin poder pedir. Una medida de seguridad que tumba
       el negocio no es una medida de seguridad.
  
       Hay una prueba que compara las cabeceras que el navegador manda con
       esta lista. Si alguien añade una cabecera y se olvida de ponerla aquí,
       se pone roja antes de salir de casa.
- L422: ── formApi ────────────────────────────────────────────────────────────────
- L423: ⚠️ `secrets` AQUI DESDE EL 15/10/2026. `action=reniec` consulta el espejo
     de RENIEC de Shalom, y para eso hace falta la clave de la API. El resto de
     acciones no la tocan: declararla no las cambia en nada.
- L456: ── Whitelist de campos permitidos en order (formulario público) ───────────
- L457: Refleja exactamente los campos que construye formulario.html.
- L458: Cualquier campo extra enviado por el cliente se descarta antes de escribir
- L459: en Firestore — los campos id/status/createdAt/fromForm los pone el backend.
- L467: La agencia de destino IDENTIFICADA. Sin estos, registrar un envio en
       Shalom es imposible: `POST /account/register` pide el `ter_id`, y ese id
       solo se conoce sin adivinar en el instante en que el cliente elige la
       agencia de la lista. Si no viajan aqui, ese instante se pierde.
- L474: Tamaño máximo por campo de texto — evita payloads gigantes (M-3).
- L484: Devuelve una copia de src con solo las claves de ORDER_FIELDS.
  Trunca strings que excedan su tamaño máximo permitido.
  @param {Object} src objeto order crudo del cliente
  @return {Object} objeto filtrado
- L501: La agencia: o entran los CUATRO campos con un id valido, o no entra
       ninguno. Recortar no basta — `agenciaId: "../x"` recortado sigue siendo
       basura, y un pedido con id malo y geo buena PARECE identificado sin
       serlo. Se valida con el MISMO modulo que usa el panel, no con una copia
       que se desincronice.
       Y se limpia entero, porque tres campos sin el cuarto es peor que nada:
       el panel diria "agencia identificada" sobre algo que no se puede
       registrar, y eso se descubre con un envio pagado.
- L516: ★ LA FORMA DE UN ID, ANTES DE TOCAR LA BASE DE DATOS — 30/10/2026.
     Los ids de link (20 letras/números) y de «foto» de configuración (~16) se
     pegaban a una ruta sin mirarlos: un id con «/» leía OTRA ruta, y la basura
     costaba una lectura por intento. Lo que no tiene forma de id se responde
     ahí mismo, sin leer nada (igual que ya hace el seguimiento).
- L523: ── action=create ──────────────────────────────────────────────────────────
- L524: @param {Object} req request
  @param {Object} res response
- L529: Rate limit: máx 10 pedidos/min por IP — evita spam de pedidos falsos.
- L549: Re-validar token para evitar carreras: si ya fue usado entre ?t= y submit
- L573: El token del link ya NO es el id. Era `id_` + el reloj, o sea un numero
       que avanza solo y que cualquiera puede recorrer. Ahora son 128 bits del
       generador criptografico. Ver functions/enlaceSeguimiento.js.
- L582: Se guarda en el pedido, no en una tabla aparte: asi la consulta es una
         sola lectura (indice automatico de Firestore sobre un campo) y el
         panel puede armar el link SIN CONEXION, porque el token ya viaja con
         el pedido. Pedirselo al servidor para copiar un link dejaria a Jarry
         sin poder mandarlo cuando se le cae internet.
- L590: ★ EL NOMBRE OFICIAL, PUESTO POR EL SERVIDOR Y NUNCA POR EL NAVEGADOR.
       `POST /account/register` de Shalom pide el nombre en TRES campos
       (`name`, `firstname`, `lastname`), y partir «JOSE LUIS DE LA CRUZ» a ojo
       se equivoca. Si el pedido nace con el nombre ya partido, el dueño puede
       registrarlo sin volver a consultar el DNI.
  
       ⚠️ SALE DE LA CACHÉ DEL SERVIDOR, NO DE LO QUE MANDE EL FORMULARIO. Si
       el navegador pudiera mandar `reniec: {...}`, cualquiera podría poner el
       nombre que quisiera EN UNA ETIQUETA DE ENVÍO REAL. El navegador
       pregunta; el servidor consultó, guardó, y ahora se acuerda. `reniec`
       tampoco está en ORDER_FIELDS, así que lo que venga de fuera con ese
       nombre se tira antes de llegar aquí.
  
       Y solo si CORRESPONDE AL DNI DEL PEDIDO: el cliente puede consultar un
       documento y escribir otro. Pegar el nombre del primero sería darle a
       Shalom el nombre de otra persona — peor que no tener ninguno.
- L621: Un pedido NUNCA se pierde por esto: el nombre partido es una mejora,
- L622: no un requisito. Sin él, el panel lo consulta al abrir el pedido.
- L626: Monto/adelanto vienen del TOKEN (los puso el operador), NO del cliente →
- L627: el cliente no los ve ni los puede alterar. Deuda = max(0, monto-adelanto)
- L628: se guarda en `cost` (lo leen tarjeta/dashboard/tracking, etc.).
- L638: ★ EL NÚMERO DE FACTURA O BOLETA, DEL TOKEN Y NUNCA DEL CLIENTE.
       Igual que el monto: lo escribió el dueño al generar el link. No está
       en ORDER_FIELDS, así que si el formulario manda `nroComprobante` se
       tira antes de llegar aquí — nadie puede ponerse el número de otra
       venta. Se vuelve a limpiar aunque lo haya escrito el panel: en el QR
       de la etiqueta un `#` de más rompe la lectura.
- L647: ★ ESCRITURA EN UNA TRANSACCIÓN, Y CON `create`, NUNCA `set` — 30/10/2026.
       Dos agujeros que el lote (batch) dejaba abiertos:
         · CHOQUE DE ID. El id es `id_` + el milisegundo. Dos clientes que
           confirman en el mismo milisegundo daban el MISMO id, y `set` hacía
           que el segundo pedido BORRARA al primero sin avisar. Ahora se lee
           el id dentro de la transacción y se graba con `create` (falla si
           existe): ocupado → se prueba el milisegundo siguiente. El formato
           del id no cambia (el panel y los links viejos dependen de él).
         · LINK USADO DOS VECES. «¿Ya se usó?» se miraba ANTES y fuera: dos
           pestañas con el mismo link pasaban las dos y nacían dos pedidos.
           Ahora mirar y marcar son la MISMA operación.
- L682: formTs: campo exclusivo del formulario — el panel nunca lo
- L683: sobreescribe. ts: señal legacy que el panel también escucha.
- L684: syncV: el servidor ya graba `_mts` → el panel puede pedir solo lo
- L685: cambiado. Mientras no exista, el panel hace la carga completa.
- L701: El formulario lo usa como código en el WhatsApp del cliente, para que
       diga lo mismo que la etiqueta. Solo si existe: los links sin número
       responden exactamente igual que antes.
- L709: ── action=token ───────────────────────────────────────────────────────────
- L710: @param {Object} req request
  @param {Object} res response
- L734: ★ LA FOTO DE LA CONFIGURACIÓN VIAJA CON EL TOKEN, NO SOLO EN LA URL.
       Cada link congela al generarse qué días y qué couriers ofrece (la
       «foto», en FORMCFG_COL). Hasta el 26/10/2026 su id viajaba solo en la
       URL (`&cfg=…`), y un cliente que editara el enlace podía cambiarlo por
       el de otro link y ver otros couriers u otros días. Ahora el panel lo
       guarda también DENTRO del token, y el formulario prefiere este.
       Los tokens viejos no lo tienen: devuelven "" y el formulario sigue con
       el de la URL, como antes. Se valida la forma para no devolver basura
       que el formulario usaría como ruta.
- L754: ── action=config ──────────────────────────────────────────────────────────
- L755: @param {Object} req request
  @param {Object} res response
- L762: Solo campos públicos que el formulario necesita.
- L763: NUNCA exponer statusPin, trash, msgTemplates ni labels al público.
- L774: ── action=formcfg ─────────────────────────────────────────────────────────
- L775: @param {Object} req request
  @param {Object} res response
- L784: Lista blanca también aquí: la «foto» la arma el panel, pero lo que
- L785: sale al público se decide en el servidor, campo por campo.
- L789: ★ LO QUE EL PÚBLICO VE DE LA CONFIGURACIÓN: LISTA BLANCA — 30/10/2026.
     Antes salía el objeto `config` ENTERO (horarios del barrido,
     interruptores de Shalom…). Nada era secreto, pero con ese diseño CADA
     CAMPO NUEVO NACÍA PÚBLICO — el mismo error que sacó la clave de recojo
     por el seguimiento (OWASP API3:2023). El formulario solo usa estos.
- L798: Copia con solo las claves permitidas.
  @param {Object} src objeto completo
  @param {Array} claves permitidas
  @return {Object} copia filtrada
- L813: La parte pública de `config`.
  @param {Object} c config completa
  @return {Object} config pública
- L822: ¿El link personalizado `t` (sin usar) es de este celular?
  @param {string} t id del token
  @param {string} phone 9 dígitos
  @return {Promise<boolean>} true si coincide
- L844: ── action=client ──────────────────────────────────────────────────────────
- L845: GET ?action=client&phone=9XXXXXXXX → {name, address} del ultimo pedido, para
- L846: reconocer al cliente que vuelve y ahorrarle escribir sus datos.
- L848: PRIVACIDAD — el formulario es publico (se abre sin token), asi que este
- L849: endpoint podria usarse para averiguar si un numero es cliente y obtener su
- L850: domicilio. Cuatro barreras lo hacen inviable como via de cosecha:
- L851: 1. Rate limit por IP (20/min).
- L852: 2. Se devuelve el MINIMO: nombre y direccion. Nunca DNI, montos, notas,
- L853: documentos, historial ni el resto del pedido.
- L854: 3. Solo pedidos de los ultimos 12 meses.
- L855: 4. Respuesta IDENTICA ({}) en todos los casos negativos —sin datos, fuera
- L856: de ventana, limite alcanzado o error— para no revelar el porque.
- L857: @param {Object} req request
  @param {Object} res response
- L871: Sin orderBy: la igualdad usa el indice automatico y no hace falta crear
- L872: un indice compuesto. El tope acota el costo; el mas reciente se elige en
- L873: memoria (un cliente real no tiene decenas de pedidos abiertos).
- L883: ★ SIN FUGA POR CELULAR — 30/10/2026. Antes, escribir CUALQUIER
         celular devolvía el nombre completo y la última dirección de esa
         persona: un robot con IPs rotando podía recorrer números. Ahora:
           · link personalizado de ESE MISMO celular → todo, como antes (el
             dueño ya escribió ese número al generar el link);
           · cualquier otro caso → solo el primer nombre, para el saludo.
         El nombre completo lo pone el DNI (RENIEC), que va antes en el paso.
- L895: nunca romper el formulario por esto
- L899: ── action=reniec ──────────────────────────────────────────────────────────
- L900: ¿Trae esta petición una prueba válida de App Check?
  
  ⚠️ SE EXIGE AQUÍ Y NO EN LAS DEMÁS ACCIONES, A PROPÓSITO. `create`,
  `track` y `client` ya tienen clientes de verdad usándolas: exigirles de
  golpe una capa nueva dejaría fuera a quien tenga reCAPTCHA caído o un
  navegador viejo, y perder un pedido real es peor que el ataque del que
  protege. Esas se MIDEN primero (ver appcheck.js en formulario.html).
  
  `reniec` nace hoy. Una puerta que todavía no existe no tiene a nadie a
  quien dejar fuera, así que nace cerrada — que es la única vez que sale
  gratis cerrarla.
  @param {Object} req request de Express
  @return {Promise<boolean>} true si la prueba es válida
- L922: No se dice por qué: a quien no pasa no se le explica cómo pasar. En
         los registros sí queda, que es donde el dueño lo necesita.
- L929: El espejo de RENIEC, para la página del cliente.
  
  Las cuatro capas y el porqué de cada una están en
  `functions/reniecPublico.js`. Aquí solo está el ir y venir: leer la
  caché, contar el día, llamar a Shalom y guardar.
  
  ⚠️ ESTO NO TOCA EL INTERRUPTOR DE LA PUERTA. `_porLaPuerta` apunta los
  fallos y cierra el paso tras cinco seguidos — correcto para el panel, y
  peligroso aquí: una racha de fallos desde la página pública dejaría al
  dueño sin poder REGISTRAR ENVÍOS, que es lo que da de comer. La página
  del cliente no puede apagarle el panel. Lo que acota el gasto aquí es el
  tope diario, no el interruptor.
  @param {Object} req request
  @param {Object} res response
  @return {Promise<void>}
- L971: Si no se puede leer, se sigue como si no hubiera nada: el tope de
         abajo y el freno por IP siguen puestos. Un formulario que se cae
         porque Firestore tosió es peor que una consulta de más.
- L991: ⚠️ SE CUENTA ANTES DE LLAMAR, Y NO DESPUÉS DE ACERTAR. Contar solo los
       aciertos deja el gasto sin tope el día que Shalom conteste mal a todo:
       cada fallo sería gratis para el contador y caro para la factura. Con el
       día caído, el cliente escribe su nombre — que es lo que hacía ayer.
- L1002: UNA consulta → {ok, persona} | {ok:false, motivo} con la causa REAL
       (ver reniecPublico.resultado: «no encontrado» solo si Shalom lo dice).
- L1015: ★ UN reintento en el servidor (30/10/2026), solo si la falla es
       temporal (corte, 5xx, respuesta rara) y no es un «demasiadas»: lo que
       Shalom tose un instante no debe llegarle al cliente como «no existe».
       Se cuenta otra vez antes de llamar: el tope diario cubre también esto.
- L1046: Lo que sale al navegador. SOLO el nombre, y campo por campo.
  
  Devolver el objeto guardado entero enseñaría `cuando` —cuándo se consultó
  ese DNI por primera vez— que no le hace falta a nadie en la pantalla y le
  diría a cualquiera si ese documento ya pasó por aquí. Lo que no se copia a
  mano no se escapa por accidente.
  @param {Object} p lo guardado
  @return {Object} lo que ve el navegador
- L1066: ── action=track ───────────────────────────────────────────────────────────
- L1067: @param {Object} req request
  @param {Object} res response
- L1078: ── REJA 1: LA FORMA, y antes que nada ────────────────────────────────
       Lo que no tiene forma de token se responde aqui mismo, SIN tocar la
       base de datos. Antes, `token=cualquiercosa` costaba una lectura de
       Firestore: un robot recorriendo valores nos cobraba a nosotros cada
       intento. Ahora la basura no cuesta nada.
       De paso cierra algo que no era una fuga pero lo parecia: el token se
       concatenaba a una ruta (`panel/shipments/items/<token>`) sin validarlo.
- L1091: ── REJA 2: EL FRENO, antes de leer ───────────────────────────────────
       Se responde 429 y no un "no encontrado": decirle a alguien que su link
       no existe cuando lo que pasa es que hay demasiadas consultas lo manda a
       buscar el problema donde no esta. La pagina lo traduce a palabras.
- L1103: ── REJA 3: BUSCAR, por el camino que toque ───────────────────────────
       Dos formas de token conviven a proposito: hay mas de mil links ya
       enviados por WhatsApp y tienen que seguir abriendo para siempre.
- L1111: Igualdad sobre un campo: usa el indice automatico de Firestore, no
- L1112: hace falta declarar ninguno (mismo patron que la busqueda por phone).
- L1124: ⚠️ LA PUERTA TRASERA, cerrada aqui.
       Un pedido nuevo guarda token al azar, pero su id de documento sigue
       siendo `id_` + el reloj. Sin esta linea, ese pedido se abriria por su
       id adivinable IGUAL QUE ANTES y el token al azar seria decoracion.
       Los pedidos de ayer no tienen token, asi que su id les sigue valiendo.
- L1134: FINALIZADO también: es la etiqueta final de hoy (ENTREGADO es el nombre
       viejo). Sin él, un pedido terminado se seguía consultando cada 30 s
       mientras el cliente miraba —una lectura y una llamada cada vez— para
       algo que ya no cambia.
- L1141: ★ LISTA BLANCA, no lista negra.
       Aqui se copiaba el pedido ENTERO y se borraba una lista de campos
       prohibidos. Con ese diseño CADA CAMPO NUEVO NACE PUBLICO: nadie se
       acuerda de añadirlo a la lista de borrados, y el fallo no se ve — el
       dato simplemente viaja.
  
       Paso de verdad: la clave de recojo (`shalomClave`) se añadio al pedido y
       empezo a salir en la respuesta de este endpoint sin que nada avisara. Un
       link de seguimiento se reenvia, se queda en un historial y no caduca; una
       clave que viaja por ahi deja de proteger el paquete.
  
       Es OWASP API3:2023 (Broken Object Property Level Authorization), y su
       remedio documentado es exactamente esto: enumerar lo permitido.
  
       Lo que el cliente ve se decide en functions/pedidoPublico.js, y hay una
       prueba que compara esa lista con los campos que el formulario lee de
       verdad — asi no se puede quedar corta sin que salte.
- L1161: Estado de Shalom: solo se muestra al cliente si el operador activo la
- L1162: opcion "Mostrar en el link del cliente". Filtro MOTOR-AGNOSTICO: aplica
- L1163: sin importar que motor genero el dato (A o B). Si esta apagado, ocultamos
- L1164: el texto de tracking del link publico (el panel siempre lo ve). Solo
- L1165: leemos config cuando hay un estado que potencialmente ocultar.
- L1166: Un pedido viejo ya minimizado no lleva estado de Shalom: no se lee nada.
- L1178: ── Rate limit básico ──────────────────────────────────────────────────────
- L1179: Contador por IP en Firestore — ventana de 60 s, fail-open si Firestore falla.
- L1180: Ruta: panel/rateLimits/items/{fn_ip_window} — cubierta por rules actuales
- L1184: Consulta de cliente recurrente: 20/min alcanza de sobra para el uso real
- L1185: (una consulta por pedido) y hace inviable cosechar la cartera.
- L1187: El link de seguimiento. 120/min y NO 30, que fue mi primer numero.
       La pagina del cliente se refresca sola cada 30 s —2 peticiones por
       minuto por pestaña abierta— y en Peru Claro y Movistar meten miles de
       usuarios detras de una misma IP publica (CGNAT). Un freno de 30 habria
       bloqueado CLIENTES REALES: un autogol, peor que el problema que
       resuelve. Con 120 caben 60 pestañas desde una misma IP, muy por encima
       del uso real, y aun asi recorrer un solo dia de milisegundos le tomaria
       a un raspador medio año.
- L1195: `memoria: true` desde el 30/10/2026: el freno del seguimiento costaba
       una lectura + una escritura de Firestore EN CADA RECARGA (cada 30 s por
       pestaña) — más caro que el seguimiento mismo. Ahora se cuenta en la
       memoria de cada instancia: gratis. Con `maxInstances: 10` el techo real
       es 10 × 120/min por IP, y aun así recorrer tokens de 128 bits es
       imposible: el freno aquí solo corta la avalancha, no protege el secreto.
- L1202: La consulta de DNI. 10/min: un cliente escribe UNO, como mucho lo
       corrige dos veces. Mas bajo que `client` (20) porque esta cuesta dinero
       de verdad y la otra solo una lectura. Y aun asi el freno por IP aqui es
       la capa DEBIL —en Peru media ciudad comparte IP publica, y un bot con
       datos moviles cambia de IP cuando quiere—: quien de verdad acota el
       daño es el tope diario de reniecPublico.js.
- L1211: Contadores en memoria: {clave: {w: ventana, n: cuenta}}. Se vacía al
     cambiar de ventana para no crecer sin fin.
- L1216: Freno por IP en la memoria de la instancia (sin Firestore).
  @param {string} clave nombre|ip
  @param {number} ventana inicio de la ventana (ms)
  @param {number} max tope por ventana
  @return {boolean} true = permitir
- L1233: Devuelve false si la IP superó el límite en la ventana actual.
  Fail-open: permite la solicitud si Firestore no está disponible.
  @param {string} name clave de RATE_LIMITS
  @param {Object} req request de Express
  @return {Promise<boolean>} true = permitir, false = rechazar
- L1254: `rlExpira`: para que Firestore BORRE SOLO estos registros con una
           política TTL (consola → Firestore → TTL, grupo `items`, campo
           `rlExpira`). Nombre propio a propósito: ningún otro documento de un
           grupo `items` lo tiene, así que la política no toca nada más.
           Sin la política, el campo no hace nada y todo sigue igual.
- L1265: fail-open: nunca bloquear por error de Firestore
- L1269: ── FUNCIONES OLVA ───────────────────────────────────────────────────────
- L1270: Mismo patron que Shalom (proxy servidor → JSON local → buscador vivo), pero
- L1271: SIN clave: el endpoint del sitio de Olva es publico y abierto.
- L1272: ──────────────────────────────────────────────────────────────────────────
- L1276: Trae el catalogo COMPLETO de agencias Olva (publico, sin clave).
  Desenvuelve el sobre estandar de WordPress AJAX: {success, data}, donde
  `data` puede venir como array directo o anidado en `data.data` (asi lo
  maneja el propio script.js de Olva).
  @return {Promise<Array>} lista de agencias crudas
- L1301: ── olvaListar ──────────────────────────────────────────────────────────
- L1302: GET → listado completo de agencias Olva. Caller: agencias-extractor.js.
- L1332: ── agenciasOlva ────────────────────────────────────────────────────────
- L1333: GET ?q=TEXTO → filtra en memoria (el endpoint de Olva no soporta busqueda
- L1334: server-side, asi que se filtra aqui sobre el catalogo completo).
- L1335: GET          → listado completo.
- L1336: Caller: formulario.html — buscador publico de agencias (fallback en vivo).
- L1359: Se responde en el MISMO formato que data/agencias-olva.json: el
- L1360: formulario tiene un solo contrato, venga del JSON o de aqui.
- L1386: Ambos modos exigen token de Firebase Auth (solo el panel logueado).
- L1400: Modo prueba (?url=): solo lectura, no escribe en Firestore.
- L1401: Solo baja de apisale (whitelist). Ahora tambien protegido con token.
- L1429: Idempotencia: ya procesado con mismo hash y version -> lo guardado.
- L1457: No pisar ediciones: solo escribe cotizItems si el pedido no tenia.
- L1473: ── SHALOM · retirado el 2026-09-13, se reconstruye endpoint por endpoint ───
- L1475: Aqui vivian `shalomApi` (intermediario con la API oficial) y `shalomWebhook`
- L1476: (avisos de cambio de estado). Se retiran ENTEROS para rehacer la integracion
- L1477: desde cero: la clave anterior quedo expuesta en capturas y se rota, y hubo
- L1478: dos fallos de traduccion que costaron dias — `statuses.message` pisando el
- L1479: arbol de pasos, y una demora tapando un "Entregado".
- L1481: Lo que NO se tira es lo aprendido: la forma REAL de `/track` y de
- L1482: `/instances/status`, medida contra la API y no supuesta, sigue escrita en
- L1483: docs/SHALOM.md junto al plan de reconstruccion. Volver a medir lo que ya
- L1484: estaba medido seria pagar dos veces.
- L1486: Mientras tanto el panel funciona igual: `shalom.js` es la puerta unica y
- L1487: responde DESCONECTADO, que la interfaz ya sabe mostrar ("Rastreo Shalom en
- L1488: reconstruccion"). Ninguna pantalla se rompe.
- L1490: AL VOLVER A CONECTAR, lo que habia y hay que conservar:
- L1491: · La clave vive en Secret Manager, nunca en el navegador.
- L1492: · Tres barreras antes de hablar con Shalom: token de Firebase Auth valido,
- L1493: correo en la lista de administradores (la misma de firestore.rules), y
- L1494: lista blanca de operaciones — no un proxy ciego.
- L1495: · El webhook verifica la firma sobre el CUERPO CRUDO, compara en tiempo
- L1496: constante y deduplica con un create() atomico.
- L1497: · La etiqueta del pedido (`status`) no se toca nunca: informar si, decidir
- L1498: por el operador no.
- L1499: · Un envio no desanda el camino (ver docs/INVARIANTES.md, 2 bis).
- L1501: ── shalomWebhook ─────────────────────────────────────────────────────────
- L1502: LA UNICA PUERTA PUBLICA SIN AUTENTICACION DEL SISTEMA. Cualquiera en
- L1503: internet puede llamarla; lo unico que separa un aviso de Shalom de uno
- L1504: inventado es la firma. Por eso aqui no hay atajos y no se escribe NADA
- L1505: antes de verificarla.
- L1507: ⚠️ ETAPA 4a: MIDE, NO TRADUCE. El webhook habla otro idioma que /track
- L1508: ("IN_TRANSIT" en vez de "En transito") y ese mapa no esta documentado en
- L1509: ninguna parte. Adivinarlo seria repetir el fallo que costo dias, esta vez
- L1510: escribiendo solo y de madrugada. Asi que por ahora: verifica, descarta
- L1511: repetidos, y ANOTA la forma y los codigos. Ningun pedido se toca.
- L1515: ⏸ APARCADO — 22 de septiembre de 2026.
- L1516: La funcion NO se despliega: el despliegue se retiro a proposito porque
- L1517: Shalom nunca llego a registrar la URL (su formulario devolvia "URL
- L1518: requerida" con el campo lleno), asi que no recibia nada — pero seguia
- L1519: siendo una puerta publica abierta en internet, y cada peticion rechazada
- L1520: le costaba una escritura a Firestore. Cero beneficio, costo real.
- L1522: El codigo y sus pruebas se quedan intactos. Para revivirlo: poner esto en
- L1523: true, ARREGLAR ANTES el contador de rechazos (ver docs/DEUDA.md § 24),
- L1524: registrar la URL con `PUT /webhooks` y guardar el secreto que devuelve.
- L1526: Sin este interruptor, un `firebase deploy --only functions` volveria a
- L1527: crear la funcion sola y la puerta reaparecia sin que nadie se enterara.
- L1536: No lo llama un navegador: no hay CORS que dar.
- L1543: req.rawBody son los bytes TAL COMO LLEGARON. Reparsear el JSON y volver a
- L1544: serializarlo cambia los bytes, y entonces la firma no cuadra nunca.
- L1551: Se anota para poder ver si alguien esta probando la puerta. El cuerpo NO
- L1552: se guarda: si no esta firmado, no hay razon para creer nada de lo que
- L1553: trae —ni para darle sitio en la base de datos—.
- L1560: No vale fallar por no poder anotar.
- L1562: Respuesta corta y sin detalle: decir QUE fallo ayuda a quien prueba.
- L1567: Repetidos. Shalom reintenta si no respondemos rapido, y aplicar dos veces
       el mismo aviso duplica historiales. `create()` falla si el documento ya
       existe, asi que la comprobacion y la marca son UNA sola operacion: entre
       mirar y escribir no cabe un segundo intento.
- L1575: Ya estaba: es un reintento. 200 para que deje de insistir, y nada mas.
- L1589: La FORMA (tipos, sin valores) y los CODIGOS (MAYUSCULAS, que nunca son
- L1590: un nombre ni una direccion). Con eso se mide el vocabulario sin
- L1591: guardar datos de nadie.
- L1609: Solo se exporta —y por tanto solo existe en internet— si el interruptor
- L1610: esta en true. Con false, `firebase deploy` ni la ve.
- L1613: ── barridoShalom ─────────────────────────────────────────────────────────
- L1614: El seguimiento automatico. Cloud Scheduler dispara CADA 30 MINUTOS y la
- L1615: funcion decide si le toca: asi los horarios viven en Config y se cambian sin
- L1616: volver a desplegar. Los disparos que no tocan no consultan nada a Shalom.
- L1618: Nacio en simulacro (decidia y no escribia) hasta que el informe cuadro.
- L1619: El 26/10/2026 el dueño lo retiro: desde entonces SIEMPRE escribe. Un
- L1620: `config.barrido.simulacro` que quede guardado en la nube se ignora.
- L1622: entre consulta y consulta
- L1623: margen bajo el timeout de 540 s
- L1624: cuantas lineas guarda el informe
- L1626: El barrido, en una funcion: lo llaman el horario y el boton "Correr ahora".
  Dos copias de esto acabarian barriendo distinto segun quien lo dispare.
  @param {boolean} [forzado] true = saltarse el reloj (boton manual)
  @return {Promise<?Object>} el informe, o null si no le tocaba
- L1635: 1 · ¿toca ahora?
- L1645: El boton manual se salta el horario, pero NO el interruptor: si el
- L1646: seguimiento automatico esta apagado, apagado esta.
- L1654: 2 · a quien se consulta
- L1669: 3 · consultar, decidir
- L1673: la lista de pendientes, UNA vez por corrida
- L1674: el Seguimiento de Shalom Pro, UNA vez por corrida
- L1675: estados que salieron del Seguimiento de Shalom Pro
- L1676: guías del panel que aún no entran a la agencia
- L1677: Por que fallaron, no solo cuantas. "6 fallaron" no se puede accionar:
       no distingue un corte de red de una cuota agotada ni de una clave
       rechazada, y cada una se arregla en un sitio distinto.
- L1689: «Shalom no conoce esta guía» (situacion de registroShalom):
           · por dejar → lo esperado: el paquete aún no está en la agencia.
             No es un fallo; se cuenta aparte para verlo en el informe.
           · con movimiento → Shalom ya la conocía: huele a Shalom caído, y
             cuenta para el interruptor como un fallo del servicio. Así una
             caída real se sigue detectando aunque llegue disfrazada.
- L1695: shalom-api no pudo leerla: el estado, del Seguimiento de tu Shalom Pro
- L1710: La puerta se cerro: seguir seria pedirle a un servicio caido 60 veces
- L1711: mas que nos diga que sigue caido.
- L1738: 4 · escribir
- L1754: Que el panel se entere de que hay datos nuevos sin releerlo todo.
- L1758: el latido se encargara
- L1760: Sin cambios: solo se anuncia que el servidor ya graba `_mts`, para
         que «▶️ Correr ahora» active la sincronización rápida sin esperar a
         un pedido. SIN `ts`: no hace recargar a ninguna PC.
- L1765: lo anunciara el proximo pedido
- L1768: 5 · el informe. Es lo unico que se ve desde Config, asi que dice TODO:
- L1769: a cuantos no se les pregunto y por que, no solo lo que cambio.
- L1793: El horario. Cada 30 min pregunta; _correrBarrido decide si le toca.
- L1794: ★ LIMPIEZA DIARIA DE LÁPIDAS (Fase 8, 11/11/2026). Ver functions/limpieza.js:
     ningún equipo usa una lápida de más de 12 h, y se borran las de más de 30
     días. Una consulta al día que solo lee lo que va a borrar; a las 03:17 de
     Lima, lejos de las horas del barrido y del trabajo.
- L1817: Un barrido perdido se recupera en el horario siguiente; uno repetido
- L1818: consultaria todo dos veces.
- L1824: ── barridoAhora ──────────────────────────────────────────────────────────
- L1825: El mismo barrido, a peticion. Sirve para ver el informe sin esperar a las
- L1826: 19:00, y despues para forzar una actualizacion cuando hace falta.
- L1827: Mismas barreras que la puerta: POST, token valido y correo de administrador.
- L1856: Misma regla que la puerta: el correo solo vale si esta verificado.
- L1876: ── shalomPuerta ───────────────────────────────────────────────────────────
- L1877: POST {op}  →  la unica via del panel hacia Shalom.
- L1879: CUATRO BARRERAS, en este orden y todas obligatorias:
- L1880: 1. POST con token de Firebase Auth valido        → si no: SIN_SESION
- L1881: 2. Correo en ADMINS (la misma lista que las reglas) → si no: SIN_PERMISO
- L1882: 3. La operacion esta en la lista blanca          → si no: NO_PERMITIDO
- L1883: 4. Recien entonces se usa la clave, del lado servidor
- L1885: Los codigos HTTP son de las BARRERAS (401/403/405). Lo que pase con Shalom
- L1886: viaja siempre en 200 con {ok:false, motivo}: para el panel, "Shalom dijo que
- L1887: no" no es un error de transporte, y mezclarlos fue lo que hizo que un fallo
- L1888: de sesion se leyera como "tu plan vencio".
- L1890: Operaciones de hoy:
- L1891: {op:"validate"}                        → {ok, valida, limite, usado, …}
- L1892: {op:"esquema", de:"validate"}          → la FORMA, sin valores
- L1893: {op:"esquema", de:"track", datos:{…}}  → idem, para medir /track
- L1895: `track` esta en la lista pero marcado `soloMedir`: se puede medir y todavia
- L1896: no usar. Pedirlo como operacion normal responde SIN_TRADUCTOR.
- L1898: ⚠️ LOS TRES SECRETOS TIENEN QUE EXISTIR ANTES DE DESPLEGAR. Una
         funcion que declara un secreto que no esta en Secret Manager NO
         DESPLIEGA — y que falle en el deploy es exactamente donde se quiere
         que falle, no en produccion con el dueño delante.
- L1902: Solo la clave de la API va declarada. Las credenciales de Shalom Pro
         se leen en el momento de la peticion (ver arriba), asi que un secreto
         que aun no existe NO rompe el despliegue.
- L1913: Las cuatro barreras viven en shalomPuerta.js para poder probarlas.
- L1927: ★ REGISTRAR UN ENVIO — no es un reenvio, es una orquestacion.
           El navegador manda SOLO el id del pedido: aqui se lee de Firestore,
           se comprueban los candados contra lo que hay AHORA, se arma el
           cuerpo, se llama y se escribe el resultado. Asi nadie puede
           falsificar un campo ni saltarse un candado desde la consola.
           Arranca en SIMULACRO: se enciende desde Config, a conciencia.
- L1946: La MISMA funcion que usa el panel para avisarte antes de
- L1947: gastar una llamada. Dos copias divergen; una no puede.
- L1957: Solo para «registrar de nuevo» tras 24 h: pregunta a Shalom
                 si la guía vieja entró a alguna agencia. Una consulta, y solo
                 cuando se pide renovar.
- L1969: `recuperarEnvio` SOLO LEE: busca el envio en pendientes y
               rellena la guia. Nunca llama a `register`, asi que no tiene
               simulacro ni puede costar nada.
- L1979: ⚠️ Un error AQUI tampoco es "fallo": si revento despues de
               llamar a Shalom, el envio pudo crearse. Se dice duda.
- L1989: ★ JALAR EL TICKET DE SHALOM. El servidor descarga, guarda en el
           bucket y apunta en el pedido; el navegador recibe solo el enlace.
           Ver functions/ticketShalom.js.
- L2013: Que las otras PCs se enteren, como hace el barrido.
- L2027: ★ CONECTAR LA CUENTA DE SHALOM PRO — crear si hace falta, entrar
           siempre, comprobar. Una sola operacion idempotente: pulsarla dos
           veces no crea dos instancias.
  
           Se entra SIEMPRE aunque ya figure conectada, y no es un descuido:
           entrar por la API es lo que deja las credenciales guardadas en la
           instancia, y eso es lo que hace que la sesion se levante sola
           cuando expira. Sin credenciales guardadas llega el 401 que su
           propia documentacion llama «el fallo mas repetido de esta API».
- L2036: ★ LA CUENTA DE SHALOM PRO (rehecho el 11/11/2026, ver
           functions/cuentaShalom.js). Dos operaciones:
             conectarShalom → {usuario?, clave?}: si llegan, van UNA vez a
               Secret Manager (nunca vuelven); si no, se usan las guardadas.
               Encuentra TU instancia por tu correo, la crea si no existe,
               entra solo si hace falta y guarda en el servidor cuál es.
             estadoShalom → ¿sigue conectada? Gratis.
           El navegador recibe «conectada · tu correo» y nada más: ni la
           contraseña, ni la lista de instancias de la cuenta de la API.
- L2077: El registro de envíos lee la instancia de AQUÍ, no del navegador.
- L2100: el correo SÍ: no es un secreto
- L2105: Sin `clave` en la respuesta, ni aquí ni en el error.
- L2140: 4 · el interruptor y la llamada, por el camino unico.
- L2143: shalom-api no pudo leer la guía (su buscador público es
             rechazado): el estado sale del Seguimiento de TU Shalom Pro.
- L2154: «No la conozco» en /track: ¿es un envío PENDIENTE de tu cuenta?
             Entonces existe y solo falta dejar el paquete: se dice con
             certeza (PENDIENTE), no como «revisa la guía».
- L2177: Solo tipos, ni un valor: asi se escribe el contrato contra lo que
- L2178: la API devuelve de verdad sin que salga un dato de nadie.

## functions/interruptor.js

- L3: functions/interruptor.js — la puerta de Shalom se apaga sola y se reenciende
  ============================================================================
  Lo que pidió el negocio, literal: "si Shalom API deja de funcionar, que solo
  apague la puerta y siga con otras formas; y cuando regrese la API, que la
  prenda y siga funcionando bien".
  
  TRES ESTADOS
    ABIERTA   normal: pasa todo.
    CERRADA   tras varios fallos seguidos. Se responde al instante, SIN llamar
              a Shalom. Una caída suya deja de costar cientos de consultas que
              van a fallar igual, y el panel deja de quedarse colgado.
    A PRUEBA  pasado el descanso, se deja pasar UNA sola consulta. Si entra,
              la puerta se abre; si falla, otro descanso. Reabrir de golpe
              mandaría las 484 guías contra un servicio que sigue caído.
  
  ⚠️ LO QUE APAGA LA PUERTA Y LO QUE NO — es la decisión central de este
  archivo. Solo apagan los fallos DEL SERVICIO (no hay red, error suyo, clave
  bloqueada, cuota agotada). Nunca los del DATO: una guía que no existe es
  información correcta sobre esa guía, y cinco guías malas seguidas no pueden
  dejar al negocio sin seguimiento. Confundir los dos lados es el error que ya
  costó dias en este proyecto, dos veces.
  
  Este archivo es logica PURA: no habla con Firestore ni con la red. Recibe el
  estado y la hora, y dice que hacer. Asi se puede probar cada transicion sin
  esperar el descanso real.
- L31: Fallos seguidos del servicio antes de cerrar.
- L34: Cuanto descansa la puerta cerrada, en ms. UN MINUTO como máximo
      (pedido del dueño, 28/10/2026; antes 10). Basta para no martillar a un
      Shalom caído, y si fue un tropiezo la puerta vuelve casi al instante.
      Tras el minuto pasa UNA consulta de prueba: si falla, otro minuto.
- L40: Motivos que SI son culpa del servicio. Todo lo demas es informacion sobre
  un dato concreto y no dice nada sobre si Shalom esta en pie.
- L46: Un estado seguro a partir de lo que haya guardado (o nada).
  @param {*} doc lo leido de Firestore
  @return {Object} estado normalizado
- L55: Por defecto ENCENDIDA: un documento que no existe todavia no puede
- L56: dejar el seguimiento apagado sin que nadie lo haya decidido.
- L64: ¿Pasa esta consulta?
  @param {Object} estado estado normalizado
  @param {number} ahora Date.now()
  @param {boolean} [esDiagnostico] true para `validate`: ver abajo
  @return {Object} {pasa, probando} o {pasa:false, motivo, reabre}
- L73: El interruptor manual manda sobre todo lo demas: si el operador la apago,
- L74: no se consulta ni para probar. Ni el diagnostico se salta esto — apagada
- L75: es apagada, y una excepcion aqui haria que el interruptor mintiera.
- L77: `validate` se salta el descanso a proposito: es UNA consulta, no toca
       ningun envio, y es la unica forma de preguntar "¿ya volvio?" sin esperar
       los diez minutos a ciegas. La documentacion de Shalom lo dice igual: ante
       un 429, backoff y consultar GET /validate. Y como cualquier respuesta
       buena reabre la puerta, preguntar es tambien lo que la reenciende.
- L85: Habia descanso y ya paso: esta es la consulta de prueba.
- L89: Que guardar despues de una consulta. Devuelve null si nada cambia — asi no
  se escribe en Firestore por cada consulta que sale bien estando ya abierta.
  @param {Object} estado estado normalizado
  @param {Object} r resultado {ok, motivo}
  @param {number} ahora Date.now()
  @param {boolean} probando si esta consulta era la de prueba
  @return {?Object} campos a escribir, o null
- L102: Entro. Si no habia nada que limpiar, no se escribe nada.
- L108: Un fallo del DATO no dice nada sobre si Shalom esta en pie.
- L111: La consulta de prueba fallo: se vuelve a cerrar sin contar hasta cinco.
- L112: Ya sabemos que sigue caido; gastar cuatro consultas mas es regalarlas.

## functions/limpieza.js

- L3: functions/limpieza.js — BORRAR LAS LÁPIDAS VIEJAS (Fase 8, 11/11/2026)
  =====================================================================
  Cada pedido o proveedor borrado deja una LÁPIDA en
  `panel/borrados/items/<col>__<id>`, para que los demás equipos se enteren
  del borrado al pedir «solo lo que cambió» (functions/sincro.js). Nadie las
  borraba: se acumulaban para siempre.
  
  ¿CUÁNDO DEJA DE HACER FALTA UNA? Un equipo cuya última carga completa
  tiene más de 12 horas (`COMPLETA_CADA_MS`) no pide cambios: baja TODO de
  nuevo, y ahí los borrados ya no están. Así que ninguna lápida de más de
  12 h le sirve a nadie. Se borran las de más de DIAS (30): una margen
  enorme a propósito, por si algún día esa regla cambia.
  
  Lógica aislada de Firestore: recibe una `db` con la forma mínima que usa,
  para poder probarla con una de mentira.
- L22: Por tanda: Firestore admite 500 escrituras por lote.
- L24: Tandas por corrida: una corrida diaria no tiene por qué ser larga.
- L27: Borra las lápidas con `_mts` anterior a hace DIAS días.
  @param {Object} db Firestore (o una con collection/where/limit/get/batch)
  @param {number} ahoraMs ahora, en ms
  @param {Function} aFecha convierte ms en el tipo de fecha de Firestore
  @return {Promise<Object>} {borradas, tandas, quedan}

## functions/montoPedido.js

- L3: functions/montoPedido.js — CUÁNTO DEBE UN PEDIDO, Y CÓMO SE ENSEÑA.
  ===================================================================
  Tres pantallas enseñan el monto de un pedido: la tarjeta, el aviso de
  «llegó a destino» y «Editar». Hasta el 26/10/2026 solo «Editar» sabía
  decir «ya pagó» (monto tachado); la tarjeta enseñaba `cost` crudo
  —«S/ 15996.1», «S/ 33.333333»— y nada si no había monto. Tres sitios con
  su propia regla terminan diciendo cosas distintas del mismo pedido.
  
  LOS TRES CASOS, con las cuentas de siempre (deuda = monto − adelanto,
  guardada en `cost`):
  
    debe     la deuda es mayor que 0       → «S/ 45.50»
    pagado   hay monto y la deuda es 0     → «S/ 120.00» TACHADO
    sin      no hay monto ni deuda         → «S/ 0.00»
  
  ⚠️ LOS PEDIDOS DE ANTES NO CAMBIAN. Su tarjeta sigue enseñando lo que
  enseñaba (ver `esNuevo`): el dueño pidió que lo de hoy no le cambie la
  cara a 1500 pedidos de ayer. Solo es presentación: nada se guarda.
- L24: global globalThis, window
- L34: Un importe como número: vacío, basura o negativo → 0.
  Admite la coma de miles («1,234.5»).
  @param {*} x lo que haya guardado
  @return {number} el importe, nunca NaN ni negativo
- L46: «S/ 1,234.50»: redondeado a céntimos, siempre con dos decimales.
  @param {number} n importe
  @return {string} el importe para enseñar
- L57: El caso, a partir de monto y adelanto (lo que se escribe en «Editar»).
  @param {*} monto monto total
  @param {*} adelanto lo ya pagado
  @return {Object} {tipo: debe|pagado|sin, valor, texto}
- L71: El caso de un pedido GUARDADO. La deuda es `cost` —lo que leen tarjeta,
  dashboard y seguimiento—; el monto, `monto`, o `cost` en los pedidos de
  antes de que existiera ese campo (ahí `cost` era el total).
  @param {Object} p el pedido
  @return {Object} {tipo: debe|pagado|sin, valor, texto}
- L89: ¿Este pedido se enseña con la regla nueva? Los creados desde el corte.
  @param {Object} p el pedido
  @return {boolean} true si es de hoy en adelante
- L99: El importe listo para pintar: tachado si ya pagó. Solo lleva dígitos,
  comas, puntos y «S/», así que no hay nada que escapar.
  @param {Object} e lo que devuelve `de` o `deDatos`
  @return {string} HTML

## functions/nroComprobante.js

- L3: functions/nroComprobante.js — EL NÚMERO DE FACTURA O BOLETA DE UN PEDIDO.
  =========================================================================
  Lo escribe el dueño al generar un link personalizado (va DENTRO del
  token, como el monto) o en «Editar pedido». Cuando existe, ES el código
  del pedido: sustituye al de 6 dígitos en la etiqueta, en el QR, en el
  escáner y en el WhatsApp de confirmación del cliente.
  
  Panel, etiqueta y servidor preguntan AQUÍ. Una sola regla y un solo
  nombre de campo —`nroComprobante`, no `comprobante`: ese nombre ya lo usan
  `docComprobante`/`chkComprobante` (la FOTO del comprobante) y el módulo
  `comprobante.js` (el PDF de API Sale). Dos datos con el mismo nombre
  terminan mezclándose.
  
  ⚠️ POR QUÉ SE LIMPIA. El número viaja dentro de un QR con la forma
  `teléfono#NÚMERO`. Un `#`, un espacio o una barra dentro del número
  partirían ese QR en trozos que el escáner leería mal. Así que se queda
  en lo que lleva un comprobante peruano: letras, números y guion
  (`F001-00000123`, `B001-456`).
  
  ⚠️ SOLO PEDIDOS DE HOY EN ADELANTE. Un pedido sin el campo devuelve "" y
  todo lo demás sigue exactamente igual que antes: mismo código, mismo QR,
  misma etiqueta.
  
  El QR pequeño del pie lo lleva TODA etiqueta impresa desde el 27/10/2026
  (también la de un pedido antiguo): es el único QR que cambia de etiqueta
  en modo escaneo, y un pedido sin él no se podría mover.
- L32: global globalThis, window
- L41: Prefijo del QR pequeño. Lo distingue de los demás QR que lee el panel
- L42: (el de la etiqueta, `teléfono#código`, y el de la guía Shalom).
- L46: El número, limpio: mayúsculas, letras/números/guion, máximo 20.
  Espacios, barras y puntos se vuelven guion; los guiones repetidos o en
  los bordes se quitan. «f001 / 123» → «F001-123».
  @param {*} x lo que sea
  @return {string} el número limpio, o ""
- L64: El número de un pedido. **El único sitio donde se lee.**
  @param {Object} p el pedido (o el token)
  @return {string} el número limpio, o ""
- L73: Cómo se llama en pantalla, según la serie (SUNAT: F = factura,
  B = boleta).
  @param {string} nro el número limpio
  @return {string} "FACTURA" · "BOLETA" · "COMPROBANTE"
- L86: ¿Lo que se busca está en el número de este pedido? Admite escribirlo
  en minúsculas, con espacios o a medias («123», «f001 123»).
  @param {Object} p el pedido
  @param {string} q el texto del buscador
  @return {boolean} si coincide
- L100: ¿La etiqueta de este pedido lleva el QR pequeño del pie?
  @param {Object} p el pedido
  @return {boolean} si lo lleva
- L110: El valor del QR pequeño. Lleva el ID del pedido, no el número impreso:
  el código de 6 dígitos se repite cada ~17 minutos de reloj, y un número
  de factura puede repetirse entre dos bultos. El id no se repite nunca,
  así que escanearlo lleva a UN pedido, sin adivinar.
  @param {Object} p el pedido
  @return {string} "TTPED:<id>", o "" si no lleva
- L122: Lee un QR pequeño. Cualquier otra cosa devuelve "".
  @param {string} raw lo que leyó la cámara
  @return {string} el id del pedido, o ""

## functions/olvaNormalizar.js

- L3: olvaNormalizar.js — Traduce una agencia CRUDA de Olva al formato del
  catalogo (data/agencias-olva.json), que es el que entiende el buscador
  del formulario.
  
  POR QUE EXISTE: Olva devuelve `nombres/department/province/district/lat/lng`
  y el formulario lee `nombre/departamento/provincia/distrito/latitud` y
  `longitud`.
  Sin traducir, el respaldo en vivo (agenciasOlva) pintaba la agencia como
  "—" y sin ubicacion, y al elegirla se guardaba solo la direccion.
  
  Gemelo en el navegador: `_mapOlva` de agencias-extractor.js (mismo mapeo,
  para generar el JSON). Si cambia el formato de Olva, se tocan los dos.
- L22: Arma "L-V 08:00-19:00 · S 08:00-14:30" desde el objeto horario de Olva.
  @param {Object} h horario crudo
  @return {string} horario legible
- L39: @param {Object} raw agencia cruda de Olva
  @return {Object} agencia en el formato del catalogo

## functions/pedidoPublico.js

- L3: functions/pedidoPublico.js — QUÉ VE EL CLIENTE DE SU PEDIDO
  =============================================================
  Un pedido tiene hoy más de sesenta campos y mañana tendrá más. El link de
  seguimiento es público: quien tenga la dirección ve lo que este archivo
  decida, y solo eso.
  
  ⚠️ POR QUÉ ESTO ES UNA LISTA BLANCA Y NO UNA NEGRA
  Antes, `handleTrack` copiaba el pedido ENTERO y borraba una lista de
  campos prohibidos. Con ese diseño, **cada campo nuevo nace público**: nadie
  se acuerda de añadirlo a la lista de borrados, y el fallo no se ve — el
  dato simplemente viaja.
  
  Pasó de verdad: la clave de recojo (`shalomClave`) se añadió al pedido y
  empezó a salir en la respuesta del link sin que nada avisara.
  
  Es exactamente **OWASP API3:2023 — Broken Object Property Level
  Authorization** (antes "Excessive Data Exposure"), cuya causa documentada
  es *"serializar objetos enteros y confiar en que el cliente filtre"* y cuyo
  remedio es este: **enumerar lo permitido; lo demás no sale.**
  
  DOS REJAS INDEPENDIENTES, no una:
    1. Solo salen los campos de `CAMPOS`.
    2. Y aunque alguien meta un secreto en `CAMPOS` por error, `SECRETOS`
       lo quita igual. Hacen falta DOS equivocaciones para filtrar algo.
- L30: global globalThis, window
- L38: Lo ÚNICO que el cliente ve de su pedido.
  
  Añadir aquí es una decisión consciente: significa "esto puede verlo
  cualquiera que tenga el link, hoy y dentro de un año, porque un link se
  reenvía y no caduca".
  
  `dni`, `dniRecoger`, `dniDestinatario` y `notes` están a propósito: el
  dueño pidió que el cliente los viera en su link.
- L49: Identidad del pedido
- L51: Marca calculada: pedido viejo y finalizado, enseñado al mínimo.
- L53: El N° de factura/boleta (26/10/2026). Cuando existe, ES el código que
         el cliente ve en su seguimiento: ya lo recibió en su WhatsApp de
         confirmación y es su propio comprobante. Si no saliera aquí, el link
         le mostraría un código distinto al del mensaje.
- L58: A quién y a dónde
- L61: Qué y con quién
- L63: Seguimiento de Shalom
- L69: Lo que NO SALE JAMÁS, aunque alguien lo ponga en `CAMPOS`.
  
  `shalomClave` es la clave de recojo: los cuatro dígitos con los que se
  retira el paquete en la agencia. Si viaja en el link, deja de proteger
  nada — un link se reenvía, se queda en un historial y no caduca.
  
  Los cuatro de agencia no son secretos, pero el cliente no los necesita y
  lo que no hace falta no viaja.
- L81: La nota PRIVADA lleva la clave de recojo desde el 10/11/2026 (el
         registro por Shalom Pro la apunta ahí). Y el historial de guías
         vencidas tampoco es asunto del cliente.
- L88: TERCERA REJA: campos que salen, pero RECORTADOS.
  
  Las dos rejas de arriba deciden QUÉ campos salen. Esta decide CUÁNTO de
  un campo sale. El dueño quiere que el cliente siga viendo su documento
  —lo necesita para recoger el paquete— pero no entero.
  
  ⚠️ LÍMITE HONESTO, y va escrito aquí para que nadie lo olvide después:
  enseñar 5 de 8 dígitos deja **1000 combinaciones**. Quien tenga el link
  puede deducir el resto probando. Esto NO convierte el DNI en un secreto.
  Reduce lo que se regala de un vistazo —una captura reenviada por
  WhatsApp, alguien mirando la pantalla de al lado—, que es un riesgo real
  y frecuente. Lo que de verdad protege el dato es que **el link no se
  pueda adivinar**, y eso es otro trabajo.
- L105: Cuántos caracteres se enseñan como mucho.
- L107: Y cuántos se tapan como mínimo, pase lo que pase.
- L110: Recorta un documento dejando ver solo el principio.
  
  Se enseña el PRINCIPIO y no el final, al revés que una tarjeta de
  crédito, y es a propósito: en un DNI peruano los primeros dígitos van
  ligados a la época y el lugar de emisión —o sea, son los más
  deducibles—, mientras que los últimos son los que menos se pueden
  inferir. Tapar el final esconde la parte que de verdad cuesta adivinar.
  
  El largo se conserva: que se vea si son 8 o 9 no le sirve a nadie para
  hacer daño, y al cliente le confirma que su dato está completo.
  
  @param {*} valor lo que haya en el campo
  @return {*} recortado, o igual que entró si no es texto con contenido
- L126: Lo que no es texto no se toca: un nulo se queda nulo y un ausente
- L127: sigue ausente. Inventar un '***' donde no hay dato le diría al cliente
- L128: que existe algo que no existe.
- L135: El pedido tal como lo ve el cliente.
  @param {Object} pedido documento completo de Firestore
  @param {Object} [extra] campos calculados por el endpoint (code, frozen…)
  @return {Object} solo lo permitido
- L149: Segunda reja. Si esto llega a borrar algo, es que alguien metió un
- L150: secreto en CAMPOS — y el fallo queda tapado igual.
- L154: Tercera reja: lo que sale, sale recortado.
- L160: Cuarta reja: si alguien ESCRIBIÓ la clave en un texto que el cliente
         ve —«clave 3321» en las notas o en un campo extra—, se tapa. Solo
         donde va pegada a la palabra «clave»: tapar cualquier número de
         cuatro cifras rompería direcciones («Mz D lote 3321»).
- L175: Tapa «clave … 1234» dentro de un texto.
  @param {*} t el texto
  @return {*} el texto con la clave tapada, o igual si no es texto
- L185: Días en FINALIZADO tras los que el link enseña lo mínimo.
- L187: Lo único que queda de un pedido viejo y finalizado.
- L192: PRIVACIDAD CON EL TIEMPO (10/11/2026). Un link no caduca —el cliente lo
  usa para garantías y reclamos—, pero una captura vieja reenviada no
  tiene por qué seguir mostrando su dirección, sus notas ni su DNI.
  Pasados DIAS_MINIMO desde la creación, un pedido FINALIZADO enseña solo
  su código, estado, fecha y guía. No ahorra lecturas (para saberlo hay
  que leerlo): protege.
  @param {Object} out lo que devolvió `proyectar`
  @param {Object} pedido el pedido completo
  @param {number} ahoraMs ahora en ms
  @return {Object} el mismo `out`, o su versión mínima
- L219: ¿Se le escapó algún secreto a este objeto? Para las pruebas y para poder
  afirmarlo, no suponerlo.
  @param {Object} obj objeto a revisar
  @return {Array<string>} los secretos que contiene (vacío = limpio)

## functions/registroShalom.js

- L3: functions/registroShalom.js — REGISTRAR UN ENVÍO EN SHALOM
  ============================================================
  ⚠️ LA ÚNICA OPERACIÓN DEL PROYECTO QUE CUESTA DINERO Y NO SE DESHACE.
  `POST /account/register` crea un envío de verdad. Shalom **no tiene
  endpoint para anularlo** y **no tiene clave de idempotencia**: dos
  llamadas son dos envíos y dos cobros.
  
  Por eso toda la decisión vive aquí, en código puro y probado, y no
  repartida entre la pantalla y el servidor. El navegador decide si habilita
  el botón; el servidor decide si manda. **Los dos preguntan a este
  archivo**: si cada uno tuviera su regla, el día que divergieran se
  registraría un envío que la pantalla creía bloqueado.
  
  Vive en `functions/` por lo mismo que `agencias.js` y `etiquetas.js`: lo
  cargan el panel y la Cloud Function, y una copia por lado divergiría.
- L21: global globalThis, window
- L29: Desde dónde se registra. Lo pidió el dueño así: POR ALISTAR, y también
  ALISTADO (10/11/2026) — un paquete ya armado al que le faltaba la guía.
  Que no tenga guía ya lo exige el candado de `estaRegistrado`.
- L35: Pasado este plazo sin dejar el paquete en la agencia, Shalom da la guía
  por vencida y se puede registrar una nueva (10/11/2026).
- L39: Catálogo de cajas de Shalom. Medidas confirmadas DOS VECES: por la app
  de Shalom y, por separado, por la otra aplicación del dueño.
  
  ⚠️ EL PESO IMPORTA, y me equivoqué diciendo que no. Un paquete de
  20×15×12 entra en XS por medidas, pero si pesa 3 kg se va a M: XS tope
  0.5 kg. Sin el peso elegiríamos una caja más chica de la que
  corresponde y Shalom lo cobraría distinto.
  
  Las dimensiones van ya ordenadas de mayor a menor: comparar así deja
  elegir cualquier cara como largo/ancho/alto sin perder el ajuste — una
  caja no distingue de qué lado la acuestas.
- L60: Lo que `content` puede valer. El registro individual ofrece de XS a XL:
  la caja XXS —la más chica del catálogo— se registra como XS, igual que
  hace la otra aplicación.
- L68: La caja donde entra un paquete, o null.
  @param {*} largo cm
  @param {*} ancho cm
  @param {*} alto cm
  @param {*} peso kg
  @return {Object} {tipo, etiqueta}, {tipo:'OTRA'} o null si faltan datos
- L93: El `content` de un pedido según sus medidas, o null si no se puede.
  @param {Object} pedido con pkgLargo/pkgAncho/pkgAlto/pkgPeso
  @return {string} uno de CONTENIDOS, o null
- L100: La caja elegida a mano (los botones XXS…L, como en Shalom Pro) manda
         sobre las medidas: quien la elige dice dónde entra el paquete.
- L109: XXS no existe en el registro: va como XS, la más chica que sí ofrece.
- L115: La caja elegida a mano, si es una del catálogo.
  @param {Object} pedido el pedido
  @return {string} "XXS"…"L", o "" si no eligió ninguna
- L122: SOBRE (documentos, A4): lo ofrece Shalom Pro y el registro lo acepta.
- L127: ¿Lo registró ESTE sistema con Shalom Pro? Una guía escrita a mano o
  escaneada del ticket no cuenta: solo lo que salió de `orquestar` o
  `recuperarEnvio`, que dejan su marca. Los de antes de la marca se
  reconocen por la hora del registro, que solo ponía `orquestar`.
  @param {Object} pedido el pedido
  @return {boolean} true si se registró por Shalom Pro desde el panel
- L141: Sin movimiento en Shalom pasado este plazo, la guía del panel se da por
  muerta y ya no se consulta (72 h y no 24: ni dos días de cortes de red
  la dejan fuera por error).
- L146: ★ LA ÚNICA VERDAD sobre «¿se puede consultar esta guía?» (11/11/2026).
  La usan el botón Consultar, el masivo, Jalar ticket y la consulta por
  horarios. Cuatro situaciones:
  
    sinGuia  → no tiene número.
    normal   → escrita A MANO (cualquier etiqueta), o la del panel que
               Shalom ya movió: se consulta y se jala el ticket como siempre.
    porDejar → la creó el panel y Shalom aún no la movió: es un envío
               PENDIENTE (el paquete no está en la agencia). Se consulta
               —así el panel se entera solo cuando lo dejas—, pero «Shalom
               no la conoce» es lo esperado, no un error. Sin ticket aún:
               el comprobante nace en el mostrador.
    vencida  → la del panel, sin movimiento y pasadas 72 h: no se consulta.
  
  Cambiar la guía a mano quita la marca del panel (pedido-guardar.js y
  tracking.js), así que esa pasa sola a `normal`.
  @param {Object} pedido el pedido
  @param {number} ahoraMs ahora, en ms
  @return {Object} {tipo, venceEn} — venceEn: ms hasta las 24 h de Shalom
    (negativo si ya pasaron), o null si no se sabe la hora del registro
- L184: ¿Ya venció la guía? Solo se puede afirmar con la hora del registro.
  @param {Object} pedido el pedido
  @param {number} ahoraMs ahora, en ms
  @return {boolean} true si pasaron 24 h desde el registro
- L195: La línea que se añade a la nota PRIVADA del pedido al registrar. La nota
  privada no sale jamás al cliente (pedidoPublico.js la tiene en SECRETOS).
  @param {string} previa la nota que ya había
  @param {string} clave la clave de recojo
  @param {string} guia la guía nueva
  @return {string} la nota con la línea añadida
- L211: Solo los dígitos de un valor.
  @param {*} v valor de origen
  @return {string} sus dígitos, o "" si no hay
- L220: El texto de un valor, sin espacios a los lados.
  @param {*} v valor de origen
  @return {string} el texto, o "" si no hay
- L229: ¿Este envío ya está registrado en Shalom?
  
  LA GUÍA ES LA PRUEBA. Si existe, Shalom ya creó el envío: se pagó, no
  se puede anular, y hay cosas que dejan de poder cambiarse —la clave de
  recojo y la agencia de destino, porque Shalom ya las tiene y
  cambiarlas aquí le daría al cliente datos que no sirven.
  
  Una sola regla para el candado del registro Y para el congelado del
  formulario: si fueran dos, el día que divergieran una congelaría y la
  otra dejaría registrar de nuevo.
  
  @param {Object} pedido el pedido
  @return {boolean} true si ya tiene guía de Shalom
- L249: TODO lo que impide registrar este pedido, en palabras.
  
  Devuelve una lista de textos, no un booleano: con un botón que cuesta
  dinero, "faltan datos" obliga a ir campo por campo adivinando cuál.
  Lista vacía = se puede registrar.
  
  @param {Object} pedido el pedido del panel
  @param {Object} cfg {agenciaOrigen, instanceId}
  @return {Array<string>} lo que falta, vacío si nada
- L265: ⚠️ CANDADO 4, y va primero porque es el caro. Un pedido con guía ya
         está en Shalom; registrarlo otra vez es un segundo envío y un segundo
         cobro que nadie puede anular. En la otra aplicación del dueño este
         candado no existe: su pedido #1 tiene guía 98014733 y el botón
         "Registrar envío Shalom" sigue ahí.
- L273: lo demás ya no importa
- L284: La agencia de destino, con su id de verdad.
- L290: La de origen, de Config.
- L311: El nombre PARTIDO, de RENIEC. No se parte a ojo: la otra aplicación lo
         hace y, con un nombre de una sola palabra, manda el mismo valor en
         `name` y en `firstname`. Un apellido basta —`apeMaterno` llegó vacío
         al medir RENIEC—, pero el nombre y al menos un apellido no.
- L321: Con la caja elegida a mano, no hacen falta medidas ni peso.
- L324: Las medidas, que deciden la caja.
- L342: El cuerpo EXACTO que se manda a `POST /account/register`, o null si el
  pedido no está listo. Nunca a medias: o va completo o no va.
  
  @param {Object} pedido el pedido
  @param {Object} cfg {agenciaOrigen, instanceId}
  @return {Object} el cuerpo, o null
- L354: ⚠️ ORIGEN Y DESTINO COMO NÚMERO, Y NO ES UN DETALLE DE TIPOS.
         La documentación: `destino` (ter_id, o "052" CON PREFIJO 0 = AÉREO).
         La otra aplicación del dueño hace `String(id).padStart(3, "0")`, así
         que convierte el ter_id 7 (Arequipa) en "007" y lo registra como
         aéreo sin que nadie lo pida — y 66 de las 552 agencias tienen ter_id
         de uno o dos dígitos: uno de cada ocho envíos.
         Un número no puede llevar cero delante. El fallo se vuelve imposible
         por construcción, no por acordarse de no hacerlo.
- L374: Vacía: medido en la otra aplicación, que la manda así siempre.
- L379: La guía, el código y el monto de una respuesta de Shalom.
  
  ⚠️ ESTE ES EL ÚNICO SITIO QUE SABE DÓNDE MIRAR, y existe por un fallo
  real que costó un envío (02/10/2026). Había DOS reglas escritas
  distinto: `resultado()` miraba también dentro de `data`, y la
  orquestación no. Shalom devuelve la guía anidada en `data`, así que
  una la encontró —dijo "éxito"— y la otra guardó `shalomGuia: ""`.
  El envío se creó y se pagó, el pedido quedó marcado REGISTRADO sin
  guía, y el candado de "ya tiene guía" —que mira justo ese campo— quedó
  desarmado. Lo que evitó el cobro doble fue la otra reja, la del estado.
  
  Dos sitios con la misma regla escrita distinta es exactamente lo que
  este proyecto lleva semanas castigando. Ahora hay uno.
  
  @param {*} json la respuesta de Shalom
  @return {Object} {guia, codigo, monto} — vacíos si no vienen
- L421: Los NOMBRES de los campos que trajo una respuesta, sin un solo valor.
  
  Antes aquí iba `forma: true`, que no enseñaba nada. Para cerrar el
  traductor hace falta saber QUÉ campos manda Shalom de verdad, y esto
  se puede pegar en un chat sin que salga el dato de nadie.
  
  @param {*} json la respuesta
  @return {Array<string>} los nombres, anidados con punto
- L445: Cómo acabó un intento de registro. TRES resultados, nunca dos.
  
  ⚠️ EL DEL MEDIO ES EL CARO. Shalom no anula y no tiene idempotencia, así
  que decir "falló" cuando en realidad NO SABEMOS invita a volver a
  pulsar — y eso son dos envíos y dos cobros. Un corte de red o un 500
  dejan el envío en el aire: pudo crearse igual.
  
    exito → Shalom devolvió una guía
    fallo → Shalom dijo que NO (4xx): no se creó nada
    duda  → no sabemos. NO se reintenta: se consulta pending-shipments
  
  @param {Object} r la respuesta de la puerta
  @return {string} 'exito' | 'fallo' | 'duda'
- L463: El MISMO extractor que usa la orquestación. Dos listas que hay que
- L464: mantener sincronizadas acaban divergiendo, y eso costó un envío.
- L465: Un "ok" sin guía no es un envío: no hay nada que enseñarle al
- L466: cliente ni con qué rastrear. Se trata como duda, no como éxito.
- L470: Un 4xx es un NO explícito de Shalom: no se creó nada.
- L472: Todo lo demás —sin red, 5xx, corte por tiempo— deja el envío en el
- L473: aire. No se afirma que falló.
- L477: Busca un envío en la lista de pendientes de Shalom.
  
  ⚠️ POR CLAVE **Y** DESTINO, y si hay dos candidatos NO SE ELIGE.
  Esto corre justo después de una respuesta dudosa, para saber si el
  envío llegó a crearse. Equivocarse aquí significa darle al cliente la
  guía de OTRO paquete, así que "el más parecido" no vale: o hay una sola
  coincidencia exacta, o no hay ninguna.
  
  ⚠️ Y LA LISTA LLEGA COMO OBJETO, no como array: `{"0":…,"1":…}`, estilo
  PHP. Medido el 01/10/2026. Un `.filter` directo habría devuelto vacío
  SIEMPRE y habríamos creído que el envío no se creó — y entonces se
  registra otra vez. De ahí sale el cobro doble.
  
  @param {*} lista lo que devolvió pending-shipments
  @param {Object} cuerpoEnviado el cuerpo que se mandó (clave, destino)
  @param {Array<string>} [excluir] guías que NO pueden ser la buscada
  @return {Object} el envío, o null
- L505: Al registrar de nuevo, la guía VIEJA tiene la misma clave y destino:
- L506: no puede pasar por la nueva.
- L520: ¿Está esta guía entre los envíos PENDIENTES de tu cuenta? (11/11/2026)
  Una guía pendiente (registrada en Shalom Pro, el paquete aún no está en
  la agencia) NO sale en el rastreo público: /track dice «no la conozco».
  Esta lista es la que dice con certeza «sí existe, falta dejarla».
  Busca por el NÚMERO exacto. La lista llega como objeto {"0":…} (medido),
  y por si acaso también como array o envuelta en `data`.
  @param {*} lista lo que devolvió pending-shipments
  @param {*} guia el número de guía
  @return {boolean} true si está
- L542: El nombre de RENIEC que corresponde a ESTE pedido, o null.
  
  ⚠️ SOLO SI EL DNI COINCIDE. La consulta a RENIEC vive en memoria
  mientras el formulario está abierto; si consultaste un DNI y luego
  escribiste otro, pegar el nombre del primero sería darle a Shalom el
  nombre de OTRA persona — y un envío a nombre de quien no es, no lo
  puede recoger nadie. Peor que no tener nombre.
  
  @param {Object} persona lo que devolvió RENIEC
  @param {*} dniDelPedido el DNI que se está guardando
  @return {Object} {dni, nombres, apePaterno, apeMaterno} o null
- L569: La configuración que el registro necesita, a partir del documento de
  config — venga de Firestore (servidor) o de `S` (panel).
  
  ⚠️ VIVE AQUÍ PARA QUE NO PUEDA HABER DOS VERSIONES. El servidor arma
  este objeto para decidir, y el panel lo arma para avisarte ANTES de
  gastar una llamada. Si las dos formas se escriben por separado, el día
  que una cambie el panel dirá "listo" y el servidor dirá "falta algo" —
  y lo descubrirías con el envío a medio crear. Una función, dos lados.
  @param {Object} raw el documento de config, o `S`
  @return {Object} {agenciaOrigen, instanceId}
- L591: La hora de ahora en ISO, por un reloj que una prueba pueda sustituir.
  Una prueba que dependa de la hora real falla sola algún martes.
  @param {Object} deps las dependencias, que pueden traer `ahora`
  @return {string} fecha ISO, o "" si el reloj dio algo que no es fecha
- L603: Lo que se guarda en el pedido a partir de un envío ya creado.
  @param {Object} env el envío, como lo devuelve Shalom
  @param {string} [nacimiento] cuándo se creó la guía, en ISO
  @param {Object} [pedido] el pedido (para la nota privada con la clave)
  @return {Object} los campos a escribir
- L624: ⏱ DE DÓNDE SALE EL PLAZO DE 24 H.
         Shalom borra la guía que no se deja en la agencia dentro de 24 h, y su
         panel muestra la cuenta atrás. Nosotros no la teníamos: el registro no
         guardaba NINGUNA hora, así que no había desde dónde contar.
  
         Se sella solo cuando se puede afirmar. En un registro recién hecho, la
         hora de ahora y la de Shalom se diferencian en segundos: sirve. En una
         recuperación posterior —`recuperarEnvio`, que puedes correr horas
         después— no se sabe cuándo nació la guía, y entonces NO se sella: sin
         sello no hay cuenta atrás, y eso es mejor que una cuenta atrás
         inventada que te deje tranquilo mientras el plazo se vence.
  
         La fuente definitiva es la rama `registrado` de /track, que es el
         reloj de Shalom y cubre también los recuperados. Viaja ya en la
         respuesta de la puerta; falta medir su formato antes de parsearla.
- L640: La marca de «lo registró el panel con Shalom Pro».
- L642: La clave a la nota PRIVADA (la del doble clic en el nombre), para
         tenerla a mano. Nunca a `notes`: esa la ve el cliente.
- L651: Registrar un envío, de principio a fin.
  
  El navegador manda SOLO el id del pedido. Todo lo demás —leer el pedido,
  decidir, armar el cuerpo, llamar, interpretar y escribir— pasa aquí, en
  el servidor: así nadie puede falsificar un campo ni saltarse un candado
  desde la consola.
  
  ⚠️ ARRANCA EN SIMULACRO. Una operación que cuesta dinero y no se deshace
  no puede estar encendida por defecto. En simulacro decide todo igual,
  devuelve el cuerpo exacto que mandaría, y NO llama a nadie.
  
  @param {Object} datos {pedidoId, renovar}
  @param {Object} deps {leerPedido, leerConfig, llamar, pendientes,
    guardar, ahora, rastrear}
  @param {Object} [opc] {simulacro}
  @return {Promise<Object>} el resultado, siempre con motivo en palabras
- L678: ⏰ REGISTRAR DE NUEVO, pasadas 24 h (10/11/2026). Shalom da por vencida
         la guía que no se deja en la agencia en 24 h. Cuesta dinero otra vez,
         así que se exige TODO, aquí en el servidor:
           · que haya una guía y su hora de registro (sin hora no se puede
             afirmar que venció: no se ofrece);
           · que hayan pasado 24 h por el reloj del SERVIDOR;
           · que el pedido no diga ya que el paquete avanzó;
           · y que Shalom, preguntado AHORA, diga que no entró a ninguna
             agencia. Cualquier otra respuesta —entró, sin red, rara— frena.
- L700: Los candados, contra lo que hay AHORA en la base de datos — no contra
         lo que el navegador creía hace un rato.
- L710: El simulacro es lo normal; registrar de verdad es la excepción.
- L725: El seguimiento viejo era de la guía vencida: se empieza limpio.
- L729: Los NOMBRES de los campos que trajo Shalom, sin un solo valor: es
- L730: lo que hace falta para cerrar el traductor, y se puede pegar en un
- L731: chat sin exponer nada.
- L737: Shalom dijo que NO. No se consulta pendientes —no creó nada— y no
           se escribe. Se dice el motivo UNA vez, con sus palabras.
- L744: ⚠️ DUDA. Aquí NO se reintenta: Shalom no anula y no tiene clave de
         idempotencia, así que un segundo intento sería un segundo envío y un
         segundo cobro. Se consulta la lista de pendientes y se busca.
- L755: Recién creado hace segundos: su hora de nacimiento es ahora.
- L771: Rellenar la guía de un envío que YA está en Shalom. SOLO LEE.
  
  ⚠️ EXISTE POR UN ENVÍO REAL QUE SE QUEDÓ SIN GUÍA (02/10/2026). Shalom
  lo creó y se pagó, pero un fallo mío guardó `shalomGuia: ""`: el
  pedido quedó marcado REGISTRADO sin guía, el cliente sin nada que
  rastrear y el candado de "ya tiene guía" desarmado.
  
  Esta operación consulta pendientes, busca por clave Y destino, y
  rellena. **Nunca llama a `register`.** Tenerla evita la tentación de
  "registrar otra vez a ver si ahora sí", que es como se paga dos veces.
  
  @param {Object} datos {pedidoId}
  @param {Object} deps {leerPedido, leerConfig, pendientes, guardar}
  @return {Promise<Object>} el resultado, con motivo en palabras
- L794: Hace falta la clave y el destino para poder identificarlo sin
         equivocarse de paquete. Lo demás —el estado, las medidas— da igual:
         el envío ya existe, no se va a crear nada.
- L817: SIN SELLO DE HORA, A PROPÓSITO: esto puede correr horas después del
         registro, y poner "ahora" regalaría 24 h de plazo que ya no existen.
- L824: Los campos de seguimiento, vacíos: eran de la guía anterior.
  @return {Object} los campos a escribir
- L834: ¿Se puede registrar de nuevo este pedido? Ver `orquestar`.
  @param {Object} p el pedido leído de la base
  @param {Object} deps {ahora, rastrear}
  @return {Promise<Object>} {ok:true} o el motivo, en palabras

## functions/reniecPublico.js

- L3: functions/reniecPublico.js — CONSULTAR UN DNI DESDE LA PÁGINA DEL CLIENTE
  ===========================================================================
  El dueño pidió que, al escribir su DNI, el cliente vea su nombre oficial y
  no tenga que teclearlo. Para el negocio es claro: un nombre escrito a mano
  llega con faltas, sin tildes o con el apellido delante, y eso es justo lo
  que Shalom rechaza al registrar el envío.
  
  ⚠️ PERO ESTO ABRE UN BUSCADOR DE NOMBRES POR DNI EN INTERNET, PAGADO CON SU
  CLAVE DE API. Hasta hoy la consulta vivía detrás de `shalomPuerta`, que
  exige token de Firebase Y estar en la lista de administradores. Eso no era
  un descuido: era la barrera. Al quitarla hay que poner otra cosa en su
  sitio, y este archivo es esa cosa.
  
  TRES COSAS LO HACEN PEOR DE LO QUE PARECE:
  
    1. El freno por IP es flojo aquí. El propio código ya lo dice en
       `RATE_LIMITS`: en Perú, Claro y Movistar meten miles de usuarios
       detrás de una misma IP pública. Un bot con datos móviles cambia de IP
       cuando quiere; un cliente real la comparte con su barrio.
    2. Son datos de personas reales. Un robot recorriendo los 8 dígitos no
       «gasta cuota»: se lleva nombres. Eso no es un gasto, es una fuga.
    3. Cada consulta nueva cuesta dinero de verdad.
  
  LAS CUATRO CAPAS, Y POR QUÉ CADA UNA
  
    App Check    dice DESDE DÓNDE viene la petición: de la página real y no
                 de un script. Es la que más corta, y por eso esta operación
                 —que nace hoy— la EXIGE desde el primer día. Las que ya
                 existían no: dejar fuera a un cliente con reCAPTCHA caído
                 es peor que el ataque del que protege.
    Freno por IP  frena al torpe. No al que sabe.
    Caché         un DNI ya consultado NO VUELVE A COSTAR. Los clientes
                 repiten, así que esto es casi todo el ahorro real.
    Tope diario   el que de verdad acota el daño: pasado el tope no se
                 consulta más hoy, y el formulario SIGUE FUNCIONANDO —el
                 cliente escribe su nombre a mano. Degrada, no rompe.
  
  Ese último es el que importa. Sin él, un bot que pase las otras tres
  capas gasta hasta donde llegue la factura. Con él, cuesta como mucho un
  día de tope y ningún cliente se queda sin poder pedir.
  
  ⚠️ Y EL NAVEGADOR NO PUEDE DECIR DE QUIÉN ES UN DNI. Si el formulario
  mandara el nombre junto al pedido, cualquiera podría poner el que quisiera
  EN UNA ETIQUETA DE ENVÍO REAL. Por eso el navegador pregunta, el servidor
  consulta, y el servidor guarda: la caché de aquí es también de dónde sale
  el nombre oficial que se graba en el pedido. Lo de fuera nunca se cree.
- L52: global globalThis, window
- L60: El tope de consultas NUEVAS por día. Las que salen de la caché no
       cuentan: no cuestan nada y no son una consulta.
  
       150 y no 20: el dueño mueve unas decenas de pedidos al día y el número
       tiene que dejarle sitio a un día bueno, a los que escriben mal el DNI y
       lo corrigen, y a los que abandonan el formulario a medias. Un tope que
       se alcanza un martes cualquiera no protege nada — se apaga solo y nadie
       se entera de por qué dejó de funcionar.
- L70: Cuánto vale una entrada de la caché. Un año: el nombre de un DNI no
       cambia, y lo que se gana con un plazo corto —volver a pagar por el
       mismo dato— no es ganar nada. No es infinito solo para que un dato mal
       guardado no se quede para siempre.
- L76: El DNI, limpio, o "" si no sirve.
  @param {*} x lo que llegó
  @return {string} 8 dígitos, o ""
- L87: El día al que se le cuentan las consultas, en hora de Lima (UTC-5).
  
  ⚠️ EN HORA DE LIMA Y NO EN UTC, y no es un detalle: en UTC el día cambia
  a las 7 de la tarde de Perú. El tope se reiniciaría en mitad de la tarde
  —las horas de más pedidos— y se agotaría a media mañana. Un tope diario
  tiene que partir la noche, no la jornada.
  @param {number} ahora milisegundos
  @return {string} "YYYY-MM-DD"
- L102: ¿Sigue valiendo lo que hay guardado?
  @param {Object} c la entrada de caché
  @param {number} ahora milisegundos
  @return {boolean} si se puede usar
- L116: QUÉ HACER con una consulta. Todo lo que decide, en un sitio y sin red.
  
  @param {Object} e {dni, appCheck, cache, consultasHoy, ahora}
  @return {Object} {accion:'rechazar'|'cache'|'consultar', motivo, persona}
- L129: ⚠️ APP CHECK ANTES QUE LA CACHÉ, y el orden importa. Al revés, un
         robot sin App Check podría ir preguntando DNIs y quedarse con todos
         los que alguna vez consultó un cliente de verdad: la caché se
         convertiría en la lista de clientes del negocio, servida gratis.
- L142: No es un error del cliente y no se le dice como tal: se le pide que
           escriba su nombre, que es lo que hacía ayer.
- L150: Lo que se guarda y lo que se devuelve: SOLO el nombre.
  
  Nada de la respuesta cruda de Shalom cruza esta frontera. Lo que no se
  copia a mano no se escapa por accidente el día que ellos añadan un campo
  —una dirección, una fecha de nacimiento— que nadie pidió y que acabaría
  viajando al navegador de cualquiera que escriba un DNI.
  @param {Object} persona la del traductor de shalomPuerta
  @param {number} ahora milisegundos
  @return {?Object} lo guardable, o null
- L177: ★ LA CAUSA REAL, NO SIEMPRE «NO ENCONTRADO» (30/10/2026).
       Antes cualquier falla —Shalom lento, una respuesta rara, App Check que
       no llegó— le decía al cliente «No encontramos ese DNI», también con
       DNIs reales. Ahora «no encontrado» es SOLO cuando Shalom lo dice claro;
       lo demás es TEMPORAL y se puede reintentar.
- L184: ¿Vale la pena reintentar?
  @param {string} motivo el de la falla
  @return {boolean} si es temporal
- L192: UNA consulta (respuesta de la puerta + su traductor) → resultado.
  @param {?Object} r lo que devolvió shalomPuerta.llamar
  @param {Function} traducir json → {ok, persona}
  @return {Object} {ok:true, persona} | {ok:false, motivo}
- L202: `success:false` u otra forma: «no encontrado» solo si lo DICE.

## functions/shalomEstado.js

- L3: functions/shalomEstado.js — QUÉ SIGNIFICA LO QUE DICE SHALOM (una regla)
  =========================================================================
  Fase 6 (11/11/2026). El texto de estado de Shalom («En origen», «En
  tránsito», «En destino», «En reparto», «Entregado», y los textos libres de
  guías viejas) se interpretaba en DOS sitios con reglas distintas:
    · functions/etiquetas.js — panel y servidor: mueve las etiquetas;
    · el seguimiento del cliente — lo que ve el cliente.
  Divergían: «En reparto» movía la etiqueta a LLEGÓ A DESTINO y al cliente
  le decía «en camino». Y Delfi se calló porque un tercer sitio leía otra
  cosa. Ahora la regla vive AQUÍ y la usan todos (servidor, panel, cliente).
  
  Las cuatro etapas: 0 origen · 1 camino · 2 destino · 3 entregado.
  La DEMORA no es una etapa (lección cara: un paquete entregado llegó a
  mostrarse como «Demora de envíos»): `rango` devuelve null y `fase` la
  marca aparte, para que la pantalla diga «sigue en camino».
  
  El ORDEN de las preguntas importa y está probado: «agencia de origen» es
  origen (no destino), «en camino a destino» es camino, «en reparto» es
  destino (sale de la agencia de destino hacia el cliente).
- L25: global globalThis, window
- L33: El texto en mayúsculas y sin tildes.
  @param {*} t el texto
  @return {string} normalizado
- L43: Las preguntas, EN ORDEN. La primera que casa decide.
- L53: ¿Es una demora? No es una etapa: es una bandera.
  @param {*} texto el estado de Shalom
  @return {boolean} true si habla de demora o retraso
- L62: La etapa del recorrido, para mover etiquetas (nunca hacia atrás).
  @param {*} texto el estado de Shalom
  @return {?number} 0..3, o null si no se reconoce o es una demora
- L76: La etapa para MOSTRAR: como `rango`, pero una demora se ve «en camino»
  (con su bandera) en vez de quedarse sin etapa.
  @param {*} texto el estado de Shalom
  @return {Object} {idx: -1..3, demora, reparto} — `reparto`: en destino
    pero ya saliendo hacia el cliente (para decirlo con esas palabras)

## functions/shalomPuerta.js

- L3: functions/shalomPuerta.js — la puerta única a la API de Shalom
  ===============================================================
  Se reconstruye endpoint por endpoint. Hoy solo sabe hacer UNA cosa:
  `GET /validate`. Cada operación entra aquí cuando su forma real está
  medida contra la API y traducida con pruebas — no antes.
  
  POR QUÉ UNA LISTA BLANCA Y NO UN PROXY
  Un proxy ciego dejaría que cualquiera con sesión ejecutara `DELETE
  /instances` o `POST /instances/logout` desde la consola del navegador, y
  eso borra la sesión persistida y mata el auto-login. Solo se puede pedir
  lo que está en PERMITIDAS, y ahí no hay nada destructivo.
  
  POR QUÉ LA CLAVE NO SALE DE AQUÍ
  Vive en Secret Manager y solo la ve el servidor. Además, todo texto que
  sale hacia el navegador pasa por `sanear()`: si algún día un mensaje de
  error de Shalom devolviera la clave, no llega al cliente.
  
  Este archivo es lógica pura + una función de red. Se puede `require` desde
  las pruebas sin levantar nada.
- L26: Qué significa un estado de Shalom: la MISMA regla en todos lados.
- L31: Hasta dónde baja el diagnóstico. Con 4 se cortaba justo donde hacía falta:
- L32: `statuses.data.entregado.cliente` salía como "objeto" a secas, y ahí es
- L33: donde vive quién recibió el paquete. Describir tipos no pesa nada; quedarse
- L34: corto obliga a otra ronda de despliegue y medición.
- L37: Lo único que se puede pedir. Añadir una entrada aquí es una decisión
  consciente: implica que su respuesta ya se midió y se tradujo.
- L43: `soloMedir` = se puede consultar con `esquema` pero NO usar todavía: su
- L44: respuesta aún no está traducida. Pedirla como operación normal responde
- L45: SIN_TRADUCTOR en vez de devolver algo a medio entender. Es el estado
- L46: intermedio de cada endpoint: medible antes que conectado.
- L48: La sesión de Shalom Pro. Se abre en `soloMedir` a propósito: la
       documentación de esta API y la realidad ya se contradijeron seis veces
       (ver docs/SHALOM-API.md), así que primero se mira la forma con `esquema`
       y recién después se escribe el traductor.
       Va el GET y no el `POST /instances/status` porque el POST exige un
       `instanceId` que el panel no tiene guardado en ninguna parte, mientras
       que el GET no pide nada Y DEVUELVE ESE ID — que es además la llave que
       van a necesitar el ticket y el registro de envíos. No gasta cuota y no
       puede crear ni borrar nada.
- L57: ⚠️ `soloServidor` desde el 11/11/2026: la cuenta de la API tiene
       instancias de otros negocios, y esta lista (con sus correos) llegaba
       al navegador. Ahora solo la lee el servidor (functions/cuentaShalom.js)
       y el panel recibe «conectada · tu correo».
- L62: El catálogo de agencias. Va la variante PÚBLICA a propósito: devuelve la
       misma estructura que `/agencies` y NO CONSUME CUOTA, así que refrescar el
       catálogo sale gratis. `publico` hace que la puerta no mande la clave: una
       credencial no viaja donde no hace falta.
       Sigue pasando por aquí y no por el navegador porque su API responde
       `access-control-allow-origin: https://shalom-api.lat` — medido el
       22/09/2026 —, así que un fetch desde el panel lo bloquearía CORS.
       En `soloMedir` hasta medir su forma: la doc dice 552 agencias con 48
       campos, y la doc de esta API ya se equivocó siete veces.
- L72: RENIEC. Es lo que convierte el registro de envios en algo que no hay que
       adivinar: `POST /account/register` pide el nombre PARTIDO en nombres,
       apellido paterno y apellido materno, y partir "JARLYN LLANOS ARTEAGA" a
       ojo se equivoca con cualquier nombre compuesto. RENIEC ya los da
       separados.
  
       ⚠️ EL DNI VA EN LA RUTA, y eso no es un detalle. Un parametro de ruta NO
       se puede escapar: un "../" ahi no ensucia un valor, CAMBIA EL ENDPOINT al
       que llamas — `/account/dni/../../instances` seria otra cosa. Por eso
       `rutaParam` no codifica: EXIGE la forma, y si no cuadra la peticion no
       sale. La forma es la que documenta su API: 8 digitos, ni uno mas.
- L85: El estado de UNA instancia. Lo que aporta sobre el `GET /instances` que
       ya tenemos es la `url`: donde quedo parado el navegador headless de
       Shalom. Si termina en `/login`, se deslogueo — eso es un diagnostico de
       verdad, no un booleano. Pide el `instanceId` y NADA MAS.
- L91: ⚠️ EL LOGIN, Y POR QUE SU LISTA DE CAMPOS ESTA VACIA.
       `POST /instances/login` pide usuario y contraseña de Shalom Pro. El
       cuerpo de una operacion llega DEL NAVEGADOR (`paso.datos` en
       functions/index.js), asi que sin esta reja existiria el camino "la
       contraseña de Jarry viaja por el panel" — aunque hoy nadie lo usara. Y
       los caminos que existen se acaban usando.
  
       Con `cuerpoCampos: []` el navegador NO PUEDE mandar nada. Las
       credenciales las pondra el servidor desde Secret Manager, igual que la
       clave de la API: nunca tocan el navegador, ni Firestore, ni el respaldo.
  
       En soloMedir: con cuerpo vacio su API devuelve la forma del error, que
       es medio contrato gratis — el mismo truco que con `register`.
- L104: ⚠️ `soloServidor`, NO `soloMedir`. Antes esto era un hueco medido con
       `cuerpoCampos: []` para que el navegador no pudiera mandar la
       contraseña. Ahora se usa de verdad, y la reja cambia de forma: el
       cuerpo lleva los tres campos, pero `soloServidor` hace que la barrera
       corte la operacion ANTES de mirar nada — el navegador no puede
       llamarla, ni para medirla. Solo la llama la orquestacion
       `conectarShalom`, que pone usuario y clave desde Secret Manager.
  
       Si estuviera aqui como las demas, `{op:"instanceLogin", datos:{…}}`
       desde la consola dejaria entrar con CUALQUIER credencial.
- L117: ⚠️ CREAR UNA INSTANCIA, y por que tambien es `soloServidor`.
       Hasta el 3/10/2026 el plan permitia UNA, y crear otra daba 403: el
       limite nos protegia. Ahora permite 900 y el 403 ya no llega.
  
       El `name` va en `cuerpoCampos` pero lo pone el SERVIDOR, no tu: con
       `soloServidor` el navegador no alcanza esta operacion, asi que nadie
       puede crear una instancia con el nombre que le apetezca desde la
       consola. Y la orquestacion solo crea si no habia ninguna.
- L127: ⚠️ `register` — SOLO EL SERVIDOR, Y NI SIQUIERA SE PUEDE MEDIR.
       `POST /account/register` CREA UN ENVIO DE VERDAD: se paga, Shalom no
       tiene endpoint para anularlo y no hay clave de idempotencia.
  
       Si estuviera aquí como las demás, bastaría con
       `{op:"esquema", de:"register", datos:{…cuerpo completo…}}` desde la
       consola del navegador para crear un envío — "medir" lo habría
       registrado. Y medir tiene que ser gratis SIEMPRE: es la regla sobre la
       que se construyó toda esta integración.
  
       Por eso `soloServidor`: la barrera lo corta antes incluso de mirar si
       es diagnóstico. Lo llama únicamente la orquestación, que lee el pedido
       de Firestore y arma el cuerpo ella misma — así el navegador no puede
       falsificar ni un campo.
  
       La forma del ERROR ya está medida y salió gratis: `medir-registro.js`
       lo llama con cuerpo vacío y Shalom responde 400 {error, message}.
- L148: Los envios pendientes. Solo LEE, no crea nada, y es la pieza que hace
       posible el candado de la duda: tras una respuesta dudosa se consulta
       aqui para saber si el envio llego a crearse, en vez de reintentar.
       Su forma esta medida (01/10/2026) y llega como OBJETO {"0":…,"1":…},
       no como array. Va en soloServidor porque solo la orquestacion la usa.
- L155: ★ EL SEGUIMIENTO DE TU SHALOM PRO (medido el 12/11/2026). /track busca
       en el rastreo PÚBLICO de Shalom, y ese buscador rechaza a shalom-api con
       algunas guías («Shalom buscar API returned status 403»). Esta lista usa
       TU sesión de Shalom Pro y trae el `status` de cada envío en camino: es
       el respaldo (deSeguimientoPro). Solo LEE. Los parámetros del
       querystring van en `consulta`, con su forma exacta.
- L164: ⚠️ LO QUE NO ESTA, Y ES UNA DECISION:
  
       · `POST /instances/logout` — su doc dice "borra la sesion Y LAS
         CREDENCIALES GUARDADAS -> se acaba el auto-login", y dos lineas antes,
         sobre el 401 por sesion caida: "ese es el fallo mas repetido de esta
         API". Un boton cuyo unico efecto es recrear el fallo mas comun tiene
         valor negativo.
  
       · `POST /instances` (crear) — el boton se llamaria "Obtener instancia" y
         eso suena a crear, pero ya hay UNA y su `id` sale del `GET /instances`
         que ya esta traducido. Crear otra devuelve 403 por limite.
- L177: Operaciones que NO son un reenvío a Shalom, sino una orquestación del
  servidor: leer el pedido de Firestore, decidir con `registroShalom.js`,
  llamar, y escribir el resultado. El navegador manda SOLO el id del
  pedido — no puede falsificar el cuerpo ni saltarse un candado.
- L183: ⚠️ `conectarShalom` ES LA UNICA DE ESTA LISTA QUE PUEDE RECIBIR UN SECRETO
     DEL NAVEGADOR, y por eso conviene leer esto antes de tocarla:
  
       · Es WRITE-ONLY. No existe su pareja de lectura, ni aqui ni en
         PERMITIDAS. Lo que entra no se puede volver a sacar por la puerta.
       · Lo que guarda va a Secret Manager, NO a Firestore. Firestore se
         sincroniza al navegador; Secret Manager no sale del servidor.
       · La respuesta NUNCA devuelve la clave, ni enmascarada. Devolver
         `****` ya seria confirmar su longitud.
       · La auditoria registra quien y cuando. El valor no.
- L196: Quita de un texto cualquier cosa con forma de clave antes de devolverlo.
  @param {*} texto texto de origen (puede no ser string)
  @return {string} texto saneado y recortado
- L207: Traduce el código HTTP de Shalom al vocabulario del panel.
  Los motivos del lado de Shalom van aparte de los del panel a propósito:
  mezclarlos manda a revisar la cuenta cuando el problema es la sesión.
  @param {number} status código HTTP
  @param {string} [texto] cuerpo crudo, para distinguir 403 que se parecen
  @return {string} motivo del contrato
- L216: ⚠️ «SHALOM BUSCAR API RETURNED STATUS 403» ES UNA FALLA DE SHALOM-API,
       NO UNA GUÍA DESCONOCIDA (medido el 11/11/2026). La guía 103379262 se
       veía «En origen» en shalom.com.pe y a la misma hora su /track daba 500
       con ese texto; las guías que ya tenían guardadas respondían 200. Es su
       consulta EN VIVO a Shalom la que es rechazada: falla con guías nuevas.
       · No es NO_ENCONTRADO: eso mandaba a «revisa número y código».
       · No es ERROR_SHALOM: no cuenta para el interruptor, porque las guías
         guardadas siguen respondiendo y pausar la puerta las dejaría sin
         consultar a todas. Los horarios lo vuelven a intentar solos.
- L228: ⚠️ UN 403 QUE HABLA DE INSTANCIA NO ES UNA CLAVE BLOQUEADA.
       Medido el 01/10/2026 con un `instanceId` inventado: Shalom responde
       403 "Invalid API Key or instance access". Traducirlo a BLOQUEADO hace
       que el panel diga "tu clave de API no sirve" cuando la clave esta
       perfecta y lo malo es el id — o sea, manda a revisar el sitio
       equivocado, que es el fallo que este proyecto persigue.
       Solo el 403: un 401 si es de credenciales y no se toca.
- L241: ⚠️ UN 400 ES NUESTRA PETICIÓN, NO SHALOM CAÍDO (28/10/2026).
       Shalom respondió 400 «querystring must have required property
       'instanceId'» al pedir el ticket. Ese 400 se traducía a ERROR_SHALOM,
       que el interruptor cuenta como servicio caído: cinco intentos del
       botón y la puerta se CERRÓ para todo, también el seguimiento. Un 400 o
       un 422 dicen que el pedido está mal armado: se arregla aquí, no
       esperando a que Shalom «vuelva». No cuenta para el interruptor.
- L252: La FORMA de un valor, sin un solo valor dentro. Es la herramienta de
  diagnóstico: deja escribir el contrato contra lo que la API devuelve de
  verdad sin que ningún dato de un cliente salga del servidor.
  @param {*} v valor a describir
  @param {number} [prof] profundidad actual
  @return {*} descripción de tipos
- L260: Solo dígitos y separadores, empezando por un dígito. Un nombre nunca entra
     (tiene letras); una fecha o un monto, sí.
- L264: El tipo de un texto — y si parece una fecha o un número, TAMBIÉN su forma,
  con los dígitos tapados: "2026-08-19 16:10" sale como "####-##-## ##:##".
  
  Hace falta: el formato de fecha decide si se puede ordenar y mostrar bien, y
  no está documentado. Sin esto habría que pedir un valor real — o sea, un
  dato de un cliente pasando por el chat.
  
  Solo se destapa la forma de lo que es puro número: cualquier texto con
  letras (un nombre, una dirección) sale como "string" a secas.
  @param {string} s texto
  @return {string} descripción
- L284: La FORMA de un valor, sin un solo valor dentro. Es la herramienta de
  diagnóstico: deja escribir el contrato contra lo que la API devuelve de
  verdad sin que ningún dato de un cliente salga del servidor.
  @param {*} v valor a describir
  @param {number} [prof] profundidad actual
  @return {*} descripción de tipos
- L311: Traduce la respuesta de `GET /validate` al contrato del panel.
  
  REGLA DE ORO: jamás ok:true sin dato real. Si `valid` no es un booleano,
  no sabemos qué nos respondieron y se dice FORMATO_DESCONOCIDO en vez de
  inventar un éxito.
  
  ⚠️ `limite` en null significa PLAN ILIMITADO, no "sin cuota". La
  documentación muestra `limit: 1000`, pero con plan ilimitado Shalom manda
  `null` — y `remaining` también (contradicción 5 de SHALOM-API.md, medida el
  13 sep 2026 contra la API real). Convertirlo a 0 diría lo contrario.
  
  FORMA REAL MEDIDA — seis campos, no los cuatro documentados:
    valid:boolean · userId:string · limit:null · currentUsage:number
    · remaining:null · message:string
  
  `userId` y `message` NO están en la documentación. `message` se devuelve
  (es lo que Shalom dice de tu clave, y mostrar sus palabras es mejor que
  inventar las mías). `userId` NO: es un identificador de la cuenta que
  ninguna pantalla necesita, y lo que no hace falta no viaja al navegador.
  
  Los campos que no se reconocen se ignoran a propósito: si Shalom añade uno
  mañana, esto sigue funcionando en vez de romperse.
  @param {*} j cuerpo JSON de Shalom
  @return {Object} respuesta del contrato
- L344: Una clave rechazada es una respuesta legítima de Shalom, pero para quien
- L345: llama es lo mismo que estar bloqueado: se traduce a su motivo.
- L359: El cuerpo que de verdad sale, segun lo declarado por la operacion.
  Sin `cuerpoCampos` va tal cual (las operaciones de siempre no cambian).
  @param {Object} def la entrada de PERMITIDAS
  @param {Object} cuerpo lo que llego, que puede venir del navegador
  @return {Object} solo lo permitido
- L376: Llama a Shalom. Devuelve el JSON crudo o un motivo; NO traduce.
  Separado a propósito: así la traducción se prueba sin red y la red se
  prueba sin traducción.
  @param {string} op nombre de la operación en PERMITIDAS
  @param {string} clave API key
  @param {Object} [cuerpo] cuerpo para las operaciones POST
  @return {Promise<Object>} {ok:true, json} o {ok:false, motivo, detalle}
- L388: Un endpoint público no necesita clave, así que tampoco se le manda: una
- L389: credencial no viaja donde no hace falta, ni siquiera a un sitio de
- L390: confianza. Y si falta la clave, eso ya no puede bloquear su consulta.
- L395: Los parametros que van DENTRO de la ruta. Se validan contra la forma
       declarada y se sustituyen; no se codifican. Codificar sirve para un
       valor —un querystring, un cuerpo—, pero aqui el valor ES parte de la
       direccion: lo unico seguro es no dejar pasar nada que no tenga la forma
       exacta que se espera.
- L414: El querystring: SOLO los campos declarados en `consulta`, cada uno con
       su forma exacta, y codificados. Lo que no tenga la forma, no sale.
- L432: Un hueco sin rellenar significa que la declaracion y lo que llego no
- L433: coinciden. Antes de llamar a una URL con una llave dentro, no se llama.
- L447: LISTA BLANCA DEL CUERPO, donde se declara.
           Misma idea que `pedidoPublico.CAMPOS` y que `ORDER_FIELDS`: se
           enumera lo permitido y lo demas no sale. Aqui protege algo muy
           concreto — que una contraseña mandada desde el navegador no llegue
           a viajar— y por eso `instanceLogin` la tiene VACIA.
  
           Solo se aplica donde esta declarada: `track` lleva meses funcionando
           con su cuerpo y no se toca. Arreglar lo que no esta roto es como se
           rompen las cosas; extenderla a `track` tiene su propio turno.
- L484: El texto va a `motivoDeHttp` porque hay 403 que significan cosas
- L485: distintas y solo el mensaje los separa. Ver el comentario de allí.
- L498: ── /track ───────────────────────────────────────────────────────────────
     FORMA REAL MEDIDA el 13 sep 2026 con `esquema`:
  
       statuses.data → registrado · origen · transito · destino
                       · reparto · entregado · demora
  
     Cada rama es `null` mientras no ocurre y un objeto con `fecha` cuando
     ocurre. `transito` trae además `carguero`, `completo` y `cargueros[]`;
     `entregado` trae `cliente:{nombre,documento}` — QUIÉN recibió el paquete.
  
     ⚠️ `statuses` es un OBJETO. La documentación lo pinta como array.
- L510: El orden de esta lista ES el avance del envío. Gana el ÚLTIMO que tenga
- L511: fecha, no el de número más alto: `destino` y `reparto` comparten pasos:2 y
- L512: aun así reparto va después.
- L514: ⚠️ `registrado` NO ESTÁ AQUÍ, por la misma razón que `demora` no está: no es
- L515: un paso del paquete. Shalom tiene DOS ramas distintas, con dos fechas
- L516: distintas, y significan cosas distintas:
- L518: registrado → la guía fue creada          ← esto lo hacemos NOSOTROS
- L519: origen     → el paquete entró a la agencia ← esto es "ya lo dejé"
- L521: Las dos estaban traducidas al mismo texto y al mismo rango. Aplastarlas
- L522: costó un pedido real: se registró, nadie dejó el paquete, la primera
- L523: consulta contestó "En origen" y la etiqueta saltó a ENVIADO con el paquete
- L524: todavía en la tienda. Medimos bien el esquema y después tiramos la única
- L525: distinción que importaba.
- L527: MEDIDO el 3 oct 2026 sobre tres guías reales del flujo viejo (número de
- L528: guía puesto a mano, después de dejar el paquete en el mostrador):
- L530: 86069409  registrado=2026-06-26 19:54:00  origen=2026-06-26 19:54:00
- L531: 86101685  registrado=2026-06-27 12:39:00  origen=2026-06-27 12:39:00
- L532: 92866322  registrado=2026-08-22 17:38:08  origen=2026-08-22 17:38:08
- L534: IDÉNTICAS, al segundo: en el mostrador registrar y entregar son el mismo
- L535: acto. Por eso sacar `registrado` de los pasos no afecta a ningún pedido
- L536: antiguo — siguen llegando a ENVIADO por `origen`, igual que siempre. En
- L537: nuestro registro, en cambio, `origen` se queda en null hasta que el
- L538: paquete llega de verdad. Las dos poblaciones se separan solas.
- L540: ⚠️ El formato es `YYYY-MM-DD HH:MM:SS` y NO LLEVA ZONA HORARIA. Parsearlo
- L541: en el servidor (que corre en UTC) lo correría 5 horas hacia adelante y la
- L542: cuenta atrás diría que te queda tiempo cuando ya venció. Por eso el plazo
- L543: sale de nuestro propio sello ISO y no de aquí, todavía.
- L545: Con `registrado` fuera de esta lista, una guía recién nacida no alcanza
- L546: ningún paso → `ok:false` → nadie mueve nada. Y eso no es que el bug esté
- L547: arreglado: es que no se puede escribir.
- L556: La fecha de una rama del árbol, o null si esa rama no ha ocurrido.
  @param {*} rama valor de la rama
  @return {?string} fecha tal cual la manda Shalom
- L567: Traduce `POST /track`.
  
  ⚠️ `demora` NO ES UN PASO, y por eso no está en PASOS. Es una bandera que
  viaja aparte. Aquí está la lección más cara de este proyecto: cuando la
  demora podía convertirse en el estado, un paquete ENTREGADO se mostraba
  como "Demora de envíos" — el envío desandaba el camino y había que
  explicárselo al cliente. Con demora fuera de la lista de pasos, eso no es
  que esté arreglado: es que no se puede escribir.
  
  La fecha se devuelve TAL CUAL la manda Shalom. No se parsea: su formato no
  está medido todavía, y adivinarlo es como se ordenan mal los historiales.
  @param {*} j cuerpo JSON de Shalom
  @return {Object} respuesta del contrato
- L587: SIN SEGUIMIENTO NO ES LO MISMO QUE NO ENTENDER LA RESPUESTA.
       Medido con la guía 94578959 (un retorno a origen): Shalom contesta 200 con
       `statuses: null` y un `search` que solo trae {message, success}, sin
       `data`. Es una respuesta clara — "de esta guía no sé nada" —, no una que
       no sepamos leer.
       La diferencia no es cosmética: FORMATO_DESCONOCIDO manda a revisar la
       integración, y NO_ENCONTRADO manda a revisar el número de guía. Confundir
       el lado del panel con el lado de Shalom ya costó días una vez.
- L596: Con `search` delante es la forma medida y la lectura es segura. Sin él
- L597: no hay respuesta que reconocer: un cuerpo vacío no dice "no encontrado",
- L598: no dice nada, y afirmar lo primero sería inventar.
- L608: Mismo caso un nivel más abajo: el árbol ausente es "no hay seguimiento".
- L620: el último con fecha manda
- L623: REGLA DE ORO: sin un paso real, no hay éxito.
  
       Y aquí se separan dos "no hay dato" que no son lo mismo:
  
         SOLO_REGISTRADO → la guía existe y Shalom la reconoce, pero el paquete
                           no ha entrado a ninguna agencia. Hay un plazo de 24 h
                           corriendo y el paquete sigue contigo.
         SIN_DATO        → el árbol entero en null: Shalom aún no la registró.
  
       Las dos devuelven ok:false, así que ninguna mueve etiquetas ni escribe
       tracking. La diferencia es lo que se te dice en pantalla, y no es poca
       cosa: una te manda a la agencia, la otra a revisar la guía.
- L653: Se llama `pasos` y no `paso` porque ese es el nombre del contrato que ya
- L654: existe (ver la cabecera de shalom.js) y el que lee el aplicador de
- L655: tracking.js para su guarda de no-retroceso. Dos nombres para lo mismo es
- L656: como una guarda deja de guardar.
- L660: Cuándo nació la guía. Viaja aparte —como la demora— porque es un hecho
- L661: del papel, no del paquete.
- L663: Quién recibió: solo tiene sentido si de verdad se entregó.
- L669: ¿Este usuario es administrador?
  
  ⚠️ EL CORREO SOLO VALE SI ESTA VERIFICADO — misma regla que firestore.rules,
  y por el mismo motivo: Firebase deja que cualquiera cree una cuenta con
  CUALQUIER correo sin comprobar que sea suyo. Sin esta linea, alguien que
  sepa uno de estos correos se registra con el, pone su contrasena, y habla
  con la API de Shalom del negocio.
  
  No hay excepciones. Hubo una —una cuenta creada a mano, sin correo
  verificado— y se retiro el 20 sep 2026 junto con la cuenta: una contrasena
  de un buzon que no existe no se puede cambiar ni recuperar, asi que no era
  una llave de emergencia sino una llave perdida.
  @param {Object} usuario token decodificado
  @param {Array<string>} admins correos autorizados
  @return {boolean} true si puede
- L694: Las cuatro barreras, en orden y como función pura.
  
  Vive aquí y no en index.js para que se pueda PROBAR. Es el límite de
  seguridad del sistema: si el orden se rompe —por ejemplo, si la lista
  blanca se mirara antes que la sesión— un desconocido podría averiguar qué
  operaciones existen. Un límite de seguridad sin pruebas es una intención.
  
  `deps.verificar` recibe el token y devuelve el usuario, o lanza. Se inyecta
  para poder probar sin Firebase.
  @param {Object} entrada {metodo, authorization, cuerpo}
  @param {Object} deps {verificar, admins}
  @return {Promise<Object>} {corte:{http,motivo}} o {ok:true, destino, ...}
- L711: 1 · POST con sesión válida
- L722: 2 · administrador. Va ANTES de mirar la operación: a un desconocido no se
- L723: le confirma ni qué operaciones existen.
- L729: 3 · lista blanca
- L734: Las orquestaciones salen por aquí: ya pasaron sesión y administrador,
       y de ellas el navegador solo manda el id del pedido.
- L745: ⚠️ SOLO-SERVIDOR SE CORTA ANTES QUE NADA, incluido el diagnóstico.
       `register` crea un envío que se paga y no se anula: si se pudiera
       "medir" con un cuerpo del navegador, medir costaría dinero.
- L751: Medible sí, usable todavía no. Sin esta guarda, un endpoint recién
- L752: añadido devolvería su JSON crudo por la puerta de otro traductor.
- L757: 4 · recién ahora quien llama puede usar la clave
- L762: Traduce la respuesta de `GET /instances` al contrato del panel.
  
  FORMA REAL MEDIDA (22 sep 2026, contra la API desplegada):
    {instances: [{id:string, name:string, username:string,
                  createdAt:string(ISO con milisegundos), isLoggedIn:boolean}]}
  
  La documentación la pinta PLANA; viene envuelta en `instances`. Una vez más
  la doc y la realidad no coinciden — por eso se mide antes de traducir.
  
  REGLA DE ORO, la de este endpoint en particular: solo se afirma algo cuando
  `isLoggedIn` es un booleano de verdad. Si Shalom cambia la forma se devuelve
  FORMATO_DESCONOCIDO y el panel enseña la respuesta cruda, en vez de inventar
  un "conectado" que haría fallar un lote entero de registros sin decir por
  qué. Es exactamente lo que faltaba cuando el traductor de /track daba por
  bueno un formato que ya no existía.
  
  ⚠️ NINGUNA instancia y VARIAS instancias son cosas distintas, y ninguna de
  las dos es "la sesión está caída":
    - 0 → no hay cuenta de Shalom Pro que consultar.
    - >1 → no se puede saber CUÁL usa el panel, y elegir la primera sería
      adivinar. Con dos instancias, una dentro y otra fuera, afirmar por la
      primera es una mentira que se paga con un lote de registros fallidos.
  
  `url` (dónde quedó parado el robot) NO lo da este endpoint, solo el
  `POST /instances/status`. Va en null a propósito: el panel no pinta el
  enlace en vez de inventarse una dirección.
  @param {*} j cuerpo JSON de Shalom
  @return {Object} respuesta del contrato
- L798: ★ LA LISTA SALE SIEMPRE, incluso cuando la respuesta es una negativa.
       Antes, con varias instancias, esto devolvía solo `VARIAS_INSTANCIAS` y
       TIRABA los datos — así que el panel ni siquiera podía ofrecerte la
       elección que le estaba pidiendo. La negativa se queda intacta: lo que
       se añade es con qué decidir.
       En el vocabulario del panel y no en el de Shalom: `isLoggedIn` y `name`
       no cruzan esta frontera, que es la razón de ser de este archivo.
- L817: ⚠️ Y CON VARIAS NO SE ELIGE, aunque ahora haya lista. Caso real del
       01/10/2026: dos instancias conectadas, `Total` y `Yapaitas`, de dos
       negocios distintos. Elegir "la primera" o "la conectada" habría
       registrado el envío de un cliente en la cuenta del otro negocio, cobrado
       a ellos, y nadie se habría enterado hasta que el paquete no apareciera.
       Quien elige es el dueño, en Config.
- L837: La llave que van a necesitar el ticket y el registro de envíos. No se
- L838: guarda en ninguna parte a propósito: pedirla es una consulta que no
- L839: gasta cuota, y un id guardado puede quedar viejo si la instancia se
- L840: rehace. Menos estado que mantener, y nunca desfasado.
- L843: NULO, no `false`, y la diferencia importa: el `GET /instances` no
           dice dónde quedó parado el navegador de Shalom, así que no lo sabe.
           Poner `false` sería afirmar "no está en la pantalla de entrar"
           cuando lo cierto es "no tengo ni idea" — y el panel se lo creería.
           Para saberlo hace falta `POST /instances/status`.
- L854: `POST /instances/status` — el estado de UNA instancia.
  
  Forma MEDIDA el 01/10/2026 contra la instancia real:
    { isLoggedIn: boolean, username: string|null, url: string }
  
  ⚠️ `username` LLEGO NULL con la sesión conectada. La documentación lo
  listaba como si siempre viniera; medirlo dijo otra cosa. Es el mismo caso
  que el `apellidoMaterno: null` de RENIEC, y se trata igual: nulo es nulo,
  nunca el texto "null" ni un inventado.
  
  LO QUE ESTE ENDPOINT APORTA sobre el `GET /instances` que ya teníamos es
  la `url`: dónde quedó parado el navegador headless de Shalom. Si termina
  en /login, se deslogueó. Eso es un diagnóstico; un booleano solo, no.
  
  Devuelve EXACTAMENTE los mismos campos que `traducirInstancias`: dos
  fuentes de lo mismo que hablaran distinto obligarían al panel a saber de
  cuál vino, y eso es estado que no hace falta mantener.
  
  @param {Object} j JSON crudo de Shalom
  @return {Object} {ok:true, sesion:{…}} o {ok:false, motivo}
- L882: Se compara la RUTA, no la url entera, y se le quita la barra final.
       Buscar "/login" dentro del texto daría por deslogueado un
       `/panel/logins` o un `/loginata`, y mandaría a volver a entrar cuando el
       problema es otro.
- L896: Este endpoint no los devuelve. Nulo y no inventado: el panel ya sabe
- L897: pedirlos al `GET /instances`, que sí los trae.
- L901: Sin url no se sabe, y no saber se dice: nulo, no `false`.
- L907: El texto de un valor, o "" si no hay. Un número se convierte a texto a
  propósito — ver `traducirAgencias`.
  @param {*} v valor
  @return {string} texto
- L920: Traduce `GET /public/agencies` al esquema común del catálogo — el MISMO que
  ya usa el buscador del formulario, así no hay que tocarlo.
  
  FORMA REAL MEDIDA (24 sep 2026, contra la API desplegada): 34 campos por
  agencia, no los 48 que dice la documentación para `/agencies`. Faltan
  `hora_domingo` y `referencia`. Se comprobó que **no las usa nadie** (el
  formulario lee `ag.horario || ag.hora_atencion`, y `hora_atencion` sí
  viene), así que se quedan vacías en vez de mentir con un dato inventado.
  Es la contradicción nº 8 entre la documentación de esta API y la realidad.
  
  ⚠️ `ter_id` LLEGA COMO NÚMERO y en el catálogo guardado es TEXTO ("3").
  Se normaliza a texto aquí, en un solo sitio. Sin esto, el día que se
  verifique la agencia antes de registrar un envío, `3 !== "3"` fallaría en
  silencio — y un envío sin agencia verificada es un paquete pagado que puede
  salir a la ciudad equivocada.
  
  ⚠️ No hay campo `distrito`: la API manda `zona`. Es el mismo mapeo que hace
  `_mapShalom` en el navegador. Antes de reemplazar el catálogo, el extractor
  compara con el que ya está en uso, así que un cambio masivo de distritos se
  vería antes de aceptar nada.
  
  Una agencia sin id no entra: no sirve para registrar y ensucia el catálogo.
  Cuántas se descartaron se DICE, no se calla.
  @param {*} j cuerpo JSON de Shalom
  @return {Object} respuesta del contrato
- L950: Jamás ok:true sin dato real: si no dice que salió bien, no salió bien.
- L973: no viene en la variante pública
- L976: tampoco viene, y no lo usa nadie
- L982: 554 agencias que se vuelven 0 no es un catálogo vacío: es que cambió la
- L983: forma. Reemplazar el catálogo con eso lo dejaría inservible.
- L989: Traduce `GET /account/dni/{dni}` (espejo de RENIEC) al contrato del panel.
  
  FORMA REAL MEDIDA (26 sep 2026, contra la API desplegada):
    {success:boolean, message:string, data:{
       dni:string(8), nombres:string, apellidoPaterno:string,
       apellidoMaterno:string|null, digitoVerificador:number}}
  
  La documentacion solo decia "espejo de datos registrales" — ni un campo.
  
  POR QUE IMPORTA: `POST /account/register` pide el nombre PARTIDO en tres,
  y partir "JARLYN LLANOS ARTEAGA" a ojo se equivoca con cualquier nombre
  compuesto. RENIEC ya los da separados, asi que el registro deja de tener
  que adivinar.
  
  ⚠️ `apellidoMaterno` PUEDE VENIR null. Se midio con un DNI de ejemplo y
  llego null — si se hubiera medido solo con el del dueño, el traductor
  habria reventado el dia que le toque un cliente sin apellido materno. Va
  como "" y se dice que falta; nunca se inventa un apellido.
  
  `completo` es SOLO PARA MOSTRAR. El registro usa los tres campos por
  separado: juntarlos y volver a partirlos seria deshacer lo unico que este
  endpoint aporta.
  
  `digitoVerificador` no se devuelve: el registro no lo pide y lo que no hace
  falta no viaja al navegador.
  @param {*} j cuerpo JSON de Shalom
  @return {Object} respuesta del contrato
- L1021: Jamas ok:true sin dato real. Un `success` que no es exactamente true no
- L1022: se interpreta: no se ha medido que significa, y suponerlo aqui seria
- L1023: rellenar el nombre de un cliente con lo que sea.
- L1029: Sin nombres no hay nada que autocompletar, y afirmarlo con los apellidos
- L1030: sueltos daria un nombre a medias en el formulario.
- L1046: Traduce la respuesta cruda del endpoint que sea. Un endpoint sin traductor
  NO devuelve su JSON: eso es justo lo que hace que una forma mal entendida
  llegue a la pantalla como si fuera un dato bueno.
  @param {string} op operación
  @param {*} json cuerpo devuelto por Shalom
  @return {Object} respuesta del contrato
- L1064: ── GET /track/voucher — el TICKET (comprobante) ─────────────────────────
     Devuelve un BINARIO (PNG por defecto), no JSON: por eso no pasa por
     `llamar`, que parsea JSON. La doc de su API trae el ejemplo con
     `res.json()`, que está mal (ver docs/SHALOM-API.md).
  
     Cuatro comprobaciones antes de aceptar lo que llega, porque esto termina
     GUARDADO en el bucket y enseñado al cliente:
       · guía y código con su forma exacta (nada raro viaja en el querystring);
       · HTTP 200;
       · tamaño máximo — un 200 con 40 MB es un error, no un ticket;
       · los BYTES dicen PNG o PDF (firma del archivo), no solo la cabecera:
         un 200 con una página HTML de error no se guarda como «ticket».
- L1076: = barrido.GUIA_OK
- L1078: El id de la cuenta de Shalom Pro (UUID). Shalom lo EXIGE para el ticket
     (medido el 28/10/2026: 400 sin él; su doc no lo menciona). Lo pone el
     servidor desde la configuración guardada al conectar, nunca el
     navegador: así nadie pide tickets con otra cuenta.
- L1085: Qué es un archivo, por sus primeros bytes.
  @param {Buffer} b bytes
  @return {string} "image/png" · "application/pdf" · ""
- L1107: ★ MEDIDO EL 28/10/2026: /track/voucher responde 200 y el cuerpo NO es un
     PNG crudo (la doc dice binario). Antes de saber su forma exacta se
     aceptan, sin aflojar la validación, las formas habituales:
       · la imagen cruda (PNG, JPEG, WEBP, GIF) o un PDF;
       · un JSON que la lleva dentro como `data:…;base64,…` o base64 suelto;
       · un JSON con la URL https del archivo (se descarga y se valida igual).
     Lo que se acepta SIEMPRE pasa por `tipoPorFirma`: los bytes mandan.
- L1116: Busca dentro de un JSON una imagen/PDF en base64 o una URL https.
  @param {*} v el JSON
  @param {number} [prof] profundidad
  @return {Object} {bytes} | {url} | {}
- L1147: Primero lo que tenga base64 (es el archivo); la URL, de respaldo.
- L1160: Descarga el ticket de una guía.
  @param {string} clave API key (solo servidor)
  @param {Object} datos {orderNumber, orderCode, instanceId}
  @return {Promise<Object>} {ok:true, bytes, tipo} o {ok:false, motivo}
- L1221: ¿Un JSON con el archivo dentro?
- L1243: Nada reconocible: se dice QUÉ llegó —tipo de contenido y la FORMA del
       JSON (claves y tipos, sin un solo valor)—, para poder adaptarlo sin
       pedir datos de un cliente.
- L1256: Descarga una URL https que devolvió Shalom y valida que sea imagen/PDF.
  La clave SOLO viaja si la URL es del mismo servidor de la API.
  @param {string} url https://…
  @param {string} clave API key
  @return {Promise<Object>} {ok:true, bytes, tipo} o {ok:false}
- L1286: Las filas de una lista, vengan donde vengan: array directo, `items`,
  `data`, `data.items`, o un objeto {"0":…} estilo PHP.
  @param {*} j respuesta
  @return {Array} filas (vacío si no hay)
- L1307: ★ EL RESPALDO POR TU SHALOM PRO: el estado de una guía sacado del
  «Seguimiento de envíos» (GET /account/tracking-list), para cuando /track
  falla del lado de shalom-api (SHALOM_SIN_RESPUESTA).
  
  FORMA MEDIDA el 12/11/2026 (botón «Medir Shalom Pro»):
    {success, message, data:{items:[{guideNumber:"#########", code, status,
     packageDelivered:boolean, checkSendPackage:boolean, …}], meta, summary:
     {en_origen, en_transito, en_reparto, en_destino}}}
  
  Se devuelve en el MISMO contrato que /track ({ok, estado, pasos}) y con
  los textos de siempre, para que el aplicador y el barrido no distingan de
  dónde vino. Reglas:
    · por `guideNumber` EXACTO; si no está → null (no se inventa nada);
    · `packageDelivered` → Entregado;
    · un estado que hable de REGISTRADO o PENDIENTE NO es un paso (el
      paquete no entró a la agencia: es la lección de `registrado`) → null;
    · un estado que no se reconoce → null. Mejor sin dato que un dato falso.
  @param {Array} filas filas de una o varias páginas
  @param {string} guia número de guía
  @return {?Object} {ok:true, estado, pasos, fuente} o null

## functions/sincro.js

- L3: functions/sincro.js — TRAER SOLO LO QUE CAMBIÓ (Fase 2, 29/10/2026).
  ====================================================================
  Antes, cada cambio en la nube (un pedido del formulario, otra PC, el
  seguimiento automático) hacía que cada PC abierta bajara los ~1500
  pedidos completos. Ahora:
  
    · Cada escritura de un pedido o proveedor graba `_mts` = la hora del
      SERVIDOR de Google (no la de la PC: un reloj atrasado escondería
      cambios). Lo ponen el panel (commit con REQUEST_TIME) y las Cloud
      Functions (serverTimestamp).
    · Borrar deja una LÁPIDA en `panel/borrados/items/<col>__<id>` en la
      MISMA operación que el borrado (commit atómico).
    · El panel pide solo `_mts > marca − 60 s` y aplica lápidas. El margen
      cubre una escritura cuya hora es anterior pero que se hizo visible un
      instante después de la consulta: lo repetido se descarta por id.
  
  ⚠️ NO ESCONDER PEDIDOS es la regla número uno, así que ante la MENOR duda
  se hace la carga completa de siempre:
    · no hay copia local, o no tiene marca, o la marca es rara;
    · el servidor todavía no está desplegado con `_mts` (`syncV` ausente);
    · la última carga completa tiene más de 12 horas;
    · la nube dice que hubo un cambio y la consulta no trae NADA: alguien
      escribió sin `_mts` (una pestaña con el panel viejo en caché);
    · la consulta falla, o trae demasiado;
    · el dueño apagó la sincronización rápida en esta PC.
  
  Lógica PURA: ni red ni DOM. La usa index.html (`_fbLoad`).
- L33: global globalThis, window
- L41: versión del formato de la marca
- L42: ventana de solape hacia atrás
- L44: más que esto: carga completa
- L47: ¿Carga completa o solo lo cambiado?
  @param {Object} e {activo, cfg, sync, tieneLocal, ahora, forzarCompleta}
  @return {Object} {modo: "completa"|"cambios", motivo}
- L57: `!(… >= V)` y no `< V`: con syncV ausente, Number() da NaN, y
- L58: `NaN < 1` es false — el panel habría creído listo al servidor.
- L73: Desde dónde pedir: la marca menos el margen.
  @param {Object} sync {ts}
  @return {string} ISO
- L83: El mayor `_mts` (ISO) de una lista.
  @param {Array} lista documentos
  @return {string} ISO, o ""
- L97: La marca tras una carga. Solo avanza con horas que DIJO EL SERVIDOR:
  nunca con el reloj de la PC, y nunca hacia atrás.
  @param {?Object} previa la marca anterior
  @param {Array} vistos documentos y lápidas recibidos
  @param {boolean} completa si fue una carga completa
  @param {number} ahora Date.now()
  @return {Object} nueva marca
- L111: Primera carga completa sin ningún `_mts` en la nube todavía: se marca
- L112: el origen de los tiempos para que el siguiente cambio SÍ se pida.
- L118: Aplica lo cambiado sobre la lista local. Por id, quien tenga el `_mts`
  más nuevo gana entre documento y lápida (un pedido borrado y luego
  restaurado de la papelera vuelve a existir).
  Lo que tiene cambios locales sin subir NO se toca aquí: de eso ya se
  encarga `_mergeRemote`, igual que con la carga completa.
  @param {Array} local la lista actual
  @param {Array} cambiados documentos recibidos (con id y _mts)
  @param {Array} lapidas {id, _mts} de esta colección
  @return {Array} lista nueva
- L141: la lápida es posterior
- L151: Cuántos de lo recibido son NOVEDAD de verdad: documentos que no se
  tenían, o con otra hora de cambio. Por el margen de 60 s la consulta
  repite casi siempre algo ya conocido; contar eso como «trajo algo»
  escondería una escritura sin `_mts` hecha en esa misma ventana.
  @param {Array} local lista actual
  @param {Array} recibidos documentos de la consulta
  @return {number} novedades
- L173: Novedad total de una consulta: documentos nuevos o con otra hora, y
  lápidas que de verdad quitarían algo de aquí (una lápida más vieja que
  el pedido que hay —borrado y restaurado— no es novedad).
  @param {Object} local {shipments, suppliers}
  @param {Object} r {ships, supps, lapidas}
  @return {number} novedades
- L199: Cuánto trajo la consulta (con lo repetido por el margen).
  @param {Object} r {ships, supps, lapidas}
  @return {number} total recibido
- L209: Id del documento de lápida: colección + id, sin barras.
  @param {string} col "shipments" | "suppliers"
  @param {string} id id del documento
  @return {string} "shipments__id_123"

## functions/ticketShalom.js

- L3: functions/ticketShalom.js — «🧾 Jalar ticket de Shalom».
  =========================================================
  El SERVIDOR hace todo: pide el ticket a Shalom (con la clave que nunca
  sale del servidor), lo guarda en Firebase Storage, en la carpeta del
  pedido, y lo apunta en el pedido como «Guía / Ticket» (`docGuia`). El
  navegador solo recibe el enlace del archivo ya guardado: nunca manipula
  el archivo, así que no hay base64 que se pierda ni memoria que se llene.
  
  Orquestación pura: la red, el bucket y Firestore llegan como `deps`, así
  que se prueba sin ninguno de los tres.
- L17: ¿Se puede pedir ya? La MISMA regla que Consultar y los horarios.
- L20: @param {Object} datos {pedidoId, orderNumber, orderCode} (del navegador)
  @param {Object} deps {leerPedido(id), instancia() → id de Shalom Pro,
    descargar({orderNumber,orderCode,instanceId}),
    subir(ruta, bytes, tipo) → url, guardar(campos)}
  @return {Promise<Object>} {ok:true, doc} o {ok:false, motivo, detalle}
- L41: ⏳ GUÍA DEL PANEL AÚN POR DEJAR (registroShalom.situacion): el
       comprobante lo emite Shalom en el MOSTRADOR, al recibir el paquete.
       Antes de eso no existe, y pedirlo solo devolvía «no encontró esa guía».
       Se dice sin gastar una llamada. Si escribiste OTRA guía en el
       formulario (aún sin guardar), esa es tuya a mano: se pide normal.
- L56: La cuenta de Shalom Pro: de la configuración del SERVIDOR (la guardó
       «Conectar»). Lo que el navegador mandara con ese nombre se ignora.
- L69: Shalom no tiene el comprobante: si la guía es un envío PENDIENTE de tu
       cuenta (escrita a mano, p. ej. registrada en pro.shalom.pe), no es un
       error: el comprobante nace al dejar el paquete.

## functions/webhook.js

- L5: functions/webhook.js — recibir avisos de Shalom sin creerles todavia
  =====================================================================
  Esta es la UNICA puerta publica sin autenticacion del sistema: cualquiera en
  internet puede llamarla. Lo unico que separa un aviso de Shalom de uno
  inventado es la firma. Por eso aqui no hay atajos.
  
  ⚠️ NO TRADUCE NADA, Y ES A PROPOSITO.
  El webhook habla OTRO idioma que /track: donde /track dice "En transito", el
  webhook dice "IN_TRANSIT". El mapa completo de codigos no esta documentado
  en ninguna parte. Adivinarlo seria repetir el fallo que costo dias —pero
  esta vez escribiendo solo, de madrugada—. Asi que primero se MIDE: se anota
  la forma del evento y los codigos que trae, y recien despues se traduce.
- L20: Cuanto se acepta de diferencia entre el reloj de Shalom y el nuestro.
- L23: Tope de cuerpo. Un aviso de estado son cientos de bytes, no megas.
- L26: Un codigo de estado: mayusculas y guion bajo. Nunca un nombre ni una
      direccion, asi que su VALOR se puede anotar sin exponer a nadie.
- L30: Lee la cabecera `t=<unix>,v1=<hex>`.
  @param {string} cab valor de X-Shalom-Signature
  @return {?Object} {t, v1} o null si no se entiende
- L52: ¿Es de Shalom de verdad?
  
  Se firma "<t>.<cuerpo CRUDO>". El cuerpo crudo, no el JSON reparseado: dos
  JSON con el mismo contenido pueden tener bytes distintos, y entonces la
  firma no cuadra nunca. Ese detalle costo dias.
  @param {string} cab cabecera X-Shalom-Signature
  @param {Buffer|string} crudo cuerpo tal como llego
  @param {string} secreto whsec_…
  @param {number} ahoraMs Date.now()
  @return {Object} {ok:true} o {ok:false, motivo}
- L69: Un aviso viejo repetido no vale: sin esto, quien grabe UNA llamada valida
- L70: puede reenviarla para siempre.
- L84: La longitud se compara aparte porque timingSafeEqual exige que coincida.
- L85: Comparar el contenido con === filtraria, byte a byte, cuanto se acerto.
- L93: Identificador del evento para no aplicarlo dos veces.
  
  Shalom reintenta si no respondemos rapido, y aplicar dos veces el mismo
  aviso duplica historiales. La propia firma sirve: incluye el momento y el
  cuerpo, asi que dos avisos distintos no pueden compartirla.
  @param {string} cab cabecera X-Shalom-Signature
  @return {?string} id apto para Firestore, o null
- L108: Los CODIGOS que trae el aviso, con su ruta. Es el vocabulario que hay que
  medir para poder traducir despues.
  
  Solo se anota el valor de lo que parece un codigo —MAYUSCULAS_CON_GUION—,
  que nunca es un nombre ni una direccion. Todo lo demas queda como tipo.
  @param {*} v cuerpo del evento
  @param {string} [ruta] ruta acumulada
  @param {Object} [salida] acumulador
  @return {Object} {ruta: codigo}

## index.html

- L12: errores.js va PRONTO: engancha window.onerror, así que cuanto antes
       cargue, más fallos atrapa. No depende de nada.
- L14: seleccion.js TAMBIÉN va pronto, y no por gusto: el script en línea de
       más abajo llama a Seleccion._pintarBoton() en cada repintado. Cargándolo
       al final del body había una ventana real —un repintado en el primer
       frame, antes de que el archivo llegara— en la que eso lanzaba
       ReferenceError y ABORTABA EL RENDER ENTERO: cero tarjetas. Pasó en una
       recarga forzada, con todo bajando de red a la vez.
       No depende de nada al cargar: solo define window.Seleccion.
- L22: guias.js: avisos del número de guía. Lógica pura + un pintor; no
       depende de nada al cargar. Lo usan config.js (formulario) y tracking.js
       (modal de seguimiento).
- L26: ⚠️ SÍ, ESTE ARCHIVO ESTÁ EN functions/ Y NO ES UN ERROR.
       Es la fórmula de qué etiqueta le toca a un pedido, y la usan LOS DOS: este
       panel y el barrido programado del servidor. Una copia en cada lado
       divergiría, y divergir ahí significa que el barrido mueva de madrugada una
       etiqueta que el panel habría rechazado. Un archivo raro de ver en el árbol
       es mejor que dos reglas que deciden si tus pedidos retroceden.
- L45: FIREBASE via REST API — sin SDK, funciona en Brave/Chrome/Firefox/Safari
- L57: HEADER
- L78: TABS
- L85: ENVÍOS
- L122: RECURSOS — misma cara que Envíos, con las MISMAS clases de panel.css.
       Ninguna de ellas dice "envío" en su nombre, así que no hay CSS nuevo
       salvo la rejilla del mosaico, que se inyecta abajo.
- L158: HOJA: NUEVO / EDITAR RECURSO
- L189: COMPARTIR
- L191: ★ «ESTE LINK» EN LUGAR DE LA LLAVE.
         La llave y el texto ocupaban el primer tercio de la pantalla para
         explicar algo que ya se sabe. Ahí van ahora los días y los couriers de
         ESTE link: se eligen aquí, se congelan al pulsar «Generar…», y no
         tocan Config. Ver `_linkSel` en config.js.
- L198: LINK PERSONALIZADO
- L210: N° de factura/boleta: va DENTRO del token (como el monto) y el
           servidor lo copia al pedido. Ver functions/nroComprobante.js.
- L227: LINKS RÁPIDOS
- L240: LINKS GENERADOS
- L250: CONFIGURAR
- L257: FORMULARIO DEL CLIENTE
- L262: DATOS
- L272: DESPACHO
- L290: COURIERS
- L301: CONFIGURACIÓN AVANZADA
- L306: ETIQUETAS
- L313: CAMPOS EXTRA
- L323: NOTIFICACIONES
- L334: CONFIGURACIÓN SHALOM
         El motor de rastreo, el modo de etiquetas, los intervalos y "Sincronizar
         ahora" se retiraron: eran del rastreo viejo (worker propio / API vencida).
         La integración nueva va contra la API oficial y no necesita que elijas
         motor ni intervalos — Shalom avisa por webhook cuando algo cambia.
         Se conserva lo único que sigue siendo una decisión tuya: qué ve el cliente.
- L342: 🔒 = pide la «Clave para cambiar estado» (la de arriba). Apagar la
           puerta o el seguimiento por un toque sin querer deja de rastrear todo
           sin que nadie lo note. La clave NO se escribe en el código: esta
           página es pública. Ver _pinShalom.
- L347: EL INTERRUPTOR MAESTRO. Va primero porque manda sobre todo lo demás:
           apagado, ni el botón ⟳ consulta. Debajo del nombre va el ESTADO REAL,
           que no siempre coincide con el interruptor: la puerta puede estar
           pausada sola tras varios fallos de Shalom aunque tú la tengas
           encendida. Decir solo "encendido/apagado" escondería justo eso.
- L360: EL BARRIDO PROGRAMADO. Corre en el servidor, así que funciona con el
           panel cerrado — que es justo cuando hace falta.
- L379: El «Modo simulacro» se retiró el 26/10/2026: el informe ya cuadraba y
           el seguimiento escribe siempre. Ver _correrBarrido en functions/index.js.
- L387: ★ SHALOM PRO — UNA LÍNEA, Y UN BOTÓN SOLO SI HACE FALTA.
           Aquí había TRES botones: «Verificar sesión», «Guardar credenciales»
           y «Conectar». De raíz, sobraban dos:
  
             · «Verificar» era un trozo de «Conectar» — Conectar ya termina
               comprobando. Y el estado es GRATIS (su doc: `GET /instances` y
               `POST /instances/status` no consumen cuota), así que pedirlo
               con un botón era cobrarle al dueño un clic por algo que no
               cuesta nada: ahora se comprueba solo al abrir Config.
             · «Guardar» NUNCA era útil sola: guardas y luego hay que
               conectar igual. Era un paso partido en dos, y el estado
               intermedio —«guardé pero no conecté»— no sirve para nada. El
               dueño se quedó atascado justo ahí el 11/10/2026.
  
           Lo que queda: una línea de estado y, solo si no hay sesión, dos
           campos y UN botón que hace lo que haga falta. Las explicaciones se
           fueron a 📖 Ayuda. Todo lo pinta `_pintarShalomConfig()`.
- L409: AGENCIA DE ORIGEN — una línea; el buscador sale al pulsar «cambiar»
- L422: MODAL NUEVO/EDITAR
- L441: frow-par: las dos etiquetas con la MISMA altura. El ✓ del DNI es más
           grande que el texto y empujaba su casilla hacia abajo.
- L464: ★ SHALOM: bloque guía
- L469: Chip de estado (solo lectura): refleja s.trackingStatus ya guardado.
                 Sin onclick, sin consulta — puro reflejo visual. Lo pinta config.js.
- L481: ★ UN SOLO DESPLEGABLE PARA TODO LO DEL ENVÍO.
             Antes esto eran tres bloques abiertos a la vez —clave, medidas y
             registro— con sus explicaciones permanentes: unas quince líneas en
             pantalla para decir, casi siempre, «todo bien».
  
             El principio: una CONFIRMACIÓN se encoge a una marca; un PROBLEMA
             conserva sus palabras. Cerrado, la cabecera resume en una línea y
             la clave sigue a la vista —la necesitas para dictársela al
             cliente—. Si falta algo estando en POR ALISTAR, la cabecera se
             pone ámbar: sabes que hay que abrirlo sin tener que abrirlo.
  
             Las explicaciones se fueron a 📖 Ayuda ('registroShalom').
- L499: La ayuda, adentro y como en «Documentos del envío» (10/11/2026).
- L501: ★ CLAVE DE RECOJO: los 4 dígitos que el destinatario necesita
                 para retirar el paquete. Se genera sola al abrir un pedido
                 nuevo de Shalom (del generador criptográfico, no de
                 Math.random: es lo único que separa el paquete de quien no
                 debe llevárselo). Un pedido YA REGISTRADO no la regenera: la
                 que se le dio a Shalom es la que el cliente va a usar.
- L519: ★ LA CAJA, COMO EN SHALOM PRO (10/11/2026). Un toque elige la caja
                 y no hace falta medir ni pesar; 📏 abre las medidas para
                 calcularla. La elegida viaja en `pkgCaja` (no en `pkgTipo`, que
                 es la calculada).
- L550: ★ DELIVERY: bloque motorizado (mismo patrón que Guía Shalom)
- L567: SLOT BOLETA / FACTURA (documento del cliente)
- L588: SLOT EMBALADO
- L609: SLOT GUÍA / TICKET (documento de la agencia)
- L639: fin docs-accordion-body
- L640: fin docs-accordion
- L646: LABEL EDIT SHEET
- L656: ALL LABELS SHEET
- L667: STATUS SHEET
- L678: SUPPLIER OVERLAY
- L688: COTIZACIÓN COMPACTA (PDF / imagen)
- L691: EXCEL DE STOCK DEL PROVEEDOR
- L694: DE COTIZACIONES (vista derivada — ítems asignados a esta fuente)
- L697: LISTA HEADER
- L715: SUPPLIER NEW OVERLAY
- L735: SUPPLIER MANAGE OVERLAY
- L749: SUPPLIER EDIT OVERLAY
- L763: PRIVATE NOTE OVERLAY
- L779: CHIP SORT OVERLAY
- L802: CAMBIO DE ETIQUETA POR QR — acordeón (solo hasta ALISTADO). Se muestra/oculta en openChipSort
- L824: CONFIRMAR REVERTIR (mismo patrón que borrar)
- L837: BULK STATUS SHEET
- L848: ADVANCED SEARCH
- L857: FECHA
- L859: Qué fecha mira el rango. Por defecto la de ENVÍO: sin tocar esto, la
           búsqueda filtra igual que siempre. «Hoy» cambia a registro y rellena
           Desde/Hasta con hoy, a la vista. Regla: functions/fechaPedido.js.
- L872: COURIER
- L876: COSTO
- L883: CON DOCUMENTOS
- L892: ORDENAR
- L906: PIN OVERLAY
- L935: EXCEL OVERLAY
- L941: EXPORT
- L948: IMPORT
- L957: FORMAT INFO
- L965: ═══ MÓDULO RESPALDO (respaldo.js) ═══
- L981: ⚡ Fase 2: sincronización por cambios (functions/sincro.js).
- L992: Documentos que no llegaron a la nube (fotos.js · documentosPerdidos).
- L1004: TRASH OVERLAY
- L1018: DELETE
- L1031: WA SHEET
- L1043: IMAGE VIEWER
- L1055: QR SCANNER
- L1081: ★ SHALOM tracking — cargado al final
- L1084: seleccion.js ya se cargó en la cabecera, ANTES del script en línea que
       lo usa. config.js, print.js y voz.js preguntan por los pedidos marcados,
       así que siguen yendo detrás. El orden de carga es un contrato
       (ver docs/ARQUITECTURA.md).

## loading-screen.js

- L1: loading-screen.js — Pantalla de carga animada para seguimiento del cliente
  Se activa automáticamente cuando ?seg= está en la URL.
  5 temas aleatorios: sierra, demoledor, taladro, amoladora, martillo
- L10: ── Estado ───────────────────────────────────────────────────────
- L22: ── CSS global ───────────────────────────────────────────────────
- L48: ── TEMA 1: SIERRA CIRCULAR ──────────────────────────────────────
- L53: Madera
- L59: Corte (progreso)
- L61: Carcasa
- L63: Disco giratorio
- L74: Mango
- L77: Aserrín
- L90: ── TEMA 2: DEMOLEDOR NEUMÁTICO ──────────────────────────────────
- L95: Piso concreto
- L99: Grietas
- L107: Polvo impacto
- L114: Cuerpo del demoledor
- L119: Broca
- L122: Manijas
- L125: Vibración
- L138: ── TEMA 3: TALADRO ──────────────────────────────────────────────
- L143: Superficie
- L147: Agujero
- L150: Virutas
- L155: Taladro
- L157: Chuck
- L162: Broca girando
- L168: Motor
- L185: ── TEMA 4: AMOLADORA ANGULAR ────────────────────────────────────
- L200: Barra metálica
- L203: Corte
- L205: Chispas
- L207: Amoladora
- L210: Guarda
- L212: Disco girando
- L218: Manija lateral
- L220: Mango trasero
- L222: Cable
- L224: Franja marca
- L236: ── TEMA 5: MARTILLO DE DEMOLICIÓN ──────────────────────────────
- L241: Pared ladrillo
- L251: Grietas
- L259: Escombros
- L267: Martillo (balanceo)
- L269: Mango
- L271: Cabeza
- L286: ── Animación de progreso ────────────────────────────────────────
- L295: Mensaje según etapa
- L300: Actualizar visual del tema (grietas, corte, etc.)
- L314: ── Montar overlay ───────────────────────────────────────────────
- L347: ── API pública ──────────────────────────────────────────────────
- L354: Montar inmediatamente (body ya existe porque el script va antes del </body>)

## medir-registro.js

- L1: /usr/bin/env node
- L2: medir-registro.js — medir qué responde Shalom al registrar un envío
  =====================================================================
  Se corre DESDE TU PC:   node medir-registro.js
  
  ⚠️ POR QUÉ ESTE ARCHIVO EXISTE Y POR QUÉ TIENE TANTAS REJAS
  `POST /account/register` CREA UN ENVÍO DE VERDAD Y SE PAGA. La API de
  Shalom **no tiene endpoint para cancelarlo ni anularlo** (comprobado en
  docs/SHALOM-API.md): una vez creado, está creado. Y no tiene clave de
  idempotencia, así que llamarlo dos veces son dos envíos y dos cobros.
  
  Por eso, por defecto este script SOLO HACE LO QUE NO CUESTA:
  
    1 · POST /account/get-user          → tu perfil. No crea nada.
    2 · POST /account/pending-shipments → tus envíos pendientes. No crea nada,
        Y ADEMÁS enseña la forma de un envío YA registrado, que es la mitad
        del contrato que buscamos.
    3 · POST /account/register CON EL CUERPO VACÍO → la forma del ERROR.
        Sin `instanceId` la API no puede crear nada aunque quisiera, así que
        esto mide gratis la otra mitad.
  
  Para registrar DE VERDAD hace falta, las dos cosas:
    node medir-registro.js --registrar
    …y escribir REGISTRAR cuando lo pida.
  
  LA CLAVE NUNCA SE IMPRIME: se lee de Secret Manager y se usa en memoria.
  Y de las respuestas se imprime LA FORMA (tipos, sin valores) con la misma
  función que usa la puerta única, así que se puede pegar en el chat sin que
  salga un dato de nadie. Con --crudo se ve todo, para mirarlo tú solo.
- L41: ── LO QUE SE VA A REGISTRAR (solo se usa con --registrar) ──────────────
     Rellena esto ANTES de correr con --registrar. Son datos de un envío real:
     revísalos dos veces, porque no se puede deshacer.
- L45: ter_id de TU agencia (Config → agencia de origen)
- L46: ter_id de la agencia de destino
- L47: DNI del destinatario, 8 dígitos
- L48: nombres        (de RENIEC)
- L49: apellido paterno
- L50: apellido materno
- L51: 9 dígitos
- L52: el catálogo de cajas de Shalom
- L53: clave de recojo, 4 dígitos
- L56: La clave, por dos caminos y en este orden.
  
  1 · La variable de entorno SHALOM_API_KEY, si está puesta. Es el camino
      fiable: PowerShell ya sabe leerla de Secret Manager, y así este script
      no depende de que el CLI de Firebase se porte bien desde dentro de un
      proceso hijo.
  2 · Llamar al CLI de Firebase. Cómodo cuando funciona.
  
  ⚠️ Y SI FALLA, SE DICE POR QUÉ. La primera versión de esto se tragaba la
  salida de error del CLI (`stdio` con stderr en 'ignore') y solo imprimía
  "no se pudo": el mismo fallo en silencio que llevamos semanas cazando, otra
  vez escrito por mí. Ahora se enseña el error tal cual lo dio la orden.
- L81: El CLI a veces imprime avisos antes del valor: se toma la última línea
- L82: con contenido, que es el secreto.
- L114: no era json
- L145: ── 0 · la instancia. No cuesta nada y hace falta para todo lo demás.
- L161: ── 1 · el perfil. De aquí salen remitente y remitente_id.
- L165: ── 2 · los pendientes. Enseña la forma de un envío YA registrado.
- L169: ── 3 · la forma del ERROR, gratis. Sin instanceId no puede crear nada.
- L184: ── 4 · el registro DE VERDAD ────────────────────────────────────────
- L211: Pase lo que pase, se mira si quedó creado: si la red se cayó a mitad, la
- L212: respuesta se pierde pero el envío puede existir igual. Reintentar a
- L213: ciegas es como se paga dos veces.

## narrador/etiqueta.js

- L1: ═══════════════════════════════════════════════════════════════════
     ETIQUETA EN VIVO — el cliente "construye" su etiqueta de envío mientras
     llena el formulario (la misma que irá pegada a su paquete).
     Capa de presentación OPCIONAL y DESACOPLADA (mismo patrón que la boleta
     anterior y los personajes): observa el DOM del formulario, no toca la
     lógica de guardado.
     · 0 llamadas a la nube · 0 cambios a formApi · solo lectura del DOM
     · Solo en el formulario (si hay ?seg=, no aplica)
     · Fuentes del sistema (sin CDN) — funciona en cualquier internet
     · QR cacheado local (narrador/qr-negocio.svg) — NO se genera por número
     · Actualización INCREMENTAL: la estructura se arma una sola vez y luego
       solo se edita el TEXTO de cada campo en su sitio (sin parpadear). No
       reescribe el HTML en cada tecla → no dispara bucles ni molesta a otros
       módulos (el narrador) que también observan #app.
     · No se escribe SOBRE la etiqueta, pero tocarla es un ATAJO: baja al primer
       campo vacío del formulario y le abre el teclado (antes no hacía nada y el
       cliente creía que la app estaba rota).
     ═══════════════════════════════════════════════════════════════════
- L29: ── Estilos (etiqueta de envío: papel blanco, bordes negros) ────────
- L32: ★ LA ESCALA DE LA ETIQUETA, EN UN SOLO SITIO.
        El dueño la quiso más pequeña: ocupaba media pantalla de móvil antes
        del primer campo. No se tocó ni una medida a mano —eso habría sido
        reescribir la tabla de tamaños y perder las proporciones— sino que
        cada `font-size` pasó a ser `calc(Npx * var(--tt-s))`. Cambiar este
        número cambia la etiqueta entera sin que nada se descuadre.
        Las medidas ORIGINALES siguen escritas: se lee lo que era y lo que es.
        ⚠️ Esto es la VISTA PREVIA del formulario, no el rótulo que se imprime.
        El que se pega al paquete lo hace print.js y no pasa por aquí.
- L43: PARA (cliente) + QR
- L54: DESTINO
- L58: Envío (courier · fecha)
- L62: REMITENTE (al pie)
- L66: Nota de revisión (sutil, fuera de la tarjeta)
- L68: La tarjeta es un ATAJO al formulario: tocarla lleva al campo que falta.
- L70: Resalte de "mira aquí" para el grupo de elección al tocar la etiqueta.
- L71: Con box-shadow (no borde ni outline) para que no desplace nada.
- L78: ── Datos del negocio (REMITENTE) — expuestos por el formulario ─────
- L84: ── Lectura de los campos del cliente (mismos getters que la boleta) ─
- L86: Sin prefijo: en la etiqueta se muestra el numero tal cual. Lo que se guarda
- L87: en el pedido y lo que va al WhatsApp no pasa por aqui, no cambian.
- L98: DESTINO: reúso EXACTO de la lógica de la boleta (sin fuga de dirección)
- L105: retiro en tienda: sin destino
- L114: ── Construcción (una sola vez) ─────────────────────────────────────
- L118: tarjeta nueva → REMITENTE se repinta (p. ej. al cargar CFG)
- L163: REMITENTE se pinta una sola vez (dato del negocio, no cambia)
- L168: ── Atajo: tocar la etiqueta lleva al campo que falta ───────────────
       El cliente ve SU NOMBRE en grande arriba del todo y lo toca esperando
       escribir ahí. Antes no pasaba nada y parecía que la app estaba rota.
       Ahora ese toque hace justo lo que quería: bajar al primer campo vacío
       y abrirle el teclado.
  
       ACCESIBILIDAD: esto es un ATAJO, no la única vía — los campos siguen
       alcanzándose con el tabulador. Por eso la tarjeta NO se marca como
       role="button" (haría que un lector de pantalla anunciara la etiqueta
       entera como un botón) ni se mete en el orden de tabulación.
  
       Sigue sin tocar la lógica de guardado: solo lee el DOM y enfoca.
- L186: de otro paso: no visible
- L188: el primero VACÍO
- L190: todo lleno
- L193: Un paso puede no tener NINGÚN campo: el de "¿cómo quieres recibir tu
- L194: pedido?" son botones y su <select> real está oculto, así que campoQueFalta
- L195: no encontraba nada y el toque se quedaba mudo justo ahí. Un grupo de
- L196: elección sin responder también es "lo que falta".
- L207: No robarle el toque a nada que ya sea interactivo dentro de la tarjeta.
- L214: Grupo de elección: se SEÑALA, no se elige. Elegir un courier avanza solo
- L215: de paso, así que hacerlo desde aquí sacaría al cliente de la pantalla por
- L216: un toque que quizá solo era para leer la etiqueta. La decisión sigue
- L217: siendo suya, con un toque directo en la tarjeta que quiera.
- L223: El teclado solo se abre si el campo está VACÍO. Si ya estaba lleno, el
- L224: cliente solo quería ver dónde se edita — no le tapamos la pantalla.
- L234: aún sin CFG: reintenta luego
- L241: ── Actualización: solo cambia texto, sin reescribir estructura ─────
- L266: Pie: "revisa que estén correctos" solo tiene sentido cuando YA hay algo
- L267: que revisar. Con la etiqueta aún en blanco era una orden imposible de
- L268: cumplir —y señalaba a la tarjeta, que no se edita—, así que el cliente
- L269: la tocaba y creía que la app estaba rota. Se decide con los MISMOS
- L270: valores que se acaban de pintar: una sola verdad, sin volver a leer el
- L271: DOM y sin poder desincronizarse de lo que se ve.
- L276: ★ LA ETIQUETA NO SE VE HASTA QUE TIENE ALGO TUYO DENTRO.
         Al entrar, el cliente veía una tarjeta EN BLANCO ocupando el primer
         tercio del móvil, antes de poder hacer nada. Una etiqueta vacía no
         enseña nada: es el sitio donde va a estar lo que todavía no existe.
  
         ⚠️ LA REGLA MIRA EL CONTENIDO, NO EL PASO. Lo fácil habría sido
         «ocúltala en el paso 1», y habría quedado mal el día que los pasos se
         muevan —que es hoy mismo: el courier acaba de pasar a ser el primero—.
         Así la regla sigue siendo cierta sola, sin saber nada del asistente.
  
         Y el REMITENTE no cuenta. Es el único dato que está desde el segundo
         cero, porque es del negocio y no del cliente: contarlo haría que la
         etiqueta se viera siempre, que es justo lo que se vino a quitar.
  
         Se decide con los mismos valores que se acaban de pintar, como el pie
         de aquí arriba: una sola verdad, recalculada, sin poder
         desincronizarse de lo que se ve.
- L296: ── Montaje en el formulario (después de la cabecera) ───────────────
- L310: ── Observadores: reacciona a lo que el cliente llena ──────────────
- L314: chips fecha / opciones
- L323: en seguimiento/éxito no aplica
- L325: nunca romper el formulario
- L328: El observador IGNORA las mutaciones de la propia etiqueta (evita bucle
- L329: de auto-disparo y no perturba a otros módulos que observan #app).

## narrador/loader.js

- L1: ═══════════════════════════════════════════════════════════════════
     LOADER DEL FORMULARIO — "INICIANDO FÁBRICA…" con logo de Heavy.
     Misma optimización que loading-screen.js: CSS/JS liviano, sin GSAP,
     se auto-oculta cuando el formulario está listo (o por tope de tiempo).
     · Solo para el formulario (si hay ?seg=, el tracking usa su loader)
     · Imagen con fallback de texto; en conexión lenta muestra breve
     · Debe cargarse ANTES del render del formulario (evita el parpadeo)
     ═══════════════════════════════════════════════════════════════════
- L11: tracking = su propio loader
- L17: mínimo visible (evita parpadeo si la carga es instantánea/cacheada)
- L18: tope de SEGURIDAD (solo si la red muere). En lento MÁS largo, no menos.
- L28: Rayas que van HACIA ATRÁS: la espera se siente más corta (Harrison
        et al., CHI 2010) y la barra nunca parece congelada.
- L37: Elegir una de las 4 mascotas al azar en cada carga
- L42: Prioridad alta y medidas fijas: aparece en cuanto se abre, sin saltos.
- L48: Fallback de texto si la imagen no carga (conexión lenta / falla)
- L52: ★ LA BARRA NUNCA SE QUEDA QUIETA (30/10/2026). Antes se acercaba al
       88 % y se paraba esperando al servidor: parecía que algo había fallado.
       Ahora:
         · avanza SIEMPRE (un mínimo por cuadro, cada vez más fino, sin llegar
           al 100 % hasta que la página esté lista);
         · al estar lista, CORRE al 100 % y se va: un final rápido es lo que
           se recuerda (Harrison et al., 2007);
         · el mensaje cambia con el tiempo y dice la verdad, también cuando
           la conexión va lenta.
- L64: final rápido
- L65: nunca se detiene
- L79: Señal REAL de "listo": el formulario/tracking terminó de renderizar (config
- L80: incluida). Respeta un MIN para no parpadear. Reemplaza el ocultar por timer
- L81: corto + el observer de #f_name, que dejaban ver el spinner básico y el flash
- L82: del segundo render (el "carga, retrocede, carga").
- L88: tope de seguridad: nunca quedarse cargando

## narrador/narrador.js

- L1: ═══════════════════════════════════════════════════════════════════
     NARRADOR — Heavy (formulario) + Delfi (seguimiento)
     Capa de presentación OPCIONAL. No toca la lógica del formulario:
     solo observa el DOM (#app) y muestra a los personajes con globos.
     · 0 llamadas nuevas a la nube (lee datos ya presentes en el DOM)
     · Carga diferida, imágenes lazy, animaciones CSS (sin GSAP)
     · Se auto-desactiva en conexión lenta / ahorro de datos
     · Si algo falla, el formulario sigue funcionando igual
     ═══════════════════════════════════════════════════════════════════
- L13: ── 0. Solo corre en la página del formulario/seguimiento ──────────
- L17: ── 1. Conexión lenta / ahorro de datos → no activar ───────────────
- L24: carpeta donde vive este script (para las imágenes)
- L30: ── 2. Diálogos ────────────────────────────────────────────────────
- L46: El narrador CONFIRMA, no repite: al elegir la sede la dirección ya está
- L47: en pantalla tres veces (etiqueta viva, buscador e insignia de agencia).
- L48: Volcarla aquí no aportaba nada y el globo tapaba el botón Continuar.
- L49: Texto fijo, igual que `delivery` — mismo criterio para los dos.
- L64: ENVIADO según el tipo de envío. Antes decía a todos «sigo el recorrido
         en tiempo real», y eso solo es verdad en Shalom: un delivery o una
         otra agencia no tienen rastreo en vivo.
- L69: Ya en Shalom (11/11/2026). Sin estos, Delfi se callaba: la etiqueta
         del panel ya no se muestra cuando el envío está en Shalom.
- L75: Retiro en tienda: ALISTADO ya significa «pasa a recoger». La dirección
         es la de Config (campo «Ciudad»), publicada en data-tienda-dir.
- L86: ── 3. Estilos (inyectados una vez) ────────────────────────────────
- L88: Sin reserva de espacio abajo. Antes se empujaba el contenido 120 px para que
- L89: el narrador no tapara los botones, pero eso dejaba un hueco muerto que se
- L90: podía seguir deslizando después del personaje. El globo es fijo y se colapsa
- L91: solo, así que no hace falta empujar nada: el contenido termina donde termina.
- L109: ── 4. UI ──────────────────────────────────────────────────────────
- L119: fallback: solo texto
- L133: Auto-colapso a avatar de esquina tras unos segundos (no bloquea el botón)
- L139: ── 5. Lectura del DOM (sin tocar la lógica) ───────────────────────
- L143: Lee el valor de una fila del tracking por su etiqueta
- L152: Tipo de envío deducido del DOM visible (funciona en form Y en tracking)
- L154: Seguimiento: la página publica el tipo con la MISMA regla que el
- L155: formulario (data-tipo). Deducirlo de las filas fallaba: un pedido
- L156: Shalom con fila «DNI destinatario» pasaba por «otra agencia».
- L159: Formulario
- L162: Tracking (filas del resultado)
- L169: Una agencia es un NOMBRE, no una dirección. No caemos a la fila
- L170: "Dirección" (dirección completa de destino) porque se colaba entera en el
- L171: mensaje de Delfi ("llegó a la agencia <dirección de 8 líneas>"). Si no hay
- L172: nombre de agencia real, se devuelve '' y s3_agencia queda corto y limpio.
- L175: Courier del FORMULARIO: el select #f_courier está vacío hasta que el cliente
- L176: elige. Los campos existen ocultos, así que el tipo se deduce por sección
- L177: VISIBLE. Antes de elegir devuelve '' para no tapar la bienvenida.
- L181: aún no elige → la bienvenida se queda
- L182: El formulario publica el tipo autoritativo (robusto aunque el paso esté
- L183: oculto en el asistente). Si no está, se deduce por lo visible.
- L191: Etapa de tracking a partir del texto de estado
- L193: status-badge muestra el estado; lo mapeo a las 5 etapas reales
- L195: Ya en Shalom: no hay etiqueta del panel; manda la etapa de Shalom.
- L211: Seguimiento Shalom: renderTrackResult publica la etapa real de Shalom en
- L212: data-shalom-st SOLO cuando va más adelantada que la etiqueta interna
- L213: (modo observación). Delfi la lee y narra el estado real, reusando la fase
- L214: ya calculada (sin duplicar lógica). Al coincidir/activar etiqueta, el
- L215: atributo no se emite y Delfi vuelve a leer el badge.
- L224: ── 6. Lógica del FORMULARIO (Heavy) ───────────────────────────────
- L231: solo si el form está visible
- L249: Courier / agencia / fecha detectados por observación del DOM
- L255: `ag` se sigue usando para DISPARAR (solo cuando ya se eligió la sede) y
- L256: como clave ANTI-REPETICIÓN. Lo único que cambia es que ya no se imprime.
- L264: ── 7. Detección de pantallas ──────────────────────────────────────
- L265: Tracking tiene .track-card/.status-badge; la pantalla de éxito tiene
- L266: el contenedor .success (marcador robusto, independiente del texto).
- L271: ── 8. Lógica del SEGUIMIENTO (Delfi) ──────────────────────────────
- L277: Qué dice Delfi: etapa × tipo de envío. Pura (sin DOM) y expuesta para
       las pruebas. ⚠️ Nunca menciona la clave de recojo.
- L315: ── 9. Observador central: reacciona a cada cambio de pantalla ─────
- L321: Tracking PRIMERO: si el pedido ya está en seguimiento, manda Delfi.
- L325: nunca romper el formulario
- L329: primer escaneo tras cargar

## narrador/toby.js

- L1: ═══════════════════════════════════════════════════════════════════
     TOBY — el guía de las ayudas (formulario, seguimiento y panel).
     UNA pieza para las tres: el mismo globo, el mismo estilo, sin copias.
     · La imagen (narrador/toby.webp, ~9 KB) se pide SOLO cuando se abre una
       ayuda: quien no la abre no descarga nada.
     · Sin imagen (falla de red), queda el globo de texto.
     · Cero lecturas y escrituras: Toby dice lo que ya está en pantalla.
     Uso:  Toby.globo('Texto con <b>HTML ya escapado</b>', 'Guía de pedidos')
           → devuelve el HTML del globo (y pone su CSS una sola vez).
     ═══════════════════════════════════════════════════════════════════
- L29: `texto` llega YA escapado por quien llama (puede traer <b>).

## panel.css

- L3: overflow-x:clip recorta el desborde horizontal SIN crear contenedor de scroll
     (a diferencia de hidden), por eso el encabezado de courier position:sticky sí
     funciona. No mezclar con overflow-y:auto (clip se convertiría en hidden).
- L9: HEADER
- L17: TABS
- L18: ★ Las pestañas se quedan fijas, pegadas JUSTO debajo de la barra (.hdr),
     que ya era fija. z-index 49: por debajo de la barra (50) para que sus
     menús desplegables pasen por encima, y muy por encima de los encabezados
     de courier (5).
- L26: PAGES
- L30: STATS
- L37: TOOLBAR
- L46: Indicador de "cambiar etiqueta por QR" activo — mismo tamaño que la fila (36×36)
- L53: CHIPS
- L54: scroll-snap-type: PROXIMITY, no mandatory. Con `mandatory`, una etiqueta
     más ancha que la pantalla —"RECLAMOS, DEVOLUCIONES, GARANT" en un
     teléfono lo es— puede ATRAPAR el desplazamiento y dejarte sin poder
     pasar de ahí. `proximity` alinea cuando estás cerca y nunca traba; las
     flechas apuntan exacto igual (ver _fixChipsScroll en floatpanel.js).
- L65: COURIER GROUP
- L67: Encabezado PEGAJOSO: se queda arriba mientras recorres el grupo y lo reemplaza
     el del siguiente courier al llegar. (overflow:hidden se quitó de .cgroup porque
     rompe position:sticky; las cards son transparentes, solo redondeamos el header.)
     top:var(--hdr-h): se fija JUSTO debajo de la barra superior de la app (.hdr, que
     también es sticky top:0 con z-index mayor); si no se fijara ahí quedaría oculto
     detrás de ella. --hdr-h la calcula el JS con la altura real de .hdr (fallback 60px).
     Desde el 26/10/2026 también hay que dejar sitio a las pestañas, que se quedan
     fijas: por eso suma --tabs-h, medida igual.
- L84: CARD
- L96: SUPPLIERS
- L131: DOC THUMBS
- L146: Compartir: selección de tokens usados + agrupado por día
- L155: MSG BUTTONS A/B
- L165: CARD ACTIONS
- L176: OVERLAY / SHEET
- L184: FORM
- L195: DOC SLOTS IN FORM
- L238: STATUS SHEET
- L247: CONFIRM
- L252: WA SHEET
- L266: VIEWER
- L276: QR SCANNER
- L287: SHARE / CONFIG
- L295: LINKS PERSONALIZADOS
- L338: COMPACT CONFIG LIST
- L356: DISPATCH
- L366: LABEL EDIT SHEET
- L396: FIXED statuses (can't delete)
- L411: TAG CHIPS IN CONFIG
- L420: DRAG ROWS for labels
- L427: COLLAPSIBLE MSG
- L443: TOAST
- L446: ADVANCED SEARCH
- L455: PIN
- L476: FB DOT ANIMATION
- L481: Fila de dos campos cuyas etiquetas llevan marcas de distinto tamaño
     (el ✓ del DNI): misma altura de etiqueta → casillas alineadas.
- L485: 🖨️ de la tarjeta: sin color hasta imprimir; después, SOLO el borde azul —el
     mismo anillo que el botón de seleccionar (.tb-btn.sel-on)—.
- L490: ★ CAJAS DE SHALOM (10/11/2026): elegir el tamaño de un toque, como en
     Shalom Pro. 📏 abre las medidas.

## panel/compartir/excel.js

- L1: panel/compartir/excel.js — exportar e importar Excel / CSV
  ================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: EXCEL EXPORT / IMPORT
- L67: ★ EL DNI VA EN `dni`, QUE ES SU CAMPO.
               Esto escribía SOLO `dniDestinatario`, y el exportador lee `dni`:
               exportar e importar perdía el documento. El pedido volvía sin
               DNI, la etiqueta salía sin DNI, y registrarlo en Shalom —que
               mira `dni`— contestaba «el DNI debe tener 8 dígitos» con el
               número delante, en la pantalla. `dniDestinatario` se mantiene
               por si algún Excel viejo se vuelve a importar.
- L106: EXPORT CSV

## panel/compartir/links-tokens.js

- L1: panel/compartir/links-tokens.js — links de pedido, «este link» y tokens de un solo uso
  ============================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L13: El seguimiento vive en su propia página desde la Fase 2 (10/11/2026). Los
     links viejos (formulario.html?seg=) siguen abriendo: se redirigen.
- L23: ★ «ESTE LINK»: QUÉ DÍAS Y QUÉ COURIERS OFRECE, ELEGIDO EN COMPARTIR.
     Cada link ya congelaba su configuración al generarse (la «foto» de abajo),
     pero la sacaba de la configuración GLOBAL. Para hacer un link solo con
     Shalom había que cambiar Config, guardar, generar y volver a dejarlo — y
     si en otra PC alguien generaba en ese momento, se llevaba el cambio a
     medias. Ahí se cruzaban.
  
     Ahora la selección vive en ESTE navegador (localStorage) y nunca en la
     nube: no hay ningún documento que dos PCs escriban a la vez, así que no
     hay nada que se pueda pisar. Config sigue siendo la configuración por
     defecto —la que usa el formulario abierto sin link— y desde aquí no se
     toca nunca. Es el principio de una factura: el precio se fija al emitirla,
     y cambiar el catálogo después no la toca.
- L39: La selección EFECTIVA, siempre cuadrada contra los couriers de HOY.
     · Un courier nuevo en Config entra con el valor de Config.
     · Uno borrado en Config desaparece: no queda un fantasma que el
       formulario intente ofrecer.
- L81: Lo que impide generar un link inservible. Se comprueba ANTES del spinner,
     como el nombre del cliente: un link sin días o sin couriers abre un
     formulario en el que el cliente no puede elegir nada.
- L96: `onclick` lleva el nombre del courier, que escribe el dueño en Config.
         Doble escape, en este orden: `escJs` para la cadena de JavaScript y
         `escH` para el atributo HTML. Con uno solo, un courier llamado
         «D'Rosa» o con comillas rompería el botón.
- L123: ★ LOS COURIERS, EN DOS FILAS Y TODOS A LA VISTA.
       Primero fue una tira que se deslizaba: con 7 couriers, «DINSIDES»,
       «MARVISUR» y «OLVA» quedaban fuera, y un courier que no se ve es uno que
       se olvida apagar. El dueño lo pidió en dos filas.
       Las columnas se calculan con cuántos hay —ceil(n/2)—, así que son DOS
       filas siempre: 7 couriers dan 4+3, 9 darían 5+4. Y el nombre baja de
       línea DENTRO de su botón: «RETIRO EN TIENDA» ocupa dos líneas en su
       casilla en vez de estirar la fila y empujar a los demás fuera.
- L146: La foto sale de lo marcado en «Este link», no de la configuración
       global: ver `_linkSel`. Hora de corte y anticipación sí siguen saliendo
       de Config — no se piden aquí para no meter una tercera fila.
- L163: Sin la función de guardar, NO se devuelve el id. Antes se devolvía
       igual: el link salía apuntando a una foto que nunca se escribió, el
       formulario recibía «no encontrada» y caía a la configuración global —
       justo lo que «Este link» viene a evitar.
- L171: ── LINKS RÁPIDOS: ahora generan un TOKEN de un solo uso ──────────────
     Cada copia/apertura/compartir crea un token anónimo (sin prefill). Al
     llevar ?t= el formulario va directo a crear pedido (no se desvía al
     seguimiento del último pedido de este dispositivo). Tras registrarse, la
     Cloud Function lo marca usado → reabrir muestra "Link ya utilizado".
- L176: Guardia + spinner para generar links: evita doble-clic → tokens duplicados y
- L177: da feedback (círculo que gira, igual que el botón "Consultar" de Shalom).
- L178: Reutilizable y a prueba de fallos (restaura el botón siempre en finally).
- L181: ya se está generando → ignora clics extra
- L189: Abrir la ventana YA (en el gesto) para que móvil no bloquee el popup tras el await.
- L192: Esperar Firebase (normalmente ya está → no bloquea)
- L198: etiqueta en la lista (NO prefilla el formulario)
- L206: vence en 7 días (autolimpieza)
- L209: Igual que el link personalizado: foto primero, y su id dentro del token.
- L223: open
- L226: aparece en "Links generados"
- L239: ── TOKENS: SISTEMA COMPLETO ───────────────────────────────────────
- L240: cache local de tokens
- L241: selección local de tokens usados (id → true), para imprimir
- L243: ¿el token es de HOY? (por fecha de creación, igual que el "hace Xh")
- L261: Tocar el checkbox de un token usado
- L268: Seleccionar todo = solo los de HOY que ya fueron USADOS (toggle)
- L280: Imprimir los seleccionados → etiqueta real del envío vinculado (orderId)
- L296: N° de factura/boleta: la regla vive en functions/nroComprobante.js
     (la misma que aplica el servidor). Estas dos líneas solo la protegen de
     que ese archivo no haya cargado: sin él, no hay número, y todo sigue
     como antes.
- L302: Otro pedido (no este) con el mismo número, o null.
- L314: ★ UN SOLO DATO BASTA (30/10/2026). Antes había que poner nombre o
     teléfono; ahora vale cualquiera: nombre, teléfono, monto, adelanto, link o
     N° de factura/boleta (p. ej. solo la factura). UNA regla para el botón y
     para el guardado.
- L332: Esperar Firebase
- L342: el backend los ata al pedido (el cliente no los ve)
- L347: El número de factura/boleta viaja DENTRO del token, como el monto: el
       servidor lo copia al pedido y el cliente no puede cambiarlo. Solo si
       hay: los links sin número quedan exactamente como antes.
- L352: ★ LA FOTO VA PRIMERO, Y SU ID DENTRO DEL TOKEN.
         Antes se guardaba el token y DESPUÉS la foto, y si la foto fallaba el
         link salía igual, sin ella: el formulario caía a la configuración
         global y ofrecía couriers que acababas de desmarcar para este link.
         Ahora, sin foto no hay link — y se dice.
         Y el id viaja en el token, no solo en la URL: la URL la puede editar
         el cliente, el token no.
- L368: Pequeño delay para que Firebase indexe el documento
- L377: Mensaje del FORMULARIO (solo el link de registro). Si hay documento
- L378: adjunto, va en un bloque SEPARADO y rotulado para que el cliente sepa
- L379: cuál es cuál — un solo WhatsApp.
- L387: acabo de generar un link → forzar refresco
- L391: Validación ANTES del spinner (para no bloquear el botón por un dato faltante).
- L398: ★ LINKS GENERADOS POR PARTES (26/10/2026). Al entrar se cargan solo los
     por usar y los usados desde el inicio de AYER (hora de Lima); el resto,
     a pedido. Antes cada refresco bajaba la colección entera.
       _tokRecientes  lo que traen las dos consultas pequeñas (se rehace en
                      cada refresco: un link borrado en otra PC desaparece);
       _tokAnteriores lo que se pidió con «Cargar anteriores» (se conserva:
                      son links usados, no cambian, no se vuelven a pagar);
       _tokTodo       el dueño pidió «Cargar todo»: la descarga completa de
                      antes, que incluye los muy antiguos sin `usedAt`.
- L409: {usedAt, name} del último anterior cargado
- L410: ya no quedan anteriores con fecha de uso
- L415: Inicio de AYER en Lima, en ISO universal (como `usedAt`).
- L419: sin el módulo: 48 h
- L421: Une recientes y anteriores (sin repetir; manda la copia reciente) y ordena.
- L429: Lo que el panel debe pedir en un refresco. Lista completa solo si el
      dueño pidió «Cargar todo», o si las consultas no existen o fallan.
- L466: El pie de la lista: «Cargar anteriores», y al final «Cargar todo».
- L480: ts del último fetch exitoso
- L481: evita revalidaciones solapadas
- L482: 30s: no re-consultar si se hizo hace poco
- L484: Stale-while-revalidate: si ya hay datos en memoria, se pintan al instante y
- L485: se revalida por detrás; el spinner queda solo para la primerísima carga.
- L486: force=true (🔄, generar/borrar, cambio remoto por poll) salta el cooldown.
- L491: instantáneo, sin red
- L495: primera vez
- L499: Consulta Firestore; si cambió (o es la primera carga), actualiza cache y repinta.
- L515: diff barato: repintar solo si cambió el conjunto (id/usado/vencimiento)
- L528: Pinta la lista desde _tokCache (función de estado, sin red).
- L576: Token USADO → busca el pedido real vinculado (orderId) para mostrar sus
- L577: datos (nombre/DNI/courier) y ofrecer ver el comprobante.
- L583: El del PEDIDO si ya existe (pudo corregirse en «Editar»); si no, el del link.
- L603: Documento (comprobante apisale) — solo lectura. "Ver" si ya extraído, "Extraer" si no.
- L626: Barra: seleccionar todo (hoy + usados) + imprimir etiquetas
- L631: Agrupar por día de creación. _tokCache viene ordenado desc → hoy primero.
- L654: Event delegation — usa el id real del documento, nunca la posición en el array
- L697: Borrado con confirmación (modal). Solo elimina el TOKEN, nunca el pedido real.
- L700: Antes esta pantalla no reponía el texto ni el `disabled` del botón, así
       que heredaba lo que hubiera dejado la anterior. Si venías de borrar un
       pedido, salía diciendo "Moviendo…" y apagado: el link no se borraba y no
       había forma de saber por qué. Ahora ni lo toca.
- L714: Si era de los «anteriores» cargados a pedido, también sale de ahí:
- L715: el refresco solo rehace los recientes.

## panel/compartir/xlsx.js

- L1: panel/compartir/xlsx.js — carga la libreria de Excel solo cuando se usa.

## panel/config/configuracion.js

- L1: panel/config/configuracion.js — la pantalla de Config: negocio, etiquetas, couriers, campos
  ====================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L18: CONFIG
- L21: Toggle auto-tracking Shalom (por defecto encendido)
- L22: El estado de la puerta a Shalom se lee de Firestore, así que se pinta
- L23: aparte y sin bloquear: la pantalla de Config no espera por la red.
- L25: El barrido programado: sus ajustes viven en S.config, su informe en el
- L26: servidor. Lo segundo se pinta aparte y sin bloquear la pantalla.
- L36: Configuración Shalom: solo queda "Mostrar en el link del cliente". El motor
- L37: de rastreo, el modo de etiquetas y los intervalos se retiraron con el
- L38: rastreo viejo. Los campos que quedan en S.config (trackingMotor,
- L39: trackingEtiquetaModo, trackingWebInterval*) NO se borran a propósito: son
- L40: datos guardados y borrarlos no aporta nada; simplemente ya nadie los lee.
- L46: DISPATCH DAYS
- L51: HOUR SELECT
- L63: LABELS — fixed (non-deletable) + custom
- L65: Show FIXED_LABELS as fixed (no delete)
- L79: Custom only (not fixed)
- L99: COURIERS — fixed + custom, with active toggle
- L118: EXTRA FIELDS
- L130: LABEL EDIT SHEET
- L157: Save messages
- L163: Rename label if custom
- L168: Dos etiquetas con el mismo nombre compartían los mensajes y no se
           podían distinguir en los filtros.
- L171: Move messages to new name
- L175: ★ Sus pedidos se van con ella. Antes se quedaban con el nombre
           viejo y caían a «sin etiqueta» sin que nadie lo notara.
- L183: Con pedidos movidos se suben SOLO esos (y la configuración, que cambió).
- L189: COURIER / EXTRA INLINE EDIT
- L193: Reuse del overlay as quick edit
- L224: Save dispatch
- L227: Una sola puerta para pintar el encabezado: tres copias del mismo par de
- L228: líneas es como una se queda vieja sin que nadie lo note.
- L230: ★ solo config
- L239: Don't allow moving fixed labels
- L242: ★ solo config
- L246: Inline add functions
- L248: Nunca dos iguales: «NUEVA ETIQUETA», «NUEVA ETIQUETA 2»…
- L252: ★ solo config
- L253: Auto-open the last card
- L258: Scroll to it
- L265: ★ solo config
- L270: ★ solo config
- L273: Protected delete — requires hold confirmation
- L280: Tenía el mismo fallo que el borrado de link: no reponía el texto ni el
       `disabled`, así que borrar una etiqueta o un courier también quedaba
       muerto si antes habías borrado un pedido. Eran dos pantallas, no una.
- L293: Los pedidos NO se tocan: conservan su estado y aparecen en
             «🏷️ SIN ETIQUETA» hasta que los muevas. Los mensajes A/B sí se
             van con la etiqueta: si un día creas otra con el mismo nombre,
             empieza limpia.
- L305: solo config
- L314: ★ solo config, no reescribe los 180 pedidos
- L315: Update buttons in place
- L324: ★ solo config, no reescribe los 180 pedidos

## panel/config/cotizacion.js

- L1: panel/config/cotizacion.js — cotizaciones de proveedores
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: ═══════════════════════════════════════════════════════════════════════
     COTIZACIÓN — módulo aislado (Fase 1)
     ---------------------------------------------------------------------------
     Captura la boleta/cotización de un pedido: subís un PDF (o pegás el texto),
     se extrae { código · descripción · cantidad } en una lista EDITABLE y se
     guarda en el pedido (shipment.cotizItems).
  
     Aislamiento: todo vive en window.Cotizacion. Reusa los globales existentes
     (save, render, toast, $, escH) igual que config.js — sin monkey-patch. El
     panel se auto-inyecta en el DOM desde aquí (no ensucia el <body>).
  
     Fase 2 (cruce con Excel de proveedores + volcado a Proveedores) y Fase 3
     (OCR de imágenes) se enchufan después sin reescribir esto: el parser
     (parseTexto) y el modelo (cotizItems) ya quedan listos.
     ═══════════════════════════════════════════════════════════════════════
- L23: pdf.js se baja del CDN sólo la primera vez que se abre el panel.
- L28: pedido abierto en el panel
- L30: ── STOCK: API por FUENTE (tienda o proveedor) ──────────────────────────
- L31: Cada fuente guarda su catálogo bajo 'tt_stock_<id>'. La UI NUNCA toca el
- L32: almacenamiento directo: usa esta API. Así el backend es intercambiable
- L33: (localStorage hoy; IndexedDB si el volumen crece) sin tocar la UI —
- L34: "funciona con cualquier carga de trabajo".
- L36: fuente fija: mi tienda (stock propio)
- L42: Lookup O(1) por código.
- L44: Parsea el Excel (array-of-arrays) y lo guarda. Devuelve nº de productos.
- L47: Migración única del stock global viejo → stock de tienda.
- L50: Id real de la fuente "tienda" (por si se creó con otro id vía el formulario).
- L52: stock de tienda (Excel del panel 🧾)
- L53: ¿está en tienda?
- L56: Proveedores para el selector por ítem: primero los que YA tienen ese
- L57: código en su Excel (destino más probable), luego el resto. Una sola
- L58: fuente de verdad para el orden — la usa el selector de cada fila.
- L64: ¿hay alguna fuente de stock cargada (tienda o algún proveedor)?
- L69: Clasifica un ítem: 🏬 en tienda / 🏭 en proveedor(es) / ⚠️ faltante.
- L77: Helpers seguros (por si el global no existe en algún contexto)
- L82: ── PARSER (núcleo, testeable) ──────────────────────────────────────────
       Máquina de estados por líneas sobre el texto de la boleta:
         · Detecta un CÓDIGO (ej. THT1320503, o "THT1320801 - Prensa ...").
         · Acumula la DESCRIPCIÓN en las líneas siguientes.
         · Cierra el ítem al ver la línea de CANTIDAD ("2  UND  12.50  25.00").
       Tolera el código y la descripción juntos o separados. Devuelve:
         [{ codigo, desc, cant }]
- L90: código al inicio (+ resto opcional)
- L91: "2 UND ..."
- L92: línea de solo números (precios)
- L108: Línea de cantidad → cierra el ítem actual.
- L115: Nuevo código → cierra el anterior (si quedó sin cantidad) y abre uno nuevo.
- L120: Línea intermedia: parte de la descripción (ignora líneas de solo precios).
- L129: ── DETECTOR DE COLUMNAS DEL EXCEL DE STOCK ─────────────────────────────
       Recibe la hoja como array-of-arrays (SheetJS header:1). Auto-detecta:
         · CÓDIGO: la columna con más celdas tipo código (letras+dígitos).
         · DESCRIPCIÓN: encabezado 'desc/nombre/producto' o la columna de texto
           más larga.
         · PRECIO: encabezado 'precio/pvp/costo/importe' (usa la ÚLTIMA, que suele
           ser la de distribuidor) o la última columna numérica con decimales.
         · STOCK: encabezado 'stock/cantidad/disponible'.
       Tolera encabezados en cualquier fila (usa la fila anterior al primer código).
       Devuelve { catalog, meta } o null si no hay columna de código.
- L145: Columna de código = la de más coincidencias
- L150: Primera fila de datos y fila de encabezados (la anterior)
- L155: Descripción
- L160: Precio (última columna candidata)
- L166: Stock
- L191: ── CARGA PEREZOSA DE pdf.js ──────────────────────────────────────────
- L210: Extrae todo el texto de un PDF (ArrayBuffer) usando pdf.js.
- L220: Reconstruir líneas por su posición Y (pdf.js entrega items sueltos).
- L226: arriba→abajo
- L239: ── PANEL (auto-inyectado) ────────────────────────────────────────────
- L245: OJO: sin display:none inline — la clase .overlay ya lo oculta y .overlay.open
- L246: lo muestra; un estilo inline le ganaría a la clase y el panel quedaría invisible.
- L280: Cerrar sólo al tocar el fondo (no dentro del panel). El listener nativo de
- L281: fondo se engancha al cargar, y este overlay se inyecta después → lo ponemos acá.
- L286: estado de edición: [{codigo, desc, cant, enTienda}]
- L287: estado del diálogo "enviar a proveedor" (Fase 2b)
- L288: modo SOLO LECTURA (desde "Links generados"): ver, no editar/enviar
- L290: Muestra/oculta los controles que MUTAN según el modo. En lectura solo se ve.
- L307: SOLO LECTURA: código · descripción · cantidad, sin inputs ni acciones.
- L320: Resumen multi-fuente (sólo si hay alguna fuente de stock cargada)
- L340: Selector de destino: 🏬 Tienda, cada 🏭 proveedor (el que ya tiene ese
- L341: código en su Excel va primero, con ✓), o sin asignar. Un solo lugar
- L342: para elegir a dónde va el ítem — reemplaza el toggle binario de antes.
- L369: Persiste _rows en el pedido (sin cerrar el panel). Devuelve el shipment.
- L376: incremental
- L380: ── EXTRACCIÓN ON-DEMAND DESDE EL COMPROBANTE (Fase 2) ────────────────────
       Al abrir el 🧾: si el pedido tiene link apisale y aún no fue procesado,
       llama la Cloud Function (con el token del panel) una sola vez y rellena los
       productos. Si ya está procesado, no llama (muestra lo guardado).
- L390: ★ PUERTA. Antes devolvía '' cuando no había sesión y la llamada salía sin
       cabecera: la función respondía 401 y acá se veía «Error al leer el
       comprobante — subí el PDF a mano», mandando a resolver a mano algo que se
       arreglaba volviendo a entrar. Ahora rechaza con el motivo.
- L400: Estados donde SÍ se jala automáticamente al abrir (fase de preparación).
- L402: Botón manual: hay link apisale y todavía no hay ítems (aunque un intento
- L403: previo haya quedado "procesado" pero vacío → vuelve a ofrecer jalar).
- L408: Auto-jalar (una sola vez): solo si aún no fue procesado, para no re-jalar
- L409: solo en cada apertura si un PDF genuinamente no tiene productos.
- L420: Al abrir: si va a auto-jalar (estado de preparación), va directo a extraer
- L421: (muestra ⏳) sin dibujar el botón ni un instante; si no, muestra el manual.
- L427: Llama la Cloud Function y rellena los productos.
- L436: el usuario cambió de pedido
- L451: Que el aviso diga la causa: "subí el PDF a mano" es un mal consejo
- L452: cuando lo único que pasa es que hay que volver a entrar.
- L462: ── PANEL "ENVIAR A PROVEEDOR" (Fase 2b, auto-inyectado) ────────────────
- L485: cerrar el panel de cotización si estaba abierto
- L488: ¿qué proveedor tiene cada ítem? + sugerir el que cubre más.
- L489: supId → nº de ítems que tiene
- L513: preselecciona el sugerido
- L517: ── API pública ───────────────────────────────────────────────────────
- L537: Solo lectura: si aún no hay ítems y tiene link, extrae UNA vez (sin botón).
- L540: on-demand: si tiene comprobante apisale y no fue procesado
- L543: Vista SOLO LECTURA (desde "Links generados"): ver sin editar ni enviar.
- L547: aún no inyectado
- L595: Selector de destino por ítem: 'tienda' | id de proveedor | '' (sin
- L596: asignar). Exclusivos entre sí. Persiste al toque para que la ficha del
- L597: proveedor y la vista de Tienda queden siempre en sync (modelo relacional).
- L607: ── STOCK: API pública (usada por el panel 🧾 y por la UI de Proveedores) ─
- L608: Cotizacion.stock.get/set/del/find/importAOA(pid,...)
- L611: Asegura (en memoria) que exista la fuente fija "🏬 Tienda" en S.suppliers.
- L620: importarAOA (panel 🧾): carga el Excel como STOCK DE TIENDA. Testeable.
- L628: ── VISTAS DERIVADAS (modelo relacional) ──────────────────────────────
- L629: Todos los ítems de cotización (de todos los pedidos) asignados a una
- L630: fuente. fuente tienda → enTienda=true; proveedor → proveedor===id.
- L631: Se calcula al vuelo (no se copia) → siempre en sync.
- L644: Reasignar un ítem (pedido+código) a: 'tienda' | providerId | null (quitar).
- L651: incremental
- L673: clasificar (Fase B): agrupa los ítems en tienda / proveedor / faltante.
- L684: comparar (compat): faltantes según el stock de tienda.
- L693: Botón manual "📥 Jalar del comprobante" (estados no automáticos).
- L696: ── ENVIAR A PROVEEDOR (Fase 2b) ──────────────────────────────────────
- L697: Compara los faltantes con el Excel; abre el diálogo para elegir proveedor.
- L701: Faltantes = lo que NO tenés en tienda (por marca 🏬 o por el Excel de tienda).
- L704: proveedores secundarios (no la Tienda)
- L707: Hook: se llama al cambiar el estado de un pedido. Sólo actúa en EN PROCESO.
- L712: nada que conseguir → no molesta
- L713: abre el diálogo (con confirmación)
- L727: Modelo relacional: NO se copia texto al proveedor. Solo se asigna el
- L728: ítem (fuente única). La ficha del proveedor deriva su lista de acá.
- L733: incremental: solo el pedido
- L747: Guarda y abre el diálogo de envío a proveedor (botón del panel).
- L754: Para la tarjeta: ¿cuántos ítems tiene la cotización de este pedido?
- L760: ══════════════════════════════════════════════════════════════════════
       AYUDA (co-locada con el módulo — se auto-registra en window.Ayuda).
       ⚠️ IMPORTANTE: si cambiás el flujo de Cotización, actualizá TAMBIÉN este
       bloque y su fecha `actualizado`. La ayuda vive acá, junto al código, para
       que no se desactualice.
       ══════════════════════════════════════════════════════════════════════
- L797: Ayuda de PROVEEDORES — co-locada acá porque la lógica de stock (Excel por
       proveedor / tienda) vive en este módulo. ⚠️ Actualizá este bloque y su fecha
       si cambiás el flujo de proveedores/stock.

## panel/config/proveedores.js

- L1: panel/config/proveedores.js — proveedores y su stock
  =============================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: SUPPLIERS
- L35: Get just the code part (before first space)
- L48: solo los proveedores realmente tocados
- L49: Force full re-render of suppliers panel
- L56: Clear silently
- L62: 🏬 Tienda fija
- L97: Orden persistente de proveedores (campo .orden). Asigna a los que no tengan.
- L104: Administrar proveedores (agregar / editar / borrar / reordenar) — desde el icono 🏭
- L135: intercambia el orden persistente
- L136: incremental: solo los dos movidos
- L157: la Tienda no se borra
- L161: Excel de stock del proveedor (o de la tienda). Reusa la API de Cotización.
- L209: Vista DERIVADA: ítems de cotización asignados a esta fuente (tienda o proveedor).
     No se copian: se calculan desde los pedidos → siempre en sync.
- L231: Quitar la asignación de un ítem (desde la ficha de la fuente).
- L248: borra el doc en Firestore
- L249: bump ts para otros dispositivos
- L277: If searching, only verify filtered items; otherwise all
- L369: incremental: solo los movidos
- L379: Vista derivada: ítems de cotización asignados a este proveedor.
- L395: Tienda exclusiva: si marcás esta como tienda, la anterior pasa a proveedor.
- L483: ★ Subir a Firebase Storage (URL que sincroniza en todos los dispositivos).
- L484: Antes se guardaba solo base64 → slimSupplier lo volvía [img] → no se veía
- L485: en otros equipos. Fallback a base64 si Storage falla.
- L525: Update header in suppOverlay
- L547: ★ incremental
- L553: ★ incremental

## panel/config/recursos-ui.js

- L1: panel/config/recursos-ui.js — la pantalla del centro de recursos
  =========================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: ══ CENTRO DE RECURSOS ══════════════════════════════════════════════════
     Página propia con la MISMA cara que Envíos: sus clases de panel.css no
     dicen "envío" en ningún nombre, así que se reutilizan tal cual.
  
     NO CUESTA NI UNA LECTURA NI UNA ESCRITURA NUEVAS: `S.recursos` viaja en el
     documento de configuración que el panel ya lee al arrancar, y se guarda con
     `save('config')` — ESE documento, no los 1169 pedidos.
  
     ⚠️ La selección vive AQUÍ, en memoria, y NUNCA en `seleccion.js`: ese es el
     marcado de pedidos, y compartirlo haría que marcar un catálogo marcara un
     envío —y que el 🗑️ de Envíos borrara lo que marcaste aquí—.
- L20: categoría (chips)
- L21: tipo de archivo (tarjetas de arriba)
- L22: búsqueda
- L44: El tipo de archivo, para las tarjetas de arriba. Es un eje DISTINTO al de
     los chips (categoría): "enséñame los videos" y "enséñame los manuales" son
     dos preguntas, y las dos se hacen.
- L78: Los filtros activos se VEN y se quitan de un toque. Un filtro puesto que
- L79: no se ve es la causa número uno de "me desaparecieron las cosas".
- L107: Agrupado por categoría solo cuando ese es el orden: con "A–Z" o "más
- L108: nuevos" los grupos romperían justo el orden que pediste.
- L127: Una imagen que no carga cae al icono y la tarjeta queda entera. Es lo que
     permite usar la miniatura de Drive, que NO está garantizada, sin riesgo de
     que se vea una foto rota.
- L168: ── Marcar ────────────────────────────────────────────────────────────
- L172: Marca lo VISIBLE, no la lista entera: marcar cosas que no ves y borrarlas
- L173: después es exactamente cómo se pierde algo sin enterarse.
- L180: ── Compartir ─────────────────────────────────────────────────────────
- L198: ── Quitar ────────────────────────────────────────────────────────────
- L217: ── Editar / crear ────────────────────────────────────────────────────
- L260: El id se fija ANTES de subir: sin él, dos portadas seguidas se pisarían
- L261: en Storage por caer en el mismo nombre de archivo.
- L300: ★ sube SOLO el documento de config
- L303: El fallo más probable de todo esto no es el código: es una carpeta de
- L304: Drive sin compartir. Quien la abra vería "solicitar acceso" y pensaría
- L305: que el panel está roto.
- L315: Sin documento, encendida: un archivo que nadie creó no puede dejar el
- L316: negocio sin rastreo.
- L328: respuesta inmediata; se confirma abajo
- L334: No se pudo guardar: se deshace el toggle en vez de mentir sobre el estado.

## panel/config/recursos.js

- L1: panel/config/recursos.js — el centro de recursos (lógica)
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: recursos.js — Centro de recursos v1
  ====================================
  Los enlaces que el negocio necesita a mano: manuales de herramientas,
  videos, procesos internos, catálogos y garantía. Viven en Drive; acá solo
  se organizan y se abren.
  
  DÓNDE VIVEN LOS DATOS — y por qué NO en `config`
  En `S.recursos`, una clave HERMANA de `config` dentro del mismo documento.
  Nunca dentro de `config`: `handleConfig` (functions/index.js) devuelve el
  objeto `config` ENTERO al formulario público, así que meterlos ahí sería
  publicar los precios mayoristas y los comunicados internos a quien pidiera
  esa URL. Es la misma razón por la que `msgTemplates` y `labels` están fuera.
  
  QUÉ CUESTA
  Casi nada. `S.recursos` viaja en el documento de configuración que el panel
  ya lee al arrancar, y se guarda con `save('config')`, que sube ESE documento
  y no los 1165 pedidos. Al guardar se lee ese documento UNA vez para
  mezclar con lo que otro equipo cambió (mezclaConfig.js): nada se pisa.
  
  `publico` queda preparado desde el día uno aunque hoy no se use: cuando el
  cliente deba ver avisos y promociones en su link de seguimiento, será añadir
  el interruptor y un endpoint que devuelva SOLO los marcados — sin migrar
  nada ni tocar los recursos ya guardados.
  
  Lógica pura arriba, pantalla abajo. Lo de arriba se prueba sin navegador.
- L37: Cinco, y fijas. Con cinco los chips entran en la pantalla de un teléfono;
       con doce hay que deslizar y el filtro deja de usarse. Añadir una es una
       línea, y es algo que pasa una vez al año — un editor de categorías sería
       otro trozo que mantener para eso.
- L43: una URL de Drive ronda los 90
- L47: El buscador aparece solo a partir de aquí. Un buscador sobre cinco
       elementos es decoración que ocupa sitio en una pantalla de teléfono.
- L51: El tipo se deduce del enlace: tú pegas, el panel decide el icono. Elegir
       un icono por recurso sería trabajo tuyo en cada alta, y trabajo que nadie
       hace acaba en una lista de 🔗 iguales.
- L69: Qué es un enlace, mirando solo su dirección.
  @param {string} url dirección
  @return {{icono:string, etiqueta:string}} icono y nombre del tipo
- L84: ¿Se puede poner esta dirección en un enlace?
  
  SOLO `https://`, y no es quisquillosería: `javascript:` dentro de un href
  ejecuta código con los permisos de tu panel. `http://` se rechaza también
  porque el panel se sirve por https y el navegador bloquearía el salto.
  @param {*} u dirección
  @return {boolean} true si se puede usar
- L96: nada de espacios ni comillas
- L97: ni caracteres de control
- L98: El punto obliga a un dominio de verdad y descarta el "https:/drive..."
- L99: de un pegado a medias.
- L103: Deja la lista utilizable: descarta lo que no sirve, recorta lo largo y
  pone valores por defecto. Lo que viene de la nube puede ser cualquier
  cosa —lo escribió otro dispositivo, o una versión vieja del panel—, así
  que nada se pinta sin pasar por aquí.
  @param {*} bruto lo que haya en S.recursos
  @return {Array<Object>} lista limpia
- L119: Un enlace inválido NO se muestra roto: no se muestra. Mostrarlo
- L120: apuntando a "#" daría un elemento que no hace nada y nadie sabría
- L121: por qué.
- L130: sin título, la dirección: mejor que vacío
- L134: La portada que TÚ pusiste —subida o pegada—. Pasa por la misma
- L135: criba que el enlace: una portada es otro sitio del que el navegador
- L136: va a cargar algo.
- L144: Sin tildes y en minúsculas, para que "garantia" encuentre "Garantía".
  @param {*} s texto
  @return {string} texto comparable
- L154: Filtra por categoría y texto. El texto busca en título, nota y categoría
  —se busca por objetivo ("garantía"), no por tipo de archivo—.
  @param {Array<Object>} lista recursos ya normalizados
  @param {string} cat categoría o 'Todos'
  @param {string} texto búsqueda libre
  @return {Array<Object>} los que pasan
- L173: Solo las categorías que tienen algo dentro. Un chip que siempre abre una
  lista vacía enseña a no usar los chips.
  @param {Array<Object>} lista recursos ya normalizados
  @return {Array<string>} categorías con al menos un recurso
- L185: ── PORTADAS ──────────────────────────────────────────────────────────
       La portada NO se guarda cuando se puede deducir del enlace. Si Google
       cambia mañana su dirección de miniaturas, se toca UNA función; si
       estuviera guardada, habría que arreglar cuarenta registros con una URL
       muerta cada uno.
- L191: El id de un video de YouTube, en cualquiera de sus cuatro formas.
  @param {string} url dirección
  @return {string} id, o '' si no es de YouTube
- L202: El id de un ARCHIVO de Drive. Una carpeta no cuenta: no tiene miniatura,
  y pedirla devolvería una imagen rota.
  @param {string} url dirección
  @return {string} id, o '' si no es un archivo de Drive
- L210: Una carpeta se descarta ANTES de buscar el id, y en sus DOS formas:
         la actual `/drive/folders/1of…` y la antigua `folderview?id=1of…`.
         La antigua es la que importa: trae un `id=`, así que sin esta línea
         caería en el patrón genérico de abajo y devolvería el id de la carpeta
         como si fuera de un archivo — miniatura rota en la tarjeta.
- L221: La portada de un recurso, o null si no hay ninguna.
  
  Orden: la que subiste o pegaste gana siempre —es una decisión tuya—, y
  solo si no hay se deduce del enlace.
  
  ⚠️ La de YouTube es de fiar: lleva quince años igual y no pide permisos.
  La de Drive NO está garantizada —exige que el archivo esté compartido, y
  Google ha movido ese endpoint más de una vez—. Por eso lo que hace que
  esto sea seguro no es la dirección, es el `onerror` de la pantalla: si no
  carga, se ve el icono. Nunca una imagen rota.
  @param {Object} r recurso ya normalizado
  @return {?string} dirección de la portada
- L247: Ordena una copia, nunca la lista original: ordenar en la pantalla no
  puede cambiar el orden que se guarda.
  @param {Array<Object>} lista recursos ya normalizados
  @param {string} modo 'categoria' | 'az' | 'nuevos'
  @return {Array<Object>} copia ordenada
- L262: Por categoría, en el orden declarado de CATEGORIAS — no alfabético:
- L263: el sitio de cada grupo no puede cambiar al renombrar una categoría.
- L269: Agrupa por categoría, en el orden declarado y sin grupos vacíos.
  @param {Array<Object>} lista recursos ya normalizados
  @return {Array<{cat:string, items:Array<Object>}>} grupos con contenido
- L280: Cuántos hay de cada tipo, para las tarjetas de arriba.
  @param {Array<Object>} lista recursos ya normalizados
  @return {{total:number, carpetas:number, videos:number, archivos:number}} cuentas
- L298: Lo que se manda por WhatsApp con los marcados. Un enlace por línea con su
  título: pegar seis URLs sueltas no le dice nada a quien las recibe.
  @param {Array<Object>} sel recursos marcados
  @return {string} texto listo para enviar

## panel/datos/copia-local.js

- L1: panel/datos/copia-local.js — la copia de los pedidos en ESTE navegador
  =====================================================================
  Fase 8 (11/11/2026). El panel guarda una copia del estado en el navegador
  para abrir al instante y pedirle a la nube SOLO lo que cambió
  (functions/sincro.js). Esa copia vivía solo en localStorage, que tiene un
  tope de ~5 MB: el día que los pedidos no quepan, la escritura falla en
  silencio, el panel abre sin copia y baja TODO cada vez — más lento y miles
  de lecturas de Firestore.
  
  Ahora:
    · se sigue escribiendo en localStorage mientras quepa (es síncrono: el
      panel abre pintado, como siempre);
    · y SIEMPRE en IndexedDB, que admite cientos de MB, sin bloquear la
      pantalla (agrupado: una escritura por ráfaga de cambios);
    · si localStorage se llena, se libera y se marca `dpanel_en_idb`: al
      abrir, la copia se lee de IndexedDB ANTES de pedir a la nube.
  Si IndexedDB no existe o falla, todo sigue exactamente como antes.
  Solo es una copia: la nube manda (estado.js → _mergeRemote).
- L24: ms: una escritura por ráfaga de cambios
- L39: un fallo no queda pegado
- L43: Escribe YA la copia que se le pasa (objeto, no texto).
- L55: La copia guardada, o null. Nunca falla: sin copia es null.
- L67: Programa la escritura de la copia ACTUAL (la de ese momento).

## panel/datos/errores.js

- L1: panel/datos/errores.js — registro de errores de los teléfonos
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: errores.js — saber qué se rompe en los teléfonos de los demás
  =============================================================
  Varios vendedores usan este panel desde equipos distintos. Hoy, si a uno se
  le rompe algo, aparece un aviso genérico en SU pantalla y ahí muere: nadie
  más se entera nunca. Eso convierte cualquier fallo intermitente en una
  cacería a ciegas — y ya perdimos días así.
  
  Esto anota los fallos en Firestore, en `<RAIZ>/errores/items`.
  
  LO QUE **NO** GUARDA, Y ES DELIBERADO
  Nada de clientes: ni nombres, ni teléfonos, ni direcciones, ni DNI. Un
  registro de errores es el sitio más fácil del mundo para filtrar datos de
  personas sin darse cuenta, porque nadie lo revisa. Se guarda qué se rompió y
  en qué equipo — nunca con quién estabas trabajando.
  
  TRES FRENOS, PORQUE UN BUCLE DE ERRORES CUESTA DINERO
    1. Tope duro por sesión: pasado ese número, deja de escribir.
    2. El mismo error no se repite: se cuenta, no se duplica.
    3. Nunca lanza. Si falla al guardar, se calla — un registro de errores que
       rompe la app es peor que no tenerlo.
- L30: fallos distintos por sesión, y para
- L31: el mismo error, no más de uno por minuto
- L32: huella → { cuando, veces }
- L39: De un Error, un string o cualquier cosa, saca un mensaje legible.
       Nunca lanza: lo llaman desde manejadores de error, y reventar ahí dejaría
       el fallo original sin registrar Y añadiría uno nuevo.
- L51: Las primeras líneas de la pila, que es donde está la información. El resto
       es ruido del navegador y ocuparía espacio en cada documento.
- L66: El userAgent entero es largo y no aporta; lo que importa es
- L67: distinguir un equipo de otro y saber si es teléfono o PC.
- L81: Anota un fallo. `donde` es una etiqueta corta y estable ('render',
         'shalom.consultarGuia', 'guardar'): es lo que permite agrupar después.
         `extra` son datos SIN informacion de personas.
- L94: el mismo error, otra vez: se cuenta y ya
- L111: Solo valores simples y cortos. Un objeto entero podría arrastrar
- L112: un pedido completo con los datos del cliente dentro.
- L127: un registro de errores no puede romper nada
- L130: Cuántos van en esta sesión — lo usa el diagnóstico de Configuración.
- L136: Los dos manejadores globales atrapan lo que nadie envolvió en try/catch,
       que es justamente lo que hoy se pierde. Se enganchan una sola vez y no
       estorban a los que ya existan.
- L149: navegador sin addEventListener: no pasa nada

## panel/datos/estado.js

- L1: panel/datos/estado.js — estado, guardado, sucios, mezcla con la nube y arranque
  =========================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L12: ★ DATOS AVISA, PANTALLA PINTA (Fase 7, 11/11/2026). Este módulo es
     estado y sincronización: no pinta ni muestra mensajes. Cuando pasa algo,
     AVISA con un evento y pantalla/inicio.js hace lo de siempre (repintar,
     mostrar el aviso). dispatchEvent es inmediato: el orden de lo que se ve no
     cambia. Si algo se avisa antes de que la pantalla esté escuchando, queda
     en cola y se entrega en cuanto escucha — no se pierde ningún aviso.
- L26: STATE
- L32: ★ LA COPIA LOCAL (Fase 8). Si localStorage se llenó, la copia vive en
     IndexedDB (panel/datos/copia-local.js) y se lee al arrancar, antes de
     pedir a la nube (pantalla/inicio.js).
- L36: Guarda la copia local: localStorage mientras quepa, y siempre IndexedDB.
   Una sola puerta para las tres escrituras que había sueltas.
- L44: Lleno: antes esto caía en memoria y al recargar no había copia (el
         panel bajaba TODO). Ahora se libera localStorage para lo pequeño y la
         copia queda en IndexedDB.
- L53: ★ Exponer S globalmente para tracking.js
- L55: ── Normalización de teléfono (una sola regla, reutilizada en todos los campos)
- L56: Borra lo que no sea dígito, quita el prefijo Perú (+51) si sobra y corta a 9.
- L57: Es la MISMA regla que ya funcionaba en el link personalizado; ahora vive en un
- L58: solo lugar. Se aplica por DELEGACIÓN: cualquier input con clase "phone-norm"
- L59: (estático o creado dinámicamente, como el del motorizado) se limpia solo, sin
- L60: cablear cada campo. Los valores de cada campo siguen 100% independientes.
- L63: Usuario de WhatsApp (@nombre): se deja pasar, recortando solo lo que
- L64: WhatsApp no admite. Sin esta guarda, el replace de abajo borraba la arroba
- L65: en cada tecla y el campo era imposible de llenar.
- L66: Se guarda en minúsculas a propósito: así el buscador del panel (que compara
- L67: en minúsculas) y el escaneo del QR encuentran el pedido sin código extra.
- L78: captura: corre ANTES del oninput inline del campo, así quien lea this.value
- L79: (ej. onPhoneInput) recibe el valor ya limpio.
- L100: ★ Sin repetidos: dos «AVISAR CUANDO LLEGUE» compartían mensajes y
     filtro, y no había forma de saber cuál era cuál.
- L103: El nombre de una etiqueta va dentro de botones (onclick='…'): sin
     comillas, < > ni barras, en mayúsculas y sin espacios de sobra.
- L106: Filtro de los pedidos cuya etiqueta se borró (o que vienen con un estado
     que ya no existe). Un valor que ninguna etiqueta puede tener.
- L115: ── FIREBASE SAVE/LOAD ────────────────────────────────────────────────
- L120: ★ Guardado incremental: registro de pedidos modificados ("sucios").
- L121: save(id) marca solo ese pedido para subir. save() sin id = subir todo (seguro).
- L123: proveedores modificados: save('supp:'+id) marca solo ese
- L124: ★ Arranca en FALSE, no en true.
     Arrancar en true significaba "no sé qué quedó pendiente, sube los 971". Eso
     tenía sentido cuando nadie anotaba qué había quedado sin subir; ahora
     `dpanel_dirty` lo dice con nombre y apellido, y dejarlo en true convertía
     cada arranque con algo pendiente en una subida completa.
     Los dos sitios que de verdad necesitan subirlo todo lo encienden a
     propósito: `save()` sin argumento (importar Excel, restaurar respaldo) y el
     primer arranque real con la nube vacía.
- L133: true = subir SOLO config (toggles de Config)
- L135: ★ LOS SUCIOS SOBREVIVEN AL CIERRE DE LA PESTAÑA
     Sin esto había una pérdida silenciosa: cambias algo → la subida falla los 4
     intentos → cierras la pestaña. Al volver, _dirtyShips está vacío (vive en
     memoria), así que _mergeRemote deja mandar a la nube y tu cambio desaparece
     sin dejar rastro — ni aviso, ni forma de recuperarlo.
     Guardando qué quedó sucio, _mergeRemote reconoce esos pedidos al arrancar y
     conserva la versión local hasta que suba de verdad.
- L143: ¿la sesión anterior dejó algo sin subir?
- L155: localStorage lleno o bloqueado: no vale romper el guardado
- L166: dato corrupto: se ignora, _dirtyAll ya cubre el caso
- L171: Lista vacía = no cambió nada. Sin esta guarda caería en "sin id" y subiría
- L172: los ~700 pedidos por gusto.
- L177: Marcar qué cambió
- L179: ★ Varios pedidos de una vez (imprimir un lote, ciclo de auto-tracking).
- L180: Marca todos y serializa UNA sola vez: llamar save(id) en un bucle de 700
- L181: congela el panel 7,6 s porque cada llamada reescribe el estado completo.
- L185: ★ Solo config cambió (toggles de Config: días, couriers, etc.).
- L186: No marca ningún pedido: si no hay otros pedidos sucios pendientes,
- L187: _fbSave subirá únicamente el documento config (no los 180 pedidos).
- L190: ★ Proveedor específico: sube solo ese proveedor + config, no los 170 pedidos.
- L195: hay un pedido real → no es solo-config
- L197: sin id → cambio de config/suppliers/masivo → subir todo
- L200: ★ Mejora 3: local sin base64 pesadas · Fase 8: + IndexedDB
- L201: qué quedó sin subir viaja con el respaldo, no solo en memoria
- L205: ★ save() se declara con const, y un const de nivel superior NO se cuelga de
- L206: window (a diferencia de las function). Los módulos que hacían
- L207: `typeof window.save === 'function'` veían undefined y NO GUARDABAN NADA:
- L208: print.js, notify.js, respaldo.js (¡restaurar un respaldo no persistía!) y el
- L209: ciclo de auto-tracking. Una línea los revive a los cuatro.
- L212: Guardar con hasta 3 reintentos ante fallos de red
- L215: ★ CAPA 1 · NADA SUBE ANTES DE QUE LA NUBE CONTESTE.
       `_fbSave` reescribe el documento de configuración ENTERO en CADA
       guardado —editar un pedido, imprimir, el seguimiento automático—, no
       solo al tocar Config. En un navegador sin datos locales la memoria
       arranca con los valores por defecto, y cualquier guardado en el segundo
       que tarda la nube en contestar borraba etiquetas, recursos, la cuenta de
       Shalom y la agencia de origen. El 21/10/2026 faltó un pelo.
  
       No se pierde nada por esperar: lo marcado como sucio sigue marcado,
       `_mergeRemote` rescata los pedidos sucios al llegar la nube, y esta
       bandera de pendiente hace que `_initFirebase` lo suba justo después.
       Se APLAZA, no se tira.
- L233: sync exitoso
- L234: Repintar: el aviso de pendiente se lee de localStorage, y _fbSave ya
- L235: había pintado 'ok' ANTES de que esta línea limpiara la bandera.
- L238: La capa 3 negó la escritura. Reintentar no sirve —la memoria sigue
         teniendo los valores por defecto— y decir «guardado» sería mentir.
- L248: Un 403 al guardar es la misma sesión vencida: se marca pendiente (lo que
- L249: no subió sobrevive) y se pide entrar de nuevo, en vez de gastar cuatro
- L250: intentos que van a fallar igual.
- L254: Misma regla que arriba: sin sesión previa no hay a quién expulsar.
- L265: ★ Agotados los intentos: marcar pendiente DE VERDAD.
           Esta bandera se leía en dos sitios pero NADIE la ponía nunca en '1'.
           Consecuencia: el aviso "⚠️ Datos pendientes de sincronizar" no
           aparecía jamás, y la resubida al reconectar —que ya estaba escrita en
           _initFirebase— no llegaba a dispararse nunca. El comentario decía
           "se subirá cuando vuelva la conexión" y no era cierto.
- L278: Sin modo offline — requiere conexión
- L280: Firebase status indicator in header
- L282: Mostrar indicador de pendiente si hay datos sin sincronizar
- L302: Merge remote state preserving local images
- L304: ★ LA NUBE CONTESTÓ CON DATOS. Se marca aquí y no en `_initFirebase`
       porque este es el ÚNICO sitio por el que entran datos de la nube: la
       carga inicial, el latido de 5 s y la recarga tras registrar. Si la
       primera carga falla y el latido la recupera minutos después, también
       cuenta — y así nada se queda bloqueado para siempre.
       Y se apunta el nombre del negocio que trae la nube: es la referencia de
       la capa 3.
- L315: No mergear si hay un guardado en curso - evita race condition
- L317: Preserve base64 images from local state
- L322: ★ FIX preciso: si ESTE pedido tiene un cambio local específico aún sin
- L323: subir (está en _dirtyShips), conservamos la versión local para que el
- L324: latido no lo pise antes de que suba. NO usamos _dirtyAll (sería muy
- L325: amplio: bloquearía los cambios legítimos de otros dispositivos).
- L329: Preservar imágenes base64 que no se guardan en Firebase
- L333: Preservar campos de tracking/guía Shalom si Firebase trae versión sin ellos
- L334: ⚠️ shalomEstado/shalomMonto/shalomRegistradoEn faltaban en esta lista
- L335: desde que se lanzo el registro: una copia vieja de la nube podia
- L336: borrarlos. Esta lista solo CONSERVA, nunca pisa, asi que anadirlos
- L337: no puede romper nada — y sin shalomRegistradoEn no hay cuenta atras.
- L351: Si este proveedor tiene un cambio local aún sin subir, conservar la versión local.
- L357: ★ LOS PEDIDOS QUE SOLO EXISTEN AQUÍ
       La línea de abajo reemplaza S ENTERO con lo que trae la nube. Un pedido
       creado en este dispositivo que todavía no llegó a subir NO viene en
       `remote`, así que desaparecía: de la pantalla y del respaldo local, sin
       aviso y sin forma de recuperarlo. No hacía falta cerrar la pestaña —
       bastaba con que la subida fallara y llegara el latido de los 5 s.
  
       Se rescatan SOLO los que están marcados como sucios. Ese filtro es lo que
       impide resucitar lo que otro dispositivo borró a propósito: si un pedido
       no está marcado, es que aquí no hay nada pendiente sobre él y su ausencia
       en la nube es la verdad, no una pérdida.
- L380: ★ Un cambio de configuración hecho AQUÍ que aún no subió (la base dice
       una cosa y la memoria otra) no se tira: se mezcla con lo que trae la
       nube, igual que al guardar. Sin esto, el latido lo borraba antes de
       que llegara a subir.
- L389: Full replace — not just assign — so arrays like labels/couriers sync correctly
- L392: ★ Limpiar etiquetas alias que puedan venir de Firebase
- L397: La nueva base: lo que la nube tiene AHORA, ya limpio como lo ve el
       panel. Una clave que la nube aún no tiene cuenta como vacía, para que
       lo de aquí suba la primera vez.
- L405: ★ ETIQUETAS REPETIDAS EN LA NUBE (11/11/2026). Aquí se muestran sin
         repetir, pero la copia guardada seguía con la «AVISAR CUANDO LLEGUE»
         doble para siempre: la base decía «limpio» y nada la reescribía. Si
         la nube trae repetidas (o alias viejos), la base toma lo que la nube
         tiene DE VERDAD y se guarda una vez: la mezcla sube la lista limpia.
         Al quedar limpia, la próxima carga ya no lo dispara.
- L423: ★ Normalizar status de pedidos con nombres viejos
- L429: ★ FIX lecturas: sincronizar _S_TS con el ts de los datos recién cargados.
- L430: Sin esto, el listener cree que SIEMPRE hay cambios nuevos y recarga los
- L431: ~170 pedidos cada 5s en bucle (causaba millones de lecturas/mes).
- L437: Los pedidos que vienen de Firestore pueden traer `sel` guardado de cuando
- L438: la selección vivía dentro del pedido. Se suelta acá, ANTES de guardar en
- L439: local, para que no se cuele de vuelta por la puerta de atrás. La selección
- L440: de ESTE dispositivo (seleccion.js) no se toca: el latido de otro
- L441: dispositivo ya no puede desmarcarte nada.
- L443: ★ Mejora 3: local sin base64 pesadas · Fase 8: + IndexedDB
- L444: El nombre y el teléfono del negocio también vienen de la nube: sin esto se
- L445: quedaban en los valores por defecto hasta la siguiente recarga.
- L446: La pantalla repinta encabezado, lista y chips, libera Config/Recursos
- L447: y dice «☁️ Datos sincronizados» (pantalla/inicio.js).
- L451: On Firebase ready: load remote data if available
- L459: Firebase tiene datos → Firebase manda
- L461: ★ Subir lo que quedó pendiente, ahora que hay conexión confirmada.
           Antes solo miraba `dpanel_pending`, que se enciende al agotar los
           reintentos — o sea, nunca cuando la pestaña se cierra de golpe. Con
           `dpanel_dirty` sabemos qué quedó sin subir aunque el navegador se
           cerrara a media escritura, y RECONOCERLO no bastaba: había que
           subirlo. `_dirtyAll` sigue en false, así que sube exactamente esos y
           no los 971.
- L470: remote === null SOLO cuando Firebase confirmó (respuestas OK) que está vacío.
- L471: Solo en ese caso es seguro subir lo local (primer arranque real).
- L472: La nube CONFIRMÓ que está vacía: eso también es una respuesta, y la
           única en la que subir lo local es correcto.
- L478: Primer arranque real: la nube está vacía y todo lo local es nuevo para
- L479: ella. Este es uno de los dos sitios que encienden _dirtyAll a mano.
- L483: ★ La carga FALLÓ (no es "vacío"). NO tocar la nube: jamás subir local aquí.
- L485: ★ 403 = PERMISSION_DENIED. No es la red: es que esta sesión ya no tiene
         permiso, casi siempre porque venció (auth.js corta a las 12 h). El
         control de vencimiento solo corría AL CARGAR la página, así que si la
         sesión moría con el panel abierto nadie se enteraba: salía "Sin conexión
         a Firebase" y a revisar el internet.
         Reintentar un 403 cuatro veces no lo arregla — solo llena la consola.
- L492: ⚠️ Un 403 significa "tu sesión venció" SOLO SI HABÍA UNA SESIÓN.
           Sin token guardado, el 403 es el estado NORMAL de quien todavía no ha
           entrado — esta carga corre en paralelo con la pantalla de login.
           Tratarlo como expulsión borraba la sesión y dibujaba una SEGUNDA
           pantalla de login encima; al entrar se quitaba una y el usuario
           seguía mirando la otra, tecleando su contraseña sin entender nada.
- L500: Había sesión y aun así Firestore dice que no. Son dos cosas
             distintas —venció, o esta cuenta no está autorizada— y desde el 403
             no se pueden separar. Antes se afirmaba "venció", y a quien entraba
             con la cuenta equivocada lo mandaba a un bucle: entra, se le dice
             que venció, vuelve a entrar, y otra vez.
             Ahora se dice lo que SÍ se sabe: con qué correo entró.
- L510: en los dos casos: reintentar un 403 no lo arregla
- L513: Reintentar la carga; no nos quedamos con local viejo en pantalla sin avisar
- L516: no arrancar el listener todavía; lo hará el reintento exitoso
- L523: ★ AL ENTRAR, CARGAR. La carga inicial corre en paralelo con la pantalla
     de login: sin sesión falla, reintenta cuatro veces (unos 37 s) y se rinde.
     Quien tardaba más que eso en entrar se quedaba sin datos de la nube hasta
     recargar la página — y con la guarda de la configuración, con Config
     bloqueado. auth.js llama a esto al entrar con éxito.
- L532: ─────────────────────────────────────────────────────────────────────

## panel/datos/fotos.js

- L1: panel/datos/fotos.js — la cola de fotos pendientes
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: fotos.js — los documentos de los pedidos: comprimir, subir, y NO PERDER.
  ========================================================================
  ⚠️ EL FALLO QUE CIERRA. Si subir a Storage fallaba (sin internet, sesión
  vencida), el panel guardaba la foto «en el navegador» como texto base64 y
  seguía. Pero al subir el pedido a la nube, `slimShipment` cambia a
  propósito ese texto por «[img]» (un pedido no puede pasar de 1 MB en
  Firestore). La foto quedaba perdida: en otra PC el documento vacío, y en
  esta, hasta recargar.
  
  Ahora una foto que no se pudo subir queda PENDIENTE:
    · en el formulario se ve (vista previa local) con «⏳ se subirá al
      guardar»;
    · al guardar el pedido entra en una COLA en IndexedDB —sobrevive a
      cerrar la pestaña y a reiniciar la PC— y se reintenta sola: al
      arrancar, al volver internet y cada minuto;
    · cuando sube, se escribe SOLO ese campo del pedido en la nube;
    · mientras tanto el pedido NO sube un «[img]» ni nada en su lugar: el
      campo se omite (ver slimShipment), así una PC con la marca vieja
      nunca pisa el enlace bueno.
  
  Y las fotos se COMPRIMEN antes de subir (máx. 1600 px, ~300 KB) con una
  MINIATURA de ~20 KB para las tarjetas. Antes cada tarjeta descargaba la
  foto original de 3–8 MB para enseñarla en 52×66 px. Los PDF no se tocan.
  
  El núcleo es puro (`crear(deps)`): red, bucket, IndexedDB y canvas
  entran como dependencias, así que se prueba sin ninguno.
- L39: ya liviana y chica: se sube tal cual
- L41: Los pedidos con documentos que NO están en la nube:
          perdido   «[img]»: la foto nunca llegó (el fallo de antes). No se
                    puede recuperar: hay que volver a subirla.
          local     base64 solo en ESTE navegador: todavía se puede salvar
                    abriendo el pedido y guardándolo.
        Las fotos pendientes en cola no salen aquí: ya se están subiendo.
- L67: {poner(item), todos(), quitar(clave)}
- L71: ¿Se puede comprimir? Solo lo que un <canvas> sabe leer. HEIC, GIF,
          SVG y PDF se suben tal cual.
- L80: Ya era liviana y no hizo falta achicarla: la original, intacta.
- L95: Sube un documento (comprimido) y su miniatura. La miniatura es una
          mejora: si falla, el documento sube igual.
- L105: sin miniatura: la tarjeta usa la grande
- L111: La marca de un documento que todavía no subió. Vive SOLO en memoria
          (la vista previa es local) y nunca sube a la nube.
- L120: Tras guardar el pedido: lo pendiente entra a la cola PRIMERO (así
          cerrar la pestaña ya no lo pierde) y luego se intenta subir.
- L139: Intenta subir todo lo pendiente. Uno a la vez; lo que falla se queda
          para el próximo intento. Devuelve cuántos subieron.
- L150: El pedido ya no existe (se borró): no se resucita con un campo.
- L154: `forma: 'url'` = el campo guarda solo el enlace (la foto de
- L155: entrega del delivery); si no, el documento completo.
- L159: Solo si en memoria sigue la MISMA marca: si mientras tanto se
- L160: cambió o quitó el documento, eso manda.
- L164: sigue en la cola; próximo intento
- L174: Encolar un archivo suelto para un campo que guarda solo el enlace.
- L193: ── EL NAVEGADOR DE VERDAD ───────────────────────────────────────────
- L195: Cola en IndexedDB. Si no hay (modo privado), en memoria: funciona
        igual mientras la pestaña siga abierta.
- L235: Redimensiona con canvas, respetando la orientación de la cámara.
- L254: PNG transparente → fondo blanco
- L262: Indicador visible: «📤 N fotos por subir». Toca para reintentar.
- L307: Pinta la lista de documentos perdidos (📦 → Documentos perdidos).
- L331: Reintentos: al arrancar (con margen para la sesión), al volver
- L332: internet, y cada minuto mientras haya algo pendiente.

## panel/datos/mezclaConfig.js

- L1: panel/datos/mezclaConfig.js — mezclar la configuración entre equipos
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L7: mezclaConfig.js — DOS EQUIPOS, NINGÚN CAMBIO PERDIDO (06/11/2026)
  =========================================================================
  Etiquetas, recursos, mensajes, couriers… viven en UN documento de la nube
  (`panel/config`). Antes cada guardado lo reescribía ENTERO desde la memoria
  del equipo que guardaba: si el teléfono tenía la lista de hace un rato,
  subía esa lista y la etiqueta que acababas de crear en la PC desaparecía.
  
  Ahora cada equipo recuerda la BASE —lo último que vio en la nube— y al
  guardar compara tres cosas:
    base  → lo que había cuando este equipo leyó la nube
    mia   → lo que hay ahora en este equipo
    suya  → lo que hay ahora en la nube (lo que dejaron los otros)
  Lo que TÚ cambiaste respecto a la base gana; lo que no tocaste se queda
  como lo dejaron los otros. En listas se mezcla elemento por elemento: tu
  etiqueta nueva y la del otro equipo quedan las dos; lo que alguien borró
  queda borrado.
  
  Lógica PURA: ni red ni DOM. La usan index.html (`_fbSave`, `_mergeRemote`)
  y las pruebas.
- L34: Listas de textos (etiquetas, couriers, campos extra). Se respeta TU orden
       (lo arrastraste tú) y lo nuevo de los otros va al final.
- L46: Estaba en la base y la nube ya no lo tiene: otro equipo lo borró.
- L53: Estaba en la base y aquí ya no: lo borraste tú.
- L60: La identidad de un elemento de lista de objetos: los recursos tienen `id`;
       la papelera guarda `{shipment, deletedAt}`. Sin nada de eso, su contenido.
- L71: Listas de objetos (recursos, papelera). Igual que `lista`, y además: si
       los dos tienen el mismo elemento y tú NO lo editaste, vale la versión de
       la nube (quizá el otro sí lo editó).
- L85: Otro equipo lo quitó. Si tú lo editaste mientras tanto, se queda.
- L94: lo quitaste tú y nadie lo editó
- L100: Objetos por clave (mensajes por etiqueta, couriers activos).
- L114: Valores sueltos (PIN, agencia de origen, datos del negocio…).
- L126: @param {Object} base lo último que este equipo vio en la nube
  @param {Object} mia  lo de este equipo ahora
  @param {Object} suya lo de la nube ahora
  @return {Object} la mezcla, con las mismas claves que `mia`
- L142: Las claves en que dos proyecciones no coinciden.

## panel/datos/nube.js

- L1: panel/datos/nube.js — la capa de Firestore: leer, escribir, sincronizar
  =================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L14: ── DÓNDE VIVEN LOS DATOS ───────────────────────────────────────────
       TODAS las rutas de Firestore salen de aquí. Ninguna se escribe suelta
       en medio del código.
  
       No es manía de orden: es la puerta por la que este panel podrá servir a
       más de un negocio. El día que haya un segundo, `RAIZ` pasa a valer
       `negocios/<id>` y no hay que ir a cazar rutas por cuatro archivos —
       que es la parte que, con datos vivos dentro, duele de verdad.
  
       HOY NO SE MIGRA NADA. `RAIZ` vale `panel`, exactamente como estaba, y
       los ~1042 pedidos se quedan donde están. Mover mil documentos para
       ganar cero hoy sería el tipo de riesgo que no se paga solo.
  
       ⚠️ Si cambias RAIZ, hay tres sitios más que apuntan a lo mismo y NO se
       enteran: firestore.rules, functions/index.js (CFG_DOC, SHIP_COL,
       TOK_COL, FORMCFG_COL) y storage.rules. Los cuatro cambian juntos o no
       cambia ninguno.
- L41: El interruptor de la puerta a Shalom. Lo escribe sobre todo el servidor
- L42: (functions/interruptor.js); el panel solo lee el estado y enciende/apaga.
- L45: ── Firestore value converters ────────────────────────────────────────
- L62: `_mts` (hora de cambio, Fase 2) es un timestamp de Firestore. Antes
- L63: este lector devolvía null para cualquier timestamp.
- L70: ── Cabeceras de cada petición a Firestore (punto único) ──────────────
- L71: Dos pruebas independientes, cada una con su propio try/catch: que una
- L72: falle no debe tumbar a la otra ni a la petición.
- L73: Authorization      → QUIÉN sos (el token de sesión de auth.js).
- L74: X-Firebase-AppCheck → DESDE DÓNDE se llama (appcheck.js). Hoy Firestore
- L75: está en modo Supervisión: si esta cabecera falta, la petición igual
- L76: funciona, solo queda contada como "no verificada" en Firebase. El día
- L77: que se active el bloqueo, ahí sí pasa a ser obligatoria — y para
- L78: entonces ya se habrá confirmado que llega bien desde acá.
- L80: Un aviso de sesión, y UNO SOLO cada medio minuto.
       Un guardado de 971 documentos que falla no puede producir 971 avisos: el
       panel quedaría inservible justo en el momento en que hace falta leerlo.
       Y el texto distingue las dos causas, porque se arreglan distinto: una se
       espera, la otra se resuelve volviendo a entrar.
- L91: Las palabras viven en auth.js, que es quien conoce los motivos.
- L94: Datos avisa; la pantalla lo muestra (Fase 7). Sin estado.js, como antes.
- L104: ★ ESTO ES UNA PUERTA, NO UN INTENTO.
       Antes, cuando no había token, devolvía `{}` y la petición salía SIN
       IDENTIFICAR. Las reglas exigen sesión, así que Firestore respondía 403 a
       todo lo que escribieras durante esa hora — y el único aviso era el mismo
       punto rojo que significa "mal internet", con lo que seguías trabajando.
       Ahora se niega antes de salir, y dice cuál de los dos problemas es.
- L115: lanza con .auth si no hay sesión
- L121: auth.js viejo en caché. No se degrada a anónimo —que es justo el
           agujero que se está tapando— pero tampoco se tumba el panel entero
           por un archivo desfasado: se exige el token por el camino de antes.
- L136: sin token de App Check → seguir sin esa cabecera
- L140: ── REST helpers ──────────────────────────────────────────────────────
- L152: Un error de Firestore que SÍ dice qué pasó.
       Sin el código HTTP, un 403 —esta sesión ya no tiene permiso— se veía igual
       que un corte de red, y el panel decía "sin conexión" cuando lo que había
       vencido era la sesión. Mandar a revisar el internet por un problema de
       permisos es el mismo error de mezclar dos lados que costó días en Shalom.
- L164: ★ FASE 2: pedidos y proveedores van por `:commit` con la hora del
         SERVIDOR en `_mts` (functions/sincro.js). Mismo merge por campos que
         el PATCH de abajo; solo cambia el método. Si `:commit` no sirve, se
         cae al PATCH de siempre y se anota que esa escritura salió SIN marca:
         las otras PCs harán la carga completa en vez de perderla.
- L170: el camino rápido ya falló en esta sesión
- L180: Pasajero (5xx, 429) o sin sesión (401): se lanza, como siempre, y
- L181: el guardado lo reintenta. Cualquier otro rechazo (403, 400…): el
- L182: PATCH de siempre, para NO guardar nunca menos que antes.
- L191: Guard: nunca mandar un PATCH sin campos. Sin fields NI mask, Firestore
- L192: reemplazaría el documento con {} y borraría todo. Con 0 campos: no-op.
- L197: ★ Escritura incremental por updateMask (merge real). SIN mask, un PATCH de
- L198: Firestore REEMPLAZA el documento entero y BORRA los campos no enviados —
- L199: por eso un dispositivo con copia vieja pisaba trackingStatus (motor B u
- L200: otro device). Con updateMask solo se tocan ESTOS campos; el resto del doc
- L201: queda intacto. Cada field path va entre backticks (escapados) para admitir
- L202: cualquier nombre de campo sin romper el path. Para "borrar" un campo se
- L203: envía con valor null (queda en el mask): quitar por omisión ya no borra.
- L213: ── ESCRITURA POR TANDAS ────────────────────────────────────────────
       Antes, guardar todo era `Promise.all` de un fsPatch por documento: con
       971 pedidos eso son 971 peticiones sueltas a la vez. Firestore devolvía
       429 a buena parte, `Promise.all` se rompía con la primera y el reintento
       volvía a mandar las 971 — unas 4.000 escrituras en medio minuto. Eso era
       el punto rojo.
  
       `documents:commit` acepta hasta 500 escrituras en UNA petición, cada una
       con su propio updateMask (o sea, la misma fusión por campos de antes: un
       dispositivo con copia vieja sigue sin poder pisar trackingStatus).
       971 documentos pasan de 971 peticiones a 2.
  
       ⚠️ NO USAR `documents:batchWrite`. Se probó y devuelve 403
       PERMISSION_DENIED "Missing or insufficient permissions." desde el
       navegador, con las mismas credenciales con las que un PATCH suelto entra
       sin problema: las reglas de seguridad no se evalúan para ese método, así
       que lo rechaza siempre. `:commit` es el que usa el SDK oficial por debajo
       para writeBatch(), y sí pasa por reglas.
  
       El precio de `:commit` es que la tanda es TODO-O-NADA y no dice cuál
       documento la tumbó. Por eso, cuando una tanda falla, esa tanda —y solo
       esa— se rehace documento por documento: es la única forma de saber con
       exactitud qué quedó fuera, y así el reintento manda 3 y no 971. El camino
       bueno sigue costando 2 peticiones; el desglose solo se paga al fallar.
- L237: tope duro de Firestore por commit
- L238: techo propio, holgado bajo el de 10 MiB
- L242: Un {path,obj} → un Write de la API. Devuelve null si no hay campos: misma
- L243: guarda que fsPatch, un write sin fields borraría el documento entero.
- L246: `_mts` lo pone SOLO el servidor: el que traiga el pedido en memoria
- L247: (leído de la nube) no viaja como dato.
- L254: Mismo escapado con backticks que fsPatch: la sintaxis de field path es
- L255: la misma en la URL y en el cuerpo, y admite cualquier nombre de campo.
- L261: ¿Este documento lleva hora de cambio? Pedidos y proveedores: lo que el
       panel sincroniza por cambios (Fase 2).
- L266: Borrar + LÁPIDA en una sola operación atómica: o pasan las dos o
       ninguna. Sin lápida, otra PC que solo pide lo cambiado no se enteraría
       del borrado. Si `:commit` no sirve, se borra como siempre y la lápida
       se intenta aparte (y se anota).
- L289: Reparte respetando a la vez el tope de 500 y un techo de bytes:
- L290: `trackingHistory` crece con cada consulta y una tanda de 500 pedidos con
- L291: mucho historial no debe acercarse al límite de la petición.
- L305: Uno por uno, pero con tope de peticiones simultáneas. Nunca lanza: cada
- L306: documento cae en ok o en fail por su cuenta, que es lo que hace falta para
- L307: saber exactamente qué quedó sin guardar.
- L323: Si `:commit` no sirve en este proyecto, no se vuelve a intentar en toda la
- L324: sesión. Ver abajo cómo se distingue "el endpoint no sirve" de "un
- L325: documento concreto está mal": no es lo mismo y no se apaga por lo segundo.
- L328: items: [{clave, path, obj}] → {ok:[clave], fail:[clave]}. No lanza.
- L336: 0 campos: nada que escribir, cuenta como hecho
- L355: se mira abajo para decidir si apagar el camino
- L360: Si no vuelve un resultado por escritura no se puede afirmar que
- L361: entraron todas. Antes de inventarlo, se rehace de uno en uno.
- L366: commit es atómico: entró entera
- L369: Un fallo de SESIÓN no es un fallo de este documento ni de este
           endpoint: hasta que vuelva a haber sesión no va a entrar ni una sola
           escritura. Rehacer la tanda uno por uno daría el mismo error tantas
           veces como documentos haya, y peor: si `_patchLimitado` los entrega
           todos fallados, la regla de abajo apagaría `:commit` para el resto de
           la sesión por algo que no tiene nada que ver con `:commit`.
           Se marca como no guardado TODO lo que quede —que es lo que mantiene
           el registro de sucios— y se corta.
- L391: Cómo se distingue una cosa de la otra:
             si uno por uno entraron TODOS, no había ningún documento malo — el
             problema era el endpoint, y solo entonces se apaga el camino rápido.
             Si alguno falló también suelto, el culpable era ese documento y el
             camino rápido sigue sirviendo para los demás.
             Y solo se apaga ante un 4xx: un 5xx o un 429 son pasajeros y no
             deben degradar el resto de la sesión.
- L411: 404 = el documento ya no existe → tratar como borrado exitoso
- L412: ★ Mejora 1: ahora el reintento sí funciona
- L419: 200 × 300 = 60 000 docs máximo
- L437: ★ exponer globalmente para tokens
- L439: ★ CONSULTA, NO LISTADO. `fsList` baja la colección ENTERA; Firestore
       cobra cada documento devuelto. `runQuery` cobra solo los que cumplen el
       filtro. `padre` es la ruta del documento que contiene la colección
       (p. ej. 'panel/tokens'), `coleccion` su id ('items').
       Devuelve los documentos como fsList, más `_name` (la ruta completa,
       que hace falta como cursor para paginar sin saltarse ninguno).
- L455: filas sin doc: solo readTime
- L464: Latido de salud a demanda: UNA lectura del doc de config, sin arrastrar la
- L465: recarga completa de pedidos. El poll normal solo recarga cuando cambia `ts`
- L466: (que el backend NO toca al escribir el latido) — y hacer que lo tocara
- L467: obligaría a releer los ~700 pedidos cada 30 min, justo lo que se optimizó.
- L472: ── Strip images for cloud (too heavy) ───────────────────────────────
- L475: Storage URL → guardar completa (no pesa nada)
- L477: Base64 → placeholder [img]
- L481: `sel` (pedido marcado) NO sube. Es estado de pantalla de ESTE
- L482: dispositivo y vive en seleccion.js; si viajara dentro del pedido, otro
- L483: dispositivo lo recibiría y vería marcado lo que marcaste tú. Se quita
- L484: acá, en la puerta de subida, porque el spread de arriba copia el objeto
- L485: entero y cualquier campo nuevo se colaría igual.
- L492: ★ UNA FOTO PENDIENTE NO SUBE NADA EN SU LUGAR. Antes subía «[img]» y
         la foto quedaba perdida. Ahora el campo se OMITE: la cola de fotos
         (fotos.js) lo escribe cuando la foto sube, y mientras tanto ninguna
         PC con la marca vieja puede pisar el enlace bueno.
- L502: Conserva las URLs de Storage; solo recorta base64 (reusa _slimDoc).
- L506: ★ Mejora 3: copia del estado adelgazada SOLO para el respaldo localStorage.
- L507: Conserva las URLs de Firebase Storage (pesan poco y se siguen viendo) y
- L508: reemplaza las imágenes base64 pesadas por '[img]' para no llenar el local
- L509: (~5MB). NO modifica el S real en memoria — solo la copia que se guarda.
- L517: Si algo falla, mejor guardar el estado completo que perder el respaldo
- L522: ★ LO QUE VIAJA EN EL DOCUMENTO DE CONFIGURACIÓN — una sola lista.
       Devuelve una COPIA (JSON) con los valores tal como se guardan: la usan
       el guardado, la base de la mezcla (`window._cfgBase`) y `_mergeRemote`.
       Una copia, no referencias: `S.labels.splice(...)` no puede tocar la base.
- L538: ★ HERMANA de `config`, jamás dentro. `handleConfig` devuelve el
           objeto `config` ENTERO al formulario público, así que meter aquí
           los recursos publicaría los precios mayoristas y los comunicados
           internos a quien pidiera esa URL. Misma razón por la que
           `msgTemplates` y `labels` están fuera.
- L544: ★ También HERMANA de `config`, por lo mismo: `handleConfig`
           devuelve el objeto `config` entero al formulario público, y aunque
           tu agencia de despacho no sea un secreto, la regla se comprueba
           antes de guardar, no después. El formulario del cliente no la
           necesita, así que no viaja.
- L550: `shalomInstancia` YA NO VA AQUÍ (11/11/2026): la escribe SOLO el
           servidor al conectar la cuenta (functions/cuentaShalom.js). Si
           viajara desde el panel, un equipo con un id viejo lo pisaría — que
           es justo como el panel quedó apuntando a una cuenta que no existe.
- L554: ★ El interruptor del simulacro de REGISTRO. Hermana de `config`
           por lo mismo que las dos de arriba, y aquí sí o sí: lo lee la
           Cloud Function. Si no viajara, apagarlo en el panel no lo
           apagaría en el servidor y el registro se quedaría en simulacro
           para siempre sin que nada lo explicara.
           ⚠️ Se guarda tal cual, y el servidor solo lo apaga con un `false`
           EXPLÍCITO: ausente, nulo o con basura deja el simulacro puesto.
           En una operación que cuesta dinero, la duda se resuelve del lado
           de no gastar.
- L569: ── SAVE ─────────────────────────────────────────────────────────────
- L571: ★ CAPA 3 · LA ÚLTIMA RED: NUNCA ESCRIBIR LOS VALORES POR DEFECTO.
         Las capas 1 y 2 deberían bastar. Esta existe por el camino que todavía
         no vimos — como el que se descubrió el 24/10/2026: que guardar un
         PEDIDO también reescribe la configuración entera.
  
         La huella es inconfundible: «Mi Negocio» / 999000000 es lo que pone el
         código cuando no hay nada. Si la memoria tiene eso y la nube tiene un
         negocio real, esta escritura borraría etiquetas, recursos y la cuenta
         de Shalom. Se niega.
  
         Se eligió esta huella y no «no escribir si hay menos recursos que
         antes» porque esa otra regla impediría borrar el último recurso a
         propósito. Nadie llama «Mi Negocio» a su negocio: no da falsos
         positivos. Va ANTES de `_isSaving`, para no dejar esa marca puesta.
- L592: ★ Mejora 2: cerrar la ventana de carrera con _mergeRemote
- L593: ★ Guardado incremental: decidir qué shipments subir
- L594: Modo solo-config: si solo cambió config y no hay pedidos sucios pendientes,
- L595: no se sube ningún pedido (idsASubir = set vacío).
- L598: ★ "Nada marcado" ya NO significa "sube los 971". Si nadie marcó nada es
- L599: que nada cambió: sube solo config. El único que ordena subir todo es
- L600: _dirtyAll, que se enciende a propósito (arranque sin saber qué quedó
- L601: pendiente, respaldo restaurado, cambio masivo).
- L605: capturar antes de writes para que _S_TS coincida exactamente
- L607: Cada escritura lleva una `clave` para poder casar la respuesta de
- L608: Firestore con el documento exacto que la produjo.
- L610: ★ SOLO LO QUE CAMBIÓ, MEZCLADO CON LO DE LOS OTROS (06/11/2026).
           Antes cada guardado —hasta editar un pedido— reescribía etiquetas,
           recursos y mensajes desde la memoria de ESTE equipo. Un teléfono
           con la lista vieja borraba la etiqueta que acababas de crear en la
           PC. Ahora:
             · si la configuración no cambió aquí, no se sube (solo la hora);
             · si cambió, se lee la nube (1 lectura, solo al tocar Config o
               Recursos) y se mezcla elemento por elemento
               (mezclaConfig.js): lo tuyo y lo de ellos, nada pisado.
- L627: Lo que trajo el otro equipo también se ve aquí, ya.
- L635: usar saveTs fijo para que _S_TS y config.ts coincidan tras la escritura
- L637: La lista completa de lo que viaja en la configuración vive en
           `window._cfgProy` (más abajo): una sola fuente.
- L640: Incremental: subir solo los pedidos marcados como sucios (o todos)
- L644: Suppliers: incremental igual que los pedidos (suppsASubir=null → todos).
- L650: La pista dice la VERDAD de este guardado: si subió pedidos/proveedores.
- L654: Si alguna escritura de este guardado cayó al PATCH sin hora de
           cambio, se avisa en la pista: las otras PCs harán la carga completa
           en vez de quedarse sin ese cambio.
- L662: config es lo que fija el reloj compartido: solo si ENTRÓ se puede
- L663: adelantar _S_TS, o _poll recargaría creyendo que hay datos nuevos.
- L666: Lo que acaba de quedar en la nube es la nueva base.
- L669: Si la mezcla trajo algo de otro equipo, que se vea sin esperar.
           La capa de datos AVISA y la pantalla repinta (pantalla/inicio.js):
           datos no llama hacia arriba (Fase 7).
- L677: ★ El éxito parcial cuenta. Se descuenta lo que Firestore confirmó,
- L678: documento por documento. Antes la limpieza estaba toda al final: un
- L679: solo fallo dejaba sucios los 971 y el reintento los mandaba de nuevo.
- L686: Lo que falló queda marcado uno por uno y se apaga _dirtyAll: el
- L687: reintento manda ESOS documentos, no la lista entera otra vez.
- L699: Backup en localStorage con timestamp de último sync exitoso
- L701: ★ Éxito completo: limpiar el registro de sucios
- L710: re-lanzar para que _fbSaveWithRetry lo capture
- L712: ★ Mejora 2: liberar el candado pase lo que pase
- L721: Antes esto solo pintaba el punto rojo y se olvidaba del pedido: el
           cambio no estaba en la nube y tampoco quedaba marcado, así que nadie
           lo reintentaba nunca. Ahora queda sucio —y el registro de sucios
           sobrevive a cerrar la pestaña—, así que el siguiente guardado lo
           sube. Es la diferencia entre "falló" y "se perdió".
- L736: Escribe SOLO estos campos de un pedido (updateMask: lo demás no se
       toca). La usa la cola de fotos: cuando una foto pendiente por fin sube,
       se escribe su campo y nada más — no el pedido entero de esta PC, que
       podría estar desfasado respecto de otra.
- L745: Guardar un shipment individual inmediatamente (sin debounce)
- L749: Reintentos: si falla la subida (red intermitente), reintenta hasta 3 veces.
- L753: éxito
- L768: éxito
- L783: ── TRASH SUBCOLLECTION ────────────────────────────────────────────
- L791: ── FORM CONFIG SNAPSHOTS ──────────────────────────────────────────
- L796: Anotar un fallo. Deliberadamente distinto de todo lo demás: NO reintenta,
       NO marca nada como sucio y NO avisa si falla. Si el registro de errores
       tropieza, se calla — reintentarlo justo cuando algo va mal es la forma
       más rápida de convertir un fallo en una tormenta de escrituras. La
       política (topes, deduplicación, qué se guarda) vive en errores.js.
- L801: El estado de la puerta a Shalom. Devuelve null si el documento no existe
       todavía — y eso significa ABIERTA, no apagada: un archivo que nadie creó
       no puede dejar el negocio sin rastreo.
- L806: Encender o apagar a mano. NO toca la cuenta de fallos ni el descanso: eso
       es del motor, y escribirlo desde acá sería pisarle la mano al servidor.
- L808: El informe del último barrido. Solo se lee: lo escribe el servidor.
- L818: ── TOKENS ────────────────────────────────────────────────────────
- L828: Asignar el id desde _id si no está
- L832: ★ LINKS GENERADOS SIN BAJAR LA COLECCIÓN ENTERA (26/10/2026).
       Antes cada apertura de Compartir, cada 🔄 y cada vez que un cliente
       usaba un link se leían TODOS los tokens desde el primero. Ahora:
         · recientes  = por usar (used == false) + usados desde `desdeISO`;
         · anteriores = usados antes de `antesISO`, de `limite` en limite,
                        del más reciente al más viejo, a pedido.
       Filtros de un solo campo: Firestore ya tiene esos índices, no hay que
       crear nada. La lista completa (`_fbListToks`) sigue existiendo para
       «Cargar todo» y como respaldo si una consulta falla.
- L849: Un link usado ENTRE las dos consultas puede salir en las dos: uno solo.
- L862: Cursor = (usedAt, ruta) del último ya cargado: dos links usados en el
- L863: mismo milisegundo no se saltan ni se repiten.
- L874: ★ FASE 2 · SOLO LO QUE CAMBIÓ. Tres consultas pequeñas: pedidos,
       proveedores y lápidas con `_mts` posterior a `desde`.
- L888: La sincronización rápida se puede apagar EN ESTA PC (📦 → Sincronización),
       sin desplegar nada: entonces todo vuelve a la carga completa de siempre.
- L893: `opc.huboCambio`: el latido vio que la nube cambió. Si entonces la
       consulta no trae NADA, alguien escribió sin `_mts` (una pestaña con el
       panel viejo, o una escritura que cayó al PATCH): carga completa.
       `opc.completa`: «Sincronizar todo».
- L914: Novedad REAL (no lo repetido por el margen): pedidos o proveedores
               que no se tenían o con otra hora, más lápidas de algo que aún
               está aquí.
- L936: null SOLO cuando Firebase confirmó (con respuestas OK) que no hay nada
- L949: ★ propagar: un error NO es "Firebase vacío" — evita pisar la nube con local
- L954: Poll adaptativo: rápido mientras el usuario trabaja, lento en reposo (ahorra lecturas).
- L955: hubo actividad reciente
- L956: en reposo (sin toques por más de IDLE_MS)
- L957: 2 min sin interacción → reposo
- L971: formTs: escrito solo por Cloud Function o formulario — el panel nunca lo toca
- L974: ★ SI NUNCA SE CARGÓ, SE CARGA. El latido solo traía datos cuando
               la nube tenía algo MÁS NUEVO que lo de aquí. Pero si la carga
               inicial falló —sin sesión, sin red— `_S_TS` es la hora de
               arranque, la nube es más vieja que eso, y el latido NUNCA la
               traía: el panel se quedaba con lo del localStorage, o con los
               valores por defecto en un navegador nuevo. Para siempre.
- L986: registrar hasta qué ts se cargó
- L988: Refrescar lista de tokens si la pestaña Compartir está abierta
- L991: cambio remoto (cliente usó link) → forzar
- L997: Delay: backoff exponencial ante fallos; si hay conexión, adaptativo por actividad.
- L999: 5→10→20→40→máx 60s
- L1004: exponer para diagnóstico/pruebas
- L1008: Cualquier interacción del usuario cuenta como actividad → poll rápido.
- L1013: Pausar cuando la pestaña está oculta (ahorra lecturas)
- L1020: volver del fondo = actividad → poll rápido

## panel/datos/respaldo.js

- L1: panel/datos/respaldo.js — respaldo y restauración
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: respaldo.js — Módulo de Respaldo y Restauración para Total Tools
  
  OBJETIVO: respaldar y restaurar TODO el estado de la app (S) en un archivo
  JSON, para poder reconstruir el sistema exactamente como estaba.
  
  DEPENDENCIAS (globales que ya existen en index.html):
    - window.S        → el estado completo de la app
    - window.save     → persiste S en localStorage + Firebase
    - window.render / window.renderChips → refrescan la UI
    - window.toast    → notificación visual (opcional)
    - lsGet / lsSet   → acceso a localStorage (opcional, para fecha último respaldo)
  
  NO MODIFICA NADA EXISTENTE. Se auto-registra como window.Respaldo.
  Para desactivar: quitar <script src="respaldo.js"> del index.html
  
  Última actualización: 2026-06
- L26: Espacio de nombres global (declarado al inicio para poder colgar métodos)
- L30: Formato 2 desde el 24/10/2026: añade `recursos`, `agenciaOrigen` y
       `shalomInstancia`. Los respaldos de formato 1 —los que ya hay
       descargados— se siguen aceptando: les faltan esos campos y la
       restauración los deja como están, no los vacía.
- L35: fecha del último respaldo descargado
- L37: ── Utilidades ────────────────────────────────────────────────────
- L58: ── Construir el objeto de respaldo desde S ───────────────────────
- L59: Toma una "foto" completa del estado. Clona profundo para no enlazar
- L60: referencias con el S vivo.
- L81: ★ LO QUE FALTABA, y faltaba sin que nadie lo supiera. El documento de
           configuración tiene 13 campos y el respaldo guardaba 9: los recursos
           —tus enlaces a Drive— y la agencia de origen no estaban. El día que
           hiciera falta, el respaldo no los habría devuelto.
- L87: Se GUARDA para que quede constancia de qué cuenta se usaba, pero la
           restauración NO la aplica: ver `_aplicarRestauracion`.
           `shalomRegistroSimulacro` no se guarda en absoluto: es un interruptor
           de seguridad, no un dato del negocio.
- L93: Clon profundo para desligar del estado vivo
- L97: ── Validar integridad de un respaldo antes de restaurar ──────────
- L98: Devuelve {ok:true} o {ok:false, motivo:'...'}
- L104: Validar que cada pedido tenga al menos un id (estructura mínima)
- L114: ── 1. CREAR + DESCARGAR respaldo ─────────────────────────────────
- L129: Recordar fecha del último respaldo
- L139: ── 2. RESTAURAR respaldo desde archivo ───────────────────────────
- L140: Lee el archivo, valida, pide confirmación, crea respaldo de seguridad
- L141: del estado actual, y aplica.
- L145: ⚠️ NO SE RESTAURA ANTES DE QUE LA NUBE CONTESTE.
         Antes de sincronizar, `save()` queda en espera —eso está bien, es la
         guarda de la configuración—; pero cuando la nube llega, `_mergeRemote`
         reemplaza TODO con lo de la nube, y lo restaurado desaparece. Ni los
         pedidos se salvan: restaurar marca «subir todo», y el rescate del merge
         solo conserva los pedidos marcados uno a uno.
         Lo peor no era perderlo: era que el aviso ya había dicho «✅ Respaldo
         restaurado». Así que se espera, y se dice por qué.
- L167: Confirmación antes de restaurar (paso destructivo)
- L173: permitir volver a elegir el mismo archivo
- L179: ── Aplicar la restauración (tras confirmar) ──────────────────────
- L182: 5. Respaldo automático de seguridad del estado ACTUAL antes de pisar
- L186: si falla el de seguridad, igual seguimos pero avisamos
- L193: Restaurar cada sección (manteniendo relaciones tal cual estaban)
- L206: ★ LOS CAMPOS NUEVOS, SOLO SI EL RESPALDO LOS TRAE.
           Un respaldo de formato 1 no tiene `recursos`. Si aquí se hiciera
           `S.recursos = data.recursos || []`, restaurar uno de esos —de los que
           ya hay descargados— BORRARÍA los recursos actuales. «No existe» no es
           lo mismo que «está vacío»: lo que el respaldo no trae se deja como
           está; lo que trae vacío, se vacía. Es la misma bisagra que el DNI.
- L219: ⚠️ Y NUNCA LA CUENTA DE SHALOM NI EL SIMULACRO.
           · La cuenta ya se murió dos veces (3/10 y 11/10). Restaurar un
             respaldo de hace un mes pondría un id que ya no existe encima del
             que funciona, y el registro fallaría sin explicación. Se recupera
             sola pulsando «Conectar».
           · El simulacro es un interruptor de seguridad. Con él apagado,
             registrar un envío COBRA. Un respaldo viejo no puede tener poder
             para apagarlo.
- L232: Persistir (sube a Firebase como cambio completo) y refrescar UI
- L233: sin id → guardado completo
- L237: Cerrar overlay si está abierto
- L247: ── 6. Confirmación visual antes de restaurar ─────────────────────
- L249: Reutiliza el overlay genérico delOverlay si existe; si no, crea uno propio.
- L272: Fallback: confirm nativo
- L285: ── 4. Mostrar fecha del último respaldo en la UI ─────────────────
- L293: Exponer para que index pueda refrescar al abrir el modal
- L296: ── Restaurar el respaldo de seguridad pre-restauración ───────────
- L297: Por si el usuario restaura algo equivocado y quiere volver atrás.
- L309: Refrescar la fecha al cargar (si el elemento ya existe)

## panel/datos/storage.js

- L1: panel/datos/storage.js — subir archivos a Firebase Storage
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: storage.js — Firebase Storage para Total Tools
  ================================================
  Sube documentos (guía, embalado, ticket) a Firebase Storage
  en lugar de guardarlos como base64 en Firestore.
  
  Modo compatible:
    - Si doc.d empieza con "https://" → es URL de Storage (nuevo)
    - Si doc.d empieza con "data:"    → es base64 (legacy)
    - Si doc.d === "[img]"            → placeholder de Firebase
  
  Uso: agregar <script src="storage.js"></script> en index.html
  ANTES de config.js
- L22: ── CONFIG ────────────────────────────────────────────────────────
- L26: ── HELPERS ───────────────────────────────────────────────────────
- L28: Determina si un documento usa Storage URL o base64 legacy
- L43: Codifica el path para Firebase Storage REST API
  shipments/id_123/guia.jpg → shipments%2Fid_123%2Fguia.jpg
- L51: Obtiene la URL de descarga de un documento
  Compatible con base64 (devuelve el data: directamente)
  y con Storage URL (devuelve la URL)
- L63: ── UPLOAD ────────────────────────────────────────────────────────
- L65: Sube un archivo a Firebase Storage
  @param {File} file - archivo a subir
  @param {string} shipId - ID del shipment
  @param {string} slot - 'guia' | 'embalado' | 'ticket'
  @returns {Promise<{d: string, n: string, t: string, storage: true}>}
- L74: `carpeta` por defecto 'shipments' para no cambiarle nada a los ocho
       sitios que ya llamaban aquí. El centro de recursos pasa 'recursos'.
       ⚠️ Cada carpeta necesita su regla en `storage.rules`: lo que no esté
       declarado allí se deniega, y la subida fallaría con un 403 que parece
       un problema de sesión.
- L81: Determinar extensión
- L92: ★ PUERTA. Antes se llamaba a `_authEnsureToken()` IGNORANDO su respuesta
       y se subía con la cabecera puesta solo «si había token». Sin token la
       subida salía anónima, Storage respondía 403 — y como subir un documento
       ya cambia la etiqueta del pedido en memoria, quedabas con el pedido
       movido, sin archivo y sin un solo aviso. Ahora, sin sesión no se sube:
       se lanza con el motivo y quien llama decide qué decir.
- L101: lanza con .auth si no hay sesión
- L117: Construir download URL con token
- L132: Elimina un archivo de Firebase Storage
  @param {string} path - path del archivo en Storage
- L141: Misma puerta que al subir. Un borrado anónimo es un 403 silencioso:
         el archivo sigue ahí ocupando espacio y el panel cree que ya no está.
- L146: lanza con .auth si no hay sesión
- L155: ── INTEGRACIÓN CON loadDoc ───────────────────────────────────────
- L157: Versión mejorada de loadDoc que usa Storage cuando está disponible.
  Reemplaza la función loadDoc de config.js.
  
  Modo compatible:
  - Si el shipment tiene ID → sube a Storage
  - Si es nuevo pedido (sin ID aún) → usa base64 como antes
    (se migrará a Storage al guardar)
- L179: Obtener el ID del shipment en edición
- L183: Pedido nuevo — usar base64 como siempre (se sube al guardar)
- L188: Pedido existente — subir directo a Storage
- L193: Actualizar _docs con la URL de Storage
- L197: Refrescar UI
- L200: Confirmación de subida por slot
- L206: Subir un documento ya NO mueve la etiqueta: el estado lo cambias tú.
- L207: (Antes: boleta → EN PROCESO, embalado → ALISTADO, guía → ENVIADO.)
- L214: Fallback a base64
- L222: Al guardar un pedido NUEVO (sin ID previo), migra los docs base64 a Storage.
  Se llama desde saveShipment después de asignar el ID.
  @param {string} shipId - ID recién asignado
  @param {object} docs   - {guia, embalado, ticket}
  @returns {Promise<object>} docs actualizados con URLs de Storage
- L236: ya es Storage URL o null
- L239: Convertir base64 a File
- L251: Convierte un base64 data URL a File
- L263: ── PATCH saveShipment ────────────────────────────────────────────
- L274: Para pedidos NUEVOS: migrar base64 a Storage antes de guardar
- L278: Generar ID anticipado para poder subir a Storage
- L281: Migrar docs si hay base64
- L289: Actualizar _docs con las URLs de Storage
- L301: Llamar al saveShipment original
- L308: ── PATCH openViewer — soportar Storage URLs ──────────────────────
- L314: Si es Storage URL y es PDF → abrir en nueva pestaña
- L320: Si es Storage URL de imagen → mostrar en viewer
- L330: ── API PÚBLICA ───────────────────────────────────────────────────
- L341: Esperar a que config.js cargue sus funciones
- L344: ★ Ya NO se parchean loadDoc ni saveShipment (28/10/2026). Eran un
           segundo camino de subida, con su propio «si falla, base64» —que al
           guardar terminaba en «[img]», foto perdida— y un id anticipado
           distinto del que luego tomaba el pedido nuevo. El único camino es
           config.js _procesarDoc → fotos.js. Las funciones se conservan
           (uploadFile, deleteFile…) porque las usan fotos.js y otros.
- L364: Auto-init

## panel/pantalla/acciones.js

- L1: panel/pantalla/acciones.js — resaltar, pegar, copiar, dictado por voz y mensajes rápidos
  ===============================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: Resaltar (y centrar) una tarjeta por su id — se usa al crear un pedido nuevo
- L10: ══════════════════════════════════════════════════════════════════════
     LLÉVAME A ESE PEDIDO — la única puerta
     ══════════════════════════════════════════════════════════════════════
     ⚠️ EXISTE POR UN FALLO REAL (30 sep 2026): al guardar un pedido nuevo, el
     panel no saltaba a él ni lo resaltaba. Y la causa es fina.
  
     `config.js` hacía esto:
         setFilt(data.status);      // esperando que repinte
         _highlightCard(data.id);   // y buscaba la tarjeta en el DOM
  
     Pero `setFilt` tiene una optimización legítima: `if (v === _filt) return;`
     —tocar el chip que ya está activo no debe reconstruir 1200 tarjetas—. Si
     el filtro YA estaba en "NUEVO PEDIDO", que es lo normal tras crear dos
     pedidos seguidos, `setFilt` se salía por ahí y NO REPINTABA. La tarjeta
     nueva no llegaba al DOM, `querySelector` devolvía null, y el resaltado
     hacía `if(!c) return;`: se callaba. Ni scroll, ni resaltado, ni tarjeta.
  
     EL ERROR DE FONDO NO ES ESE `return`. Es que el camino de creación
     dependía de un EFECTO SECUNDARIO de `setFilt` en vez de pedir el
     repintado que necesitaba. Y había DOS caminos para lo mismo: el de
     `notify.js` (botón Ver) lo hacía bien desde hace meses. Ahora es uno.
  
     El repintado está GARANTIZADO porque `clearAdvSearch()` siempre llama a
     `render()`, pase lo que pase con el filtro. Esa es la pieza que al camino
     de creación le faltaba.
     ══════════════════════════════════════════════════════════════════════
- L41: 1 · Destrabar lo que pudiera esconderlo. La razón está escrita en el
       comentario original de notify.js: "antes podía quedar oculto por una
       búsqueda activa". Un pedido recién creado que no aparece porque hay
       texto en el buscador es el mismo fallo con otra cara.
- L50: 2 · Si el pedido ya no está, se dice y no se marca nada. Marcar un id
       que no existe dejaría el estado encendido para siempre, esperando a una
       tarjeta que no va a pintarse nunca.
- L60: 3 · Pedir la marca y el desplazamiento ANTES de cambiar de etiqueta.
       No se hace ninguna de las dos cosas aquí: se APUNTAN, y las hace el
       repintado cuando la lista definitiva ya está escrita. Esa inversión es
       todo el arreglo — antes esto buscaba la tarjeta a mano y la encontraba
       en la lista VIEJA, que el repintado estaba a punto de destruir.
- L69: 4 · Llevar a la etiqueta donde vive el pedido. El repintado que esto
       dispara es el que pinta la marca y hace el scroll, ya dentro de la
       lista corta: desplazarse entre 29 tarjetas cae donde debe; entre 1408,
       nunca caía bien.
- L74: `setFilt` no repinta si la etiqueta YA era esa. Entonces repinta esto,
       o la marca se quedaría apuntada y sin pintar.
- L78: 5 · Y se apaga sola. El apagado también es un repintado: la marca entra
       y sale por el mismo sitio por el que se dibuja.
- L85: fin irAlPedido
- L87: Barra de pegar WhatsApp: botón ✕ para limpiar lo pegado
- L91: Copiar el número de la tarjeta (iconito ⧉ al lado del número)
- L93: Con usuario de WhatsApp se copia tal cual (la arroba hace falta para
- L94: pegarlo en su buscador); con número, solo los dígitos, como siempre.
- L100: ── Dictado por voz para Guía + Código Shalom ─────────────────────────
     Reutiliza Web SpeechRecognition (es-PE). Guía = 8 dígitos (auto-salta al
     código al completar). Código = 4 caracteres (mejor esfuerzo + corregible).
     El micro solo se ve si el navegador soporta voz Y la guía está vacía.
- L105: instancia activa
- L106: 'guia' | 'codigo' | null
- L107: timer del salto automático guía → código
- L109: Motivo por el que el dictado no está disponible (para explicarlo claro en vez
- L110: de fallar callado). Solo Chrome/Edge de escritorio; Brave lo desactiva.
- L120: Siempre visible si el navegador soporta voz. (Antes se ocultaba al llenar la
- L121: guía, dejando la etapa 'código' sin mic visible → confuso.)
- L123: escuchando: el visual lo maneja _shalomMicVisual
- L129: Convierte palabras/frases dictadas a solo dígitos ("ocho dos cero" → 820)
- L136: Código: alfanumérico → mayúsculas sin espacios (mejor esfuerzo).
     Convierte también números dictados en palabra ("nueve" → 9).
- L139: Números en palabra + alfabeto fonético español (ej. "tres ka te te" → "3KTT").
- L140: Mejor esfuerzo y corregible a mano — dictar letras nunca es 100% fiable.
- L166: si ya está escuchando (o en el salto guía → código), el toque detiene
- L195: Guía completa → el micrófono SIGUE PRENDIDO y salta solo al código.
- L196: Se cierra esta sesión y se abre una NUEVA tras una pausa breve: así el
- L197: final de la frase de la guía no se cuela en el código (era el bug de
- L198: la transición directa). La guarda anti-leak de abajo es el segundo
- L199: cinturón. Tocar el mic durante la pausa cancela.
- L204: sigue en rojo: no hay que volver a encender
- L215: Guardia anti-leak: un código real es corto y alfanumérico. Si el
- L216: resultado trae 5+ dígitos seguidos o contiene la guía completa, es la
- L217: guía colándose → ignorar.
- L233: reflejar la etapa (guía/código) en el mic tras terminar
- L241: Ícono 🔄: CON selección → tracking Shalom de las seleccionadas; SIN selección → refrescar
- L249: QUICK MSG

## panel/pantalla/ayuda.js

- L1: panel/pantalla/ayuda.js — el contenido de la ayuda (📖) y Toby
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: ayuda.js — Módulo de Ayuda y Documentación centralizada para Total Tools
  
  OBJETIVO: que cualquier usuario entienda cómo funciona cada módulo sin
  depender de memoria ni capacitación. Toda la documentación vive aquí, en
  un solo lugar, y se muestra con el mismo formato visual del Manual Shalom.
  
  USO:
    Ayuda.abrir('envios')   → abre la ayuda del módulo "Envíos"
    Ayuda.abrir('config')   → abre la ayuda de "Configuración"
    ... etc. (ver claves en DOCS abajo)
  
  Para agregar/editar ayuda: solo edita el objeto DOCS. No hay que tocar
  ninguna pantalla — los botones 📖 Ayuda llaman a Ayuda.abrir('clave').
  
  DEPENDENCIAS: ninguna obligatoria. Usa document y (si existe) el estilo
  .trk-manual-step de tracking.js; si no está, inyecta su propio CSS.
  
  NO MODIFICA NADA EXISTENTE. Se auto-registra como window.Ayuda.
  Para desactivar: quitar <script src="ayuda.js"> del index.html
  
  Última actualización: 2026-10-30 (Toby en todas las ayudas; contenido al día)
- L36: ══════════════════════════════════════════════════════════════════
       DOCUMENTACIÓN CENTRALIZADA
       Cada entrada: { titulo, icono, toby, pasos:[], faq:[], tips:[] }
       - toby:  el consejo clave que Toby dice al abrir (si falta, el 1er tip)
       - pasos: lista numerada (círculos azules, como el Manual Shalom)
       - faq:   preguntas frecuentes [{q, a}]
       - tips:  recomendaciones (lista con viñeta)
       Usa <b>...</b> para resaltar.
    ══════════════════════════════════════════════════════════════════
- L345: ★ ESTA SECCIÓN EXISTE PARA VACIAR LA PANTALLA.
         El formulario del pedido llevaba cuatro explicaciones fijas —qué es la
         clave, que el origen vale para todos, que se comprueba lo guardado,
         que crear solo crea si no hay— y entre las cuatro ocupaban más que los
         campos. Una explicación se lee UNA vez; un dato se mira cada día. Lo
         que se lee una vez, aquí.
- L385: ══════════════════════════════════════════════════════════════════
       RENDERIZADO (mismo formato visual del Manual Shalom)
    ══════════════════════════════════════════════════════════════════
- L393: Permite <b> en los textos de DOCS pero escapa el resto
- L401: Si tracking.js ya definió .trk-manual-step, lo reutilizamos. Igual
- L402: definimos clases propias .ay-* por si este módulo va solo.
- L442: ── Registro de ayuda desde otros módulos ───────────────────────────
       Permite que cada módulo co-loque su propia documentación (junto a su
       código) y la registre aquí. Así la ayuda no se desactualiza: vive en el
       mismo archivo que la función. Ej. (en cotizacion.js):
          if(window.Ayuda) Ayuda.register('cotizacion', { titulo, icono, pasos, faq, tips, actualizado });
    ──────────────────────────────────────────────────────────────────────
- L453: ── Abrir la ayuda de un módulo ───────────────────────────────────
- L466: ★ TOBY (30/10/2026): saluda con el nombre del negocio y dice el
         consejo clave de ESTA sección. Sin lecturas: S ya está en memoria.
- L476: Pasos
- L484: FAQ
- L492: Tips
- L507: ── Utilidad: lista de módulos con ayuda disponible ───────────────

## panel/pantalla/dashboard.js

- L1: panel/pantalla/dashboard.js — métricas del negocio
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: dashboard.js — Panel de métricas Total Tools
  Activación: doble-tap en el nombre del negocio (hdrName)
  Lee S.shipments desde memoria — cero llamadas a Firebase
- L13: ── CSS ───────────────────────────────────────────────────────────
- L61: ── Overlay ───────────────────────────────────────────────────────
- L71: ── Helpers ───────────────────────────────────────────────────────
- L88: ── Barra CSS ─────────────────────────────────────────────────────
- L108: ── Cómputo de métricas ───────────────────────────────────────────
- L120: ── Contabilidad (estándar): Facturado = Cobrado + Por cobrar ──────────
- L121: monto = venta; adelanto = pagado a cuenta; cost = deuda (max(0,monto-adel)).
- L122: Finalizado = cobrado por completo. Pedidos viejos sin monto: cost = venta.
- L131: lo que aún se debe
- L132: viejos: cost=venta
- L142: Facturado (venta)
- L147: Cobrado (efectivo recibido): finalizado = venta completa; activo = adelanto
- L153: Por cobrar (CxC): solo activos con deuda. Aging por etapa.
- L161: Actividad temporal — usa createdAt si existe, si no date
- L169: Estado
- L175: Courier
- L179: Cliente (agrupa por teléfono)
- L187: Provincia
- L210: ── Render HTML ───────────────────────────────────────────────────
- L222: HEADER
- L231: RESUMEN FINANCIERO (contable): Facturado = Cobrado + Por cobrar
- L245: CUENTAS POR COBRAR (antigüedad / aging)
- L256: ACTIVIDAD TEMPORAL
- L267: PIPELINE POR ESTADO
- L273: POR COURIER
- L279: TOP 10 CLIENTES
- L294: TOP 10 PROVINCIAS
- L302: ALERTAS
- L313: ── API Pública ───────────────────────────────────────────────────

## panel/pantalla/escaner.js

- L1: panel/pantalla/escaner.js — escáner QR y lectura del ticket por foto
  ===========================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: QR SCANNER
- L15: Modo "cambiar etiqueta por QR": el escaneo mueve el pedido, no busca.
- L17: QR de Shalom (guía) — igual que siempre
- L19: ★ EL QR PEQUEÑO DEL PIE (`TTPED:<id>`): un pedido exacto, sin buscar.
       Lleva el id, no el número impreso, porque el id no se repite nunca.
       Se va a él igual que con «Ver»: su etiqueta, la marca y el scroll.
- L29: EL QR GRANDE: el celular, y la búsqueda de siempre (todos los pedidos de
       ese número). Desde el 27/10/2026 lleva SOLO el celular; las etiquetas
       impresas antes con «número#código» se siguen leyendo: se usa el tramo
       del número. Ese tramo puede ser un usuario de WhatsApp (@nombre): se
       acepta tal cual, ya viene en minúsculas desde el campo.
- L41: ═══════════════════════════════════════════════════════════════════════
     CAMBIO DE ETIQUETA POR QR — módulo autocontenido.
     • Se activa desde el acordeón del sheet "ordenar esta vista" (solo estados
       hasta ALISTADO) con la clave de cambio de etiqueta (openPin).
     • Escanear mueve el pedido al estado activo. SOLO AVANZA. Uno por uno.
     • SOLO con el QR PEQUEÑO del pie (`TTPED:<id>`, el pedido exacto). Desde
       el 27/10/2026 el QR grande lleva solo el celular, y un celular puede
       tener varios pedidos: mover «el que parezca» es cómo se cambia de
       etiqueta el paquete equivocado. El QR grande aquí no mueve: avisa.
     • Bajo la tarjeta movida aparece "de → a" + Revertir (efímero, solo la última).
     No toca la búsqueda normal ni el render fuera del modo.
     ═══════════════════════════════════════════════════════════════════════
- L53: last:{id,prev} (con tira) · shown:id (solo mostrar)
- L57: Auto-apagado por inactividad (1 min). Se rearma en cada escaneo y al activar.
- L67: hasta ALISTADO; si no existe, desactivado
- L101: Indicador persistente en la barra (junto al 🗑️): visible solo en modo escaneo.
- L109: Escaneo rechazado: NO deja ningún pedido en pantalla como si fuera el resultado
- L110: (limpia la tarjeta del escaneo anterior) y avisa por qué. Único punto de salida
- L111: para todos los casos que no mueven ni muestran.
- L118: Escaneo en modo mover: identifica el pedido, valida "solo avanzar", mueve y guarda.
- L120: uno por uno
- L121: hubo actividad: reinicia el minuto de inactividad
- L123: Solo el QR pequeño del pie: el pedido exacto por su id.
- L131: Ya está en ese estado: sin aviso ni tira, solo mostrar ese pedido (como una búsqueda).
- L141: Revertir (con confirmación, como borrar). Solo la última movida.
- L160: ── Escanear ticket Shalom por CÁMARA/FOTO → OCR → autollena orden + código ──
     El QR de Shalom no sigue un formato constante, así que leemos el TEXTO
     impreso ("NRO. ORDEN" + "CÓDIGO") con OCR (Tesseract.js, carga bajo demanda,
     charset 0-9A-Z para máxima precisión). Anclado a las etiquetas del ticket y
     SIEMPRE corregible a mano. Solo se usa aquí (admin), no en el formulario.
- L189: Preprocesa: escala a ~ancho útil + gris con contraste (mejora el ticket térmico).
- L204: Extrae orden (6-12 díg) y código (3-6 alfanum) del texto OCR, anclado a etiquetas.
- L225: cámara nativa (móvil) o foto (PC)
- L248: El token, no el id. Un pedido nuevo lleva 128 bits al azar; uno de ayer
       no tiene token y usa su id de siempre, así que su link ya enviado sigue
       abriendo. La regla vive en functions/enlaceSeguimiento.js — aquí no se
       copia, se llama.

## panel/pantalla/floatpanel.js

- L1: panel/pantalla/floatpanel.js — la barra flotante y el carrusel de etiquetas
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: floatpanel.js — Mini paneles flotantes para Total Tools (solo PC)
  Al hacer clic largo (500ms) en una etiqueta de estado o en el header de courier,
  se abre un panel flotante de solo lectura con esa vista filtrada.
  Se sincroniza automáticamente con window.S.
  Para desactivar: quitar <script src="floatpanel.js"> del index.html
- L15: Solo en PC con mouse
- L18: paneles activos
- L21: ── CSS ───────────────────────────────────────────────────────────
- L175: ── CREAR PANEL ───────────────────────────────────────────────────
- L179: Posición inicial — derecha del panel principal o donde haya espacio
- L186: Intentar poner a la derecha
- L218: Arrastre desde cualquier parte excepto botones y el body scrolleable
- L221: Resize
- L224: Render inicial
- L227: Focus al crear
- L235: ── RENDER CONTENIDO ─────────────────────────────────────────────
- L266: ── CERRAR PANEL ─────────────────────────────────────────────────
- L280: ── DRAG ─────────────────────────────────────────────────────────
- L285: No arrastrar si el clic fue en el body (scroll), botón, o resize handle
- L310: ── LONG PRESS EN CHIPS ───────────────────────────────────────────
- L328: Limpiar emojis del label para comparar con S.shipments
- L330: Buscar el label real en allStatuses
- L337: Fallback: buscar en FIXED_LABELS
- L345: Verificar que no existe ya un panel con este label
- L348: Si ya existe, traer al frente
- L357: Hint primera vez
- L366: 600ms de clic sostenido
- L378: Solo cancelar si se movió más de 8px
- L386: ── SYNC CON WINDOW.S ────────────────────────────────────────────
- L387: Cada vez que render() se llama, actualizar todos los paneles
- L390: Intentar hookear render() — puede no existir aún, reintentar
- L403: ── HELPER ───────────────────────────────────────────────────────
- L411: ── RESIZE DESDE BORDES ──────────────────────────────────────────
- L413: px de margen para detectar borde
- L415: 'se','s','e','sw','w','ne','n','nw'
- L452: dejar que el drag maneje el movimiento
- L485: ── API PÚBLICA ───────────────────────────────────────────────────
- L493: ── INIT ─────────────────────────────────────────────────────────
- L499: Hint de uso si es primera visita en PC
- L508: ── CARRUSEL DE ETIQUETAS · las flechas ‹ › ─────────────────────────
       Las flechas avanzaban 120 px fijos. Las etiquetas miden desde "TODOS"
       (~60 px) hasta "RECLAMOS, DEVOLUCIONES, GARANT" (~230 px), así que ese
       salto no tenía relación con dónde empieza o acaba ninguna: a veces
       pasaba casi dos y a veces dejaba media cortada.
  
       Ahora la flecha va a la etiqueta SIGUIENTE: se miden dónde empiezan y
       se salta a la primera que esté más allá de donde estás.
  
       POR QUÉ NO `::scroll-button()` (2026-09): existe, hace esto sin una
       línea de JavaScript y es lo que recomiendan los artículos de este año,
       pero solo funciona en Chrome/Edge 135+ — no es Baseline. En los
       navegadores sin soporte las flechas simplemente no existirían y nadie
       sabría por qué. Cuando sea Baseline, esto se puede borrar casi entero.
       Lo que sí se usa es la mitad universal: CSS Scroll Snap (panel.css).
- L523: ── CARRUSEL DE ETIQUETAS · las flechas ‹ › ─────────────────────────
       Las flechas CAMBIAN LA ETIQUETA ACTIVA, una por toque — no desplazan la
       fila. Desplazar era un botón caro para algo que el dedo ya hace; en
       cambio "etiqueta anterior / siguiente" no tenía atajo: había que buscar
       el chip con la vista y apuntarle. La fila se mueve igual, pero como
       consecuencia (`verActivo` trae el chip activo a la vista).
  
       Quién decide a qué etiqueta ir vive en index.html (`navFiltro`,
       `filtroPuedeIr`): ahí están `_filt` y `S.labels`. Este archivo solo pone
       los botones y los muestra u oculta.
  
       Antes las flechas movían 120 px fijos. Las etiquetas miden de ~60 px
       ("TODOS") a ~230 px ("RECLAMOS, DEVOLUCIONES, GARANT"), así que ese
       salto dejaba medias etiquetas cortadas en el borde.
  
       Del CSS se conserva Scroll Snap (panel.css), que alinea el deslizamiento
       con el dedo. Se descartó `::scroll-button()` —hace esto sin JavaScript—
       porque en 2026-09 solo funciona en Chrome/Edge 135+ y no es Baseline:
       donde no hubiera soporte, las flechas no existirían y nadie sabría por
       qué. Ver docs/ARQUITECTURA.md.
- L546: no duplicar flechas
- L550: Envoltura propia para el carrusel. Antes las flechas se posicionaban
         sobre TODA la fila, y la izquierda tapaba los ~25 px iniciales del
         chip TODOS: ahí dejaba de responder al toque. Ahora `left:0` es el
         borde del carrusel, no el de la fila.
- L577: Cada flecha se ve si hay etiqueta hacia ese lado — no según si se
         puede desplazar, que es lo que miraban antes. En TODOS no hay ‹; en la
         última etiqueta no hay ›.
- L593: Cuando cambian las etiquetas —agregar una en Config, o cualquier
         renderChips()— hay que rehacer las cuentas. `navFiltro` ya avisa
         directo; esto cubre los demás caminos.
- L599: navegador viejo: quedan resize y el aviso de navFiltro
- L601: La rueda del ratón sigue desplazando la fila (sin cambiar el filtro).
- L616: Trae el chip activo a la vista si se quedó fuera. Mueve SOLO el
         carrusel: `scrollIntoView` habría podido desplazar la página entera
         hacia arriba o abajo, que no es lo que nadie pidió.
- L626: ya se ve entera: no se mueve nada
- L651: Lo reemplaza _fixChipsScroll al montarse; los huecos evitan que quien
       llame antes de tiempo se encuentre con un undefined.

## panel/pantalla/iconos.js

- L1: Lucide (ISC) https://lucide.dev

## panel/pantalla/inicio.js

- L1: panel/pantalla/inicio.js — encabezado del negocio y ARRANQUE del panel
  =============================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: El encabezado del negocio. Se pintaba UNA sola vez al arrancar, así que en
     un navegador sin respaldo local se quedaba en "Mi Negocio / 999000000" —los
     valores por defecto— aunque los de verdad llegaran de la nube un segundo
     después. Ahora es una función y la llama también el latido.
- L21: ★ LA PANTALLA ESCUCHA A LA CAPA DE DATOS (Fase 7). datos/estado.js ya no
     pinta: avisa, y aquí se hace exactamente lo que antes hacía allí. Se
     registra ANTES del arranque de la nube, y lo que se avisó antes de este
     punto (estaba en cola) se entrega ahora.
- L27: El nombre y el teléfono del negocio también vienen de la nube.
- L42: ★ ARRANQUE DE LA NUBE — aquí y no en estado.js (Fase 3). Arranca una
     carga asíncrona que, al volver, pinta con la lista, las pestañas y el
     estado: cuando todo eso vivía en UN script, existía desde el primer
     instante. Partido en módulos, arrancar en estado.js dejaría una carrera
     (la respuesta llegando antes que lista.js). Aquí ya están todos los del
     panel. Los de Config (panel/configuracion.js y compañía) cargan después,
     exactamente igual que cuando eran config.js: el código los llama con
     `typeof … === 'function'`.
- L54: Fallback: try after short delay
- L58: ★ Fase 8: si la copia local está en IndexedDB (localStorage se llenó), se
     lee ANTES de pedir a la nube: con copia, la nube manda solo lo que cambió.
     Si no hay copia o falla, se arranca igual que siempre.
- L73: La capa de datos avisa que la configuración trajo cambios de otro equipo
     (panel/datos/nube.js): aquí se repinta lo que está a la vista.
- L83: INIT
- L87: DASHBOARD — doble-tap en nombre del negocio

## panel/pantalla/lista.js

- L1: panel/pantalla/lista.js — la lista de envíos: estadísticas, búsqueda, chips, tarjetas y selección
  ========================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: STATS
- L83: UNA pasada sobre los pedidos, no una por etiqueta. Antes esto recorría
- L84: los 1039 pedidos once veces (una por etiqueta) para contar y sumar.
- L96: Solo estados ACTIVOS (antes de FINALIZADO) muestran deuda. Finalizado y
- L97: lo que va después → como antes (solo el conteo). Monto centrado; conteo
- L98: a la derecha (su posición de siempre).
- L112: ⚡ SINCRONIZACIÓN (Fase 2) — estado y controles en 📦.
- L136: ADVANCED SEARCH
- L137: `campo`: qué fecha mira el rango — 'envio' (como siempre) o 'registro'.
- L160: ¿«Hoy» está puesto? Registro, y Desde = Hasta = hoy en Lima. No es un
     modo escondido: se deduce de lo que se ve en los campos.
- L203: BULK STATUS CHANGE
- L219: Marcar como sucio solo cada pedido cambiado (no reescribir los ~170).
- L229: ya estaba vacío: nada que repintar
- L231: que no llegue después el render del freno
- L235: FILTER CHIPS
- L237: per-label sort: {label: 'courier_date'|'date'|'name'|'cost'}
- L251: Si la etiqueta activa quedó fuera del carrusel —al elegirla desde el
- L252: listado completo, por ejemplo— se trae a la vista. Solo mueve el
- L253: carrusel, nunca la página.
- L256: «🏷️ SIN ETIQUETA» solo aparece cuando hay pedidos así: borrar una
     etiqueta no borra sus pedidos, los deja aquí hasta que los muevas.
- L264: Cambiar a otro estado apaga el modo "cambiar etiqueta por QR".
- L266: Tocar el chip que YA está activo no cambia nada: no hay por qué
- L267: reconstruir la lista. Es lo que hacía que el doble clic en TODOS
- L268: costara dos reconstrucciones antes de abrir el listado de etiquetas.
- L273: ══════════════════════════════════════════════════════════════════════
     NAVEGAR ENTRE ETIQUETAS con las flechas ‹ › del carrusel
     ══════════════════════════════════════════════════════════════════════
     Las flechas ya no desplazan la fila: cambian la etiqueta activa, una por
     toque. Desplazarla era un botón caro para algo que el dedo ya hace; en
     cambio "etiqueta anterior / siguiente" no tenía atajo — había que buscar
     el chip con la vista y apuntarle. La fila se mueve igual, pero como
     CONSECUENCIA: renderChips() trae el chip activo a la vista.
  
     El recorrido vive ACÁ y no en floatpanel.js a propósito: `_filt` y
     `S.labels` son de este archivo. Que el carrusel tuviera que alcanzar un
     `let` de otro script para decidir sería el tipo de acoplamiento que se
     rompe en silencio (ver la comprobación de window.X en el CI).
  
     TODOS es la primera posición: es el filtro vacío.
- L290: ¿Hay etiqueta hacia ese lado? Lo usa el carrusel para mostrar u ocultar
     cada flecha. Sin dar la vuelta: de la última no se salta a TODOS. El chip
     TODOS está siempre visible y a un toque, así que dar once vueltas para
     volver no aporta — y que la flecha desaparezca es la señal más clara de
     que llegaste al final.
- L297: etiqueta borrada en Config
- L309: Mismo apagado del modo "cambiar etiqueta por QR" que setFilt.
- L312: Los chips, al instante: son 12 elementos y es la respuesta que esperas
- L313: ver al tocar. La LISTA espera a que dejes de presionar — ir de TODOS a
- L314: ENVIADO son cinco toques, y montar cinco listas de las que solo miras
- L315: la última es trabajo tirado. Importa sobre todo al pasar de largo por
- L316: FINALIZADO, que son 924 tarjetas.
- L324: Abrir el sheet de OTRO estado también apaga el modo (evita confusión).
- L344: RENDER
- L345: Fuente ÚNICA de verdad de "qué envíos se están mostrando": aplica la
     etiqueta activa (_filt), la búsqueda y los filtros avanzados. La usan
     render() (lo que se pinta) y selAll() (lo que se selecciona), para que
     nunca se desincronicen. No ordena (el orden es solo visual).
- L349: ¿Está la vista mostrando SOLO los activos?
     TODOS quiere decir "lo que tengo entre manos", no "todo lo que existió".
     924 de 1040 pedidos están FINALIZADO: mostrarlos en la vista de trabajo
     son 9 veces más tarjetas para ver 9 veces menos de lo que importa.
  
     LA EXCEPCIÓN, y es la que hace que esto funcione: BUSCAR BUSCA EN TODO.
     Consultar un pedido viejo por teléfono es justo para lo que se usa la
     lupa; si la búsqueda respetara el filtro, buscar dejaría de encontrar
     precisamente lo que se busca. En cuanto hay texto —o filtros avanzados—
     los finalizados vuelven a entrar.
- L369: El N° de factura/boleta entra con su propia regla: «f001 123» encuentra F001-123.
- L388: ══════════════════════════════════════════════════════════════════════
     REPINTAR — una sola puerta
     ══════════════════════════════════════════════════════════════════════
     `render()` reconstruye TODAS las tarjetas. Con 1039 pedidos son ~37 400
     elementos (36 por tarjeta) que el navegador tiene que parsear, estilar y
     maquetar. Es la operación más cara del panel, y hay 87 sitios que la
     llaman — muchos en cadena: `save(); render();` y dos líneas después otro
     `render()`. Cada eslabón pagaba el precio completo.
  
     El caso que lo delató: el chip TODOS lleva `onclick` Y `ondblclick`. El
     navegador dispara click, click, dblclick — así que abrir el listado de
     etiquetas costaba DOS reconstrucciones completas antes de que el modal
     apareciera.
  
     Ahora `render()` no pinta: apunta. Todas las llamadas del mismo tick se
     juntan en una sola pasada en el siguiente frame. Los 87 sitios quedan
     arreglados sin tocar ninguno, y los que se escriban mañana también.
  
     `renderYa()` existe para el caso raro que necesite el DOM al instante.
     Hoy no lo usa nadie: se revisaron las 87 llamadas y ninguna lee el DOM
     inmediatamente después.
- L411: ★ EL ESTADO DE «QUÉ PEDIDO ESTÁ MARCADO», fuera del DOM.
     Vive aquí y no en una clase pegada a un elemento porque esta lista se
     reconstruye entera en cada repintado: lo que se pega, se borra.
  
     Y se declara AQUÍ, antes de `_renderAhora` y de `cardHTML`, que son
     quienes lo leen. Con `let` hay zona muerta temporal: declararlo más abajo
     —junto a `irAlPedido`, que es donde se escribe— funcionaría de milagro,
     solo porque nadie pinta durante la carga. Un milagro no es una garantía.
- L430: Vigilante "llegó a destino" (agnóstico al motor A/B). Avisa por transición
- L431: de estado; hook explícito, sin monkey-patch. Idempotente (avisa una vez).
- L434: Resaltar en azul el botón "seleccionar todo" si hay algún pedido
- L435: seleccionado. Va con guarda A PROPÓSITO: es cosmético, y que un botón sin
- L436: colorear impida ver los 1044 pedidos sería absurdo. Es literalmente lo que
- L437: pasaba — un ReferenceError aquí abortaba _renderAhora entero.
- L439: etiqueta + búsqueda + avanzados (fuente única)
- L441: Ordenar por fecha de registro — más reciente primero
- L448: Ordenamiento (los filtros avanzados ya se aplicaron en visibleShipments)
- L450: Con «Fecha de registro», más reciente/antiguo es por CUÁNDO ENTRÓ (con
- L451: hora, no solo el día). Con «Fecha de envío», como siempre.
- L460: Default sort: by courier then by date
- L468: Modo escaneo: tras escanear, la lista muestra SOLO ese pedido (movido o ya-en-estado).
- L469: Al salir del modo o revertir (shown=null) vuelve la lista completa.
- L487: Los finalizados escondidos se ANUNCIAN. Una lista que oculta cosas sin
- L488: decirlo se siente rota; con el número delante y un toque para llegar a
- L489: ellos, es una decisión visible.
- L506: ★ Y EL SCROLL, DESPUÉS DE PINTAR. Antes se hacía antes, desde
       `irAlPedido`, sobre la lista vieja: se desplazaba dentro de TODOS y
       justo después la lista se reemplazaba por la de otra etiqueta, así que
       la posición acababa apuntando a cualquier otra tarjeta.
       Aquí la tarjeta existe con certeza —se acaba de escribir en la línea de
       arriba— y la lista es la definitiva. No hay nada que esperar ni que
       reintentar.
- L524: Sanitización XSS: datos de pedidos vienen del formulario público
- L526: Escape para strings dentro de onclick='...(' (comillas simples / backslash)
- L529: ── Encabezado de courier: icono, seleccionar, imprimir, scroll por tarjeta ──
- L530: Icono según el courier (reusa el criterio del formulario).
- L542: Imprimir SOLO lo seleccionado de ese courier (contrato único, como el resto de
- L543: la app: imprimir = lo seleccionado). Si no hay ninguno seleccionado en ese
- L544: courier, NO imprime nada y guía con un aviso (evita el "imprime todo" que
- L545: confundía y también el no-op silencioso). Reusa PrintModule.openList.
- L549: DELIVERY: imprimir las etiquetas en el MISMO orden que la ruta (fuente única).
- L556: ★ LO FIJO ARRIBA — UNA sola medida (30/10/2026): barra superior + pestañas
     «Envíos · Compartir · Config» (fijas desde el 26/10) + el encabezado del
     courier de esa tarjeta. Antes ▲▼ no contaba las pestañas y la tarjeta
     quedaba ESCONDIDA debajo de ellas (se veía la dirección, no el nombre), y
     al volver a tocar creía seguir en la misma. Medido en vivo, sin píxeles
     fijos: rotar, teclado o una barra más alta no lo descuadran.
- L566: El encabezado del courier se pega en SU «top» del CSS (= barra + pestañas):
- L567: su borde de abajo, ya pegado, es donde termina todo lo fijo. Así la cuenta
- L568: es la misma que usa el navegador para pegarlo (una sola verdad).
- L572: Desplazar UNA tarjeta a la vez (▼ siguiente, ▲ anterior), dejándola justo
- L573: debajo de todo lo fijo (con su nombre visible).
- L577: «Tarjeta actual» = la de top más cercano a la línea bajo lo fijo.
- L588: El monto de la tarjeta. Pedidos de hoy en adelante: la regla única de
     functions/montoPedido.js (debe · S/ 0.00 · tachado si pagó, redondeado).
     Pedidos de antes: EXACTAMENTE lo de siempre — el dueño pidió no cambiarle
     la cara a los de ayer.
- L599: 🖨️ de la tarjeta: imprime SOLO este pedido (el mismo panel de impresión
     de siempre, vía PrintModule.openOne, sin tocar la selección). Círculo
     con borde azul si ya se imprimió; sin color si no. La respuesta a «¿se
     imprimió?» es una sola: PrintModule.impreso.
- L612: ★ LA MARCA SE DIBUJA CON LA TARJETA, no se pega encima.
       Antes `irAlPedido` hacía `c.classList.add(...)` sobre el elemento que
       encontraba. Pero esta lista se reconstruye ENTERA en cada repintado
       —`area.innerHTML = …`— así que cualquier cosa que repintara borraba la
       marca: una sincronización de la nube, un pedido nuevo, o el propio
       cambio de filtro que `irAlPedido` acababa de pedir.
  
       Ese último caso es el que veía el dueño: estando en TODOS, la tarjeta
       YA estaba en pantalla, se marcaba al instante, y medio segundo después
       el repintado la destruía. Desde otra etiqueta funcionaba porque la
       tarjeta NO estaba y había que esperar al repintado — encontrarla
       demasiado pronto era peor que no encontrarla.
  
       Ahora la marca es ESTADO, y el repintado la vuelve a pintar. Sobrevive
       a cuantos repintados hagan falta, que es lo que no podía hacer una
       clase puesta a mano.
- L669: Bloque MOTORIZADO en la tarjeta — mismo patrón/CSS que el bloque de Tracking
     Shalom (.trk-block), pero para DELIVERY. Solo aparece si hay motorizado; se
     edita en el ✏️ del pedido, como la guía Shalom.
- L689: La miniatura de un documento en la tarjeta. ★ La versión LIVIANA (`m`,
     ~20 KB) si existe, y `loading="lazy"`: solo se descarga lo que está en
     pantalla. Antes cada tarjeta bajaba la foto original de 3–8 MB para
     enseñarla en 52×66 px, todas a la vez — por eso a veces no se pintaban.
     Las fotos de antes (sin miniatura) siguen saliendo, también diferidas.
     Una foto pendiente de subir enseña ⏳ (su vista previa es local).
- L726: SELECT
- L727: La selección es estado EFÍMERO de UI: se guarda solo en local, nunca en
- L728: Firestore. Antes, save() sin id reescribía los ~170 pedidos por cada click
- L729: de checkbox (causa del pico de escrituras). saveLocal() no toca Firestore.
- L731: Marcar una casilla NO cambia la lista: cambia una casilla. Antes esto
     llamaba a saveLocal() + render(), es decir, serializaba el estado completo
     (~0,7 MB con 1039 pedidos) y reconstruía las ~1039 tarjetas con innerHTML.
     Por un clic. Ahora Seleccion pinta esa casilla y el botón de "todos", y
     nada más se mueve.
- L738: DESELECCIONAR es GLOBAL: si hay CUALQUIER selección (en esta etiqueta o en
- L739: otra), un toque limpia TODO, sin importar dónde se marcó. SELECCIONAR es
- L740: contextual: solo si no hay nada seleccionado en ningún lado, marca lo
- L741: VISIBLE de la etiqueta actual.
- L744: Sin render(): Seleccion repinta las casillas que hay en pantalla. Con 1039
- L745: pedidos, render() rehace ~50 000 nodos; esto toca una clase por tarjeta.
- L748: Buscar: se espera a que dejes de escribir.
     Cada render() con TODOS reconstruye ~1039 tarjetas (~50 000 nodos) y obliga
     al navegador a recalcular el layout entero. Atado a `oninput` sin freno, eso
     pasaba una vez POR TECLA: escribir "mariano" eran siete reconstrucciones
     completas, y por eso la lupa se sentía trabada. 150 ms es el punto en que ya
     no se acumulan pulsaciones y todavía se siente inmediato.
- L760: DOC TOGGLE

## panel/pantalla/navegacion.js

- L1: panel/pantalla/navegacion.js — avisos, velo de «sincronizando», pestañas y ventanas
  ==========================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: TOAST
- L12: ★ CAPA 2 · CONFIG Y RECURSOS NO SE TOCAN HASTA QUE LLEGUE LA NUBE.
     Lo que se edita en un pedido antes de sincronizar se puede rescatar
     —queda marcado como sucio y `_mergeRemote` lo conserva—. Lo que se edita
     en la CONFIGURACIÓN no: al llegar la nube, `_mergeRemote` la reemplaza
     entera. Aplazar esos cambios sería perderlos en silencio.
  
     Así que en vez de dejarte editar algo que se va a perder, estas dos
     pantallas dicen «sincronizando» y no se pueden tocar. Un solo punto de
     entrada —esta función—, no una guarda en cada una de las cuarenta que
     escriben en la configuración: una que se olvide es un agujero.
- L52: Al llegar la nube: quitar el velo y REPINTAR. Sin repintar, Config seguía
     mostrando lo dibujado antes de sincronizar —las 8 etiquetas fijas— y las
     tuyas solo aparecían si añadías una para forzarlo. El 21/10/2026 pasó
     exactamente eso.
- L64: TABS
- L72: Se repinta al ENTRAR: si cambiaste los couriers en Config, aparecen.
- L74: Recursos no tiene pestaña a propósito: cuatro no entran en un teléfono
       de 360 px sin que "Config" quede en "Confi…". Se entra por el 📚 de la
       cabecera y se sale tocando cualquier pestaña — el bucle de arriba no
       enciende ninguna, que es lo correcto: no estás en ninguna de las tres.
- L82: OVERLAYS
- L87: Modal de envío: si hay datos sin guardar, no cerrar al clic-fuera; solo
- L88: Guardar/Cancelar cierran. Si está limpio, cierra normal.
- L96: HELPERS

## panel/pantalla/seleccion.js

- L1: panel/pantalla/seleccion.js — qué pedidos están marcados en ESTE dispositivo
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: seleccion.js — Qué pedidos están marcados, en ESTE dispositivo
  ==============================================================
  Un solo dueño de la selección, igual que shalom.js lo es del rastreo.
  
  POR QUÉ EXISTE ESTE ARCHIVO
  Antes la selección era un campo del pedido (`ship.sel`). Parece inofensivo y
  no lo es: el pedido es la cosa que se sincroniza. `slimShipment` copia el
  pedido entero al subirlo, así que `sel` viajaba de acarreo a Firestore en
  cualquier guardado; y `_mergeRemote` reemplaza los pedidos con los remotos
  cada 5 segundos sin conservar `sel`. Resultado: desmarcabas algo y cinco
  segundos después volvía solo, o te aparecía marcado lo que marcó otro
  vendedor en su pantalla.
  
  Y no era solo molesto. `delSelected` leía la selección DOS VECES —una al
  abrir el aviso y otra al confirmar— y entre las dos cabía un latido: podía
  desaparecer de la pantalla un pedido que nunca entró a la papelera ni se
  borró de Firestore.
  
  LA REGLA, para cualquier dato que venga después:
    ¿de esto depende un cliente o un pedido?  → va compartido, en Firestore
    ¿solo cambia lo que ves TÚ en tu pantalla? → va local, como esto
  
  La selección es lo segundo: es efímera, es tuya, y muere al recargar.
  
  A PROPÓSITO NO SE GUARDA en localStorage. Marcar 60 pedidos obligaba a
  serializar el estado completo (~0,7 MB con 1039 pedidos) en cada clic. Y
  tampoco tiene sentido: si recargas la página, esa selección ya no describe
  nada que estuvieras haciendo.
- L40: Los pedidos vivos, sea cual sea la fuente. Se lee al vuelo (y no se
       guarda) porque _mergeRemote reemplaza el array entero cada pocos
       segundos: una referencia guardada quedaría apuntando a fantasmas.
- L55: Los ids marcados QUE TODAVÍA EXISTEN. Un pedido borrado (acá o en otro
         dispositivo) deja de contar sin que nadie tenga que acordarse de
         limpiarlo: el olvido es lo que produce borrados fantasma.
- L69: Los pedidos marcados, en el orden en que están en el panel.
- L104: ── Pintado: se toca el DOM que cambió, no se rehace la lista ──────────
         Volver a montar las tarjetas con innerHTML obliga al navegador a
         reconstruir ~50 nodos por tarjeta (unos 50 000 con 1039 pedidos) y a
         recalcular el layout entero. Marcar una casilla no cambia la LISTA:
         cambia una casilla. Así que se cambia una clase y un carácter.
- L113: fuera del filtro actual: se pintará al renderizar
- L142: Limpia el `sel` que quedó guardado dentro de los pedidos viejos.
         Solo en memoria: NO se reescriben los documentos de Firestore. Ese
         campo es inerte —ya nadie lo lee— y borrarlo de verdad costaría
         reescribir un millar de documentos de golpe, que es exactamente la
         tanda que deja el indicador de Firebase en rojo. Se limpia en memoria
         para que no vuelva a subir de acarreo.

## panel/pantalla/voz.js

- L1: panel/pantalla/voz.js — comandos por voz
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: voz.js — Asistente de voz "Jarvy" (Fase 1: push-to-talk)
     ────────────────────────────────────────────────────────────────────────
     AISLADO: no toca Shalom, delivery, tracking ni la lógica del panel.
     Solo LEE el estado local `window.S` (ya está en memoria) y, cuando hay una
     ACCIÓN, llama funciones que YA existen en index.html (save, render, waOpen).
  
     CERO lecturas a Firebase: todas las consultas (buscar, contar, estado) se
     resuelven sobre window.S en memoria. La ÚNICA escritura a Firebase ocurre al
     cambiar una etiqueta, y usa save(idPedido) → sube SOLO ese pedido.
  
     Push-to-talk: el micrófono NO queda encendido. Tocas el botón, escucha UNA
     frase, ejecuta y se apaga. Sin polling, sin MutationObserver, sin mic activo.
     ────────────────────────────────────────────────────────────────────────
- L21: ── Configuración rápida ────────────────────────────────────────────────
- L22: idioma del reconocimiento de voz
- L23: false = solo avanzar/retroceder 1 paso (SEGURO).
- L24: true  = permite saltar a cualquier etiqueta.
- L25: true = Jarvy responde por voz (síntesis)
- L27: ── Helpers seguros hacia el panel (nunca lanzan) ───────────────────────
- L35: normaliza: minúsculas y sin acentos (para comparar nombres y etiquetas)
- L39: ── Voz de salida ───────────────────────────────────────────────────────
- L53: ── Búsqueda de pedidos por nombre (substring, sin acentos) ─────────────
- L60: ── Resolver etiqueta hablada → etiqueta real del sistema ───────────────
- L73: 1) match exacto contra etiquetas reales (incluye personalizadas)
- L75: 2) alias hablados comunes
- L77: 3) match parcial contra etiquetas reales
- L82: ── ACCIÓN: cambiar etiqueta (con guardia de 1 paso, igual que el panel) ─
- L109: Aplicar — mismo patrón que applyStatus() del panel: incremental
- L112: ← SOLO este pedido sube a Firebase
- L117: ── CONSULTA: contar por etiqueta (cero Firebase) ───────────────────────
- L134: ── CONSULTA: estado de un pedido (cero Firebase) ───────────────────────
- L142: ── CONSULTA: buscar (llena el buscador del panel, cero Firebase) ───────
- L149: ── ACCIÓN: abrir WhatsApp del pedido (usa waOpen existente) ────────────
- L160: ── ACCIÓN: abrir el formulario de nuevo pedido (el botón +) ────────────
- L166: ── Ayuda hablada ───────────────────────────────────────────────────────
- L172: ── Frases personalizadas (se guardan en el dispositivo, cero Firebase) ─
- L186: Ejecuta una acción YA programada. capturado = lo que sigue a tu frase;
- L187: argFijo = el dato fijo que configuraste (opcional).
- L196: argFijo = etiqueta destino
- L203: ¿El texto hablado coincide con alguna frase personalizada?
- L216: ── Interpretar el texto reconocido → comando ───────────────────────────
- L221: 1º) Frases personalizadas (tienen prioridad sobre los comandos base)
- L224: Cambiar etiqueta: "marca a juan como enviado" / "cambia a juan a enviado" / "pon a juan en enviado"
- L228: Estado de X
- L232: Cuántos X
- L236: WhatsApp a X
- L240: Buscar X
- L244: Nuevo pedido (abre el formulario, igual que el botón +)
- L249: Ayuda
- L255: ── Motor de reconocimiento (push-to-talk) ──────────────────────────────
- L264: una sola frase, luego se apaga
- L270: ── Indicador de estado: grabando vs inactivo ──────────────────────────
- L271: Al grabar, el botón pasa a 🔴 y parpadea. Al terminar vuelve a 🎤.
- L282: Motivo por el que el dictado no está disponible (navegador). Se explica
- L283: claro en vez de fallar en silencio. La Web Speech API solo va en Chrome/Edge
- L284: de escritorio; Brave la desactiva por privacidad y Firefox no la soporta.
- L320: ── Triple toque sobre el 🎤 → abre la ayuda ────────────────────────────
- L325: 3 toques seguidos → ayuda
- L331: 1 toque → grabar / detener
- L337: ── Panel de ayuda (se inyecta solo, no toca index.html) ────────────────
- L365: ── Mis frases personalizadas ──────────────────────────────────
- L454: ── Estilos inyectados (parpadeo del botón al grabar) ───────────────────
- L464: ── Auto-montaje del botón 🎤 (antes del punto verde #fbDot) ────────────
- L465: No necesitas editar el header a mano: el botón se crea solo.
- L466: Idempotente: si ya existe #voiceBtn no lo duplica.
- L480: ← justo antes del punto verde
- L482: Respaldo: si no encuentra el punto verde, botón flotante arriba a la derecha
- L494: API pública

## panel/pantalla/whatsapp.js

- L1: panel/pantalla/whatsapp.js — abrir WhatsApp y el usuario de WhatsApp (@nombre)
  =============================================================================
  Fase 7 (11/11/2026): vivían al principio de datos/estado.js por herencia
  (eran lo primero del script de index.html), pero son de PANTALLA: abren
  WhatsApp y muestran avisos. Movidos sin cambiar una línea.
  Script CLÁSICO: sus funciones son globales, igual que antes.
- L9: ★ El campo teléfono admite DOS formas: número peruano (lo de siempre) o
- L10: usuario de WhatsApp (@nombre), que desde 2026 permite escribirle a alguien
- L11: sin conocer su número. Este predicado es el ÚNICO dueño de esa distinción:
- L12: cada sitio que usa el teléfono pregunta aquí en vez de repetir la regla.
- L13: Reglas de WhatsApp: 3-35 caracteres entre letras, números, puntos y guiones bajos.
- L19: ★ WhatsApp centralizado: el prefijo de país vive en UN solo lugar.
- L20: waLink(phone,msg) → devuelve la URL. waOpen(phone,msg) → la abre.
- L21: código de país (Perú). Cambiar aquí si se necesita.
- L23: Usuario (@nombre): WhatsApp NO publica un enlace de chat por usuario — su
- L24: formato click-to-chat sigue aceptando solo números. Devolvemos null a
- L25: propósito, para que quien llame decida qué hacer, en vez de fabricar una
- L26: URL inventada que al abrirse daría error y parecería un fallo de la app.
- L28: limpiar espacios, guiones, etc.
- L34: Con usuario: SOLO se copia al portapapeles y se avisa. No se abre WhatsApp
- L35: a propósito: no existe forma de llegar al chat de alguien solo con su
- L36: usuario. Se probó abrir wa.me sin número y WhatsApp responde con un error
- L37: ("no se encontró el número de teléfono … es demasiado corto"), que parece un
- L38: fallo de esta app. Mejor un paso honesto que uno que aparenta funcionar.
- L39: Si algún día WhatsApp publica el enlace por usuario, entra en waLink y ya.

## panel/pedidos/delivery.js

- L1: panel/pedidos/delivery.js — la ruta de delivery
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: delivery.js — Módulo de Rutas DELIVERY v3
  ==========================================
  - Sin MutationObserver (causa congelamiento)
  - Panel lateral en PC, overlay en mobile
  - Solo pedidos DELIVERY no finalizados
  - Tap en dirección → Google Maps
  - Driver con nombre + teléfono → WhatsApp / llamada
  - Botón Entregar al lado del nombre
  - Confirmar entrega → FINALIZADO automático
- L21: ── Estado ────────────────────────────────────────────────────────
- L28: parada "tomada" para cambiarla de posición
- L39: Orden de la ruta (misma fuente para la ruta Y la impresión de etiquetas):
     1) Lo movido a mano manda (_dlvOrden, queda fijado).
     2) Si no, el ÚLTIMO al que se le puso motorizado/inDriver va arriba
        (_dlvAsignadoTs desc).
     3) El resto (sin motorizado), por fecha más reciente — como siempre.
- L47: asignado reciente arriba
- L48: luego por fecha
- L54: empates (Infinity) conservan el orden base (sort estable)
- L63: ── CSS ───────────────────────────────────────────────────────────
- L68: z-index 300 = DEBAJO de los modales del panel (.overlay es 400): así el
         modal de edición se abre ENCIMA y al cerrarlo vuelves a la ruta intacta.
- L76: La tarjeta reusa .card/.cname/.card-meta/.card-addr/.card-actions/.btn-st/
         .btn-edit del panel principal. Aquí solo lo exclusivo de la ruta.
- L84: Modo mover: franjas "Colocar aquí" entre tarjetas
- L98: ── HTML ──────────────────────────────────────────────────────────
- L102: Panel principal
- L113: Overlay confirmar entrega
- L138: El motorizado (nombre, teléfono, link inDriver) se edita en el MODAL DE
- L139: EDICIÓN del panel principal — aquí ya no hay un modal propio duplicado.
- L142: ── Render ────────────────────────────────────────────────────────
- L144: mismo orden que las etiquetas (+ reorden manual)
- L165: Si la parada tomada ya no está en la lista (se entregó, etc.), salir del modo.
- L168: Zona "Colocar aquí" del modo mover (solo cuando hay una parada tomada).
- L188: Chips de link del cliente (apisale, etc.) — mismo chip que el panel
- L193: Bloque MOTORIZADO: la MISMA función que pinta la tarjeta del panel principal
- L194: (fuente única) → se ve idéntico en los dos lados.
- L197: Estado: mismo botón/colores del panel (stClass/stIcon) — sin texto cortado.
- L205: Cabecera: número de parada (toca para mover) + nombre + Entregar
- L213: Meta: teléfono · fecha · monto (mismas clases del panel)
- L219: Dirección (toca → Maps) + pin si hay GPS
- L226: Acciones: estado + editar (mismas clases del panel)
- L237: ── Editar pedido — reusa el modal de edición del panel principal ──
     Ahí se editan motorizado (nombre, teléfono) y link inDriver, junto al resto
     del pedido. El panel queda debajo (z-index 300) y vuelve intacto al cerrar.
- L245: ── Reordenar: tocar el número → tocar "Colocar aquí" ─────────────
- L246: Sin gestos (no pelea con el scroll) y funciona igual con listas largas.
- L247: Normaliza _dlvOrden a 0..n-1 y guarda SOLO los que cambian; es la fuente de
- L248: verdad compartida con la impresión de etiquetas.
- L250: volver a tocar el número = cancelar
- L260: ajustar índice tras sacar el elemento
- L274: Orden de ruta expuesto para que la impresión de etiquetas DELIVERY coincida.
- L277: Abrir la dirección en Google Maps (por id, para no meter la URL en el HTML).
- L283: Tap a un teléfono (cliente o motorizado) → mini-hoja Llamar / WhatsApp (reusa tel:/wa.me).
- L303: ── Confirmar entrega ─────────────────────────────────────────────
- L336: evitar doble envío durante la subida
- L348: ★ Foto y firma van a Firebase Storage (URL), NO base64 en el doc: evita
- L349: superar el limite de 1MB por documento de Firestore (que haria fallar el
- L350: guardado). Reusa StorageModule.uploadFile/base64ToFile. Si la subida falla,
- L351: igual se registra la entrega (la foto/firma son complementarias).
- L354: Reintentos ante red intermitente (2s, 4s) para no perder foto/firma.
- L363: ★ Si tras los reintentos no sube, YA NO se pierde: entra a la cola de
         fotos (fotos.js, IndexedDB) y se sube sola, escribiendo solo su campo.
- L374: firma opcional: si falla, a la cola
- L385: Confirmar la entrega deja el pedido en FINALIZADO, así que en la vista
- L386: de activos la tarjeta desaparece. Se avisa con las mismas palabras que
- L387: el resto del panel en vez de que parezca que se borró.
- L393: ── Triple tap ────────────────────────────────────────────────────
- L406: ── API pública ───────────────────────────────────────────────────
- L417: Refrescar la ruta desde fuera (p. ej. tras guardar en el modal de edición).

## panel/pedidos/estados-papelera.js

- L1: panel/pedidos/estados-papelera.js — cambiar estado, confirmar, papelera
  ===============================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: STATUS
- L33: Special: from NUEVO PEDIDO (idx 0) allow jump to POR ALISTAR (idx 2)
- L35: Sin etiqueta (la suya se borró) no tiene «siguiente»: va a cualquiera.
- L54: Marcar algo como FINALIZADO desde TODOS hace que la tarjeta desaparezca de
     la lista. Es correcto —ya no es un pendiente— pero sorprende si nadie lo
     dice: se ve igual que si se hubiera borrado.
- L60: delivery.js finaliza por su cuenta al confirmar una entrega y también hace
- L61: desaparecer la tarjeta: necesita poder decirlo con las mismas palabras.
- L68: Apply to all selected
- L69: incremental: solo los seleccionados
- L75: ★ incremental: solo este pedido
- L77: Hook Cotización: al pasar a EN PROCESO, ofrece enviar los faltantes a un proveedor.
- L82: ── LA ÚNICA PUERTA AL DIÁLOGO DE CONFIRMAR ─────────────────────────────
     Cinco pantallas —borrar pedido, borrar varios, borrar proveedor, vaciar
     papelera y borrar link— escribían A MANO sobre el mismo botón: su texto, su
     color, su acción y si estaba apagado. Cada una tenía que acordarse de
     dejarlo limpio para las otras cuatro.
  
     Una se olvidó. `openDel` dejaba el botón en "Moviendo…" y DESHABILITADO al
     terminar bien (solo lo reponía si fallaba), y el borrado de link no reponía
     nada. Resultado: borrabas un pedido y el siguiente borrado de link nacía
     muerto — el botón salía diciendo "Moviendo…" y no respondía. No fallaba
     siempre: fallaba según lo que hubieras hecho antes, que es lo peor que
     puede hacer un fallo.
  
     Ahora nadie toca el botón. Esta función lo pone en su sitio al abrir y lo
     devuelve SIEMPRE al terminar —salga bien o mal—, así que ya no hay nada de
     qué acordarse. Hay una prueba que falla si alguien vuelve a escribirle
     encima por su cuenta.
- L124: Cerrar solo si salió bien: si falló, el aviso se lee con el diálogo
- L125: delante y se puede reintentar sin volver a buscar el pedido.
- L132: DELETE → TRASH
- L146: solo config (trash): el pedido ya se borró de Firestore
- L152: SE CONGELA LA LISTA ACÁ, Y ES LA ÚNICA QUE MANDA.
       Antes esto leía la selección dos veces: una al abrir el aviso (para contar)
       y otra al confirmar (para quitar de la pantalla). Entre las dos caben
       segundos, y en esos segundos el latido de Firebase reemplaza los pedidos.
       Si la selección cambiaba en medio, se quitaba de la pantalla un pedido que
       NO se había mandado a la papelera ni borrado de Firestore: desaparecía sin
       estar borrado, y el aviso decía otro número. Una acción destructiva no
       puede preguntar dos veces y confiar en que le respondan igual.
- L166: Se resuelven los objetos AHORA, contra la lista viva: si el latido los
- L167: reemplazó, la papelera tiene que guardar la versión buena, no la que se
- L168: capturó hace treinta segundos.
- L172: Borrar de Firestore inmediatamente
- L177: solo config (trash): los pedidos ya se borraron de Firestore
- L182: PIN
- L184: Funciones de configuración movidas a config.js

## panel/pedidos/notify.js

- L1: panel/pedidos/notify.js — la campana de avisos
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: notify.js — Campana de notificaciones para Total Tools v2
  ==========================================================
  - Notifica pedidos nuevos del formulario (últimas 2h)
  - Botón 👁 Ver → scroll hasta la card del cliente + resaltar
  - Botón 🖨️ Imprimir → abre modal de impresión con pedido preseleccionado
  - Flag _printed en Firebase → sincronizado en todos los dispositivos
  - Badge morado con contador de no impresos
- L18: ── CSS ───────────────────────────────────────────────────────────
- L94: ── INYECTAR CAMPANA ──────────────────────────────────────────────
- L124: ¿Se imprimió? La misma respuesta que la tarjeta y el panel de
       impresión (PrintModule.impreso): antes la campana solo miraba
       `_printed`, que casi nunca se ponía, y ofrecía «Imprimir» de pedidos
       ya impresos.
- L133: N° de factura/boleta, leído del PEDIDO al pintar, no copiado en la
       notificación: si se corrige en «Editar», la campana dice el nuevo.
- L141: ── RENDER ────────────────────────────────────────────────────────
- L147: Badge = pedidos nuevos SIN imprimir
- L164: Link del pedido (mismo estilo de pastilla .link-chip del panel), clickeable
- L189: ── HELPERS ───────────────────────────────────────────────────────
- L208: ── VER: scroll hasta la card ─────────────────────────────────────
- L212: "Ver" es navegación determinista: llevar a la ETIQUETA donde vive el
         pedido y destrabar lo que pudiera ocultarlo (búsqueda + filtros
         avanzados), para que SIEMPRE aparezca.
  
         ESTA LÓGICA YA NO VIVE AQUÍ. Vivía solo aquí, y el camino de crear un
         pedido tenía su propia versión —peor— que fallaba cuando el filtro ya
         estaba puesto en el estado del pedido nuevo: `setFilt` no repintaba y
         la tarjeta no llegaba al DOM. Dos caminos para lo mismo y uno roto.
         Ahora es uno: `irAlPedido()` en index.html, que es ESTE código
         promovido tal cual. Ver el comentario de allí.
- L226: ── IMPRIMIR ──────────────────────────────────────────────────────
- L233: openOne imprime solo este pedido sin tocar los seleccionados del panel
- L238: Marcar como impreso tras confirmación del navegador
- L242: Con id: sube SOLO este pedido. Sin id subiría los ~700.
- L252: ── OBSERVAR NUEVOS PEDIDOS ───────────────────────────────────────
- L261: Actualizar estado impreso si cambió en Firebase
- L271: Notificar pedidos nuevos recientes (últimas 2 horas): tanto los del
- L272: formulario público como los creados a mano (+ azul). Cada dispositivo
- L273: deriva la notificación del pedido ya sincronizado → aparece en todos.
- L290: ── API PÚBLICA ───────────────────────────────────────────────────
- L294: Evitar duplicados
- L336: Actualizar tiempos al abrir
- L345: ── INIT ──────────────────────────────────────────────────────────

## panel/pedidos/pedido-docs.js

- L1: panel/pedidos/pedido-docs.js — WhatsApp, documentos, visor, links y monto del pedido
  ============================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: WA SHEET
- L18: Sin docs marcados y sin mensajes → WhatsApp directo
- L24: Sin docs marcados pero con mensajes → abrir sheet solo con mensajes
- L25: Con docs marcados → abrir sheet completo
- L58: incremental: solo este pedido
- L84: Fallback screen
- L108: DOC MENU
- L114: DOC SLOTS
- L116: Núcleo reutilizable: valida y guarda el archivo en un slot. Lo usan loadDoc
- L117: (input), dropDoc (arrastrar) y pasteDoc (portapapeles).
- L118: ★ Pedido EXISTENTE + Storage disponible → sube a Firebase Storage (URL que
- L119: sincroniza en todos los dispositivos), igual que cámara/galería. Pedido
- L120: NUEVO → base64 (storage.js lo migra a Storage al guardar). Así pegar y
- L121: arrastrar dejan de guardarse solo como base64 (que se recorta a [img]).
- L127: ★ fotos.js: comprime, sube con miniatura y, si no se puede subir, deja
       la foto PENDIENTE (vista previa local) para la cola — nunca base64,
       que al guardar terminaba en «[img]» y perdida. Pedido nuevo: pendiente
       hasta guardar, porque aún no tiene id.
- L149: Subir un documento ya NO mueve la etiqueta: el estado lo cambias tú.
- L152: Si lo que falló fue la sesión, decirlo: el archivo quedó aquí, pero
- L153: no está en la nube y eso se arregla volviendo a entrar, no esperando.
- L168: Arrastrar y soltar sobre el slot.
- L176: Pegar imagen del portapapeles (icono 📋). Sin Ctrl+V.
- L209: Pendiente de subir: vista previa local y aviso. Si no, la miniatura
- L210: (liviana) si la hay; la original se abre al tocar.
- L226: VIEWER
- L234: LINKS
- L240: MONTO / ADELANTO / DEUDA — deuda = max(0, monto − adelanto). El campo `cost`
     del pedido guarda la DEUDA (lo leen 14 lugares que siguen funcionando igual).
- L247: texto plano, sin color
- L248: Pagado (monto>0 y deuda=0) → monto tachado. Debe / sin monto → texto normal.
- L249: La regla vive en functions/montoPedido.js: la MISMA que la tarjeta.
- L255: Deuda: toca para desplegar/ocultar Monto/Adelanto (fila de abajo).
- L262: Carga monto/adelanto/deuda al abrir el form. Pedido viejo: deriva monto=cost.
- L271: colapsado al abrir
- L275: ── "Sucio": ¿el formulario cambió respecto a como se abrió? Snapshot de los
     campos clave. Sirve para no cerrar el modal al clic-fuera si hay cambios.
- L291: Chip de estado Shalom en el modal de editar (SOLO LECTURA).
     Refleja s.trackingStatus tal cual está guardado — no consulta ni mueve nada.
     Mismo criterio de color que _estadoChip de tracking.js, replicado inline para
     no acoplar el modal a ese módulo. Sin estado → oculto (no muestra "—").
- L311: FORM

## panel/pedidos/pedido-form.js

- L1: panel/pedidos/pedido-form.js — abrir el formulario del pedido, cliente recurrente, pegar de WhatsApp
  ============================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L10: Resetear acordeón de documentos a cerrado
- L16: La agencia identificada del pedido que se abre. Un pedido antiguo no la
       tiene y no pasa nada: funciona igual que siempre, solo que el aviso dirá
       "sin identificar" mientras no elijas de la lista.
- L27: El texto de referencia es el que YA tiene el pedido: si no lo tocas,
- L28: el id sobrevive a abrir y guardar.
- L32: limpiar el pegado al abrir
- L35: Panel de gestión: SIEMPRE todos los couriers disponibles (independiente
- L36: de qué esté activo en el formulario público del cliente).
- L42: limpiar monto/adelanto/deuda (pedido nuevo); el edit lo sobreescribe
- L48: ★ Al abrir un pedido con DNI, se vuelve a consultar RENIEC.
         No cuesta: `Shalom.dni` cachea en el navegador y un DNI ya consultado
         no se vuelve a preguntar nunca. Lo que SI consigue es que el pedido
         gane el nombre PARTIDO al guardarlo — sin esto, un pedido creado
         antes de que existiera ese campo no lo gana jamas aunque tenga el DNI
         puesto y el nombre en pantalla, y el registro dice "falta el nombre
         de RENIEC" sin que se entienda por que.
- L60: ★ Un pedido cuya etiqueta se borró: su estado no está en la lista, y
         el <select> quedaba vacío — al guardar, el pedido perdía el estado sin
         aviso. Se añade su estado actual para que se conserve tal cual.
- L74: Si tiene documentos, abrir el acordeón automáticamente
- L85: Courier por defecto: SHALOM (siempre está en la lista del panel)
- L88: ★ SHALOM + ENCOMIENDA: show/hide bloques según courier
- L94: DELIVERY: bloque motorizado (mismo criterio por courier que Shalom)
- L99: El TEXTO, no la etiqueta entera: dentro vive ahora la marca de agencia
         identificada, y `textContent` sobre el padre se la llevaba por delante.
- L105: SHALOM: precargar agencias para búsqueda instantánea; si no, ocultar dropdown
- L106: Al aparecer el bloque de Shalom es cuando la clave hace falta: antes no
- L107: se sabía que este pedido iba por ahí, y generarla en un pedido de
- L108: DELIVERY sería un campo lleno que no significa nada.
- L121: avisos: formato y guía repetida
- L131: Las medidas se ven si las había (y no eligió caja): no se esconde lo escrito.
- L134: pinta el tipo ya guardado
- L151: limpia el badge
- L152: ⚠️ EL VIGILANTE, DESPUÉS DE LIMPIAR. Estaba veinte líneas MÁS ARRIBA,
         y `Guias.vigilar` pinta en el acto: leía el campo cuando todavía tenía
         la guía del pedido anterior y dejaba «⚠️ Esta guía ya está en otro
         pedido» colgado sobre un campo que se vaciaba justo después.
  
         Vaciar un campo por código NO dispara `input`, así que nadie volvía a
         pintar y el aviso se quedaba ahí, hablando de un pedido que no tenía
         nada que ver con el que estabas creando.
  
         Un vigilante que mira antes de que el mundo esté listo no vigila:
         informa de lo de antes.
- L167: reiniciar: buscador de agencias disponible de nuevo
- L168: Caja "Pegar pedido de WhatsApp": solo en pedido NUEVO (no al editar)
- L171: Snapshot del estado inicial (para saber si luego se ensució).
- L175: ★ EL DNI DE UN PEDIDO — una sola regla, en functions/dniPedido.js.
     El 13/10/2026 el dueño corrigió un destinatario y la etiqueta siguió
     imprimiendo el documento del anterior: el mismo dato vivía en tres campos
     (`dni`, `dniRecoger`, `dniDestinatario`), el panel al editar solo tocaba
     el primero, y cada uno de los nueve lectores tenía su propio orden.
- L185: ── RELLENAR CLIENTE RECURRENTE (por teléfono o DNI, solo en Nuevo Envío) ──
     Se deriva del historial que ya está en memoria (`S.shipments`): sin
     colección nueva, sin una sola lectura de Firestore, sin reglas nuevas.
  
     ⚠️ Y NO HACE FALTA UNA FICHA DE CLIENTE. Sería una SEGUNDA CASA del mismo
     dato —el nombre y el DNI vivirían en el pedido y en la ficha— y el día que
     no coincidan hay que decidir cuál manda. Esa es, palabra por palabra, la
     historia del DNI en tres campos que costó dos días. El historial de
     pedidos YA ES el historial del cliente.
- L197: ★ LO QUE SE COPIA DE UN CLIENTE. LISTA CERRADA, NO UN COMENTARIO.
     Antes esto eran seis `setIfEmpty` sueltos y un comentario que prometía
     «NO se toca: fecha, estado, monto, notas, guía/código». Un comentario no
     impide nada — es la misma clase de promesa que el «fuente única =
     order.dni» que el código incumplía mientras hacía tres copias.
  
     LO DE SHALOM NO ES DEL CLIENTE, ES DE ESE ENVÍO: la guía, el código, la
     clave de recojo, el «registrado» y las medidas del paquete nacen y mueren
     con un paquete concreto. Copiarlos daría por registrado un pedido que no
     existe, y le daría al cliente una clave que no abre nada.
  
     LA AGENCIA SÍ: es del cliente. Dónde recoge no cambia cada semana, y sin
     el `agenciaId` el pedido es irregistrable y hay que volver a buscarla a
     mano en cada envío repetido.
  
     Hay una prueba que fija esta lista.
- L216: El más recientemente CORREGIDO, no el más reciente.
- L224: ★ CUÁL DE LOS CLIENTES — Y POR QUÉ AQUÍ NO SE ADIVINA.
     El teléfono 9XXXXXXXX del dueño pertenece a DOS personas distintas: CLIENTE A
     (DNI XXXXXXXX) y CLIENTE B (XXXXXXXX). Antes se
     cogía «el más reciente» EN SILENCIO, así que escribir ese número rellenaba
     el nombre y el documento de una de las dos sin decir que había otra — y la
     etiqueta salía con el DNI de otra persona, por el mismo camino que ya
     arreglamos una vez.
  
     Es la regla que el proyecto ya aplica a las instancias y a las agencias:
       · Adivinar  = elegir entre varias cuando no se sabe cuál. Prohibido.
       · Preguntar = enseñarlas y que elija el dueño. Eso sí.
  
     EL DNI ES LA PERSONA; el teléfono es un punto de contacto y se comparte.
     Por eso el DNI, cuando se escribe, manda y no hay ambigüedad posible.
  
     Solo se considera que hay varias cuando se puede AFIRMAR que son personas
     distintas: dos DNI diferentes, o —si ninguno tiene DNI— dos nombres
     diferentes. Un pedido sin DNI nunca parte en dos a alguien que sí lo
     tiene: sería preguntar por un dato que falta, no por una contradicción.
     @param {Array} lista los pedidos
     @param {string} keyPh teléfono de 9 dígitos, o ''
     @param {string} keyDni DNI de 8 dígitos, o ''
     @return {Object} {estado:'uno'|'varios'|'ninguno', uno, varios}
- L272: Sin ningún DNI, lo único que distingue a dos personas es el nombre.
- L289: solo en Nuevo Envío
- L309: ⚠️ NO SE ELIGE SOLO. Dos personas en el mismo teléfono es un caso
           real de este negocio, y rellenar «la más reciente» pone el DNI de
           una en el paquete de la otra.
- L322: ★ SE ENSEÑA QUÉ VA A RELLENAR, no solo el nombre. Una sugerencia que
           no dice qué trae se acepta a ciegas, y el día que trae el DNI de
           otro nadie lo mira.
- L347: Courier habitual (dispara el cambio de bloque agencia/encomienda).
- L352: ★ LA AGENCIA IDENTIFICADA VIAJA — y con la misma regla que todo el
       proyecto: el id sobrevive SOLO si el texto de la dirección es
       literalmente el de esa agencia.
  
       Sin esto, el pedido repetido salía con la dirección de la agencia
       escrita y «sin identificar» por dentro: irregistrable en Shalom hasta
       volver a buscarla a mano, cada vez.
  
       Y si el campo de dirección ya tenía algo escrito, `setIfEmpty` no lo
       pisa — entonces el texto NO es el de esta agencia y el id tampoco se
       pone. Un id pegado a una dirección que no es la suya es cómo se manda
       un paquete pagado a otra ciudad.
- L371: NO se copia NADA de Shalom ni del paquete: guía, código, clave,
       registrado, medidas. Ver CLIENTE_COPIA, que es la lista de verdad.
- L377: ── PEGAR PEDIDO DE WHATSAPP → autocompletar campos ────────────────
- L409: encomienda: dejar dirección como ciudad
- L420: Pegado de WhatsApp reconocido: la dirección ya viene completa, así que
- L421: NO activar el buscador de agencias Shalom (solo aplica en llenado manual).
- L429: ── BÚSQUEDA DE AGENCIAS SHALOM en el campo Dirección (courier SHALOM) ──
     Mismo JSON y misma calidad de búsqueda que el formulario público.
- L432: Versión del catálogo = fecha de `meta.generado` de data/agencias-shalom.json.
     La MISMA que AGENCY_SOURCES.SHALOM.version en formulario.html (hay prueba).
- L437: 1) cache localStorage (24 h) — solo si es de ESTA versión del catálogo
- L444: 2) JSON local (con ?v= para que el navegador no sirva la copia vieja)
- L480: Repinta el aviso mientras escribes: si rompiste la correspondencia con la
- L481: agencia elegida, lo ves en el momento y no al intentar registrar.
- L484: Si se pegó un pedido de WhatsApp, la dirección ya está completa: no buscar agencias

## panel/pedidos/pedido-guardar.js

- L1: panel/pedidos/pedido-guardar.js — guardar el pedido (saveShipment)
  ==========================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L10: ★ GUARDAR Y REGISTRAR (10/11/2026). Con «Registrar en Shalom al
       guardar» encendido, primero se pide la confirmación de siempre (cuesta
       dinero) y solo después se guarda; el registro va cuando el pedido ya
       subió, porque el servidor registra con lo que hay en la nube.
- L15: Auto-agregar link si hay texto en el campo pero no se presionó +Add
- L25: El teléfono admite número (como siempre) o usuario de WhatsApp (@nombre).
- L26: Solo se valida cuando el operador EMPEZÓ con arroba: así un "@ab" a medio
- L27: escribir no se guarda roto, y los números siguen entrando exactamente igual
- L28: que hasta hoy (nada de estrenar reglas sobre los pedidos que ya funcionan).
- L41: ★ SHALOM: leer campos guía
- L44: ★ LA AGENCIA IDENTIFICADA.
       Si sigue vigente, viajan los cuatro campos. Si no, `limpiar()` decide:
       devuelve {} cuando el pedido NUNCA tuvo agencia —así abrir y guardar un
       pedido antiguo no le añade ni un campo vacío— y los cuatro en null
       cuando sí la tenía y se rompió, porque ahí el borrado TIENE que viajar a
       la nube: un id viejo pegado a una dirección nueva es cómo se manda un
       paquete pagado a otra ciudad.
- L56: La clave de recojo. Tres condiciones para escribirla, y las tres
       importan:
         · solo con courier Shalom — en un DELIVERY sería un número sin sentido;
         · solo si HAY algo que escribir, o si el pedido YA la tenía. Sin esta
           segunda parte, abrir un pedido de Shalom de hace un mes y guardarlo
           le añadía `shalomClave: ''` — un campo nuevo en un pedido antiguo,
           que es justo lo que el dueño pidió que no pasara;
         · y cuando sí se escribe, se escribe '' al vaciarla y nunca undefined,
           para que BORRARLA también viaje a la nube.
- L71: ★ LAS COPIAS VIEJAS DEL DNI, PUESTAS AL DÍA.
       El 13/10/2026 el dueño corrigió un destinatario aquí mismo y la etiqueta
       siguió imprimiendo el DNI del anterior: `dniRecoger` se quedaba con el
       valor viejo y la etiqueta lo prefería. Ya no lo prefiere —todos los
       lectores pasan por `DniPedido.de`— pero una copia desfasada en la nube
       es una trampa esperando al siguiente que la lea, así que se pone al día.
  
       SOLO las que el pedido YA TENÍA: abrir y guardar un pedido antiguo no le
       estrena campos. Misma regla que `shalomClave`, dos bloques más arriba.
- L80: ★ EL NÚMERO DE FACTURA/BOLETA. Misma regla que `shalomClave`: se
       escribe si HAY algo, o si el pedido YA lo tenía —y entonces también
       vacío, para que BORRARLO viaje a la nube y el pedido vuelva a su
       código de 6 dígitos—. Abrir y guardar un pedido antiguo no le estrena
       el campo.
- L91: Aviso, no bloqueo: una factura puede cubrir dos bultos.
- L98: ★ CUÁNDO SE CORRIGIÓ, que no es cuándo nació.
       Sin esto, «rellenar con los últimos datos del cliente» ordenaba por
       `createdAt` y te ofrecía el pedido más NUEVO, no el último que
       corregiste. Los pedidos de antes de hoy no lo tienen y se siguen
       ordenando por `createdAt`, igual que siempre.
- L106: ★ MEDIDAS DEL PAQUETE: se guardan tal cual (vacío → '', nunca undefined,
- L107: para que "borrar la medida" se propague a la nube igual que cualquier
- L108: otro campo). pkgTipo se guarda ya calculado — barato de leer después
- L109: (ej. filtrar "quién tiene medidas puestas") sin repetir la cuenta cada vez.
- L117: La caja elegida de un toque manda: es la que se registra en Shalom.
- L121: ★ EL NOMBRE DE RENIEC, PARTIDO, SE GUARDA CON EL PEDIDO.
       Hasta ahora la consulta vivía solo en `window._dniUltima` —memoria
       volátil— y lo único que quedaba era el nombre COMPLETO en el campo de
       texto. Pero `POST /account/register` pide el nombre en TRES campos
       (`name`, `firstname`, `lastname`), y partir "JOSE LUIS DE LA CRUZ" a
       ojo se equivoca: es exactamente lo que hace la otra aplicación del
       dueño, que con un nombre de una sola palabra manda el mismo valor en
       dos campos.
  
       Sin esto, la reja del registro habría dicho "falta el nombre de RENIEC"
       en TODOS los pedidos, con el DNI consultado y el nombre a la vista —y
       se habría leído como un fallo del registro cuando el fallo estaba tres
       pasos antes.
  
       ⚠️ SOLO SI CORRESPONDE AL DNI QUE SE ESTÁ GUARDANDO. Si consultaste un
       DNI y luego escribiste otro, pegar el nombre del primero sería darle a
       Shalom el nombre de otra persona: peor que no tener ninguno.
  
       Y los pedidos de ayer no se tocan: solo gana el campo el que se guarda
       de hoy en adelante.
- L144: (La cola del seguimiento automático se retiró: escribía
- L145: trackingWebProximaConsulta para el Motor B, que ya no existe. Ver shalom.js.)
- L146: ★ DELIVERY: motorizado (nombre, teléfono) + link inDriver. Solo se tocan si el
- L147: courier es DELIVERY (no ensucia otros pedidos); null al vaciar, para que
- L148: "quitar" también se propague a la nube.
- L156: Sello del momento en que se asignó/cambió el motorizado o el link: la ruta
- L157: pone arriba al último asignado. Solo se actualiza si algo cambió.
- L164: sin motorizado → vuelve al orden por fecha
- L168: Preservar campos tracking al editar
- L177: Guía cambiada A MANO sobre una registrada por Shalom Pro: la nueva no
         la registró Pro, así que se quitan su marca y su hora (sin ellas no hay
         plazo de 24 h ni «registrar de nuevo» sobre una guía ajena).
- L183: ★ Aquí había además un _fbSaveShipmentNow(): el mismo pedido se escribía
- L184: DOS veces, una suelta al instante y otra 800 ms después dentro de la
- L185: tanda de save(). Estaba para que un cambio no se perdiera si cerrabas la
- L186: pestaña antes del debounce. Ya no hace falta: save() persiste en el acto
- L187: qué quedó sin subir (dpanel_dirty), _mergeRemote no se lo lleva por
- L188: delante y el arranque lo sube solo. Ver INVARIANTES §7.
- L189: ★ incremental: solo este pedido
- L190: fotos pendientes → cola
- L191: ruta al día si está abierta
- L196: ★ EL TOKEN DEL LINK DE SEGUIMIENTO.
         Antes el link era `?seg=` + este mismo id, o sea `id_` + el reloj: un
         numero que avanza solo y que cualquiera puede recorrer. Ahora el link
         lleva 128 bits al azar (functions/enlaceSeguimiento.js).
  
         SOLO PEDIDOS NUEVOS. A los de ayer no se les escribe nada y su link
         de siempre sigue abriendo — hay mas de mil ya enviados por WhatsApp.
  
         Y SI EL MODULO NO CARGO, SE AVISA Y SE CREA IGUAL. El negocio no se
         para porque falle un <script>: sin token, el link se comporta
         exactamente como ayer. Pero callarselo seria crear pedidos con menos
         proteccion durante semanas sin que nadie se entere, que es justo el
         patron que llevamos meses cazando.
- L215: ★ Sin _fbSaveShipmentNow(): ver el comentario de arriba. Un pedido nuevo
- L216: que aún no subió ya sobrevive al latido y al cierre de la pestaña.
- L218: Sus fotos esperaban el id: entran a la cola y suben con ESTE id.
- L220: Llevar al pedido nuevo y resaltarlo, por LA MISMA puerta que usa el
         boton "Ver" de la campana.
         Antes esto era `setFilt(data.status)` + `_highlightCard(data.id)`, y
         fallaba en silencio cuando el filtro YA estaba en ese estado: setFilt
         se salia por su optimizacion, no repintaba, y la tarjeta nunca
         llegaba al DOM. Ver el comentario de `irAlPedido` en index.html.
- L228: Notificar (campana), igual que los pedidos del formulario público

## panel/pedidos/pedido-reniec.js

- L1: panel/pedidos/pedido-reniec.js — DNI → RENIEC y la agencia identificada
  ===============================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: ── RENIEC: EL NOMBRE REAL A PARTIR DEL DNI ──────────────────────────────
     `POST /account/register` pide el nombre PARTIDO en nombres, apellido
     paterno y apellido materno. Partir "JARLYN LLANOS ARTEAGA" a ojo se
     equivoca con cualquier nombre compuesto; RENIEC ya los da separados.
  
     TRES REGLAS, y las tres cuestan dinero o confianza si se rompen:
     1. Se pregunta al llegar a 8 dígitos, y UNA SOLA VEZ por DNI. Cada consulta
        gasta cuota del plan, así que disparar en cada tecla saldría carísimo.
     2. NO SE PISA lo que escribiste. RENIEC se OFRECE con un botón; el nombre
        con el que tú llamas a un cliente y el que dice su documento no tienen
        por qué ser el mismo, y el tuyo es el que usas para hablarle.
     3. Un 404 es un DNI MAL ESCRITO, y eso se avisa AQUÍ — un envío registrado
        con DNI malo es un envío que tu cliente no puede recoger.
- L22: el último DNI por el que ya se preguntó
- L24: ★ UNA CONFIRMACIÓN SE ENCOGE A UNA MARCA; UN PROBLEMA CONSERVA SUS
     PALABRAS. «✅ Coincide con RENIEC» ocupaba una línea entera del formulario
     para decir que todo estaba bien — y casi siempre está bien. Ahora es un ✓
     dentro de la etiqueta del campo: cero líneas, y el dato sigue ahí para
     quien lo busque (con `title`, y leíble por un lector de pantalla).
     Lo que NO se encoge: que RENIEC diga otro nombre (es una decisión tuya) y
     que el DNI esté mal escrito (bloquea el envío).
     @param {string} marca el símbolo corto, o '' para quitarlo
     @param {string} titulo qué significa, al pasar el ratón
- L59: Una vez por DNI: volver a escribir el mismo número no vuelve a preguntar.
- L66: Si mientras consultaba cambiaste el DNI, este resultado ya no corresponde.
- L68: El bloque de registro depende de esta respuesta: que se entere ya.
- L73: ★ NINGÚN MOTIVO SE CALLA.
         Aquí había un `else` que dejaba el aviso en blanco cuando el motivo no
         estaba previsto: salía "Consultando…", desaparecía, y no pasaba nada
         más. Sin error, sin pista. Es el patrón que este proyecto lleva
         semanas cazando —algo falla y nadie se entera— y lo escribí yo mismo,
         con un comentario que lo justificaba. Pasó de verdad con
         SIN_TRADUCTOR. `Shalom.textoMotivo` nunca devuelve vacío.
- L92: Vacío: no hay nada que pisar, así que se rellena y se ahorra un toque.
- L101: Distinto: se OFRECE, no se impone. Esto SÍ conserva sus palabras.
- L110: ── LA AGENCIA IDENTIFICADA ──────────────────────────────────────────────
     `_agElegida` guarda los cuatro campos mientras el formulario está abierto.
     Se pone SOLO al elegir de la lista —el único momento en que el `ter_id` se
     conoce sin adivinar— y se borra en cuanto la dirección cambia por
     cualquier otra vía.
  
     La regla que no se negocia: el id y el texto no pueden divergir. Un id
     viejo pegado a una dirección nueva es exactamente cómo se manda un paquete
     pagado a otra ciudad. Ver functions/agencias.js.
- L120: la dirección EXACTA que escribió el selector
- L122: La única puerta: el id sigue vivo solo si la dirección es literalmente la
     que puso el selector Y el courier sigue siendo el del mismo catálogo.
  
     Se compara el TEXTO y no se escucha ningún evento, a propósito: `fAddr`
     dispara `onAddrInput` también al recibir el foco, así que colgarse de los
     eventos borraría el id por solo tocar el campo. Comparando el texto quedan
     cubiertos de una vez escribir, pegar, el relleno desde WhatsApp y
     cualquier cambio por código que venga mañana — sin acordarse de nada.
- L134: El courier importa tanto como el texto: el 3 de Olva no es el 3 de
- L135: Shalom, y cambiar de courier deja el id apuntando a otro catálogo.
- L154: ⚠️ Y AQUÍ HABÍA DUPLICACIÓN PURA: la línea repetía «ANCASH / HUARAZ /
         HUARAZ / HUARAZ CO», que ya está escrito en el campo Dirección justo
         encima. Dos veces el mismo texto no informa el doble.
- L166: Sin catálogo (DELIVERY, ENCOMIENDA…) no hay nada que identificar: el
- L167: aviso solo sale donde de verdad hace falta.
- L169: Un problema sí conserva sus palabras — pero las justas.
- L180: ★ El instante en que el ter_id se conoce sin adivinar. Antes se tiraba.
- L182: el texto contra el que se comparará después
- L187: Cerrar dropdown al hacer click fuera

## panel/pedidos/pedido-ui.js

- L1: panel/pedidos/pedido-ui.js — acordeones del pedido, cajas de Shalom y medidas de la barra
  =================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L29: Lee los 4 campos de medidas y pinta el tipo de caja al instante — sin
     guardar nada, sin llamar a nadie. Usa la puerta única (Shalom.clasificarPaquete)
     para que el mismo cálculo sirva acá y en el registro en lote más adelante.
- L35: Los botones de caja: el elegido encendido, y las medidas solo con 📏.
- L59: Un toque elige la caja; 📏 abre las medidas.
- L67: Al abrir el form, cerrar el acordeón por defecto
- L70: Exponer la altura REAL de la barra superior (.hdr) como --hdr-h para que el
- L71: encabezado de courier (position:sticky) se fije JUSTO debajo y no quede
- L72: escondido tras la barra. Se recalcula ante cambios de tamaño (rotar, teclado,
- L73: distintos teléfonos) → sin píxeles hardcodeados.
- L77: Y la de las pestañas, que desde el 26/10/2026 también se quedan fijas.
       El encabezado de courier se pega debajo de LAS DOS: sin esta medida,
       las pestañas lo taparían al desplazarse.
- L84: Asegurar window.S sincronizado
- L88: re-render para mostrar bloques tracking

## panel/pedidos/pin-papelera.js

- L1: panel/pedidos/pin-papelera.js — PIN de la clave y papelera
  ==================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: ── HTML DE LA SECCIÓN CONFIG ──────────────────────────────────────
  El HTML del page-configurar permanece en index.html
  Este módulo solo contiene las funciones JS
  ────────────────────────────────────────────────────────────────
- L57: Auto-purge items older than 30 days
- L61: auto-purga: solo cambia trash (config)
- L86: Restaurar de la papelera NO devuelve la selección: es estado de pantalla,
- L87: no del pedido, y vive en seleccion.js. Se limpia el campo por si el
- L88: pedido se archivó cuando `sel` todavía se guardaba dentro.
- L92: recrea ese pedido + trash (config), no los 170
- L108: solo config (trash)

## panel/pedidos/print.js

- L1: panel/pedidos/print.js — imprimir etiquetas
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: print.js — Módulo de impresión para Total Tools
  Formatos: Etiqueta (pegar en paquete) · Lista (registro interno)
  Integración: reemplaza doPrint() en index.html
- L13: ★ EL DNI DEL PEDIDO — UNA SOLA REGLA, Y NO VIVE AQUI.
     El 13/10/2026 esta etiqueta imprimio el DNI de OTRA PERSONA: el dueño
     corrigio el destinatario en el panel, el nombre cambio y el documento no.
     Leia `s.dniRecoger || s.dni`, y el panel al editar solo actualiza `dni`.
     Mientras tanto el registro en Shalom leia `dni`: la etiqueta pegada al
     paquete y la guia llevaban documentos distintos, que en la agencia
     significa que no se lo entregan a nadie.
     La regla —y por que «vacio» no es lo mismo que «no existe»— esta en
     functions/dniPedido.js, que leen los nueve sitios.
- L24: ── MODAL HTML ───────────────────────────────────────────────────
- L128: ── ESTADO ───────────────────────────────────────────────────────
- L129: 'sel' | 'all' | 'one' | 'list'
- L139: ── API PÚBLICA ───────────────────────────────────────────────────
- L149: Decidir scope inicial. «✨ Nuevos» se retiró el 26/10/2026: cada
         tarjeta tiene su 🖨️ para imprimir un pedido suelto. Sin selección
         queda «Todos», que es lo que ya pasaba cuando no había nuevos.
- L154: siempre empieza en 1 por impresión (no persistir valor viejo)
- L163: Abre el modal directo con un solo pedido — ignora seleccionados del panel
- L172: siempre empieza en 1 por impresión (no persistir valor viejo)
- L174: Mostrar chip "1 pedido" sin opciones de scope
- L183: Imprime una LISTA específica de pedidos (por id) — independiente de la
- L184: selección del panel (Seleccion). La usa Compartir para imprimir etiquetas
- L185: de los envíos vinculados a tokens usados, sin tocar nada de Envíos.
- L250: Actualizar estilos botones
- L281: Estilos opciones
- L298: Tip
- L309: Refrescar _list con los datos más recientes de window.S
- L326: Blob URL evita document.write síncrono que congela el hilo principal
- L335: Limpiar URL del blob tras 2 minutos
- L338: Marcar como impresos
- L340: Lista de ids en UNA llamada: "imprimir todos" puede ser 700 pedidos y
- L341: save(id) en bucle reescribe el estado completo cada vez (7,6 s de bloqueo).
- L343: La 🖨️ de cada tarjeta se pinta de azul AHORA, no en la próxima
- L344: sincronización; y la campana deja de ofrecer «Imprimir».
- L352: Código de envío para la etiqueta.
     · Pedidos ANTIGUOS (antes de 2026-08-08): últimos 4 dígitos del id — NO se tocan.
     · Pedidos de 2026-08-08 en adelante: 6 dígitos (más únicos que 4 y más legibles
       que un alfanumérico). Determinístico: mismo pedido → mismo código (reimprimir
       da igual), sin guardar nada nuevo en la base.
- L357: ★ Desde el 26/10/2026: si el pedido tiene N° de factura/boleta, ESE es su
     código (etiqueta, QR, escáner). Sin número, el de siempre. La regla del
     número vive en functions/nroComprobante.js.
- L364: El código de antes del N° de factura. El escáner lo sigue aceptando: una
- L365: etiqueta impresa antes de poner la factura tiene que seguir sirviendo.
- L368: Fase 6 (11/11/2026): la regla vive en functions/codigoSeguimiento.js,
       la MISMA del WhatsApp y del link de seguimiento.
- L373: ★ ¿SE IMPRIMIÓ? UNA SOLA RESPUESTA. `printed` lo pone print() al generar
     la etiqueta y viaja a la nube; es lo que contaba «Nuevos» y la campana
     de impresión. `_printed` era de la campana de notificaciones y dependía
     del aviso `afterprint`, que casi nunca llega porque la etiqueta se
     imprime en OTRA pestaña. Se sigue aceptando para los que ya lo tengan.
- L379: Exponer el código para que el escáner (index.html) identifique el pedido exacto.
- L382: Valor del QR GRANDE: solo el celular (27/10/2026). Escanearlo hace la
     búsqueda de siempre: todos los pedidos de ese número. Identificar UN
     pedido —para ir a él o cambiarlo de etiqueta— es trabajo del QR pequeño
     del pie, que lleva su id (ver _pieQrPedido). Antes llevaba también
     «#código»; las etiquetas ya impresas así se siguen leyendo.
- L391: ── ¿A DÓNDE VA ESTE ENVÍO? — un solo dueño de la regla ──────────────
- L392: Los dos formatos de impresión (etiqueta y lista de despacho) preguntan aquí
- L393: en vez de repetir el criterio. Cada courier guarda el destino en un sitio
- L394: distinto: SHALOM/domicilio lo dejan en `address`, y ENCOMIENDA parte el dato
- L395: en `ciudadDestino` (la ciudad) + `encAgencia` (el nombre de la agencia).
- L398: Nombre de la agencia, venga del formulario (encAgencia) o del modal de guía
- L399: Shalom (shippingAgency / agencia_nombre).
- L404: Línea "🏪 <agencia>" para la etiqueta. Se omite cuando el nombre YA está
- L405: dentro del destino: en Shalom `address` suele traer la dirección completa de
- L406: la agencia, y sin esta guarda saldría repetido en la etiqueta.
- L415: ── PIE: QR PEQUEÑO DEL PEDIDO ───────────────────────────────────
     Debajo de toda la etiqueta. Con factura/boleta dice «FACTURA F001-123»;
     sin ella (links rápidos, pedidos a mano) dice «PEDIDO #307321».
     El QR lleva el ID del pedido (`TTPED:<id>`), no el número impreso: el
     número puede repetirse, el id no. Escanearlo en el panel lleva a ESE
     pedido, solo, y es el ÚNICO que cambia de etiqueta en modo escaneo.
     Desde el 27/10/2026 lo lleva TODA etiqueta que se imprima, también la
     de un pedido antiguo: sin él, ese pedido no se podría mover por QR.
- L435: ── FORMATO 1: ETIQUETA ───────────────────────────────────────────
- L442: Nota recortada SOLO para la etiqueta (para que no la deforme). La nota
- L443: completa se conserva en el pedido, tracking y panel.
- L576: ── FORMATO 2: LISTA DE DESPACHO ──────────────────────────────────
- L676: ── HELPER ───────────────────────────────────────────────────────
- L686: ── CAMPANA DE IMPRESIÓN EN HEADER ───────────────────────────────
- L706: Exponer updateBadge para que index.html lo llame desde updateStats
- L726: Inyectar al cargar

## panel/shalom/agencias-extractor.js

- L1: panel/shalom/agencias-extractor.js — el extractor de agencias (Config)
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: agencias-extractor.js — Extractor de agencias (sección Config)
  =====================================================================
  Agrega en Config (#page-configurar) un bloque POR CADA courier con
  catálogo propio (hoy: Shalom y Olva, en ese orden). Cada bloque:
    1. Llama a su Cloud Function (la key/URL va segura en el servidor).
    2. Trae TODAS las agencias.
    3. Las convierte al MISMO formato que usa la búsqueda del formulario
       (nombre, distrito, provincia, departamento, direccion, telefono,
       horario...) — un solo esquema, sin importar el courier de origen.
    4. Muestra cuántas agencias se extrajeron.
    5. Te deja descargar el JSON para subir a la carpeta data/.
  
  Agregar un courier nuevo = un objeto más en COURIERS. Nada más.
  
  Reglas respetadas:
    - Módulo independiente. Solo agregar <script src="agencias-extractor.js"></script>
    - SIN MutationObserver.
    - No toca ninguna otra funcionalidad.
- L30: Saneo de calidad de datos — aplica a CUALQUIER courier (punto único, no
       por-mapper): si algún catálogo de origen trae basura, se corrige aquí una
       sola vez.
       - Coordenadas fuera del territorio peruano (lat/lon invertidos, typo del
         origen, etc.) → se tratan como "sin coordenadas" (igual que si vinieran
         vacías): nunca ofrecen una agencia como "cerca de mí" con una distancia
         falsa, pero la agencia sigue siendo buscable por texto.
       - Duplicados exactos (mismo nombre + mismas coordenadas) → se descartan,
         quedándose con el primero.
       - Sedes a las que un cliente NO puede ir → se descartan (ver _esUsable).
- L45: ¿Puede un cliente presentarse en esta sede a recoger su paquete?
       El catálogo alimenta un buscador donde el cliente ELIGE dónde recoger, así
       que una entrada que no sirva para eso no es un dato incompleto: es una
       trampa. Aparece entre los resultados, se puede tocar, y el pedido termina
       con un punto de recojo al que nadie puede llegar.
       Dos reglas, ambas indiscutibles:
         - Sin dirección → no hay a dónde ir.
         - Nombre de prueba → no es una sede real (Shalom deja terminales de
           prueba en su catálogo; una salía en los resultados de un distrito).
       Deliberadamente NO se filtran almacenes ni centros de distribución que sí
       traen dirección: algunos atienden público y no nos consta cuáles. Ante la
       duda, se conserva: perder una sede real es peor que mostrar una de más.
- L70: Cualquier coordenada que no caiga dentro de Perú se vacía, y el (0,0)
- L71: entra en esa regla. Antes estaba exceptuado, lo que contradecía el
- L72: comentario de arriba y dejaba pasar 5 agencias de la API de Shalom con
- L73: 0,0 — un punto en el Atlántico frente a África. Vacío es honesto:
- L74: "no sabemos dónde está". Un 0,0 parece un dato bueno y no lo es.
- L80: duplicado exacto: se descarta
- L84: Se devuelve también lo descartado: filtrar en silencio es cómodo hasta
- L85: el día que descarta algo que sí servía y nadie se entera.
- L90: Primer valor no vacío entre varios nombres posibles. La documentación de
       la API no describe las respuestas, así que en vez de fijar un nombre y
       rezar, se aceptan los que ya conocemos del catálogo guardado y sus
       variantes razonables. Lo que no aparezca queda vacío, y `_sanear` decide
       si la agencia sirve igual.
- L103: Mapea agencia cruda de Shalom al esquema común (el mismo que ya usa el
       buscador del formulario, así no hay que tocarlo).
- L123: Mapea agencia cruda de Olva (department/province/district/lat/lng/horario
       por día) al MISMO esquema común que Shalom, para que la búsqueda del
       formulario funcione idéntico sin importar el courier.
- L126: Gemelo en el servidor: functions/olvaNormalizar.js, que aplica el MISMO
       mapeo al respaldo en vivo (agenciasOlva). Si Olva cambia sus campos, se
       tocan los dos.
- L157: Un objeto por courier con catálogo propio. Orden = orden en pantalla.
  
       Cada courier declara CÓMO se traen sus datos, porque no todos se piden
       igual:
         · functionUrl → una URL abierta que se consulta directo (Olva).
         · traer()     → una función propia, para cuando hace falta sesión.
       Shalom pasa por la puerta única (shalom.js), que adjunta el token del
       panel; su Cloud Function exige ser administrador, así que un fetch pelado
       recibiría un 401. Un courier nuevo se agrega con una entrada más, sin
       tocar el resto del extractor.
- L177: Pasa por la puerta única, que hoy responde DESCONECTADO mientras la
- L178: integración se rehace. El catálogo que ya está en data/ sigue
- L179: sirviendo al formulario: extraer solo hace falta para actualizarlo.
- L193: para comparar antes de reemplazar
- L198: por courier.key
- L200: Encuentra la lista dentro de la respuesta, venga como venga envuelta.
       Cada courier la envuelve distinto y ninguno lo documenta, así que se
       buscan los nombres habituales en la raíz y un nivel más adentro.
- L220: Compara lo recién extraído con el catálogo que ya está en uso.
       Si el nuevo trae MENOS, lo dice con todas las letras: reemplazar a ciegas
       dejaría sin agencias a clientes que hoy sí pueden elegirlas. No bloquea la
       descarga —a veces el courier cierra sedes de verdad— pero obliga a mirar.
- L246: no poder comparar no debe impedir extraer
- L276: Courier con puerta propia (Shalom): la función adjunta la sesión.
- L283: Leer SIEMPRE el cuerpo: la función devuelve el motivo real del fallo
- L284: (corte por tiempo, respuesta upstream con su código, o red). Sin esto
- L285: solo se ve un "HTTP 500" sin causa.
- L310: COMPARAR CON LO QUE YA TIENES antes de dejar reemplazar. Descargar un
- L311: catálogo más chico y pisar el bueno deja al cliente sin poder elegir
- L312: agencias que antes sí aparecían — y te enterarías por un reclamo, no
- L313: por un error. Por eso el aviso es explícito y dice cuántas faltan.
- L316: Lo descartado se dice, no se calla: si algún día el filtro se lleva
- L317: algo que servía, tiene que verse acá y no descubrirse por un reclamo.
- L360: ── Inyectar un bloque por courier en la sección Config ────────────

## panel/shalom/guias.js

- L1: panel/shalom/guias.js — avisos sobre el número de guía
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: guias.js — avisos sobre el número de guía de Shalom
  ====================================================
  Dos avisos, y los dos salieron de mirar los 971 pedidos reales:
  
    1. EL FORMATO. 484 de las 487 guías tienen 8 dígitos. Las otras tres
       están mal escritas — y una, `939726661`, estaba EN TRÁNSITO con un
       dígito de más: su seguimiento llevaba semanas sin funcionar y no lo
       sabía nadie. Un número mal escrito no da error: da silencio.
  
    2. LA GUÍA REPETIDA. Tres números aparecen en dos pedidos. Dos son el
       mismo cliente que pidió dos veces y salió en un solo paquete; el
       tercero son dos clientes distintos, o sea un error de tipeo. El panel
       no puede distinguirlos, y no debe intentarlo: repetir una guía es algo
       que se hace a propósito (un retorno a origen reutiliza la misma).
  
  POR ESO LOS DOS AVISAN Y NINGUNO IMPIDE. Bloquear el guardado por una guía
  repetida rompería la forma de trabajar del negocio; callarse deja pasar el
  error. Avisar es lo único que respeta las dos cosas.
  
  `revisar()` es lógica pura: no toca el DOM y se puede probar sola.
  `vigilar()` es la parte que pinta.
- L31: lo que mide una guía de Shalom (medido: 484 de 487)
- L32: Desde octubre de 2026 Shalom pasó el 99.999.999 y sus guías nuevas
       tienen 9 dígitos, empezando por 1 (100761787…). Misma regla que el
       seguimiento automático: functions/barrido.js GUIA_OK.
- L43: Qué hay que avisar de este número. Devuelve [] si no hay nada que decir.
  @param {string} numero lo que hay escrito en el campo
  @param {string} idActual id del pedido que se está editando (se excluye)
  @param {Array} lista los pedidos donde buscar repetidos
  @return {Array} avisos {tipo, texto}
- L53: Vacío no es un error: la guía es opcional y se pone después.
- L86: ── La parte que pinta ───────────────────────────────────────────────
- L107: Engancha un campo: cada vez que se escribe, se repintan los avisos.
  Idempotente — llamarlo dos veces sobre el mismo campo no duplica nada.
  @param {string} idInput id del <input>
  @param {string} idActual id del pedido que se edita (o '' si es nuevo)
- L121: El id se lee del campo, NO de la variable de arriba: el oyente se
- L122: engancha una sola vez y se quedaría con el id del primer pedido que
- L123: se abrió. Al abrir otro, excluiría del control de repetidos al pedido
- L124: equivocado — y avisaría de que la guía está repetida consigo misma.
- L138: Un solo oyente por campo: el formulario se abre muchas veces y el modal
- L139: de seguimiento se reconstruye entero cada vez.
- L140: antes de enganchar: pintar lo lee
- L146: por si el campo ya viene con algo escrito

## panel/shalom/qrtracking.js

- L1: panel/shalom/qrtracking.js — el QR para el seguimiento manual
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: qrtracking.js — Módulo QR para tracking manual Shalom v2
  =========================================================
  - Botón QR en header del bloque tracking (junto a Ayuda)
  - Genera QR automático con fórmula: orderNumber + 3473503
  - Opción de escanear ticket físico con cámara como alternativa
- L15: ── Cargar librería QR ────────────────────────────────────────────
- L25: ── CSS ───────────────────────────────────────────────────────────
- L43: Botón QR en header del bloque tracking
- L50: ── Overlay ───────────────────────────────────────────────────────
- L72: ── Generar QR en canvas ──────────────────────────────────────────
- L103: ── Fórmula QR Shalom ─────────────────────────────────────────────
- L109: ── Variables de estado ───────────────────────────────────────────
- L116: ── API Pública ───────────────────────────────────────────────────
- L135: ── Escanear ticket físico ────────────────────────────────────────
- L137: Crear overlay de cámara encima del overlay QR
- L154: Iniciar cámara
- L181: Intentar BarcodeDetector primero
- L196: Cargar jsQR si no está
- L206: Mostrar mensaje de escaneado
- L212: Limpiar completamente el canvas antes de regenerar
- L215: Destruir cualquier instancia anterior de QRCode
- L217: Forzar reflow para que el DOM se limpie
- L220: Pequeño delay para asegurar limpieza del DOM
- L252: ── Patch renderCardBlock — botón QR en header ────────────────────
- L261: Insertar solo botón 📷 QR en el header junto a "Ayuda"
- L271: ── Init ──────────────────────────────────────────────────────────

## panel/shalom/shalom-ajustes.js

- L1: panel/shalom/shalom-ajustes.js — Shalom en Config: barrido, puerta, seguimiento y cuentas
  ==================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: SHALOM: el barrido programado (Config)
- L12: Valores de fábrica: encendido y en semiautomática. (`simulacro` se
- L13: retiró: si quedó guardado en la nube, el servidor ya no lo lee.)
- L19: ★ LA CLAVE DE LOS AJUSTES DE SHALOM. Es la «Clave para cambiar estado»,
     con su mismo teclado: una sola clave que el dueño cambia en un solo
     sitio. No se escribe en el código — esta página es pública en GitHub.
- L25: Horarios y modo: el campo vuelve AL INSTANTE a lo guardado, y el valor
     nuevo solo entra con la clave. Si se cancela, en pantalla queda lo que de
     verdad está guardado — nunca un valor que parece puesto y no lo está.
- L55: Por qué fallaron, no solo cuántas. Un número suelto no se puede accionar:
     "6 fallaron" no distingue un corte de red de una cuota agotada ni de una
     clave rechazada, y cada una se arregla en un sitio distinto.
- L73: El informe de la última corrida. Dice también a cuántos NO se les preguntó:
     sin eso, "consultó 12" parece poco cuando en realidad es todo lo que había.
- L99: Correr el barrido a pedido: el MISMO barrido, sin esperar al horario.
     Sirve para ver el informe ahora y, después, para forzar una actualización
     cuando haga falta. Se salta el reloj pero NO el interruptor.
- L122: Los pedidos cambiaron en la nube: que el panel los traiga.
- L134: SHALOM: el interruptor maestro de la puerta (Config)
- L135: SHALOM: toggle auto-tracking (Config)
- L142: solo cambia config
- L145: Motor de rastreo: 'off' | 'api' | 'web' (Motor B, mi servidor). Solo uno a
     la vez: al elegir 'web' se apaga la API paga; al elegir 'api' se prende.
- L147: ── Auto-avanzar estado al subir un documento ─────────────────────────────
     Escalera monotónica sobre FIXED_LABELS: cada slot apunta a un estado y el
     pedido SOLO avanza si el objetivo está más adelante; nunca retrocede.
     Gobernado por el toggle S.config.autoEstadoDoc (default ON).
- L151: NOTA — El estado ya NO se mueve solo.
     Se retiró `autoEstadoPorDoc` (subir un documento avanzaba la etiqueta), el
     selector de motor de rastreo, el modo de etiquetas (off/auto/semi) y los
     intervalos de la cola. Eran del rastreo viejo, que se apoyaba en leer la web
     pública de Shalom. La integración nueva va contra la API oficial y avisa por
     webhook; si en su momento se decide que la etiqueta vuelva a moverse sola,
     se hará ahí, con el dato real delante. Hoy la etiqueta la mueves tú.
  
     Se conserva `toggleTrackingWebCliente`: qué ve el cliente sigue siendo una
     decisión tuya, y el filtro que la respeta vive en la Cloud Function.

## panel/shalom/shalom-cuenta.js

- L1: panel/shalom/shalom-cuenta.js — la cuenta de Shalom Pro, en el panel
  =====================================================================
  Rehecho el 11/11/2026. UN solo lugar para todo lo de la cuenta:
    · el estado («● Shalom Pro conectada · tu correo»);
    · Config: correo + contraseña + «Conectar» (y «cambiar cuenta»);
    · la RECONEXIÓN SOLA: al abrir el panel se mira el estado (gratis) y,
      si se cayó y hay credenciales guardadas, se reconecta una vez.
  Lo decide el servidor (functions/cuentaShalom.js): el navegador nunca ve
  la lista de instancias ni la contraseña después de escribirla.
  Script CLÁSICO: sus funciones son globales (las llaman los onclick).
- L14: El estado de la cuenta para toda la pantalla:
     mirando · conectando · ok · sinCuenta · caida · error
- L17: ya se preguntó en esta sesión
- L18: ya se intentó reconectar sola
- L19: «cambiar cuenta» abierto
- L21: El estado actual (lo lee el bloque de registro del pedido).
- L29: Recuerda la instancia que dijo el servidor (no se guarda desde aquí:
     la escribe el servidor). Sirve para que el registro no diga «falta la
     cuenta» mientras llega la sincronización.
- L36: Pregunta al servidor si la cuenta sigue conectada. Gratis.
   Si se cayó y hay credenciales guardadas, reconecta UNA vez sola.
- L65: Conectar (con lo escrito, o vacío = con lo guardado).
- L84: El botón «Conectar» de Config.
- L89: la contraseña no se queda en pantalla
- L94: «cambiar cuenta»: abre o cierra el formulario.
- L97: Lo que se dice cuando no está conectada: palabras, no códigos.
- L106: La sección de Shalom Pro en Config.
- L142: La fila «TU CUENTA» del bloque de registro del pedido.
- L154: Al entrar al panel (cuando llegan los datos, o sea con sesión), se mira
     la cuenta una vez y se reconecta sola si hace falta.

## panel/shalom/shalom-origen.js

- L1: panel/shalom/shalom-origen.js — agencia de origen y cuenta de Shalom Pro
  =================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: ── TU AGENCIA DE ORIGEN ─────────────────────────────────────────────────
     `POST /account/register` pide `origen`, y también es un `ter_id`. Como es
     siempre la misma, se elige UNA VEZ aquí en vez de en cada envío.
  
     Se guarda con el MISMO `Agencias.elegida()` que el destino: una segunda
     forma de guardar un ter_id acabaría aceptando aquí lo que allá se rechaza.
  
     Vive en `S.agenciaOrigen`, HERMANA de `config` y no dentro: ese objeto lo
     devuelve entero la función pública, y aunque tu agencia de despacho no sea
     un secreto, la regla se comprueba antes de guardar, no después.
- L21: El origen, en UNA línea. El buscador estaba siempre abierto ocupando un
     campo para algo que se elige una vez al año; ahora sale con «cambiar».
- L54: `pre` existe para que el MISMO buscador sirva en Config y en el pedido.
     La alternativa era copiarlo, y una copia habría divergido: dos buscadores
     escribiendo sobre la MISMA `S.agenciaOrigen` con reglas distintas es como
     se despacha desde la agencia equivocada sin que nadie lo note.
- L88: SHALOM fijo, no el courier del formulario: esta es TU agencia de
- L89: despacho, y el registro que la va a usar es el de Shalom.
- L99: El bloque del pedido depende de esto: sin repintar, seguiría diciendo
- L100: "sin agencia de origen" con la agencia ya elegida.

## panel/shalom/shalom-registro.js

- L1: panel/shalom/shalom-registro.js — clave de recojo y registro en Shalom (desde el pedido y en Config)
  =============================================================================================
  Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
  Script CLÁSICO a propósito: sus funciones y variables son globales, igual
  que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
  El orden de los <script> en index.html es el orden de ejecución.
- L9: ── CLAVE DE RECOJO ─────────────────────────────────────────────────────
     Los 4 dígitos que el destinatario necesita para retirar el paquete en la
     agencia. `POST /account/register` la acepta como `clave`, y es la razón
     por la que se eligió el endpoint individual y no el masivo: el masivo NO
     la admite.
  
     Se genera sola —una menos que inventar por pedido— pero se puede cambiar.
     Y NO se regenera sola en un pedido que ya tiene guía: la clave que se le
     dio a Shalom es la que el cliente va a usar, y cambiarla aquí dejaría al
     cliente con un número que no abre nada.
- L21: ⚠️ UN ENVÍO YA REGISTRADO NO CAMBIA DE CLAVE. Esos cuatro dígitos ya
       están en Shalom: generar otros aquí le daría al cliente un número que
       no abre nada y el paquete se quedaría en la agencia.
       `_claveAuto` ya lo respetaba; este botón no, y se podía pulsar. Lo vio
       el dueño en la primera prueba real.
       Y SE DICE, no se ignora en silencio: un botón que no hace nada y no
       explica por qué se vuelve a pulsar.
- L40: Congela lo que Shalom ya tiene. Se llama al abrir el formulario.
     La clave y la agencia de destino dejan de poder cambiarse en cuanto hay
     guía: Shalom las tiene, y que el panel diga una cosa y el paquete vaya a
     otra es peor que no poder editarlo.
- L62: ── 🚚 REGISTRAR EN SHALOM, DESDE EL PEDIDO ──────────────────────────────
     Hasta hoy el registro solo existía desde la consola. Esta es su cara.
  
     TRES REGLAS QUE NO SE NEGOCIAN, porque Shalom no anula un envío, no tiene
     clave de idempotencia y cada registro cuesta dinero:
  
     1. Lo que falta se dice ANTES, en palabras. `window.RegistroShalom.faltantes()` es
        el MISMO archivo que usa el servidor para decidir, así que lo que lees
        aquí es exactamente lo que el servidor va a decidir — no una copia que
        algún día diga otra cosa. Un botón gris sin explicación obliga a probar,
        y probar aquí cuesta S/ 12.
     2. El botón se apaga al pulsarlo y NO SE VUELVE A ENCENDER. Ni en éxito, ni
        en fallo, ni en duda. Dos clics serían dos envíos y dos cobros.
     3. En duda jamás sale "reintentar". Sale "Recuperar", que solo lee.
  
     Y la trampa silenciosa: el servidor lee el pedido DE FIRESTORE, no de tu
     pantalla. Si hay cambios sin subir, registraría con los datos viejos —caja
     equivocada, o "faltan medidas" con las medidas delante—. Por eso se mira
     `_dirtyShips` y se te pide guardar primero. Explícito, no magia.
- L84: ── ★ REGISTRAR AL GUARDAR (10/11/2026) ──────────────────────────────────
     Antes había que guardar, cerrar, volver a abrir y recién ahí registrar.
     Ahora el bloque mira lo que tienes EN PANTALLA (estado, caja o medidas,
     clave): si con eso ya se puede, ofrece «Registrar en Shalom al guardar»
     y el botón Guardar pasa a «Guardar y registrar». Los cambios valen al
     guardar, como siempre, y el registro va DESPUÉS de que el pedido subió:
     el servidor registra con lo que hay en la nube.
     Cero lecturas y cero llamadas para decidir: la lista de lo que falta es la
     MISMA función del servidor, corriendo aquí.
- L94: el formulario ya cargó los valores de ESTE pedido
- L106: Lo guardado + lo que tienes en pantalla en los campos que deciden.
  @param {Object} ped el pedido guardado
  @return {Object} el pedido tal como quedaría al guardar
- L115: Una guía escrita a mano en pantalla también cuenta: ese ya no se registra.
- L118: ★ LO QUE EL GUARDADO TAMBIÉN DECIDE (11/11/2026). Sin esto, el DNI recién
       escrito, su nombre de RENIEC o la agencia recién elegida solo contaban
       después de guardar, cerrar y volver a abrir: «Falta el nombre partido
       por RENIEC» con el nombre a la vista. Se calculan con las MISMAS reglas
       que saveShipment (pedido-guardar.js).
- L142: La confirmación ANTES de guardar: cuesta dinero y no se deshace.
- L174: Espera a que ESTE pedido termine de subir (o se rinde).
  @param {string} id el pedido
  @param {number} tope ms como máximo
  @return {Promise<boolean>} true si ya está en la nube
- L209: Simulacro, fallo o duda: se reabre el pedido para verlo con sus palabras.
- L221: ⏰ REGISTRAR DE NUEVO — pasadas 24 h sin dejar el paquete en la agencia.
     El servidor vuelve a comprobarlo TODO (hora, y que Shalom diga que no
     entró): si el paquete ya entró, no se registra y no se cobra.
- L250: La config del registro, por la MISMA función que usa el servidor.
  @return {Object} {agenciaOrigen, instanceId}
- L257: Simulacro ENCENDIDO salvo un `false` explícito — la regla del servidor,
  repetida aquí porque la pantalla tiene que decir la verdad sobre si el
  próximo clic cuesta dinero.
  @return {boolean} true si no va a gastar
- L263: ¿Este pedido tiene cambios que Firestore todavía no tiene?
  @param {string} id el id del pedido
  @return {boolean} true si falta subirlo
- L281: ★ EL RESUMEN DE LA CABECERA. Lo que se lee con el desplegable CERRADO.
     La clave va aquí a propósito: la necesitas para dictársela al cliente, así
     que esconderla detrás de un clic sería esconder justo lo que más se mira.
     Y si falta algo estando en POR ALISTAR —o sea, ahora es cuando se puede
     hacer algo— la cabecera se pone ámbar: te enteras sin abrir.
     @param {Object} ped el pedido guardado, o null
     @param {Array} faltan lo que falta, o null si no aplica
     @param {boolean} registrado si ya tiene guía
- L296: La clave en la cabecera: mientras se prepara el registro (para
       dictársela al cliente) y cuando lo registró Shalom Pro. Con una guía
       puesta a mano, nada — como antes (10/11/2026).
- L312: Ámbar solo si se puede hacer algo YA: en POR ALISTAR.
- L325: ★ EL PINTOR. Único sitio que decide qué se ve en ese bloque.
- L329: Sin título propio: el del desplegable ya dice qué es esto.
- L341: ⚠️ Y LA CABECERA TAMBIÉN SE LIMPIA. Esta puerta de atrás salía sin
         repintarla, así que al abrir un pedido NUEVO después de editar uno
         registrado, el desplegable seguía diciendo «PAQUETE L · CLAVE 6277 ·
         REGISTRADO» del anterior — con el cuerpo justo debajo diciendo
         «guarda el pedido y vuelve a abrirlo».
  
         Una pantalla que se contradice consigo misma a dos centímetros de
         distancia da más miedo que un error: el dueño creyó que el pedido
         nuevo había nacido registrado. No lo estaba —los campos de verdad sí
         se limpian— pero eso no se podía saber mirando.
- L357: YA REGISTRADO: no hay botón. No es que esté deshabilitado — es que no
       existe, que es la única forma de que un clic no pueda crear un segundo
       envío con un segundo cobro.
- L363: Guía puesta a mano (o escaneada del ticket): no la registró Shalom Pro
         desde aquí, así que no se muestra nada de registro — como antes.
- L379: Escribiste una guía a mano en pantalla: este pedido no se registra.
- L392: ── TU CUENTA de Shalom Pro: la comprueba y la reconecta sola
       panel/shalom/shalom-cuenta.js. NO se bloquea el botón si la comprobación
       falla: un registro sin cuenta válida devuelve 403 y NO crea ni cobra.
- L399: ── TU AGENCIA DE ORIGEN. Se puede cambiar desde aquí, y es UNA sola para
       todo el negocio: cambiarla «para este envío» cambia todos los
       siguientes. Eso ya no se repite en pantalla —estaba fijo, ocupando una
       línea cada vez— y vive en 📖 Ayuda, que es donde se lee una vez.
- L417: ── LO QUE FALTA, EN PALABRAS. Mismo archivo que el servidor.
- L428: Esta nota SOLO cuando aplica. Permanente era ruido; con cambios sin
           subir es justo lo que explica por qué la lista no cuadra con lo que
           ves en pantalla.
- L440: ── TODO LISTO CON LO DE PANTALLA, pero aún no guardado: se ofrece
       registrar AL GUARDAR. Nada se llama hasta pulsar Guardar.
- L468: ── TODO LISTO. Antes del botón, la trampa de los datos sin subir.
- L484: ⚠️ "Guarda primero" sonaría a reproche cuando acabas de guardar: la
         subida va con 800 ms de espera más la red, así que hay unos segundos
         en los que ya pulsaste Guardar y la nube todavía no lo tiene. Se dice
         lo que de verdad pasa, y el bloque se repinta solo al terminar — sin
         eso te quedarías mirando un aviso vencido sin saber qué hacer.
- L496: ⚠️ ACOTADO. La primera versión se reprogramaba sola sin límite: si la
         subida no terminaba nunca —sin red, sesión caída— el panel repintaba
         cada 1,2 s para siempre. Un reintento sin final no es paciencia, es un
         bucle. A los ~18 s se para y se te da un botón, que además te dice que
         algo va mal con la subida en vez de fingir que sigue en camino.
- L524: ── EL INTERRUPTOR. Hasta hoy solo se podía cambiar subiendo un archivo de
       configuración: lo único que decide si un clic cuesta S/ 12 era invisible.
- L535: ⏳ / ⏰ El plazo de 24 h de Shalom para dejar el paquete. Dentro del
     plazo, cuánto queda (urgencia real, no inventada); vencido y sin que
     Shalom lo haya recibido, la salida: registrar de nuevo. Sin la hora del
     registro no se dice nada: mejor callar que inventar un plazo.
- L573: Se guarda `false` EXPLÍCITO para apagarlo y `true` para encenderlo: el
       servidor solo apaga el simulacro con un false explícito, así que dejar
       el campo ausente lo dejaría encendido y el botón mentiría.
- L583: ★ EL CLIC QUE CUESTA DINERO.
     Todo se vuelve a comprobar aquí, justo antes de llamar: entre que se pintó
     el bloque y pulsaste pudo cambiar cualquier cosa (otra pestaña, el barrido,
     tú mismo). Lo pintado es un aviso; lo que manda es esta comprobación.
- L621: ⚠️ EL BOTÓN SE APAGA ANTES DE LLAMAR Y NO SE VUELVE A ENCENDER.
           No es un detalle de estilo: dos clics son dos envíos y dos cobros que
           nadie puede anular. Se le quita hasta el onclick.
- L631: NO SE RELANZA NUNCA. `confirmar` vuelve a habilitar SU botón cuando
           `alConfirmar` lanza, y ofrecer ahí un reintento sería ofrecer un
           segundo envío. Los tres finales se cuentan abajo, en su sitio.
- L638: ★ LOS TRES FINALES. No dos: éxito, fallo y DUDA.
     Shalom no anula y no tiene clave de idempotencia, así que llamar "fallo" a
     una duda invita a reintentar — y un reintento sobre un envío que sí se creó
     es un segundo paquete y un segundo cobro. La duda tiene su propia salida, y
     es de SOLO LECTURA.
- L644: ★ EL RASTRO. Un registro cuesta dinero y pasa UNA vez: si la respuesta
       no queda escrita en algún sitio, lo único que te queda cuando algo sale
       raro es el recuerdo. Y `forma` —los NOMBRES de los campos que devolvió
       Shalom, sin un solo valor— es lo que permite cerrar el traductor cuando
       un campo no llega donde lo esperábamos; pasó con el monto.
       Se deja fuera `cuerpo`: en simulacro lleva el nombre, el DNI y el
       teléfono del cliente, y eso no tiene por qué quedar en una consola que
       cualquiera puede estar mirando por encima del hombro.
- L681: DUDA: se cortó y NO sabemos si el envío llegó a crearse.
- L696: FALLO: Shalom dijo que no. Se dice UNA vez, con sus palabras, y sin
       ningún botón que invite a volver a intentarlo a ciegas.
- L706: ★ LO QUE TRAE EL SERVIDOR, AL PEDIDO (11/11/2026). El servidor de la
     Fase 1 ya trae la marca de Shalom Pro y la nota privada con la clave. Uno
     SIN DESPLEGAR no: entonces el panel la completa él mismo —la clave y la
     guía las tiene a mano— y avisa, para que no quede en silencio que el
     servidor está atrasado. Pasó de verdad: la nota quedó vacía.
- L721: Un servidor sin la Fase 1 rechaza lo que el panel ya permite (caja sin
     medidas, ALISTADO). Si el rechazo es ESE, se dice qué hacer.
- L734: SOLO LEE: busca el envío entre los pendientes de Shalom por clave y destino
     y rellena la guía. No registra, así que no puede costar ni duplicar.
- L759: ya tiene una: no se pisa
- L760: Un pedido con guía ya está registrado en Shalom: generarle una clave
- L761: nueva aquí sería darle al cliente un número que no abre nada.

## panel/shalom/shalom.js

- L1: panel/shalom/shalom.js — el cliente de la API de Shalom (por la Cloud Function)
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: shalom.js — Puerta única a Shalom
  ==================================
  TODO lo que habla con Shalom pasa por aquí: consultar una guía, jalar el
  ticket, traer agencias y registrar pedidos. Un solo dueño, un solo contrato.
  
  ══════════════════════════════════════════════════════════════════════════
  DESCONECTADA A PROPÓSITO — 2026-09-13
  ══════════════════════════════════════════════════════════════════════════
  La integración se está rehaciendo desde cero, endpoint por endpoint. Se
  retiró el cliente entero (functions/shalomApi.js) y los dos endpoints del
  backend (shalomApi, shalomWebhook). La clave anterior se rota.
  
  Y ESTE ARCHIVO ES EL MOTIVO DE QUE NO SE ROMPA NADA. La interfaz —el botón
  ⟳ de cada tarjeta, el masivo, el extractor de agencias, el ticket, el
  verificador de sesión— no sabe que Shalom existe: le habla a esta puerta.
  Con las respuestas en DESCONECTADO, cada pantalla ya sabe qué decir
  ("Rastreo Shalom en reconstrucción") sin que haya que tocar una línea.
  
  RECONECTAR = rellenar los métodos de abajo. Nada más.
  
  ══════════════════════════════════════════════════════════════════════════
  
  ES I/O PURO: no toca la UI (nada de toasts ni DOM). Devuelve datos; quien
  llama decide qué mostrar. Así la misma puerta sirve para el botón manual, el
  auto-check del panel o un Cloud Scheduler, sin acoplarse a ninguno.
  
  CÓMO LLEGARÁ A SHALOM (y por qué nunca directo):
    navegador → Cloud Function → API de Shalom
  La API key es un secreto y vive en Secret Manager, del lado del servidor. Si
  viajara al navegador, cualquiera con F12 la vería y gastaría el plan del
  negocio. La función además exige que seas administrador y solo permite las
  operaciones de una lista blanca — no es un proxy ciego.
  
  CONTRATO (lo que devolverá cada método; una promesa):
    consultarGuia(guia, codigo) → {
        ok:true, estado:'En destino', fecha:'2026-08-19T16:10:00Z', pasos:2 }
      · estado : texto tal cual de Shalom (se muestra al operador y al cliente)
      · pasos  : 0..3 de la barra (0 origen · 1 tránsito · 2 destino · 3 entregado)
      · fecha  : ISO del evento, si Shalom la da (opcional)
    ticket(guia, codigo)   → { ok:true, url:'https://…' }  |  { ok:true, dataUrl:'data:image/png;…' }
    agencias()             → { ok:true, lista:[…] }        (formato del catálogo)
    registrar(pedido)      → { ok:true, guia:'…', codigo:'…' }
  
    En error, todos: { ok:false, motivo:CODIGO }
      Del lado de SHALOM:
        NO_ENCONTRADO · BLOQUEADO (su clave o su plan) · LIMITE (cuota agotada)
        · ERROR_SHALOM (tropiezo temporal suyo, no del dato)
        · FORMATO_DESCONOCIDO (respondió algo que no reconocemos)
      Del lado del PANEL (nada que ver con Shalom, y por eso van aparte):
        SIN_SESION (tu sesión venció) · SIN_PERMISO (tu cuenta no está en la
        lista de administradores) · SIN_RED · DESCONECTADO · SIN_DATO
    Mezclar los dos lados manda a revisar la cuenta de Shalom cuando el
    problema es la sesión del panel. Ya pasó una vez; por eso están separados.
  
    REGLA DE ORO: jamás ok:true sin dato real. Sin estado → ok:false. (La
    lección más cara: el éxito falso ocultó días de fallo.)
- L66: Los métodos que todavía no se han reconstruido responden lo mismo. No es
       un fallo: es el estado honesto del sistema, y la interfaz lo sabe leer.
- L71: ── La única dirección hacia Shalom ────────────────────────────────────
       El navegador NUNCA habla con api.shalom-api.lat. Habla con esta función,
       que guarda la clave del lado servidor, exige que seas administrador y
       solo acepta operaciones de una lista blanca.
- L78: El token de sesión, refrescado si está por vencer. Sin token no se
       intenta siquiera: SIN_SESION es del panel, no de Shalom, y confundirlos
       manda a revisar la cuenta de Shalom cuando lo que venció es tu sesión.
- L94: ── CACHÉ DE DNI ──────────────────────────────────────────────────────
       Cada consulta a RENIEC gasta cuota del plan, y los clientes se repiten.
       Se guarda en localStorage con un tope: sin él, un año de pedidos llenaría
       la cuota de almacenamiento del navegador y `lsSet` se tragaría el error.
       Un dato registral no caduca —el nombre de una persona no cambia—, así que
       no lleva fecha de vencimiento: solo se recorta cuando pasa del tope.
- L111: Se exige la forma, no solo que exista: lo guardó una versión anterior
- L112: del panel, o quedó a medias, y un nombre a medias en el formulario es
- L113: peor que preguntar otra vez.
- L122: Se sueltan los más viejos por orden de inserción, que es el que
- L123: conserva Object.keys.
- L129: sin sitio: se consultará otra vez, no es grave
- L132: Una petición a la puerta. Nunca lanza: siempre resuelve con el contrato.
       Los códigos HTTP son de las barreras; lo que diga Shalom llega en 200
       dentro del cuerpo.
- L160: Interruptor maestro. Lo miran el auto-check y el extractor de agencias
         para no intentar siquiera.
         SIGUE EN FALSE aunque `consultarGuia` ya funcione, y es a propósito:
         el botón ⟳ de cada tarjeta NO mira esta bandera, así que ya se puede
         usar a mano — que es justo como se calibra, guía por guía, contra lo
         que muestra la web de Shalom. El barrido automático SÍ la mira, y no
         se enciende hasta que la calibración esté hecha. Encenderlo antes es
         soltar 484 consultas confiando en un traductor sin comprobar.
- L170: ── Los métodos, en el orden en que se van a reconstruir ────────────
         Cada uno vuelve cuando su endpoint esté medido y probado. Ver el plan
         en docs/SHALOM.md, que conserva las formas REALES ya medidas de
         /track y /instances/status — eso no se vuelve a medir.
- L175: ✅ CONECTADO · POST /track — 2026-09-13
         El árbol de 7 ramas de Shalom traducido al contrato de siempre.
         → {ok:true, estado, pasos, fecha, demora, recibio, arbol}
         `demora` viaja como bandera y NUNCA como estado: un paquete entregado
         no puede volver a mostrarse como "Demora de envíos".
- L189: ✅ CONECTADO · GET /track/voucher — 2026-10-28
         El SERVIDOR descarga el ticket, lo guarda en Storage y lo apunta en
         el pedido como «Guía / Ticket». Aquí solo viaja el id del pedido y la
         guía/código; vuelve el enlace del archivo ya guardado.
         → {ok:true, doc:{d:url, n, t, storage, path}} | {ok:false, motivo}
- L202: 6 · alta de envío
- L204: ✅ CONECTADO · GET /public/agencies — 2026-09-24
         El catálogo completo, ya mapeado al esquema que usa el buscador.
         → {ok:true, agencias:[…12 campos…], total, sinId}
         Va la variante PÚBLICA: misma utilidad y NO CONSUME CUOTA, así que
         refrescar el catálogo sale gratis. La puerta no le manda la clave.
         ⚠️ Devuelve `agencias`, no `lista`: es la clave que busca
         `agencias-extractor.js` y la misma del archivo del catálogo.
- L213: ⚠️ REGISTRAR UN ENVIO — LA UNICA OPERACION QUE CUESTA DINERO.
         Shalom NO tiene endpoint para anular y NO tiene clave de
         idempotencia: dos llamadas son dos envios y dos cobros.
  
         Por eso aqui solo viaja el ID DEL PEDIDO. El servidor lo lee de
         Firestore, comprueba los candados contra lo que hay AHORA, arma el
         cuerpo y llama. Desde la consola del navegador no se puede falsificar
         ni un campo ni saltarse un candado.
  
         ARRANCA EN SIMULACRO: decide todo igual, devuelve el cuerpo exacto
         que mandaria, y no llama a nadie. Se apaga desde Config.
         → simulacro: {ok:true, simulacro:true, cuerpo:{…}}
         → exito:     {ok:true, estado:'exito', campos:{shalomGuia,…}}
         → fallo:     {ok:false, estado:'fallo', motivo, detalle}
         → duda:      {ok:false, estado:'duda', detalle} ← NO reintentar
         → faltan:    {ok:false, motivo:'SIN_DATO', faltan:[textos]}
- L229: `opc.renovar`: registrar de nuevo una guía vencida (24 h sin dejarse
         en la agencia). El servidor lo vuelve a comprobar TODO.
- L237: Rellenar la guía de un envío que YA está en Shalom. SOLO LEE: busca
         en pendientes por clave y destino, y rellena. Nunca registra, así que
         no puede costar nada ni duplicar un envío.
         Para cuando algo salió a medias y el pedido quedó sin guía.
- L245: ★ LA CUENTA DE SHALOM PRO (rehecho el 11/11/2026) — la decide el
         servidor (functions/cuentaShalom.js). El navegador nunca recibe la
         lista de instancias de la cuenta de la API.
         conectar(usuario, clave): con datos, van UNA vez a Secret Manager y no
         vuelven; vacíos, se usan los guardados. Busca TU instancia por tu
         correo, la crea si no existe y entra solo si hace falta.
         → {ok:true, conectada:true, usuario, id} | {ok:false, motivo, detalle}
         estadoCuenta(): ¿sigue conectada? Gratis.
         → {ok, conectada, usuario, id, hayCredenciales, motivo}
- L261: ✅ CONECTADO · GET /validate — 2026-09-13
         Dice si la clave sirve y cuánto se ha consumido. Es el primero a
         propósito: no toca ni un envío, así que si algo está mal en la
         autenticación se ve aquí y no a mitad de una consulta masiva.
         → {ok:true, valida:true, limite, usado, restante, ilimitado}
         ⚠️ `limite: null` con `ilimitado: true` es PLAN ILIMITADO, no "sin
         cuota". La documentación muestra 1000; con plan ilimitado llega null.
- L270: ✅ CONECTADO · GET /account/dni/{dni} — 2026-09-26
         El espejo de RENIEC, con el nombre YA PARTIDO en nombres, apellido
         paterno y apellido materno — que es justo lo que pide
         `POST /account/register` y lo que partir a ojo se equivoca.
         → {ok:true, persona:{dni, nombres, apePaterno, apeMaterno, completo}}
  
         ⚠️ CON CACHÉ, y no es un lujo: cada consulta gasta cuota del plan, y
         «lo repetitivo son los mismos clientes» (palabras del dueño). Un DNI ya
         consultado no se vuelve a preguntar nunca. La caché vive en
         localStorage, así que es de este dispositivo: en otro se pregunta una
         vez y ya.
  
         Solo se guarda lo que respondió BIEN. Cachear un fallo de red
         convertiría un corte de diez segundos en un DNI que nunca más se puede
         consultar.
- L296: Un motivo, en palabras. NUNCA devuelve vacío, y esa es toda la
         gracia.
  
         El fallo que obliga a esto: el aviso de RENIEC tenía un `else` que
         dejaba el mensaje en blanco cuando el motivo no estaba previsto. Salía
         "Consultando…", desaparecía, y no pasaba nada más — sin error, sin
         pista. Es justo el patrón que este proyecto lleva semanas cazando:
         algo falla y nadie se entera.
  
         Un motivo desconocido sale con su código dentro. Feo, pero dice dónde
         mirar; un aviso feo vale mil veces más que uno que se desvanece.
- L313: ⚠️ ESTA CLAVE ESTABA DOS VECES EN ESTA MISMA TABLA, y en JavaScript
             la segunda PISA a la primera sin decir nada: ni un aviso del
             navegador, ni uno de ESLint, ni una prueba en rojo. La de abajo
             decía «Faltan datos para registrar. Abajo dice cuáles.», así que
             consultar una guía sin número contestaba hablando de registrar.
  
             No se eligió una de las dos: el mismo código sale de dos sitios
             que no comparten contexto —consultar y registrar—, y una tabla
             que traduce códigos no sabe de cuál viene. Así que el texto dice
             lo único cierto en ambos, y la lista de lo que falta —que el
             registro sí pinta debajo— se explica sola.
  
             Un barrido por todo el proyecto (14/10/2026) dice que era la
             única. Hay una prueba que la mantiene única.
- L329: No es un fallo: es el estado normal entre registrar y llevar el
             paquete. Shalom distingue `registrado` (la guía existe) de
             `origen` (el paquete entró a la agencia); la puerta ya no las
             aplasta, así que esta respuesta por fin se puede decir.
- L339: Medido: con un instanceId malo, Shalom responde 403 "Invalid API
             Key or instance access". Antes se traducía como BLOQUEADO y
             mandaba a revisar la clave, que estaba perfecta.
- L360: Lo que no está en la lista se dice IGUAL, con su código: callarse
- L361: aquí es como se pierde una tarde buscando qué pasó.
- L365: La clave de recojo de un envío: 4 dígitos.
  
         Del generador criptográfico del navegador, NO de `Math.random()`. Esta
         clave es lo único que separa el paquete de quien no debe llevárselo, y
         `Math.random` produce una secuencia que se puede adivinar a partir de
         las anteriores. Con rechazo, para que los 10 000 valores salgan con la
         misma probabilidad.
- L377: 429496 * 10000: el múltiplo de 10 000 más alto por debajo de
- L378: 2^32. Sin esto, los valores 0000-7295 saldrían más a menudo.
- L382: cae al de abajo
- L386: Diagnóstico: la FORMA de la respuesta de un endpoint, sin un solo
         valor dentro. Es la herramienta con la que se escribe cada contrato
         contra lo que la API devuelve de verdad — la documentación y la
         realidad ya se contradijeron seis veces.
- L394: ── El interruptor, visto desde el panel ────────────────────────
         El estado real lo lleva el servidor (functions/interruptor.js) y vive
         en Firestore. Acá solo se lee para mostrarlo y se enciende o apaga a
         mano. La cuenta de fallos NO se toca desde el navegador: es del motor.
- L399: El texto del estado. Los tres casos dicen cosas distintas a propósito:
         apagada la decidió el operador, pausada la decidió la puerta sola, y
         confundirlos haría buscar el arreglo donde no está.
- L420: Catálogo de cajas de Shalom (medidas oficiales de su app, ver
         docs/SHALOM.md). No son rangos: son cajas fijas, así que la regla
         correcta es "la más chica en la que el paquete entra" — nunca "el rango
         donde cae la medida más grande". Las dimensiones se guardan YA
         ordenadas de mayor a menor: comparar así deja elegir cualquier cara
         como largo/ancho/alto sin perder el ajuste (una caja no distingue de
         qué lado la acostás). "Sobre" queda afuera a propósito: es una
         categoría de contenido (documentos), no un tamaño — no hay umbral
         numérico que lo distinga de un paquete real.
- L437: Clasifica un paquete por sus medidas y peso.
         → {tipo:'S', etiqueta:'Paquete S'}      la caja donde entra
         → {tipo:'OTRA', etiqueta:'Otra Medida'} no entra en ninguna (grande o pesada)
         → null                                  faltan datos: no se puede clasificar
         Nunca lanza — datos incompletos o inválidos devuelven null, no un error.

## panel/shalom/ticket.js

- L1: panel/shalom/ticket.js — jalar el ticket de Shalom
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: ticket.js — Jalar ticket de Shalom (PNG) v1
  ============================================
  Pide el ticket por la puerta única (shalom.js) con orderNumber + orderCode
  y lo coloca en el slot GUÍA / TICKET (agencia) del formulario.
  
    orderNumber = trackingOrderNumber / shalomGuia   (campo fShalomGuia)
    orderCode   = trackingOrderCode   / shalomCodigo (campo fShalomCodigo)
  
  Persistencia (reutiliza el mecanismo de storage.js):
    - Pedido EXISTENTE → sube el PNG directo a Firebase Storage (URL https://… persistente)
    - Pedido NUEVO     → guarda base64 temporal; storage.js lo migra a Storage al guardar
  
  Reglas respetadas:
    - SIN MutationObserver (parchea openForm como hace qrtracking.js)
    - Archivo independiente: solo agregar <script src="ticket.js"></script> en index.html
    - No rompe funcionalidades existentes
  
  Orden de carga: DESPUÉS de delivery.js (openForm / refreshSlot / _docs / _editId)
                  y DESPUÉS de storage.js (window.StorageModule).
  
  ESTADO (2026-10-28): CONECTADO. El servidor descarga el ticket, lo guarda
  en Storage y lo apunta en el pedido (functions/ticketShalom.js). Aquí solo
  se pide y se pinta el enlace que vuelve: el navegador no toca el archivo.
- L33: Sin CONFIG de red: quién habla con Shalom es shalom.js, la puerta única.
       Aquí vivía una URL a shalom-api.lat con una ranura para la API key en el
       navegador ("solo pruebas"). Una ranura así no es una prueba: es la clave
       del negocio a un descuido de estar en el código que se publica. Y el
       proxy al que apuntaba la otra rama (`shalomTicket`) ni siquiera existía
       en el backend, así que ese camino llevaba meses muerto.
- L40: ── HELPERS ───────────────────────────────────────────────────────
- L45: Leer guía + código del formulario, con fallback al pedido en edición
- L64: ── API PÚBLICA ───────────────────────────────────────────────────
- L74: El servidor guarda el ticket EN el pedido: hace falta que exista.
- L80: Reemplazar un documento que ya está es una decisión: se pregunta.
- L95: Ya está guardado en la nube. Se refleja en el formulario y en el
- L96: pedido en memoria (si cierras sin guardar, el ticket sigue ahí).
- L111: Qué decir de cada motivo: honesto, nunca mudo.
- L115: POR_DEJAR / VENCIDA: la regla única (RegistroShalom.situacion), en el servidor.
- L128: Con el detalle (qué llegó: tipo y forma, sin datos del cliente) para
- L129: poder adaptarlo sin adivinar. Mándame foto de este mensaje.
- L134: ── INYECTAR BOTÓN EN EL SLOT GUÍA / TICKET (agencia) ─────────────
- L137: slot guía aún no existe
- L138: ya inyectado
- L150: Insertar justo después del botón "+ Agregar" del slot guía / ticket
- L154: Parchear openForm para asegurar el botón cada vez que se abre (sin MutationObserver)
- L160: el form ya está renderizado
- L170: por si el slot ya está en el DOM

## panel/shalom/tracking.js

- L1: panel/shalom/tracking.js — el seguimiento de Shalom en el panel
  Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
- L5: tracking.js — UI de tracking Shalom en el panel
  ================================================
  Tarjeta de tracking, modal de edición de guía, historial, manual, y el
  vigilante "llegó a destino" (agnóstico al motor). El rastreo en sí (consultar,
  masivo) pasa por la PUERTA ÚNICA shalom.js, hoy desconectada — ver docs/SHALOM.md.
  El motor viejo (API paga + worker propio) se retiró: Shalom protege su portal
  con reCAPTCHA v3 y un servidor nunca saca nota.
- L17: ══════════════════════════════════════════════
     CONFIGURACIÓN
  ══════════════════════════════════════════════
- L21: Únicas palabras clave que sobreviven: las usa detectarEstadoAuto para el
- L22: vigilante "llegó a destino" (agnóstico al motor). El motor de rastreo vive
- L23: ahora en shalom.js; su lógica vieja se retiró.
- L30: Los estados TAL COMO los muestra Shalom. El texto se guarda literal (es lo
     que ve el operador y el cliente); la interpretación la hace el aplicador.
     El primero vacío = "no cambiar", para que guardar la guía no toque el estado.
- L36: ══════════════════════════════════════════════
     HELPER — escapar HTML
  ══════════════════════════════════════════════
- L41: ══════════════════════════════════════════════
     DETECCIÓN AUTOMÁTICA DE ESTADO
  ══════════════════════════════════════════════
- L56: ══════════════════════════════════════════════
     APLICADOR — único dueño de "qué hacer con una respuesta de Shalom"
  ══════════════════════════════════════════════
- L59: Traduce un código de motivo a un aviso en español (honesto, nunca mudo).
     Cada motivo dice qué pasó Y qué hacer: un aviso que no orienta obliga a
     adivinar, y adivinar sobre un envío de un cliente sale caro.
- L62: Pega la explicación de Shalom al aviso, si la dio. Se recorta porque un
     aviso flotante que no se alcanza a leer no sirve, y se limpia el HTML
     porque el texto viene de afuera.
- L72: "Se pausó solo" sin decir hasta cuándo se lee como "se rompió". Con la hora
     es una espera; sin ella, un problema.
- L84: NO ES UN ERROR, y por eso no lleva ⚠️. Shalom reconoce la guía pero
         todavía no ha entrado a ninguna agencia: el paquete sigue contigo.
         Antes esto no existía como respuesta —la puerta traducía la guía recién
         nacida como "En origen"— y la primera consulta movía la etiqueta a
         ENVIADO con el paquete en la tienda.
- L92: Estos dos son del PANEL, no de Shalom. Antes los dos caían en BLOQUEADO
- L93: y mandaban a revisar la cuenta de Shalom cuando lo único que pasaba era
- L94: que la sesión había vencido: media tarde perdida mirando el lugar
- L95: equivocado. El aviso tiene que apuntar al arreglo correcto.
- L98: De acá para abajo el problema es de Shalom. Cuando Shalom explica por
- L99: qué falló, su explicación se repite TAL CUAL entre paréntesis: sin eso,
- L100: "error temporal" se ve igual el día que es un tropiezo de un minuto y el
- L101: día que su sesión está caída y nada va a andar hasta que vuelvas a
- L102: entrar. La misma frase para dos mundos distintos es lo que hace
- L103: reintentar veinte veces sin avanzar.
- L111: shalom-api no pudo leer la guía en Shalom (su búsqueda en vivo recibe
         403). No es la guía ni tu cuenta: en shalom.com.pe se ve bien.
- L116: Los dos del INTERRUPTOR. No son fallos: son el sistema protegiéndose.
         Y son distintos entre sí — uno lo decidió el operador y el otro lo
         decidió la puerta sola—, así que decirlos igual haría buscar el arreglo
         en el sitio equivocado.
- L125: La respuesta llegó pero no se reconoció su forma. NO se inventa un
- L126: estado: se avisa para poder ajustar el traductor con el dato real.
- L133: Escritor atómico del tracking visible: estado + mensaje + hora + historial en
     una sola pasada. Es IMPOSIBLE dejar un estado sin su hora ni su entrada.
- L138: origen: 'shalom' (lectura automática) | 'manual' (lo puso el operador).
- L139: El historial lo muestra con su distintivo, así se sabe de dónde salió cada dato.
- L146: ÚNICO lugar que aplica una respuesta de la puerta a un pedido. Lo usan el
     botón manual, el masivo y el auto-check. Devuelve:
       { cambio:true,  resultado:'FINALIZADO'|'EN_DESTINO'|'ENVIADO'|'ok', estado }
       { cambio:false, motivo }   ← sin dato real: NO toca el pedido (nunca finge)
     Mueve la etiqueta respetando el modo (off/semi/auto) y sin retroceder jamás.
- L153: La hora de consulta se estampa SOLO si la consulta sirvió. Antes se
- L154: estampaba en la primera línea, antes de mirar la respuesta: una consulta
- L155: fallida también quedaba marcada como "visto", que es decir que se miró
- L156: cuando no se pudo ver nada.
- L157: `detalle` viaja junto al motivo: cuando Shalom explica el rechazo,
- L158: el aviso repite su explicación en vez de inventar una. Si no explicó
- L159: nada, va el código HTTP: es poco, pero es un hecho — y un hecho corto
- L160: vale más que un "error temporal" que no distingue nada.
- L165: el servidor ya miró tus envíos pendientes (y no estaba)
- L170: El estado semántico viene de la barra de pasos (más robusto) o, si no, del
- L171: texto. pasos: 0 origen · 1 tránsito · 2 destino · 3 entregado.
- L181: ni texto ni barra → no inventamos
- L184: ── GUARDA DE NO RETROCESO ────────────────────────────────────────────
       Un envío no desanda el camino. La etiqueta del pedido ya tenía esta
       protección; el texto del tracking no, y por eso una respuesta peor podía
       pisar una buena: una guía Entregada volvió a mostrarse como "Demora de
       envíos" y otra En destino se quedó en "En tránsito".
  
       Solo bloquea cuando se puede DEMOSTRAR el retroceso: ambos textos tienen
       que ser reconocibles y el nuevo estrictamente anterior. Un texto que no
       sabemos clasificar nunca bloquea — así los pedidos que hoy están mal
       guardados (por ejemplo, con "Demora de envíos" encima de un Entregado)
       se pueden corregir con una consulta, en vez de quedar congelados.
  
       El operador es la excepción: si el estado lo pone a mano (origen
       'manual'), manda él. La guarda existe para atajar datos, no personas.
- L211: 1) Tracking visible: se escribe siempre que el texto cambie.
- L212: `escribio` distingue dos cosas que antes se veían idénticas desde
- L213: afuera: que Shalom haya contestado bien, y que algo haya cambiado. Un
- L214: paquete puede pasar días en el mismo estado; sin este dato el operador
- L215: consulta, todo funciona, nada se mueve en pantalla, y parece roto.
- L222: 2) LA ETIQUETA. Vuelve a moverse (18 sep 2026, decisión del negocio: es la
          fórmula del manual del panel), y lo hace por el MISMO archivo que usa el
          barrido del servidor: functions/etiquetas.js. Ahí viven los tres modos,
          el no-retroceso, la regla de que un pedido con saldo no se cierra, y la
          de que una etiqueta tuya —RECLAMOS, AVISAR CUANDO LLEGUE— no se toca.
          Acá no se decide nada: se pregunta y se aplica.
- L241: `cambio`   = Shalom contestó con un dato real (se pudo aplicar).
- L242: `escribio` = ese dato era distinto al que ya teníamos.
- L243: `avanzo`   = el paquete llegó más lejos que la última vez. Es lo que
- L244: decide si hay algo que CONTAR, y no puede depender de
- L245: `escribio`: un envío puede avanzar de "En tránsito" a
- L246: "En destino" con el mismo texto guardado, y ese caso —
- L247: justo el que se nos escapó con la guía 95046118 — se
- L248: anunciaba como "sin cambios".
- L253: Lee un texto de estado y dice en qué punto del recorrido cae:
       0 origen · 1 tránsito · 2 destino · 3 entregado · null = no se reconoce
     "Demora de envíos" devuelve null A PROPÓSITO: una demora no es un punto del
     recorrido, es algo que le pasa a un envío en camino. Tratarla como punto es
     lo que hacía que pisara un "Entregado".
  
     Hubo una copia gemela en el servidor (`_idxDeTexto`), que se fue con la
     integración el 2026-09-13. Cuando el webhook vuelva, va a necesitar la misma
     decisión: si se escribe otra copia, las dos tienen que cambiar juntas — y la
     prueba que las compara vuelve con ella.
- L264: La regla vive en functions/etiquetas.js porque el barrido del servidor
       necesita EXACTAMENTE la misma respuesta. Dos copias divergen, y divergir
       aquí significa que el barrido mueva de madrugada una etiqueta que el panel
       habría rechazado. Si el archivo no cargó, se devuelve null: no clasificar
       nunca bloquea ni mueve nada, así que lo peor es no hacer nada.
- L275: ══════════════════════════════════════════════
     ALERTA DE DESTINO
  ══════════════════════════════════════════════
- L278: ── Aviso "llegó a destino" — vigilante AGNÓSTICO AL MOTOR ─────────────────
     Detecta la TRANSICIÓN de un pedido a destino (por status o por trackingStatus)
     y avisa UNA sola vez, sin importar el motor (A local o B por Firestore). Se
     dispara desde render() → Tracking.checkDestinoAlerts. El aviso queda FIJO
     hasta que lo cierres.
- L283: Set de ids ya avisados (persistido en localStorage)
- L284: ¿existía la clave? (para sembrar en el rollout sin avalancha)
- L298: ¿El pedido está "en destino"? Agnóstico al motor y al modo (etiqueta u observación).
- L299: ¿SHALOM dice que llegó a destino?
     Mira SOLO el tracking, nunca la etiqueta. Antes también devolvía true si el
     pedido estaba en LLEGÓ A DESTINO o PENDIENTE DE PAGO, y eso tenía sentido
     cuando la etiqueta la movía el sistema: era otro rastro del mismo hecho.
     Ya no. Desde que el movimiento automático se retiró, la etiqueta es una
     decisión del operador, así que leerla acá convertía el aviso en un eco: el
     operador marcaba "LLEGÓ A DESTINO" a mano y la app se lo anunciaba de vuelta
     —con la tira apareciendo justo debajo de la tarjeta, como si lo hubiera
     averiguado la consulta— incluso cuando Shalom seguía diciendo "En tránsito".
     El aviso existe para contar algo que el operador NO sabía. Si lo puso él, ya
     lo sabía.
- L314: Vigilante: avisa los que ENTRARON a destino y no se habían avisado. En el primer
- L315: arranque (sin clave previa) solo SIEMBRA en silencio → nada de avisos en masa.
- L323: rollout: solo sembrar
- L324: Pocos → tiras hacia abajo. Bastantes → resumen que, al tocar "Ver", se
- L325: despliega en las tiras de ESOS pedidos apiladas una sobre otra.
- L330: La pila vive DENTRO de la página, justo encima de los 4 cuadros de cantidades.
- L331: Antes flotaba fija sobre la pantalla (position:fixed) y TAPABA el contenido;
- L332: en el flujo normal lo empuja hacia abajo, así nunca oculta nada.
- L338: Mismo ancho de siempre (no se toca el tamaño de la tarjeta).
- L343: respaldo si aún no existe
- L357: El monto de la tira: regla única para los pedidos de hoy en adelante;
- L358: los de antes, solo si deben (lo mismo que enseña su tarjeta).
- L367: Construye la tira de UN pedido (no la inserta). Misma tarjeta de siempre.
- L368: DOM + addEventListener → el teléfono no va en un onclick inline (cierra el
- L369: vector XSS del hallazgo #5).
- L371: solo dígitos
- L377: ★ CELULAR Y MONTO EN UNA LÍNEA (26/10/2026). Antes iba la guía, que
       para avisar al cliente no sirve. El celular se copia al tocarlo —con la
       misma función que la tarjeta— y a la derecha va lo que debe, con la
       regla de functions/montoPedido.js. Los pedidos de antes solo enseñan
       monto si deben, como su tarjeta.
- L398: solo dígitos, «S/» y <s>: lo arma MontoPedido.html
- L415: Quita una tira y, si estaba en un mazo, reordena para que la siguiente pase
- L416: al frente. Si el mazo queda vacío, se elimina (sin huecos en blanco).
- L428: Mazo: una tira DEBAJO de otra, enteras (26/10/2026). Antes se montaban
- L429: (-62px) y solo se leía la primera: avisar al cliente número 7 obligaba a
- L430: cerrar las seis de encima.
- L440: «Cerrar todos»: solo cuando hay dos o más tiras. Cerrarlas una por una
- L441: con doce en lista es pesado.
- L460: Aviso individual (fijo hasta cerrar).
- L464: dedup: ya visible
- L469: Aviso resumen cuando llegan varios de golpe (fijo hasta cerrar).
- L470: "Ver" ya no filtra y descarta el aviso: despliega las tiras de ESOS pedidos
- L471: APILADAS una sobre otra, para avisar cliente por cliente desde ahí mismo.
- L482: el resumen se reemplaza por las tiras
- L489: Despliega las tiras apiladas una sobre otra.
- L496: ya visible
- L502: el mazo ya está dentro: ahora sí se cuentan sus tiras
- L506: ══════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════
- L530: overlay historial
- L538: overlay manual
- L549: ══════════════════════════════════════════════
     OVERLAYS
  ══════════════════════════════════════════════
- L591: ══════════════════════════════════════════════
     CHIP DE ESTADO
  ══════════════════════════════════════════════
- L594: EL PLAZO DE 24 H DE SHALOM.
     Shalom borra la guía que no se deja en la agencia dentro de 24 h —su propio
     panel muestra la cuenta atrás— y una guía borrada es un envío que no existe.
     Sin esto, lo único que veías era "Registrado" y nada que te apurara.
  
     Devuelve null cuando el pedido no trae sello de hora: los envíos
     recuperados con `recuperarEnvio` no lo tienen a propósito, porque su hora
     de nacimiento no se puede afirmar. Mejor sin cuenta atrás que con una
     inventada que te deje tranquilo mientras el plazo se vence.
- L613: menos de 3 h
- L621: ★ EL HUECO ENTRE REGISTRAR Y RASTREAR.
         Al registrar en Shalom el envío ya EXISTE —tiene guía, código y
         monto— pero todavía no se ha movido, así que no hay nada que
         rastrear. Decir "Sin consultas aún — presiona Consultar" invita a
         consultar algo que aún no puede responder, y calla lo único que
         importa: que está registrado y que hay un plazo para dejarlo.
         En cuanto Shalom lo mueve, manda el rastreo: el estado del
         transporte es más fresco que "lo registré yo".
- L654: FECHA DEL CAMBIO, SIEMPRE. Hubo una vuelta acá que conviene no repetir:
       por un tiempo el chip mostró "visto hace X" (la hora de la última
       consulta) en lugar de la fecha del cambio. Resolvía una queja real —
       un paquete puede pasar días en "En tránsito" y presionar Consultar
       parecía no hacer nada— pero la resolvía tirando el dato: para trabajar
       sirve saber CUÁNDO se movió el paquete, no cuándo lo miré.
       Que la consulta se note es trabajo del aviso ("✓ Sin cambios — sigue
       En tránsito"), que sale en cada clic. La hora de la última consulta
       sigue guardada y se ve en el Historial, donde hay sitio.
- L666: Una fecha ilegible es peor que ninguna: si el dato guardado no es una
- L667: fecha válida, el chip va sin sello en vez de decir "Invalid Date".
- L676: "hace 3 min" / "hace 2 h" / "hace 4 d". En minutos hasta la hora, porque el
     caso que importa es el inmediato: acabo de tocar Consultar, ¿pasó algo?
- L687: ══════════════════════════════════════════════
     API PÚBLICA: Tracking
  ══════════════════════════════════════════════
- L691: vigilante "llegó a destino" (hook desde render)
- L693: ── Helper: obtener shipments desde cualquier fuente ───────────────
- L695: 1. window.S (expuesto por index.html)
- L697: 2. S como variable global (let S en index.html)
- L699: 3. Buscar en todas las variables globales
- L718: Búsqueda exacta primero
- L721: Fallback: buscar por trackingOrderNumber
- L724: Fallback: buscar por shalomGuia
- L731: ── renderCardBlock ───────────────────────────────────────────────
- L733: ★ FIX img 404: limpiar referencias a imágenes inválidas
- L758: ── abrirEdicion ──────────────────────────────────────────────────
- L774: ESTADO: lo que dice Shalom, puesto a mano. Vale IGUAL que una lectura
- L775: automática — pasa por el mismo aplicador, así que escribe historial y
- L776: mueve la etiqueta según tu modo. Pensado para el celular, donde el
- L777: rastreo automático (que corre en la PC) no puede llegar.
- L780: Se preselecciona el estado actual (si coincide con uno de la lista) para
- L781: que veas dónde está el pedido sin tener que abrir el historial. Aun así,
- L782: guardar sin tocarlo no reescribe nada: el aplicador ignora el estado
- L783: repetido, así que no ensucia el historial con entradas duplicadas.
- L797: Avisos del número de guía (formato y repetida). Va DESPUÉS del innerHTML:
- L798: el modal se reconstruye entero cada vez que se abre, así que el campo que
- L799: había antes ya no existe.
- L803: ── _guardarEdicion ───────────────────────────────────────────────
- L820: Si cambió la guía, resetear estado
- L826: La guía nueva no la registró Shalom Pro desde aquí: sin su marca ni
         su hora, no hay plazo de 24 h ni «registrar de nuevo» que ofrecer.
- L832: Guardar la guía NO mueve la etiqueta: conserva la que tenía. Es la primera
- L833: consulta (manual o automática) la que la pasa a ENVIADO. Antes esto forzaba
- L834: ENVIADO en cada guardado, así que un pedido ya en LLEGÓ A DESTINO retrocedía
- L835: a ENVIADO al entrar solo a corregir la guía — el "a veces cambia de etiqueta
- L836: y se regresa solo" que buscábamos.
- L838: ESTADO puesto a mano: entra por el MISMO aplicador que el automático, así
- L839: que hace exactamente lo mismo (historial + etiqueta según el modo). Vacío =
- L840: no cambiar. Se marca como 'manual' para distinguirlo en el historial.
- L845: ★ Subida INMEDIATA: para que el link del cliente lo vea al instante.
- L850: El aviso informa lo que dice Shalom y, cuando toca, sugiere la acción.
- L851: Ya no anuncia cambios de etiqueta: la etiqueta la mueves tú.
- L861: Consulta un pedido por la puerta y aplica el resultado. Devuelve el objeto
     del aplicador. No toca UI global (lo hace el llamador).
- L871: El aviso de una consulta, en un solo sitio.
  
     EL ORDEN IMPORTA, y es la parte que estaba mal: antes lo primero que se
     preguntaba era si el TEXTO había cambiado, y si no, se decía "sin cambios"
     y se acababa ahí. Eso tapaba el caso que de verdad importa — el paquete
     avanzó pero Shalom lo redacta igual. Pasó con la guía 95046118: llegó a
     destino a las 08:34, el panel lo supo (pasos = 2) y respondió "sin cambios".
     Ahora se pregunta primero si AVANZÓ.
- L881: Un retroceso bloqueado no es un fallo ni un cambio: se dice lo que hay y
- L882: lo que se rechazó, para que nunca sea una decisión silenciosa.
- L895: La situación de la guía: la ÚNICA regla (functions/registroShalom.js →
     situacion), la misma que usan el ticket y la consulta por horarios.
- L902: «Shalom no conoce esta guía» (NO_ENCONTRADO) o «solo registrada»
     (SOLO_REGISTRADO), dicho según la situación. No es un error: con la guía
     del panel por dejar es justo lo esperado.
- L916: El servidor ya miró tus envíos pendientes y no está: no es «normal».
- L922: PENDIENTE: el servidor la encontró entre los envíos pendientes de tu cuenta.
- L925: ── consultarAhora: botón ⟳ por tarjeta ───────────────────────────
- L937: Vencida (72 h sin movimiento): no se gasta una consulta en ella.
- L948: La hora de consulta se guarda siempre, haya cambiado el estado o no: es
- L949: lo que permite que el chip muestre "visto hace un momento" y que tocar
- L950: el botón se note aunque el paquete lleve días quieto.
- L952: subida inmediata
- L957: PUERTA_CERRADA trae `reabre` (una hora) en vez de `detalle` (un texto).
- L962: Se restaura SIEMPRE, en los dos caminos. Antes solo se hacía en el de
- L963: error: el otro confiaba en que render() redibujara la tarjeta, y si el
- L964: pedido quedaba fuera del filtro activo o render fallaba, el botón se
- L965: quedaba en "Consultando…" para siempre.
- L970: ── bulkTrack: masivo desde el ícono 🔄 con selección ─────────────
- L984: Solo se marca para guardar lo que realmente cambió: un retroceso
- L985: bloqueado no escribió nada, y marcarlo sucio sería una escritura
- L986: en Firestore por un pedido que quedó igual.
- L998: Si NINGUNO respondió, di el motivo (p.ej. desconectado); si algunos sí, resume.
- L1007: ── verHistorial ──────────────────────────────────────────────────
- L1023: Estado actual
- L1031: La hora de la última consulta vive acá y no en el chip: en el chip
- L1032: desplazaba a la fecha del cambio, que es el dato con el que se trabaja.
- L1037: Historial Shalom (estados de la API)
- L1050: Log de consultas
- L1056: AUTO = lo leyó el lector de la PC ('shalom', 'shalom-local', 'auto');
- L1057: MANUAL = lo puso el operador a mano. Antes cualquier cosa que no
- L1058: dijera 'auto' salía como MANUAL, así que las lecturas automáticas se
- L1059: mostraban mal.
- L1076: ── abrirManual ───────────────────────────────────────────────────
- L1082: ── copiarLink ────────────────────────────────────────────────────
- L1086: El token, no el id — ver functions/enlaceSeguimiento.js. Un pedido de
       ayer no tiene token y se cae a su id, que es justo lo que queremos: su
       link ya enviado sigue abriendo.
- L1104: ── Auto-check al abrir el panel — APAGADO A PROPÓSITO ──────────────
     Esto consultaba TODOS los pedidos Shalom pendientes cada vez que abrías el
     panel. Antes no se notaba porque estaba gateado en Shalom.DISPONIBLE, que
     era false; al conectar la API oficial se habría despertado solo y, con ~60
     pedidos en cola, habría disparado ~60 consultas en cada apertura.
  
     Se deja apagado por dos razones:
       1. Fase 1 es para VALIDAR con el botón ⟳ Consultar, de a una guía. Un
          barrido masivo antes de comprobar que el traductor lee bien la
          respuesta multiplicaría un error por sesenta.
       2. Los webhooks de la Fase 2 hacen innecesario preguntar: Shalom avisa
          cuando algo cambia. Este ciclo desaparece entonces.
  
     Para reactivarlo temporalmente: poner AUTO_CHECK_ACTIVO en true.
- L1121: ver nota de arriba
- L1122: puerta desconectada
- L1125: el operador lo apagó
- L1143: la puerta ya devuelve {ok:false}; no rompemos el ciclo
- L1152: ── init ──────────────────────────────────────────────────────────
- L1156: Sincronizar S con window.S con reintento
- L1170: no-op mientras Shalom.DISPONIBLE sea false

## seguimiento.html

- L8: ★ SEGUIMIENTO DEL CLIENTE, EN SU PROPIA PÁGINA (Fase 2, 10/11/2026).
       Antes vivía dentro de formulario.html y quien solo quería ver su pedido
       descargaba el formulario entero. Esta página carga solo lo suyo:
         · cliente/cliente.css y cliente/comun.js (compartidos con el formulario);
         · cliente/seguimiento.js (lo propio);
         · el telón de carga, y el narrador y Toby en diferido.
       Sin App Check a propósito: pesa cientos de KB (reCAPTCHA) y retrasaba la
       primera consulta, y el servidor no lo exige para el seguimiento (sí para
       el DNI). Lo que protege el link es su token al azar y el freno por IP.
- L24: El telón de carga, síncrono: TTLoader existe antes de la primera consulta.

## shalom-local/rastrear.js

- L3: rastrear.js — Lector LOCAL del seguimiento público de Shalom
  ============================================================
  Corre en TU PC (no en la nube), con tu IP residencial, que sí pasa el
  reCAPTCHA v3 de Shalom. Abre la página PÚBLICA shalom.com.pe/rastrea como lo
  haría una persona, escribe la guía + código, y lee el estado que Shalom pinta
  en pantalla (la barra de 4 pasos + el encabezado). No inicia sesión, no
  descifra nada, no falsifica firmas: lee una página pública, como tú a mano.
  
  FASE A (este archivo): SOLO LEER. No toca tu base de datos. Sirve para
  comprobar lo único que aún no sabemos: si tu PC puede leer Shalom a través
  del reCAPTCHA. Cuando eso quede probado, la Fase B agrega subir a Firestore.
  
  USO:
    node rastrear.js --debug 92892656 ABCD
       → abre el navegador, busca esa guía, GUARDA el texto y una captura en
         ./debug/ y muestra lo que interpretó. Con esto CALIBRAMOS el lector
         contra la estructura real antes de confiar en él.
  
  Requisitos (una sola vez, en tu PC):
    npm install
    npx playwright install chromium
- L31: perfil persistente: mejora
- L32: la nota de reCAPTCHA con el tiempo (cookies estables) y parece más humano.
- L34: ── Interpretación del estado ───────────────────────────────────────────────
- L35: CLAVE: la barra de pasos SIEMPRE trae las 4 palabras (En origen, En tránsito,
- L36: En destino, Entregado). Buscar una palabra "a secas" agarraría la barra, no el
- L37: estado real. Pero el ENCABEZADO (el estado actual) aparece SIEMPRE ANTES que
- L38: la barra en el texto → gana la coincidencia de MENOR posición. Estas claves se
- L39: afinan con la salida de --debug contra la página real.
- L51: Interpreta el TEXTO visible del resultado. Devuelve {ok, estado, fecha, bloqueado}.
  NUNCA inventa: si no reconoce nada, ok:false (no forzamos un estado).
  Elige el estado por POSICIÓN (el encabezado va antes que la barra), así la
  barra de 4 pasos no lo confunde. Exportada aparte para probarla sin navegador.
- L61: Fecha del evento: "Desde el 22/08/26 a las 16:56"
- L66: Bloqueo (reCAPTCHA / login) — NO es "sin estado", es "no me dejaron ver".
- L70: Guía/código que Shalom no reconoce — texto exacto visto en pantalla real:
- L71: "No se encontró la orden de servicio." Es un dato MAL escrito, no un fallo
- L72: nuestro ni de Shalom: hay que avisarlo distinto de todo lo demás.
- L78: Tropiezo TEMPORAL del lado de Shalom — texto exacto visto en pantalla real:
- L79: "Ups, algo no ha funcionado correctamente. Inténtalo de nuevo pronto."
- L80: NO es un dato malo: el número puede estar perfecto. Se avisa distinto para
- L81: no mandar a "revisar el número" cuando el problema es de Shalom, no tuyo.
- L87: Estado = la clave que aparece MÁS TEMPRANO (el encabezado, no la barra).
- L100: Abre el navegador con perfil persistente (cookies estables entre corridas:
  mejora la nota de reCAPTCHA con el tiempo). Quien la abre debe cerrarla
  (ctx.close()) al terminar. Compartida entre rastrear.js (una guía) y
  subir.js (varias guías en la misma sesión — más rápido y más "humano" que
  abrir/cerrar un navegador por cada una).
- L116: ── Driver del navegador ──────────────────────────────────────────────────
- L117: Si se pasa `opts.ctx` (un contexto ya abierto), lo REUTILIZA y NO lo cierra
- L118: al terminar — así subir.js puede consultar muchas guías en una sola sesión.
- L119: Sin `opts.ctx`, abre y cierra su propio contexto (uso suelto / CLI).
- L130: Los dos primeros inputs de texto: N° de Orden y Código.
- L140: Esperamos a que la página pinte algo reconocible (estado o muro de login).
- L141: OJO: esta regex corre sobre el texto CRUDO (con tildes) del navegador,
- L142: no sobre el normalizado — "encontró" lleva tilde, hay que aceptarla.
- L147: que termine de asentarse
- L152: siempre disponible: permite autodiagnosticar sin
- L153: tener que volver a consultar cuando algo no se reconoce (ver subir.js).
- L155: En modo debug guardamos TODO para calibrar el lector contra la realidad.
- L168: solo cerramos lo que abrimos
- L172: ── CLI ─────────────────────────────────────────────────────────────────────
- L200: Exportamos parsearEstado para poder probarla sin abrir el navegador.

## shalom-local/subir.js

- L3: subir.js — Fase B: consulta los pedidos Shalom pendientes y sube el estado
  =============================================================================
  Lee de tu Firestore los pedidos Shalom con guía+código que aún no terminaron,
  los consulta con el lector de rastrear.js (tu navegador, tu IP, el mismo que
  ya probamos), y escribe el resultado de vuelta — respetando el modo de
  etiquetas de tu Config, exactamente como lo hace el botón ⟳ del panel.
  
  NO ES EL MISMO CÓDIGO que tracking.js `_aplicarEstadoShalom` — es una copia
  deliberada, pura (sin DOM), porque el navegador y Node no comparten módulos
  en este proyecto. Es el MISMO patrón que ya usa functions/shalomWebSync.js
  para sus palabras clave: motor aislado, misma regla, documentado a propósito.
  Si cambias la regla de etiquetas en tracking.js, cámbiala aquí también.
  
  REGLA DE ORO (la misma de siempre): si Shalom no dio un dato real, NO se
  toca el pedido. Nunca se finge éxito.
  
  USO:
    node subir.js            → consulta todos los pendientes y escribe
    node subir.js --dry-run  → consulta y MUESTRA qué escribiría, sin tocar Firestore
    node subir.js 92678946   → una sola guía puntual (por su N° de orden)
  
  Requiere `serviceAccount.json` en esta carpeta (ver README.md — Fase B).
- L33: gentil con Shalom — mismo ritmo que el
- L34: worker viejo, para no verse como una ráfaga de bot.
- L36: ── Internet REAL antes de arrancar ─────────────────────────────────────────
- L37: Cuando el Programador despierta la PC de la suspensión, Windows puede tardar
- L38: en reconectar el Wi-Fi aunque el ícono ya diga "conectado". Si abrimos el
- L39: navegador contra una red que no responde, rastrear.js puede quedarse
- L40: esperando mucho más de lo esperado. Se comprueba con una petición real (no
- L41: basta con el estado del adaptador) y se reintenta antes de rendirse.
- L42: 2 minutos de margen tras despertar
- L62: ── Vigía: nunca colgado más de la cuenta ───────────────────────────────────
- L63: Segundo seguro además del "Detener la tarea si se ejecuta más de..." del
- L64: Programador: si CUALQUIER paso se cuelga (perfil de navegador bloqueado por
- L65: una corrida zombie, red que nunca vuelve, lo que sea), esto fuerza el cierre
- L66: en vez de dejar un node.exe vivo para siempre bloqueando las próximas corridas.
- L69: ── Reglas de negocio — COPIA DELIBERADA de tracking.js, ver cabecera ───────
- L84: Decide qué escribir en Firestore para UN pedido, a partir de la lectura del
  lector. Devuelve SOLO los campos que cambian (nunca el objeto completo — el
  mismo principio que ya corrigió el bug de window.save: no reescribir de más).
    {cambio:true,  cambios:{...}, resultado}
    {cambio:false, motivo}   ← sin dato real: no se escribe nada
  
  NUNCA toca `status` (la etiqueta): se retiró el movimiento automático, aquí y
  en el panel. Este script registra lo que dice Shalom; mover la etiqueta es
  decisión del operador. `resultado` se sigue calculando solo para el resumen
  que se imprime en el registro.
- L99: "No se encontró la orden de servicio": dato mal tecleado, no un fallo.
- L101: "Ups, algo no ha funcionado correctamente": tropiezo DE SHALOM, no del dato.
- L109: 1) Tracking visible: solo si el texto cambió (igual que el navegador).
- L120: 2) La etiqueta NO se toca. Solo se interpreta para el resumen del registro.
- L128: ── Candado: nunca dos corridas a la vez ────────────────────────────────────
- L129: El Programador puede disparar mientras una corrida sigue viva (PC lenta, o
- L130: una corrida larga). Sin esto tendrías DOS navegadores golpeando Shalom a la
- L131: vez — justo lo que sube el riesgo de bloqueo. El candado guarda el PID: si el
- L132: proceso que lo dejó ya murió (corte de luz, cierre forzado), se ignora solo.
- L136: Cada cuánto corre la tarea programada. El panel lo usa para saber a partir de
- L137: cuándo alarmarse: con 6 h, avisar a las 3 h daría rojo casi siempre.
- L146: otra corrida en curso: no arrancamos
- L147: candado huérfano: se limpia solo
- L152: ante la duda, dejamos correr (no bloquear por el candado)
- L156: ── Registro mensual ────────────────────────────────────────────────────────
- L157: Un archivo por mes, y se borran solos los de más de 3 meses. Sin esto, una
- L158: corrida que falla de madrugada no deja rastro y volvemos al fallo silencioso.
- L168: Limpieza: fuera los registros de más de 3 meses.
- L177: el registro nunca debe tumbar la corrida
- L180: ── Latido: revive el centro de alertas del panel ───────────────────────────
- L181: Se escribe DENTRO de panel/config (campo "salud"), que el panel ya sabe leer
- L182: y mostrar con su semáforo, sus KPIs y sus problemas agrupados. Va con merge,
- L183: así que no pisa el resto de la configuración. Se ve desde el celular sin
- L184: tener nada abierto: el lector corre en la PC, pero el latido viaja a Firestore.
- L201: ── Firestore (Admin SDK) ────────────────────────────────────────────────────
- L218: Trae los pedidos Shalom elegibles: guía+código presentes, no finalizados.
- L219: Barrido por prefijo de courier (cubre "SHALOM", "SHALOM EMPRESAS", etc.),
- L220: igual que ya hacía el backend viejo — mismo criterio, sin sorpresas.
- L243: Antes que nada: ¿hay Internet DE VERDAD? Si la PC recién se despertó y la
- L244: red todavía no responde, mejor esperar un poco y avisar claro que abrir el
- L245: navegador contra la nada.
- L252: El candado solo aplica a la corrida COMPLETA. Una consulta suelta es tan
- L253: poco tráfico que no necesita turno, y bloquearla sería molesto.
- L276: Eventos para el centro de alertas del panel: se agrupan por código y son
- L277: pulsables (te llevan al pedido). Así el caso "guía mal escrita" no se
- L278: pierde en la terminal — lo ves desde el celular.
- L301: Dato mal tecleado, no un fallo del lector ni de Shalom.
- L306: Tropiezo del lado de Shalom, no del dato: se reintenta en la próxima corrida.
- L312: Autodiagnóstico: guardamos lo que Shalom mostró, SOLO cuando no lo
- L313: reconocemos, para calibrar sin tener que volver a consultar a mano.
- L349: Registro en disco: aunque no estés mirando la pantalla, mañana lo lees.
- L355: Latido → el centro de alertas del panel (y tu celular) lo muestran solo.
- L356: En simulación o consulta suelta NO se escribe: el latido representa la
- L357: corrida completa de verdad, y ensuciarlo daría una lectura falsa del sistema.
- L362: qué máquina corrió (útil si mañana hay dos)
- L364: el panel calcula con esto cuándo alarmarse
- L377: El candado se suelta pase lo que pase (error, Ctrl+C, process.exit).
- L381: Si algo cuelga la corrida (perfil de navegador bloqueado, red que nunca
- L382: vuelve, etc.) esto la mata igual — el candado y el navegador quedan
- L383: liberados en vez de un node.exe zombie esperando para siempre.

