# تشغيل EA-Hub على AWS (ECS مع Fargate)

تشغّل خدمة Amazon ECS بنمط Fargate حاوية EA-Hub دون خوادم تديرها بنفسك. الإعداد الكامل على AWS:

| جزء EA-Hub | خدمة AWS |
|---|---|
| تطبيق الويب | **خدمة ECS على Fargate** |
| نقطة الدخول بـ HTTPS | **Application Load Balancer** مع شهادة من **ACM** |
| قاعدة البيانات | **Amazon RDS for PostgreSQL 16** |
| الملفات المرفوعة (`/data/storage`) | **Amazon EFS** مع نقطة وصول (access point) |
| الأسرار | **AWS Secrets Manager** |
| المهام اليومية | **EventBridge Scheduler** يشغّل مهام ECS |
| النسخ الاحتياطية | نسخ RDS التلقائية، و**AWS Backup** لنظام EFS |

> النسخة الإنجليزية: [en/deploy-aws-ecs-fargate.md](en/deploy-aws-ecs-fargate.md)

> **الحالة:** تتبع هذه الخطوات أوامر AWS CLI وخطوات الواجهة الموثقة. الحاوية نفسها، ووضع المالك لـ PostgreSQL المُدارة، وخيار `MIGRATE_ON_START`، كلها مختبرة في CI على PostgreSQL 16 عادية. لكن AWS نفسها لم تُختبر من البداية إلى النهاية بعد.

> تفضّل Kubernetes على AWS؟ استخدم **EKS** مع الـ Helm chart كما في [helm.md](helm.md)، مع StorageClass `gp3` وAWS Load Balancer Controller أو ingress-nginx.

## 1. المتطلبات

### موارد AWS وأحجامها

| المورد | الحجم المبدئي |
|---|---|
| مهمة Fargate للتطبيق | **1 vCPU و2 GB**، من مهمة إلى 3 مهام |
| مهمة Fargate لكل مهمة يومية | 0.25 vCPU و0.5 GB، ثوانٍ قليلة يومياً |
| RDS PostgreSQL | **db.t4g.small**، 20 GB من نوع gp3، المحرك **16.x**، في منطقة واحدة (Multi-AZ للإنتاج) |
| EFS | General Purpose بنمط Bursting، والدفع حسب حجم المخزّن |
| Application Load Balancer | واحد مكشوف للإنترنت، في شبكتين فرعيتين عامتين |

التكلفة التقريبية بهذه الأحجام: بين 60 و90 دولاراً شهرياً في أغلب المناطق.

### الأدوات والصلاحيات والشبكة

| المطلوب | التفاصيل |
|---|---|
| حساب AWS | صلاحيات IAM على ECS وEC2 (VPC ومجموعات الأمان) وRDS وEFS وELB وACM وSecrets Manager وأدوار IAM وEventBridge Scheduler وCloudWatch Logs |
| AWS CLI v2 | مضبوطة بـ `aws configure` أو SSO |
| VPC | شبكتان فرعيتان **عامتان** لموزّع الحمل، وشبكتان **خاصتان** مع NAT gateway للمهام والقاعدة وEFS. يصلح VPC الافتراضي للتجربة مع عناوين IP عامة للمهام |
| الصورة | `ghcr.io/e20e-tools/ea-hub-selfhost:<version>` (عامة)، أو نسخة منها في Amazon ECR، وهو الموصى به |
| نطاق وشهادة ACM | لـ HTTPS: نطاق في Route 53 أو أي مزوّد DNS، وشهادة في ACM للاسم `hub.example.com` |

## 2. المتغيرات

```bash
REGION=eu-central-1
VPC=vpc-xxxxxxxx
PRIV_SUBNETS=subnet-aaa,subnet-bbb        # tasks, RDS, EFS
PUB_SUBNETS=subnet-ccc,subnet-ddd         # load balancer
DOMAIN=hub.example.com
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
```

## 3. انسخ الصورة إلى ECR (موصى به)

```bash
aws ecr create-repository --repository-name ea-hub-selfhost --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker pull ghcr.io/e20e-tools/ea-hub-selfhost:<version>     # or build it: docker build -t ea-hub-selfhost .
docker tag ghcr.io/e20e-tools/ea-hub-selfhost:<version> $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
IMAGE=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ea-hub-selfhost:<version>
```

## 4. مجموعات الأمان

أنشئ ثلاث مجموعات أمان في الـ VPC:

| المجموعة | قاعدة الدخول |
|---|---|
| `ea-hub-alb` | المنفذان 443 و80 من `0.0.0.0/0` |
| `ea-hub-app` | المنفذ 3000 من `ea-hub-alb` |
| `ea-hub-data` | المنفذ 5432 (PostgreSQL) و2049 (NFS/EFS) من `ea-hub-app` |

## 5. قاعدة البيانات (RDS PostgreSQL 16)

من الواجهة: **RDS ← Create database ← PostgreSQL 16 ← Templates: Free tier/Dev-Test**، ثم:

- المعرّف `ea-hub-db`، والمستخدم الرئيسي `eahubadmin`، وكلمة مرور مولّدة تلقائياً أو قوية.
- الحجم `db.t4g.small` مع 20 GB من نوع gp3، في الشبكات الخاصة، بمجموعة الأمان `ea-hub-data`، مع **Public access: No**.
- **Initial database name: `eahub`**.

المستخدم الرئيسي في RDS ليس superuser. يكتشف EA-Hub ذلك ويعمل في **وضع المالك**، فيتصل التطبيق باسم `eahubadmin` الذي يملك كل الجداول. ولأن RDS يفرض TLS، اضبط `DB_SSLMODE=require`.

## 6. تخزين الملفات (EFS مع نقطة وصول)

```bash
FS=$(aws efs create-file-system --encrypted --tags Key=Name,Value=ea-hub-uploads --query FileSystemId --output text)
for S in ${PRIV_SUBNETS//,/ }; do aws efs create-mount-target --file-system-id $FS --subnet-id $S --security-groups <ea-hub-data-sg-id>; done
AP=$(aws efs create-access-point --file-system-id $FS \
  --posix-user Uid=1000,Gid=0 \
  --root-directory 'Path=/ea-hub,CreationInfo={OwnerUid=1000,OwnerGid=0,Permissions=775}' \
  --query AccessPointId --output text)
```

نقطة الوصول تجعل كل ملف ملكاً للمستخدم 1000، وهو المستخدم الذي تعمل به الحاوية.

بديل: يمكن حفظ الملفات في حاوية S3 بدل EFS بالإعداد `STORAGE_BACKEND=s3` مع متغيرات `S3_*`، وعندها لا يلزم EFS. انظر `.env.example`.

## 7. الأسرار (Secrets Manager)

```bash
aws secretsmanager create-secret --name ea-hub/db-password    --secret-string '<RDS master password>'
aws secretsmanager create-secret --name ea-hub/enc-key        --secret-string "$(openssl rand -hex 32)"   # never change it later
aws secretsmanager create-secret --name ea-hub/cron-secret    --secret-string "$(openssl rand -hex 24)"
aws secretsmanager create-secret --name ea-hub/admin-password --secret-string '<first admin password, 10+ chars>'
```

يحتاج **دور تنفيذ المهام** (`ecsTaskExecutionRole`) إلى صلاحية `secretsmanager:GetSecretValue` على `ea-hub/*`، إضافة إلى السياسة المعتادة `AmazonECSTaskExecutionRolePolicy`.

## 8. موزّع الحمل والشهادة

1. **الشهادة:** من **ACM ← Request certificate** اطلب شهادة للاسم `hub.example.com` بالتحقق عبر DNS، وانتظر حتى تظهر *Issued*.
2. **مجموعة الأهداف:** من **EC2 ← Target groups ← Create** اختر:
   - النوع *IP*، والبروتوكول HTTP، والمنفذ **3000**، والـ VPC.
   - مسار فحص الصحة **`/healthz`**، ورمز النجاح 200.
3. **موزّع الحمل:** من **EC2 ← Load balancers ← Create ALB** اختر:
   - مكشوف للإنترنت (internet-facing)، في الشبكات العامة، بمجموعة الأمان `ea-hub-alb`.
   - مستمع على **HTTPS 443** بشهادة ACM يحوّل إلى مجموعة الأهداف.
   - مستمع على **HTTP 80** يعيد التوجيه إلى HTTPS.
4. **مهلة الخمول:** ارفع **idle timeout** إلى 300 ثانية من ALB ← Attributes، لأن المحادثة المباشرة تستخدم اتصالات طويلة.
5. **DNS:** اجعل `hub.example.com` يشير إلى الـ ALB، بسجل alias في Route 53 أو بسجل CNAME.

## 9. تعريف المهمة (Task definition)

احفظ ما يلي في الملف `ea-hub-task.json`، واستبدل قيم `<…>`:

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

## 10. العنقود والخدمة

```bash
aws ecs create-cluster --cluster-name ea-hub
aws ecs create-service --cluster ea-hub --service-name ea-hub \
  --task-definition ea-hub --desired-count 1 --launch-type FARGATE \
  --health-check-grace-period-seconds 180 \
  --network-configuration "awsvpcConfiguration={subnets=[${PRIV_SUBNETS}],securityGroups=[<ea-hub-app-sg-id>],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=<target-group-arn>,containerName=ea-hub,containerPort=3000"
```

تابع التشغيل الأول في **CloudWatch Logs ← /ecs/ea-hub**:

```text
[migrate] 91 migrations applied in total
[migrate] owner mode: this database does not allow BYPASSRLS …
[migrate] admin account created
➜ Listening on: http://0.0.0.0:3000/
```

## 11. المهام المجدولة (EventBridge Scheduler)

أنشئ دور IAM باسم `ea-hub-scheduler` يستطيع EventBridge Scheduler تقمّصه (`scheduler.amazonaws.com`). امنحه صلاحية `ecs:RunTask` على تعريف المهمة `ea-hub`، وصلاحية `iam:PassRole` على `ecsTaskExecutionRole`. ثم أنشئ جدولاً لكل مهمة:

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

تستخدم المهام المجدولة تعريف مهمة التطبيق نفسه، ولا تفعل أكثر من استدعاء التطبيق مع `CRON_SECRET`.

## 12. افتح الموقع وسجّل الدخول

افتح `https://hub.example.com/admin`:

![شاشة دخول المدير](en/images/admin-sign-in.jpg)

![لوحة تحكم المدير](en/images/admin-dashboard.jpg)

بعد ذلك:
1. غيّر كلمة المرور من **My account**.
2. احذف السر `ADMIN_PASSWORD` من تعريف المهمة.

## 13. التشغيل اليومي

| المهمة | الطريقة |
|---|---|
| الترقية | ارفع وسم الصورة الجديد، وسجّل نسخة جديدة من تعريف المهمة، ثم `aws ecs update-service --cluster ea-hub --service ea-hub --task-definition ea-hub --force-new-deployment` |
| السجلات | CloudWatch Logs في `/ecs/ea-hub` |
| نسخ قاعدة البيانات | نسخ RDS التلقائية (من 7 إلى 35 يوماً) واللقطات |
| نسخ الملفات | خطة **AWS Backup** لنظام ملفات EFS |
| التوسع | `--desired-count 2..3`. يتشارك الجميع EFS وRDS، فالتوسع آمن |
| الإزالة | احذف الخدمة والعنقود والـ ALB ومجموعة الأهداف وقاعدة RDS وEFS والجداول والأسرار |

## حل المشكلات

| العَرَض | الحل |
|---|---|
| تتوقف المهمة مع `ResourceInitializationError: unable to pull secrets` | دور التنفيذ ينقصه `secretsmanager:GetSecretValue`، أو الشبكات الخاصة بلا NAT أو VPC endpoints |
| `mount.nfs4: Connection timed out` | المنفذ 2049 غير مسموح من `ea-hub-app` إلى `ea-hub-data`، أو لا توجد نقطة ربط EFS في شبكة المهمة |
| الهدف غير سليم والمهمة تعيد التشغيل باستمرار | التشغيل الأول يطبّق التهيئات، فأبقِ مهلة فحص الصحة الأولى 180 ثانية أو أكثر |
| `no pg_hba.conf entry … no encryption` | اضبط `DB_SSLMODE=require` |
| كل الزوار يتشاركون حد طلبات واحداً | أبقِ `TRUST_PROXY_HOPS=1` خلف ALB واحد، واجعله `2` إن كان CloudFront أمام الـ ALB |
| تحديثات المحادثة المباشرة تتأخر | ارفع مهلة الخمول في الـ ALB (الخطوة 8، البند 4) |
