# Deploying EA-Hub on local Kubernetes (Docker Desktop, kind, minikube, k3s)

Use this guide to run the real Helm chart on your own computer, to learn it, test changes, or demo EA-Hub, without a cloud account. For production, follow [deploy-kubernetes.md](deploy-kubernetes.md). The steps are the same, with a real domain and HTTPS.

## 1. Requirements

### Hardware (your computer)

| | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores | 6+ cores |
| Memory | 8 GB (allow **4 GB** for Docker / the cluster) | 16 GB (6 GB for the cluster) |
| Free disk | 20 GB | 40 GB |

### Software

| Tool | Version | Install |
|---|---|---|
| Docker | Docker Desktop 4.x, or Docker Engine 24+ | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **One** local cluster | see the table below | |
| kubectl | 1.27+ | included in Docker Desktop; otherwise [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |
| Helm | 3.8+ or 4.x | `winget install Helm.Helm` · `brew install helm` · [helm.sh](https://helm.sh/docs/intro/install/) |
| git | any | |

| Local cluster | Good for | Install |
|---|---|---|
| **Docker Desktop Kubernetes** | Windows/macOS users who already have Docker Desktop | Docker Desktop → Settings → Kubernetes → *Enable Kubernetes* |
| **kind** | fastest to create and throw away; what our CI uses | `winget install Kubernetes.kind` · `brew install kind` |
| **minikube** | many add-ons (ingress, dashboard) | `winget install Kubernetes.minikube` · `brew install minikube` |
| **k3s** | a Linux machine or VM, closest to a small production server | `curl -sfL https://get.k3s.io \| sh -` |

All four include a default StorageClass, which EA-Hub needs for its volumes.

## 2. Create or start the cluster

```bash
# kind
kind create cluster --name ea-hub

# minikube
minikube start --memory 6g --cpus 4

# Docker Desktop: enable Kubernetes in Settings, then select its context
kubectl config use-context docker-desktop

# k3s: already running after installation
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER ~/.kube/config
```

Check:

```bash
kubectl get nodes           # STATUS Ready
kubectl get storageclass    # one is marked (default)
```

## 3. Get the code and build the image

Building locally avoids needing access to the published image.

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
docker build --build-arg WITH_LOCAL_MODEL=0 -t ea-hub-selfhost:local .
```

`WITH_LOCAL_MODEL=0` makes the image ~120 MB smaller by leaving out the local search model. The build takes 5–10 minutes the first time.

Make the image visible to the cluster:

| Cluster | Command |
|---|---|
| kind | `kind load docker-image ea-hub-selfhost:local --name ea-hub` |
| minikube | `minikube image load ea-hub-selfhost:local` |
| Docker Desktop | nothing to do, the cluster uses Docker's images |
| k3s | `docker save ea-hub-selfhost:local \| sudo k3s ctr images import -` |

## 4. Install with Helm

```bash
helm upgrade --install ea-hub deploy/helm/ea-hub \
  --namespace ea-hub --create-namespace \
  --set image.repository=ea-hub-selfhost \
  --set image.tag=local \
  --set image.pullPolicy=Never \
  --set appUrl=http://localhost:8080 \
  --set admin.email=admin@example.com \
  --set admin.password='choose-a-long-password' \
  --set backup.storage.size=2Gi --set storage.size=1Gi --set postgres.storage.size=2Gi
```

Wait until it is ready. The first start prepares the database, which takes 1–3 minutes:

```bash
kubectl -n ea-hub rollout status deploy/ea-hub --timeout=10m
kubectl -n ea-hub get pods
```

```text
NAME                      READY   STATUS    RESTARTS   AGE
ea-hub-6d8f9c7b8d-q4z2n   1/1     Running   0          2m
ea-hub-postgres-0         1/1     Running   0          2m
```

## 5. Open the site

```bash
kubectl -n ea-hub port-forward svc/ea-hub 8080:80
```

Keep that command running, then open **http://localhost:8080/admin** and sign in with the e-mail and password from step 4.

![Admin sign-in](images/admin-sign-in.jpg)

![Admin dashboard](images/admin-dashboard.jpg)

> The address in `appUrl` must match the one you open (`http://localhost:8080`), otherwise links and uploaded images point elsewhere.

### Optional: use an Ingress instead of port-forward

- **minikube:** run `minikube addons enable ingress`, then add `--set ingress.enabled=true --set ingress.host=ea-hub.local --set appUrl=http://ea-hub.local`. Point `ea-hub.local` to `minikube ip` in your hosts file.
- **k3s:** Traefik is built in. Use the same flags, with `ingress.className=traefik`, and point the name to the machine's IP.

## 6. Try the scheduled jobs and the backup

```bash
kubectl -n ea-hub create job --from=cronjob/ea-hub-daily-cleanup cleanup-now
kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now
kubectl -n ea-hub wait --for=condition=complete job/cleanup-now job/backup-now --timeout=5m
kubectl -n ea-hub logs job/backup-now
```

## 7. Change, upgrade, remove

```bash
# after rebuilding the image with a new tag (e.g. local2) and loading it again:
helm upgrade ea-hub deploy/helm/ea-hub -n ea-hub --reset-then-reuse-values --set image.tag=local2

# remove everything, including the data
helm uninstall ea-hub -n ea-hub
kubectl delete namespace ea-hub

# delete the cluster itself
kind delete cluster --name ea-hub     # or: minikube delete
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pod `Pending` | The cluster lacks memory: give Docker Desktop / minikube more (Settings → Resources) |
| `ErrImageNeverPull` | The image was not loaded into the cluster (step 3), or the tag differs |
| `Init:0/1` for a long time | `kubectl -n ea-hub logs deploy/ea-hub -c migrate` shows the progress of the database setup |
| Port 8080 busy | Use another local port: `port-forward svc/ea-hub 9090:80`, and `appUrl=http://localhost:9090` |
