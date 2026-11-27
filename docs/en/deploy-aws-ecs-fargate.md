# Deploying EA-Hub on AWS (ECS on Fargate)

Amazon ECS with the Fargate launch type runs the EA-Hub container without servers to manage. The full setup on AWS:

| EA-Hub part | AWS service |
|---|---|
| Web app | **ECS service on Fargate** |
| HTTPS entry point | **Application Load Balancer** + **ACM** certificate |
| Database | **Amazon RDS for PostgreSQL 16** |
| Uploaded files (`/data/storage`) | **Amazon EFS** with an access point |
| Secrets | **AWS Secrets Manager** |
| Daily jobs | **EventBridge Scheduler** running ECS tasks |
| Backups | RDS automated backups + **AWS Backup** for EFS |

> **Status:** these steps follow AWS's documented CLI and console flows. The container itself, owner mode for managed PostgreSQL, and `MIGRATE_ON_START` are tested in CI on plain PostgreSQL 16. AWS itself has not been tested end-to-end yet.

> Want Kubernetes on AWS instead? Use **EKS** with the Helm chart: [deploy-kubernetes.md](deploy-kubernetes.md) (StorageClass `gp3`, AWS Load Balancer Controller or ingress-nginx).

## 1. Requirements

### AWS resources and sizing

| Resource | Starting size |
|---|---|
| Fargate task (app) | **1 vCPU, 2 GB**, 1–3 tasks |
| Fargate task (each daily job) | 0.25 vCPU, 0.5 GB, a few seconds per day |
| RDS PostgreSQL | **db.t4g.small**, 20 GB gp3, engine **16.x**, single-AZ (Multi-AZ for production) |
| EFS | General Purpose, Bursting; pay per GB stored |
| Application Load Balancer | 1, internet-facing, in 2 public subnets |

Rough cost at these sizes: about USD 60–90 per month in most regions.

### Tools, permissions and network

| Need | Detail |
|---|---|
| AWS account | IAM permissions for ECS, EC2 (VPC, security groups), RDS, EFS, ELB, ACM, Secrets Manager, IAM roles, EventBridge Scheduler, CloudWatch Logs |
| AWS CLI v2 | configured with `aws configure` / SSO |
| VPC | 2 **public** subnets (load balancer) and 2 **private** subnets with a NAT gateway (tasks, database, EFS). The default VPC also works for a test, with public IPs on the tasks |
| Image | `ghcr.io/e20e-tools/ea-hub-selfhost:<version>` with a GitHub token (`read:packages`) stored in Secrets Manager, **or** a copy in Amazon ECR (recommended) |
| Domain + ACM certificate | for HTTPS: a domain in Route 53 or any DNS provider, and a certificate in ACM for `hub.example.com` |

## 2. Variables

```bash
REGION=eu-central-1
VPC=vpc-xxxxxxxx
PRIV_SUBNETS=subnet-aaa,subnet-bbb        # tasks, RDS, EFS
PUB_SUBNETS=subnet-ccc,subnet-ddd         # load balancer
DOMAIN=hub.example.com
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
```

## 3. Copy the image to ECR (recommended)

```bash
aws ecr create-repository --repository-name ea-hub-selfhost --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker pull ghcr.io/e20e-tools/ea-hub-selfhost:<version>     # or build it: docker build -t ea-hub-selfhost .
docker tag ghcr.io/e20e-tools/ea-hub-selfhost:<version> $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
IMAGE=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
```

## 4. Security groups

Create three security groups in the VPC:

| Group | Inbound rule |
|---|---|
| `ea-hub-alb` | 443 and 80 from `0.0.0.0/0` |
| `ea-hub-app` | 3000 from `ea-hub-alb` |
| `ea-hub-data` | 5432 (PostgreSQL) and 2049 (NFS/EFS) from `ea-hub-app` |

## 5. Database (RDS PostgreSQL 16)

Console: **RDS → Create database → PostgreSQL 16 → Templates: Free tier/Dev-Test**. Then:

- identifier `ea-hub-db`, master user `eahubadmin`, an auto-generated or strong password
- `db.t4g.small`, 20 GB gp3, the private subnets, security group `ea-hub-data`, **Public access: No**
- **Initial database name: `eahub`**

The RDS master user is not a superuser. EA-Hub detects this and runs in **owner mode**: the app connects as `eahubadmin`, the owner of all tables. RDS enforces TLS, so set `DB_SSLMODE=require`.

## 6. File storage (EFS with an access point)

```bash
FS=$(aws efs create-file-system --encrypted --tags Key=Name,Value=ea-hub-uploads --query FileSystemId --output text)
for S in ${PRIV_SUBNETS//,/ }; do aws efs create-mount-target --file-system-id $FS --subnet-id $S --security-groups <ea-hub-data-sg-id>; done
AP=$(aws efs create-access-point --file-system-id $FS \
  --posix-user Uid=1000,Gid=0 \
  --root-directory 'Path=/ea-hub,CreationInfo={OwnerUid=1000,OwnerGid=0,Permissions=775}' \
  --query AccessPointId --output text)
```

The access point makes every file belong to uid 1000, the user the container runs as.

## 7. Secrets (Secrets Manager)

```bash
aws secretsmanager create-secret --name ea-hub/db-password    --secret-string '<RDS master password>'
aws secretsmanager create-secret --name ea-hub/enc-key        --secret-string "$(openssl rand -hex 32)"   # never change it later
aws secretsmanager create-secret --name ea-hub/cron-secret    --secret-string "$(openssl rand -hex 24)"
aws secretsmanager create-secret --name ea-hub/admin-password --secret-string '<first admin password, 10+ chars>'
```

The **task execution role** (`ecsTaskExecutionRole`) needs `secretsmanager:GetSecretValue` on `ea-hub/*`, plus the standard `AmazonECSTaskExecutionRolePolicy`.

## 8. Load balancer and certificate

1. **ACM → Request certificate** for `hub.example.com` (DNS validation), then wait until it shows *Issued*.
2. **EC2 → Target groups → Create:** type *IP*, protocol HTTP, port **3000**, VPC; health check path **`/healthz`**, success code 200.
3. **EC2 → Load balancers → Create ALB:** internet-facing, the public subnets, security group `ea-hub-alb`. Add a listener on **HTTPS 443** with the ACM certificate that forwards to the target group, and a listener on **HTTP 80** that redirects to HTTPS.
4. Raise the **idle timeout** to 300 seconds (ALB → Attributes). Live chat uses long-lived connections.
5. DNS: point `hub.example.com` to the ALB, with a Route 53 alias or a CNAME.

## 9. Task definition

Save as `ea-hub-task.json`, replacing `<…>`:

```json
{
  "family": "ea-hub",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "1024",
  "memory": "2048",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "arn:aws:iam::<account>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "ea-hub",
      "image": "<IMAGE>",
      "essential": true,
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "environment": [
        { "name": "APP_URL", "value": "https://hub.example.com" },
        { "name": "DB_HOST", "value": "<rds-endpoint>.rds.amazonaws.com" },
        { "name": "DB_NAME", "value": "eahub" },
        { "name": "DB_SSLMODE", "value": "require" },
        { "name": "APP_DB_USER", "value": "eahubadmin" },
        { "name": "MIGRATE_ON_START", "value": "true" },
        { "name": "ADMIN_EMAIL", "value": "admin@yourcompany.com" },
        { "name": "TRUST_PROXY_HOPS", "value": "1" }
      ],
      "secrets": [
        { "name": "APP_DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:ea-hub/db-password" },
        { "name": "APP_ENCRYPTION_KEY", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:ea-hub/enc-key" },
        { "name": "CRON_SECRET", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:ea-hub/cron-secret" },
        { "name": "ADMIN_PASSWORD", "valueFrom": "arn:aws:secretsmanager:<region>:<account>:secret:ea-hub/admin-password" }
      ],
      "mountPoints": [{ "sourceVolume": "uploads", "containerPath": "/data/storage" }],
      "healthCheck": {
        "command": ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"],
        "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 120
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/ea-hub", "awslogs-region": "<region>", "awslogs-stream-prefix": "app", "awslogs-create-group": "true" }
      }
    }
  ],
  "volumes": [
    {
      "name": "uploads",
      "efsVolumeConfiguration": {
        "fileSystemId": "<FS>",
        "transitEncryption": "ENABLED",
        "authorizationConfig": { "accessPointId": "<AP>", "iam": "DISABLED" }
      }
    }
  ]
}
```

```bash
aws ecs register-task-definition --cli-input-json file://ea-hub-task.json
```

## 10. Cluster and service

```bash
aws ecs create-cluster --cluster-name ea-hub
aws ecs create-service --cluster ea-hub --service-name ea-hub \
  --task-definition ea-hub --desired-count 1 --launch-type FARGATE \
  --health-check-grace-period-seconds 180 \
  --network-configuration "awsvpcConfiguration={subnets=[${PRIV_SUBNETS}],securityGroups=[<ea-hub-app-sg-id>],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=<target-group-arn>,containerName=ea-hub,containerPort=3000"
```

Watch the first start in **CloudWatch Logs → /ecs/ea-hub**:

```text
[migrate] 91 migrations applied in total
[migrate] owner mode: this database does not allow BYPASSRLS …
[migrate] admin account created
➜ Listening on: http://0.0.0.0:3000/
```

## 11. Scheduled jobs (EventBridge Scheduler)

Create an IAM role `ea-hub-scheduler` that EventBridge Scheduler can assume (`scheduler.amazonaws.com`), with `ecs:RunTask` on the `ea-hub` task definition and `iam:PassRole` on `ecsTaskExecutionRole`. Then create one schedule per job:

```bash
for JOB in "newsletter|cron(0 6 * * ? *)" "daily-cleanup|cron(30 2 * * ? *)" "semantic-index|cron(15 3 * * ? *)"; do
  NAME=${JOB%%|*}; EXPR=${JOB#*|}
  aws scheduler create-schedule --name ea-hub-$NAME --schedule-expression "$EXPR" \
    --flexible-time-window Mode=OFF \
    --target "{
      \"Arn\": \"arn:aws:ecs:$REGION:$ACCOUNT:cluster/ea-hub\",
      \"RoleArn\": \"arn:aws:iam::$ACCOUNT:role/ea-hub-scheduler\",
      \"EcsParameters\": {
        \"TaskDefinitionArn\": \"arn:aws:ecs:$REGION:$ACCOUNT:task-definition/ea-hub\",
        \"LaunchType\": \"FARGATE\",
        \"NetworkConfiguration\": {\"awsvpcConfiguration\": {\"Subnets\": [\"subnet-aaa\",\"subnet-bbb\"], \"SecurityGroups\": [\"<ea-hub-app-sg-id>\"]}}
      },
      \"Input\": \"{\\\"containerOverrides\\\":[{\\\"name\\\":\\\"ea-hub\\\",\\\"command\\\":[\\\"node\\\",\\\"selfhost/scripts/run-job.mjs\\\",\\\"$NAME\\\"],\\\"environment\\\":[{\\\"name\\\":\\\"JOB_BASE_URL\\\",\\\"value\\\":\\\"https://$DOMAIN\\\"},{\\\"name\\\":\\\"MIGRATE_ON_START\\\",\\\"value\\\":\\\"false\\\"}]}]}\"
    }"
done
```

The job tasks reuse the app's task definition and only call the app with `CRON_SECRET`.

## 12. Open the site and sign in

Open `https://hub.example.com/admin`:

![Admin sign-in](images/admin-sign-in.jpg)

![Admin dashboard](images/admin-dashboard.jpg)

Afterwards, change the password in **My account**, and remove the `ADMIN_PASSWORD` secret from the task definition.

## 13. Operations

| Task | How |
|---|---|
| Upgrade | push the new image tag, register a new task definition revision, `aws ecs update-service --cluster ea-hub --service ea-hub --task-definition ea-hub --force-new-deployment` |
| Logs | CloudWatch Logs `/ecs/ea-hub` |
| Database backups | RDS automated backups (7–35 days) and snapshots |
| File backups | **AWS Backup** plan for the EFS file system |
| Scale | `--desired-count 2..3`. EFS and RDS are shared, so this is safe |
| Remove | delete the service, cluster, ALB, target group, RDS instance, EFS, schedules and secrets |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Task stops with `ResourceInitializationError: unable to pull secrets` | The execution role lacks `secretsmanager:GetSecretValue`, or the private subnets have no NAT / VPC endpoints |
| `mount.nfs4: Connection timed out` | Port 2049 is not allowed from `ea-hub-app` to `ea-hub-data`, or there is no EFS mount target in the task's subnet |
| Target unhealthy, task keeps restarting | The first start runs migrations: keep the health-check grace period at 180 s or more |
| `no pg_hba.conf entry … no encryption` | Set `DB_SSLMODE=require` |
| Every visitor shares one rate limit | Keep `TRUST_PROXY_HOPS=1` behind one ALB; use `2` if CloudFront is in front of the ALB |
| Live chat updates arrive late | Raise the ALB idle timeout (step 8.4) |
