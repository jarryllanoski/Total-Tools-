'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  bloque('Logo vectorial, liviano y seguro');
  {
    ['marca/icono.svg', 'marca/logo.svg'].forEach((f) => {
      const t = E.leerReal(f);
      ok(t.length < 8000, f + ' pesa menos de 8 KB (' + t.length + ')');
      ok(!/<script|on\w+=|href=|xlink|<foreignObject|<image/i.test(t), f + ': sin scripts, enlaces ni imagenes incrustadas');
      ok(/fill="#02787C"/.test(t) && /fill="#F70303"/.test(t) && /fill="#FFFFFF"/.test(t), f + ': los tres colores de la marca');
    });
    ok(/viewBox="42 52 1154 1154"/.test(E.leerReal('marca/icono.svg')), 'el icono es cuadrado y ajustado (llena la pestana)');
  }

  bloque('Instalable con el logo (panel)');
  {
    const m = JSON.parse(E.leerReal('marca/app.webmanifest'));
    ok(m.short_name === 'Total Tools' && m.display === 'standalone' && m.start_url === '../index.html', 'nombre, pantalla completa y entrada al panel');
    ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable') && m.icons.some((i) => i.sizes === '192x192'), 'iconos 192, 512 y adaptable');
    m.icons.forEach((i) => ok(fs.existsSync(path.join(E.RAIZ, 'marca', i.src)), 'existe ' + i.src));
    ok(/<link rel="manifest" href="marca\/app\.webmanifest\?v=\d+">/.test(E.leerCrudo('index.html')), 'el panel lo enlaza');
  }

  bloque('Vista previa al compartir el link (WhatsApp, Facebook)');
  {
    ['formulario.html', 'seguimiento.html'].forEach((f) => {
      const h = E.leerCrudo(f);
      ok(/<meta property="og:image" content="https:\/\/[^"]+\/marca\/compartir\.png">/.test(h), f + ': imagen con URL absoluta');
      ok(/og:title" content="Total Tools · /.test(h) && /og:description/.test(h) && /twitter:card" content="summary_large_image"/.test(h), f + ': titulo y descripcion');
      ok(h.indexOf('og:image') < h.indexOf('<script defer'), f + ': en la cabecera, antes de los scripts');
    });
    const png = fs.readFileSync(path.join(E.RAIZ, 'marca/compartir.png'));
    ok(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 300000, 'imagen 1200x630 y liviana');
  }

  bloque('Encabezado del formulario y del seguimiento');
  {
    const c = E.leerReal('cliente/comun.js');
    ok(/<img class="biz-logo" src="marca\/logo\.svg\?v=\d+" alt="" width="48" height="35" decoding="async">/.test(c),
       'logo con tamano fijo (sin saltos) y alt vacio (decorativo: el nombre va al lado)');
    ok(/const brand = `<div class="biz-marca">/.test(c) && !/const brand = isTrack/.test(c), 'en las dos paginas');
    ok(/\.biz-marca\{[^}]*max-width:calc\(100% - 184px\)/.test(E.leerReal('cliente/cliente.css')), 'sin chocar con el boton Ayuda');
  }

  bloque('Privado: ni el panel ni los links de clientes en buscadores');
  {
    ['index.html', 'formulario.html', 'seguimiento.html'].forEach((f) =>
      ok(/<meta name="robots" content="noindex, nofollow">/.test(E.leerCrudo(f)), f + ': noindex (los links llevan codigos de clientes)'));
  }
};
