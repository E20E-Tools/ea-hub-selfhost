# Deploying EA-Hub on Red Hat OpenShift (or OKD)

OpenShift runs every pod under a **random user ID** and publishes sites with **Routes**. The Helm chart has an OpenShift mode that handles both: set `openshift.enabled=true`.

## 1. Requirements

### Cluster capacity

| | Minimum | Recommended |
|---|---|---|
| CPU (requests across the project) | 2 vCPU | 4 vCPU |
| Memory | 4 GiB | 8 GiB |
| Persistent storage | 35 GiB (`ReadWriteOnce`): 5 uploads + 10 database + 20 backups | 60 GiB |

If your project has a **ResourceQuota**, it must allow at least 4 pods, 3 PVCs and the memory above.

### Software and access

| Need | Version / detail | Check |
|---|---|---|
| OpenShift Container Platform or OKD | **4.14+** (Kubernetes 1.27+) | `oc version` |
| `oc` CLI | matching your cluster | `oc version --client` |
| Helm | 3.8+ or 4.x (or use the Developer console, see below) | `helm version` |
| Permission | create a project, or *admin* on an existing one | `oc auth can-i create deployments -n <project>` |
| Default StorageClass | any `ReadWriteOnce` (e.g. `gp3-csi`, `thin-csi`, ODF `ocs-storagecluster-ceph-rbd`) | `oc get storageclass` |
| Security context | the default **restricted-v2** SCC is enough; no `anyuid` or privileged access needed | |
| Image access | the cluster must be able to pull `ghcr.io/e20e-tools/ea-hub-selfhost` and `docker.io/library/postgres:16`. In disconnected clusters, mirror both to your internal registry | |
| Domain | the cluster's apps domain (e.g. `*.apps.cluster.example.com`) or your own host name | `oc get ingresses.config cluster -o jsonpath='{.spec.domain}'` |

## 2. Log in and create a project

```bash
oc login --token=<token> --server=https://api.cluster.example.com:6443   # "Copy login command" in the web console
oc new-project ea-hub
```

## 3. Get the code

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
```

## 4. Make the image available

Use **one** of these options.

**a) Published image (private package):**

```bash
oc create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token-with-read:packages>
oc secrets link default ghcr-pull --for=pull
```

**b) Mirror to your own registry** (disconnected clusters):

```bash
skopeo copy docker://ghcr.io/e20e-tools/ea-hub-selfhost:<version> docker://registry.internal/ea-hub/ea-hub-selfhost:<version>
skopeo copy docker://docker.io/library/postgres:16 docker://registry.internal/ea-hub/postgres:16
```

Then use `image.repository=registry.internal/ea-hub/ea-hub-selfhost` and `postgres.image=registry.internal/ea-hub/postgres:16` below.

**c) Build inside OpenShift** from this repository:

```bash
oc new-build --name ea-hub --strategy docker --binary
oc start-build ea-hub --from-dir=. --follow
# image: image-registry.openshift-image-registry.svc:5000/ea-hub/ea-hub:latest
```

## 5. Choose the address

Use the default Route host, or your own name:

```bash
APPS=$(oc get ingresses.config cluster -o jsonpath='{.spec.domain}')
echo "https://ea-hub.$APPS"        # e.g. https://ea-hub.apps.cluster.example.com
```

## 6. Write your values file

`my-values.yaml`. Keep it outside the repository, because it holds a password:

```yaml
appUrl: https://ea-hub.apps.cluster.example.com

openshift:
  enabled: true              # random UIDs, Debian postgres image, Route
  route:
    enabled: true
    host: ea-hub.apps.cluster.example.com
    tls: true                # edge TLS with the router certificate, HTTP → HTTPS

ingress:
  enabled: false             # the Route replaces the Ingress

admin:
  email: admin@yourcompany.com
  password: choose-a-long-password

image:
  repository: ghcr.io/e20e-tools/ea-hub-selfhost
  tag: "<version>"

# storage:
#   storageClass: thin-csi   # only if there is no default StorageClass
# smtp: { host: smtp.example.com, port: 587, user: …, password: …, from: "EA-Hub <…>" }
```

What `openshift.enabled=true` changes in the rendered resources:

- No `runAsUser`, `runAsGroup` or `fsGroup` is set, so the **restricted-v2** SCC assigns them. The EA-Hub image is built to run under any user ID in group 0.
- PostgreSQL uses `postgres:16` (Debian), which supports random user IDs. The Alpine variant is only for plain Kubernetes.
- A **Route** with edge TLS is created for the Service.

## 7. Install

```bash
helm upgrade --install ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml
oc -n ea-hub rollout status deploy/ea-hub --timeout=10m
oc -n ea-hub get pods,route
```

```text
NAME                          READY   STATUS    RESTARTS   AGE
pod/ea-hub-5b7d9c6f4-8kx2p    1/1     Running   0          3m
pod/ea-hub-postgres-0         1/1     Running   0          3m

NAME                              HOST/PORT                              SERVICES   PORT   TERMINATION
route.route.openshift.io/ea-hub   ea-hub.apps.cluster.example.com        ea-hub     http   edge/Redirect
```

Follow the database setup while the pod shows `Init:0/1`:

```bash
oc -n ea-hub logs deploy/ea-hub -c migrate -f
```

### Alternative: the web console (no Helm CLI)

1. **Developer** perspective → project `ea-hub` → **+Add → Helm Chart**. This needs the chart published as a repository: after a release tag, add `oci://ghcr.io/e20e-tools/charts` as a *HelmChartRepository*.
2. Or **+Add → Import YAML** and paste the output of
   `helm template ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml`.
   This has no upgrade tracking; the Helm CLI is preferred.

## 8. Open the site and sign in

Open `https://ea-hub.apps.cluster.example.com/admin`:

![Admin sign-in](images/admin-sign-in.jpg)

![Admin dashboard](images/admin-dashboard.jpg)

Health check: `curl https://ea-hub.apps.cluster.example.com/healthz` returns `{"ok":true,"database":"ok"}`.

## 9. Operations

| Task | Command |
|---|---|
| Upgrade | `helm upgrade ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml --set image.tag=<new>` |
| Backup now | `oc -n ea-hub create job --from=cronjob/ea-hub-backup backup-now` |
| Logs | `oc -n ea-hub logs deploy/ea-hub -f` |
| Back up the generated secrets | `oc -n ea-hub get secret ea-hub -o yaml > ea-hub-secret-backup.yaml` (store it safely) |
| Uninstall (keeps data) | `helm uninstall ea-hub -n ea-hub` |
| Delete everything | `oc delete project ea-hub` |

Your own certificate on the Route: install the cert-manager Operator plus the *openshift-routes* add-on, and set `openshift.route.annotations: {cert-manager.io/issuer-name: …}`. Or ask your cluster administrator for the router's wildcard certificate, which is used automatically.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `unable to validate against any security context constraint` | `openshift.enabled` is not `true`. The default mode sets fixed UIDs that restricted-v2 refuses |
| PostgreSQL `CrashLoopBackOff`: `could not change permissions of directory` | You overrode `postgres.image` with an image that cannot run under a random UID. Use `postgres:16` (Debian) or a mirror of it |
| `ImagePullBackOff` | Link the pull secret (`oc secrets link default ghcr-pull --for=pull`) or mirror the images (step 4) |
| PVC `Pending` | There is no default StorageClass: set `storage.storageClass`, `postgres.storage.storageClass` and `backup.storage.storageClass` |
| Route shows "Application is not available" | The pod is not ready yet: `oc -n ea-hub get pods`, then read the `migrate` logs |
| Quota exceeded | Ask for a larger quota, or lower `resources` / `postgres.resources` in your values |
