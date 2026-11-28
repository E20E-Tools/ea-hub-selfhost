# Helm-based operator for EA-Hub. Build from the repository root (one chart, no copy in git):
#   docker build -f deploy/operator/Dockerfile -t ghcr.io/e20e-tools/ea-hub-operator:<version> .
FROM quay.io/operator-framework/helm-operator:v1.42.3
LABEL org.opencontainers.image.source="https://github.com/E20E-Tools/ea-hub-selfhost" \
      org.opencontainers.image.description="EA-Hub operator (Helm-based)"
ENV HOME=/opt/helm
COPY deploy/operator/watches.yaml ${HOME}/watches.yaml
COPY deploy/helm/ea-hub ${HOME}/helm-charts/ea-hub
WORKDIR ${HOME}
