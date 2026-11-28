# EA-Hub self-host

Run EA-Hub on your own servers: Docker Compose, Kubernetes (Helm), OpenShift, Rancher or a cloud container service.

| | English | العربية |
|---|---|---|
| Start here | [Overview](en/README.md) | [Docker](install-docker.md) |
| Docker Compose | [Deploy with Docker](en/deploy-docker.md) | [التثبيت بـ Docker](install-docker.md) |
| Kubernetes | [Deploy on Kubernetes](en/deploy-kubernetes.md) | [Helm](helm.md) |
| OpenShift | [Deploy on OpenShift](en/deploy-openshift.md) | [OpenShift](openshift.md) |
| Single sign-on | [Single sign-on](en/single-sign-on.md) | [الدخول الموحد](single-sign-on.md) |
| Backups | [Kubernetes: day-2](en/deploy-kubernetes.md#backup) | [النسخ الاحتياطي](backup.md) |

Helm repository:

```bash
helm repo add ea-hub https://e20e-tools.github.io/ea-hub-selfhost
helm install ea-hub ea-hub/ea-hub -n ea-hub --create-namespace \
  --set appUrl=https://hub.example.com --set admin.email=you@example.com
```

The full guide is also available as [PDF](en/EA-Hub-Deployment-Guide.pdf) and [Word](en/EA-Hub-Deployment-Guide.docx).
