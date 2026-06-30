$project = "total-tools-24ce8"
$region  = "us-central1"

function Mask-Secrets {
    param([Parameter(ValueFromPipeline)]$line)
    process {
        "$line" `
        -replace '("(?:key|secret|password|token|api[_-]?key)"\s*:\s*")[^"]{6,}(")', '$1***MASKED***$2' `
        -replace '("(?:[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|API)[A-Z_]*)"\s*:\s*")[^"]{6,}(")', '$1***MASKED***$2'
    }
}

Write-Host "════ CLOUD RUN: todos los servicios ════"
gcloud run services list --project=$project --format=json

Write-Host "`n════ CLOUD RUN: agenciashalom detalle ════"
gcloud run services describe agenciashalom --region=$region --project=$project --format=json | Mask-Secrets

Write-Host "`n════ CLOUD RUN: revisiones agenciashalom ════"
gcloud run revisions list --service=agenciashalom --region=$region --project=$project --format=json

Write-Host "`n════ SECRET MANAGER: lista de secrets ════"
gcloud secrets list --project=$project --format=json

Write-Host "`n════ ARTIFACT REGISTRY: repositorios ════"
gcloud artifacts repositories list --project=$project --format=json

Write-Host "`n════ ARTIFACT REGISTRY: imagenes (gcf-artifacts) ════"
gcloud artifacts docker images list "$region-docker.pkg.dev/$project/gcf-artifacts" --project=$project --format=json 2>&1

Write-Host "`n════ CLOUD BUILD: ultimos 15 builds ════"
gcloud builds list --project=$project --limit=15 --format=json

Write-Host "`n════ LOGS: formApi (ultimos 20) ════"
gcloud functions logs read formApi --region=$region --project=$project --limit=20

Write-Host "`n════ LOGS: shalomTracking (ultimos 20) ════"
gcloud functions logs read shalomTracking --region=$region --project=$project --limit=20

Write-Host "`n════ LOGS: shalomListar (ultimos 10) ════"
gcloud functions logs read shalomListar --region=$region --project=$project --limit=10

Write-Host "`n════ LOGS: shalomTicket (ultimos 10) ════"
gcloud functions logs read shalomTicket --region=$region --project=$project --limit=10

Write-Host "`n════ LOGS: agenciasShalom (ultimos 10) ════"
gcloud functions logs read agenciasShalom --region=$region --project=$project --limit=10

Write-Host "`n════ LOGS: Cloud Run agenciashalom (ultimos 20) ════"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=agenciashalom" --project=$project --limit=20 --format=json

Write-Host "`n════ IAM: service accounts del proyecto ════"
gcloud iam service-accounts list --project=$project --format=json

Write-Host "`n════ SCHEDULER: jobs programados ════"
gcloud scheduler jobs list --project=$project --location=$region --format=json 2>&1

Write-Host "`n════ FUNCTIONS CONFIG (secrets ocultos) ════"
firebase functions:config:get --project=$project 2>&1 | Mask-Secrets