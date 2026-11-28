# GitOps examples (Argo CD and Rancher Fleet)

Run EA-Hub in several environments, such as staging and production, where every change goes through Git. The chart comes from the published repository, so you only keep **values files** in your own config repository.

```
deploy/gitops/
  values/staging.yaml       one app pod, built-in PostgreSQL
  values/production.yaml    2 app pods + S3 uploads, CloudNativePG (3 instances), offsite
                            backups, SSO, ServiceMonitor + alerts + Grafana dashboard
  argocd/ea-hub-<env>.yaml  Argo CD Applications (multi-source: OCI chart + your values)
  fleet/<env>/fleet.yaml    Rancher Fleet bundles (Helm repo chart + your values)
```

Both example values files are rendered by CI (`helm template`), so they stay valid as the chart changes.

## 1. Copy the values into your config repository

Copy `values/` to `ea-hub/values/` in your repository, then edit the host names, e-mails, bucket names and SSO IDs.

## 2. Secrets: never in Git

The values use `secrets.create: false` and `existingSecret: ea-hub-secrets`. Create that Secret with **Sealed Secrets** or **External Secrets** (from Vault, Azure Key Vault, AWS Secrets Manager…).

**Required keys:**
- `postgres-password`
- `app-db-password`
- `app-encryption-key` (32+ characters; never change it)
- `cron-secret`

**Optional keys:**
- `admin-password`
- `smtp-password`
- `openai-api-key`
- `turnstile-secret-key`
- `s3-access-key-id`, `s3-secret-access-key` (S3 uploads)
- `oidc-client-secret` (SSO)
- `metrics-token`

**Extra Secrets for the production values:**
- **CloudNativePG:** a `kubernetes.io/basic-auth` Secret named `ea-hub-secrets-pg-superuser`, with `username: postgres` and `password` set to the **same value** as `postgres-password`.
- **Offsite backups:** a Secret named `ea-hub-offsite` with keys `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`.

## 3a. Argo CD

```bash
kubectl apply -f deploy/gitops/argocd/ea-hub-staging.yaml     # after editing repoURL of your config repo
kubectl apply -f deploy/gitops/argocd/ea-hub-production.yaml
```

To upgrade, raise `targetRevision` (for example from `1.1.0` to `1.2.0`) in a pull request. The pre-upgrade backup hook runs during the sync.

## 3b. Rancher Fleet

In Rancher, open **Continuous Delivery → Git Repos → Add Repository**, point it at your config repository, and set the paths `ea-hub/fleet/staging` and `ea-hub/fleet/production`. Target each path at the right cluster group.

## Promotion flow

1. Raise the chart version in `staging` and merge.
2. Check the admin **Settings → Application health** page, which shows the server status.
3. Raise the same version in `production` and merge.
