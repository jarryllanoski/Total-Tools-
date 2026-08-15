# Documentación — Total Tools

Punto de entrada. Empieza por donde te haga falta:

| Documento | Léelo cuando… |
|---|---|
| **[ARQUITECTURA.md](ARQUITECTURA.md)** | vuelvas al proyecto y no recuerdes qué hay en cada archivo, o vayas a mover código de sitio |
| **[INVARIANTES.md](INVARIANTES.md)** | vayas a tocar etiquetas, tracking, guardado o privacidad — son las reglas que no se deben romper sin querer |
| **[DEUDA.md](DEUDA.md)** | algo falle de forma rara, o toque decidir qué arreglar |
| [PLAN-SEGURIDAD.md](PLAN-SEGURIDAD.md) | revises seguridad y puesta en producción |
| [plan-tracking-atomico.md](plan-tracking-atomico.md) | trabajes en el escritor de tracking |

---

## Lo mínimo que hay que saber

**No hay paso de compilación.** Los `.js` se sirven tal cual desde GitHub Pages.
Cada `<script src>` lleva `?v=N`: **si cambias un archivo y no subes ese número,
tus clientes siguen con la versión vieja en caché.**

**Los archivos se comunican por `window`, no por `import`.** Si añades una
función que otro archivo va a usar, cuélgala con `window.miFuncion = miFuncion`.
Ojo: un `const` de nivel superior **no llega a `window` solo** — solo las
`function` lo hacen. Ese detalle dejó cuatro módulos sin guardar durante meses
(`DEUDA.md` § 12).

**Para guardar varios pedidos, usa la lista:** `save([id1, id2])`. Llamar
`save(id)` en un bucle de 700 congela el panel 6,5 segundos. Y `save()` **sin
argumento sube los ~700 pedidos** — solo tiene sentido tras restaurar un
respaldo.

---

## Antes de dar por bueno un cambio

Como todo se publica en `window`, el comportamiento externo del panel es
medible: la lista de nombres de `window` con su tipo (unos 509 contando los
del propio navegador), más el HTML que se pinta.

1. Servir la versión anterior (`git archive HEAD`) y la nueva a la vez.
2. Capturar en ambas: nombres de `window` con su tipo, número de botones y de
   pestañas, y el HTML con los `<script>` quitados.
3. La regla: **0 nombres perdidos, 0 tipos cambiados, HTML visible idéntico.**

Un nombre que desaparece es un módulo que dejó de funcionar en silencio.
