# Deploying EA-Hub with Rancher

Rancher manages Kubernetes clusters (RKE2, K3s, or imported AKS/EKS/GKE). EA-Hub installs on a Rancher-managed cluster with the same Helm chart, and you can do everything from the Rancher web UI.

## 1. Requirements

### Downstream cluster (where EA-Hub runs)

| | Minimum | Recommended |
|---|---|---|
| Kubernetes | **1.27+** (RKE2 or K3s) | latest supported by your Rancher version |
| Worker capacity | 2 vCPU, 4 GB RAM free | 4 vCPU, 8 GB |
| Storage | a default StorageClass with **35 GB** free (`local-path` on K3s, Longhorn, vSphere CSI, cloud disks…) | Longhorn or your cloud's CSI with snapshots |
| Ingress controller | RKE2 ships **ingress-nginx** (class `nginx`); K3s ships **Traefik** (class `traefik`) | |
| HTTPS (optional) | cert-manager (Rancher → Apps → Charts → *cert-manager*) or your own certificate | |

### Rancher and your workstation

| Need | Detail |
|---|---|
| Rancher Manager | 2.8 or newer, with a user that is **Project Owner/Member** on the target cluster |
| One of these | the Rancher **kubectl shell** in the browser (has `kubectl` and `helm` built in), *or* `kubectl` + Helm on your PC with the cluster's kubeconfig |
| Image access | the cluster can pull `ghcr.io/e20e-tools/ea-hub-selfhost` (with a pull secret if the package is private) or a copy in your registry |
| DNS | a host name (e.g. `hub.example.com`) pointing to the cluster's ingress / load balancer |

## 2. Open a shell on the cluster

**From the browser:** Rancher → **☰ → Cluster Management** → your cluster → **Explore** → the **>_ Kubectl Shell** button at the top right. `helm` and `kubectl` are already available there.

**From your PC:** Explore → the **⋮** menu → **Download KubeConfig**, then:

```bash
export KUBECONFIG=~/Downloads/<cluster>.yaml
kubectl get nodes
```

## 3. Create a Project and Namespace (Rancher UI)

Explore → **Cluster → Projects/Namespaces → Create Project** `ea-hub` → **Create Namespace** `ea-hub` inside it. With the CLI, `kubectl create namespace ea-hub` also works; then move the namespace into a project in the UI.

## 4. Image pull secret (only if the image is private)

Rancher UI: Explore → **Storage → Secrets → Create → Registry**. Namespace `ea-hub`, name `ghcr-pull`, registry `ghcr.io`, username = your GitHub user, password = a token with `read:packages`.

CLI equivalent:

```bash
kubectl -n ea-hub create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
```

## 5. Get the chart

In the kubectl shell or on your PC:

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
```

## 6. Write your values

`my-values.yaml`:

```yaml
appUrl: https://hub.example.com
admin:
  email: admin@yourcompany.com
  password: choose-a-long-password
image:
  repository: ghcr.io/e20e-tools/ea-hub-selfhost
  tag: "<version>"
imagePullSecrets:
  - name: ghcr-pull                 # remove if not needed
ingress:
  enabled: true
  className: nginx                  # RKE2. Use traefik on K3s
  host: hub.example.com
  tls: true
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt   # if cert-manager is installed
# Longhorn example:
# storage: { storageClass: longhorn }
# postgres: { storage: { storageClass: longhorn } }
# backup: { storage: { storageClass: longhorn } }
```

## 7. Install

```bash
helm upgrade --install ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml
kubectl -n ea-hub rollout status deploy/ea-hub --timeout=10m
```

In the Rancher UI, under Explore → **Apps → Installed Apps**, the release `ea-hub` appears with its status. **Workloads** shows the `ea-hub` Deployment, the `ea-hub-postgres` StatefulSet and the CronJobs.

### Alternatives inside Rancher

| Method | When | How |
|---|---|---|
| **Apps → Charts from an OCI repository** | Rancher 2.9+ and a published release | Apps → Repositories → Create → **OCI** → `oci://ghcr.io/e20e-tools/charts`; then Apps → Charts → *ea-hub* → Install. The form shows `values.yaml` with its comments |
| **Import YAML** | No Helm at all | Run `helm template ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml > ea-hub.yaml` on any machine, then cluster **⬆ Import YAML** → paste → namespace `ea-hub`. Or use `deploy/kubernetes/ea-hub.yaml` with your Secret, as in [deploy-kubernetes.md](deploy-kubernetes.md#path-b--install-with-the-plain-yaml-file) |
| **Continuous Delivery (Fleet, GitOps)** | Several clusters, changes through Git | Add a GitRepo pointing at this repository with path `deploy/helm/ea-hub`. Keep your values in a Kubernetes Secret and reference it with `helm.valuesFrom` in a `fleet.yaml` in your own config repository |

## 8. DNS and HTTPS

1. Find the ingress address: Explore → **Service Discovery → Ingresses** → `ea-hub`, or `kubectl -n ea-hub get ingress`.
2. Create a DNS **A record** `hub.example.com` → that address (or your load balancer's).
3. With cert-manager and the `letsencrypt` ClusterIssuer (see [deploy-kubernetes.md, step 4](deploy-kubernetes.md#step-4--domain-name-and-https-optional)), the certificate is issued automatically. Without cert-manager, create a TLS secret named `ea-hub-tls` in Explore → Storage → Secrets → **TLS Certificate**.

## 9. Open the site and sign in

Open `https://hub.example.com/admin`:

![Admin sign-in](images/admin-sign-in.jpg)

![Admin dashboard](images/admin-dashboard.jpg)

## 10. Operations from Rancher

| Task | Rancher UI | CLI |
|---|---|---|
| Logs | Workloads → `ea-hub` → ⋮ → **View Logs** (choose container `migrate` or `app`) | `kubectl -n ea-hub logs deploy/ea-hub -f` |
| Backup now | Workloads → CronJobs → `ea-hub-backup` → ⋮ → **Run Now** | `kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now` |
| Upgrade | Apps → Installed Apps → `ea-hub` → **Upgrade** (OCI method) | `helm upgrade ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml --set image.tag=<new>` |
| Monitoring | Install the **Monitoring** app; pod CPU/memory appear under Workloads | |
| Volume snapshots | Longhorn UI → Volumes → `ea-hub-*` → snapshot/backup schedule | |
| Uninstall (keeps data) | Apps → Installed Apps → ⋮ → Delete | `helm uninstall ea-hub -n ea-hub` |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Ingress returns 404 | Wrong `ingress.className`: `nginx` on RKE2, `traefik` on K3s (`kubectl get ingressclass`) |
| PVC `Pending` | No default StorageClass: set it in Rancher (Storage → StorageClasses → ⋮ → Set as Default) or pass `storageClass` values |
| Pods blocked by Pod Security Admission | The chart runs non-root with seccomp `RuntimeDefault` and drops all capabilities, so it fits the **restricted** policy; check any custom PSA/Kyverno/Gatekeeper rule |
| `ImagePullBackOff` | The pull secret must be in namespace `ea-hub` and named in `imagePullSecrets` |

The rest is identical to the generic guide: [deploy-kubernetes.md](deploy-kubernetes.md).
