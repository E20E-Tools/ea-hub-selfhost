# EA-Hub offline (air-gapped) bundle

Each release has two bundles, `ea-hub-airgap-<version>-amd64.tar.gz` and `ea-hub-airgap-<version>-arm64.tar.gz`, attached to its [GitHub Release](https://github.com/E20E-Tools/ea-hub-selfhost/releases). Each one contains everything needed to install on a network with no internet access:

| In the bundle | |
|---|---|
| `images/images.tar.gz` | The EA-Hub app, PostgreSQL 16 (Alpine and Debian), Caddy and rclone images |
| `ea-hub-<version>.tgz` | The Helm chart |
| `docker-compose.yml`, `.env.example`, `setup.sh`, `setup.ps1`, `deploy/compose`, `selfhost/` | The Docker Compose installation |
| `load.sh` | Imports the images, and can push them to an internal registry |

On a machine with internet access, download the bundle and its `.sha256` file and copy both to the offline network. Then:

```bash
sha256sum -c ea-hub-airgap-<version>-amd64.tar.gz.sha256
tar xzf ea-hub-airgap-<version>-amd64.tar.gz && cd ea-hub-airgap-<version>-amd64
```

## Docker Compose

```bash
./load.sh
./setup.sh            # or: cp .env.example .env and fill it in
docker compose up -d
```

The bundle's `.env.example` already points `EA_HUB_IMAGE` at the bundled version, and `setup.sh` uses the loaded image when it cannot download one.

## Kubernetes / OpenShift (internal registry)

```bash
./load.sh registry.internal:5000/ea-hub
helm install ea-hub ./ea-hub-<version>.tgz -n ea-hub --create-namespace \
  --set appUrl=https://hub.example.com --set admin.email=you@example.com \
  --set image.repository=registry.internal:5000/ea-hub/ea-hub-selfhost --set image.tag=<version> \
  --set postgres.image=registry.internal:5000/ea-hub/postgres:16-alpine \
  --set backup.offsite.image=registry.internal:5000/ea-hub/rclone:1.76.0
```

On OpenShift, add `--set openshift.enabled=true --set postgres.image=registry.internal:5000/ea-hub/postgres:16`.

## Verify the image signature offline (optional)

The images are signed with cosign (keyless). Signature checks need the Sigstore public services, so verify the image **before** you copy it into the offline network:

```bash
cosign verify ghcr.io/e20e-tools/ea-hub-selfhost:<version> \
  --certificate-identity-regexp 'https://github.com/E20E-Tools/ea-hub-selfhost/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```
