# Imagen oficial de Playwright: trae Chromium + dependencias del sistema listas.
# Esto es lo que hace que "funcione siempre" sin pelear con librerias del navegador.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Los navegadores ya vienen en la imagen; evitamos re-descargarlos al instalar.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=production

# Instalar dependencias (sin lockfile: npm install en vez de npm ci).
COPY package.json ./
RUN npm install --omit=dev

# Copiar el codigo del servicio.
COPY . .

# Cloud Run inyecta PORT (8080 por defecto).
EXPOSE 8080
CMD ["node", "server.js"]
