#!/usr/bin/env bash
# Regenerates deploy/kubernetes/ea-hub.yaml from the Helm chart (CI runs this on every
# push to main). The raw manifests expect a Secret you create yourself from
# secret.example.yaml, so no secret value is ever written into this repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
{
  echo "# GENERATED from deploy/helm/ea-hub by deploy/kubernetes/render.sh — do not edit by hand."
  echo "# Apply:  kubectl apply -f deploy/kubernetes/namespace.yaml"
  echo "#         kubectl apply -f my-secret.yaml        (copy of secret.example.yaml with your values)"
  echo "#         kubectl apply -f deploy/kubernetes/ea-hub.yaml"
  echo "# Then edit APP_URL / the Ingress host below, or better: use Helm (docs/helm.md)."
  helm template ea-hub deploy/helm/ea-hub \
    --namespace ea-hub \
    --set appUrl=http://ea-hub.local \
    --set ingress.enabled=true --set ingress.host=ea-hub.local \
    --set admin.email=admin@example.com \
    --set secrets.create=false --set secrets.existingSecret=ea-hub
} > deploy/kubernetes/ea-hub.yaml
echo "wrote deploy/kubernetes/ea-hub.yaml"
