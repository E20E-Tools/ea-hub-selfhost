# Bundle image (for `operator-sdk run bundle` and catalogs):
#   docker build -f deploy/operator/bundle.Dockerfile -t ghcr.io/e20e-tools/ea-hub-operator-bundle:<version> deploy/operator
FROM scratch
LABEL operators.operatorframework.io.bundle.mediatype.v1=registry+v1 \
      operators.operatorframework.io.bundle.manifests.v1=manifests/ \
      operators.operatorframework.io.bundle.metadata.v1=metadata/ \
      operators.operatorframework.io.bundle.package.v1=ea-hub \
      operators.operatorframework.io.bundle.channels.v1=stable \
      operators.operatorframework.io.bundle.channel.default.v1=stable \
      com.redhat.openshift.versions=v4.12
COPY bundle/manifests /manifests/
COPY bundle/metadata /metadata/
