# shalomweb-tracker (Fase 1)

Rastreo propio de Shalom con **navegador real** (Playwright) en **Cloud Run**.
Motor B: aislado, separado de la API paga. **No falsifica tokens** — usa la
página de Shalom e intercepta su respuesta legítima (`buscar` / `estados`).

## Qué hace (Fase 1)
Expone `GET /track?numero=...&codigo=...` que abre `shalom.com.pe/rastrea`,
escribe la orden, da "Buscar" y devuelve el **JSON crudo** de `buscar` y
`estados`. Sirve para validar contra un pedido real antes de normalizar (Fase 2)
e integrar el Scheduler + Firestore (Fase 3).

## Requisitos (una sola vez)
- Proyecto GCP en plan Blaze (ya lo tienes: `total-tools-24ce8`).
- `gcloud` CLI en tu PC, o usa **Cloud Shell** (navegador, sin instalar nada).
- **No necesitas Docker local**: `gcloud run deploy --source .` construye la
  imagen en la nube (Cloud Build).

## Pasos

### 0) Login y proyecto
```bash
gcloud auth login
gcloud config set project total-tools-24ce8
```

### 1) Habilitar APIs (una vez)
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com
```

### 2) Desplegar (desde esta carpeta)
```bash
cd shalomweb-tracker
gcloud run deploy shalomweb-tracker \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 1 \
  --timeout 120 \
  --min-instances 0
```
Al terminar imprime una **Service URL** (algo como
`https://shalomweb-tracker-xxxxx-uc.a.run.app`).

### 3) Probar con un pedido real
```bash
curl "https://TU-SERVICE-URL/track?numero=88124236&codigo=HHM9&debug=1"
```
Copia y pega la respuesta completa (trae `buscar`, `estados` y, con `debug=1`,
una captura en base64 y el texto de la página). Con eso afinamos.

## Notas
- `--concurrency 1`: un navegador por instancia (estable). Cloud Run autoescala.
- `--allow-unauthenticated`: solo para probar en Fase 1. En Fase 5 lo cerramos
  (o defines `TRACK_KEY` y se exige `?k=...`).
- reCAPTCHA v3 le pone *score* a los navegadores automáticos: si `buscar`
  devuelve error, la respuesta lo mostrará y ahí ajustamos (fingerprint,
  esperas, reintentos).
