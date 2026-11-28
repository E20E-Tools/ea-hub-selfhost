# EA-Hub Helm chart

EA-Hub is an enterprise-architecture hub: application portfolio, technology radar, decisions,
capability maps and an admin console. This chart runs the **self-hosted** edition on any
Kubernetes 1.25+ cluster, including OpenShift and Rancher. It has no Supabase or Vercel dependency.

What gets installed:

- **App:** a Deployment with a Service, and optionally an Ingress or an OpenShift Route.
- **Database:** PostgreSQL 16 as a StatefulSet with its own volume. You can use your own database instead.
- **Uploads:** a PVC for uploaded files.
- **Scheduled jobs:** CronJobs for the daily jobs and a nightly backup.
- **Database setup:** migrations run automatically before each app pod starts.

## Install

```bash
helm install ea-hub oci://ghcr.io/e20e-tools/charts/ea-hub \
  -n ea-hub --create-namespace \
  --set appUrl=https://hub.example.com \
  --set ingress.enabled=true --set ingress.host=hub.example.com \
  --set admin.email=you@example.com
```

When you leave out `admin.password`, a password is generated. `helm status ea-hub -n ea-hub` prints the command that shows it.

On **OpenShift**, add `--set openshift.enabled=true`. Leave the ingress settings out, because a Route is created instead.

To install from the classic Helm repository instead of OCI:

```bash
helm repo add ea-hub https://e20e-tools.github.io/ea-hub-selfhost
helm install ea-hub ea-hub/ea-hub -n ea-hub --create-namespace --set appUrl=… --set admin.email=…
```

## Requirements

| | Minimum |
|---|---|
| Kubernetes | 1.25 or newer (OpenShift 4.12+, RKE2, k3s, AKS, EKS, GKE…) |
| Nodes | 2 vCPU and 4 GB RAM free for the whole release |
| Storage | a default StorageClass: about 5 GB for uploads, 10 GB for the database and 20 GB for backups |
| Optional | an ingress controller, cert-manager for HTTPS, an SMTP account |

## Main values

| Value | Default | Meaning |
|---|---|---|
| `appUrl` | `http://ea-hub.local` | Public address, with no trailing slash. **Set this.** |
| `admin.email` / `admin.password` | empty | First admin. The password is generated if empty. |
| `ingress.enabled`, `ingress.host`, `ingress.tls`, `ingress.className` | off | Ingress |
| `openshift.enabled` | `false` | OpenShift mode: Route, no fixed UIDs, and the Debian postgres image |
| `postgres.enabled` | `true` | `false` uses `externalDatabase.*` instead |
| `storage.size`, `postgres.storage.size`, `backup.storage.size` | 5Gi, 10Gi, 20Gi | Volume sizes |
| `smtp.*` | empty | Outgoing e-mail |
| `features.openaiApiKey`, `features.turnstileSiteKey` / `features.turnstileSecretKey` | empty | Optional features. Each one turns on only when its key is set. |
| `secrets.*` | generated | Generated on first install and kept on upgrade. Don't change `appEncryptionKey` after install. |

Every value is documented in [values.yaml](https://github.com/E20E-Tools/ea-hub-selfhost/blob/main/deploy/helm/ea-hub/values.yaml) and checked by `values.schema.json`.

## Check the installation

```bash
helm test ea-hub -n ea-hub      # calls /healthz through the Service
```

## Documentation

Step-by-step guides for Docker, local Kubernetes, any cluster, OpenShift, Rancher, Azure, AWS and Google Cloud are in [docs/en](https://github.com/E20E-Tools/ea-hub-selfhost/tree/main/docs/en). They are also available as a [PDF](https://github.com/E20E-Tools/ea-hub-selfhost/raw/main/docs/en/EA-Hub-Deployment-Guide.pdf).
