# النشر على السحابة بخطوة واحدة

قوالب جاهزة تنشئ **كل** ما يحتاجه EA-Hub على كل سحابة:
- التطبيق.
- قاعدة PostgreSQL مُدارة.
- تخزين الملفات المرفوعة.
- الأسرار.
- HTTPS.
- المهام اليومية.

القوالب تغني عن الأوامر المتتالية في أدلة [Azure](azure-container-apps.md) و[AWS](aws-ecs-fargate.md) و[Google Cloud](google-cloud-run.md). الملفات نفسها في مجلد [`deploy/cloud`](../deploy/cloud/README.md).

> النسخة الإنجليزية: [deploy/cloud/README.md](../deploy/cloud/README.md)

| السحابة | القالب | طريقة التشغيل |
|---|---|---|
| **Azure** Container Apps | `deploy/cloud/azure/main.bicep` (وملف ARM: `azuredeploy.json`) | زر **Deploy to Azure** في [صفحة القوالب](../deploy/cloud/README.md)، أو أمر واحد |
| **AWS** ECS على Fargate | `deploy/cloud/aws/ea-hub.cfn.yaml` (CloudFormation) | أمر `aws cloudformation deploy`، أو رفع الملف من **CloudFormation ← Create stack** |
| **Google Cloud** Run | `deploy/cloud/gcp/main.tf` (Terraform) | أمر `terraform apply` |

> **الحالة:** تُفحص القوالب في CI: يُبنى قالب Bicep، ويجتاز قالب AWS أداة `cfn-lint`، ويجتاز قالب Terraform أمر `terraform validate`. لكنها لم تُنشر بعد على اشتراك حقيقي. التطبيق داخلها هو الصورة نفسها التي تجتاز كل اختبارات CI.

## Azure

اضغط زر **Deploy to Azure**، واختر مجموعة موارد (resource group)، ثم املأ النموذج:
- بريد المدير وكلمة مروره.
- كلمة مرور PostgreSQL.
- `encryptionKey`: سلسلة عشوائية من 32 حرفاً أو أكثر. احتفظ بها، ولا تغيّرها أبداً بعد التشغيل الأول.
- `cronSecret`: سر المهام المجدولة.

أو بالأوامر:

```bash
az group create -n ea-hub-rg -l westeurope
az deployment group create -g ea-hub-rg -f deploy/cloud/azure/main.bicep \
  -p adminEmail=you@example.com adminPassword='choose-a-long-password' \
     postgresPassword="$(openssl rand -hex 24)" encryptionKey="$(openssl rand -hex 32)" \
     cronSecret="$(openssl rand -hex 24)"
az deployment group show -g ea-hub-rg -n main --query properties.outputs.url.value -o tsv
```

## AWS

تحتاج إلى VPC فيها شبكتان فرعيتان عامتان وشبكتان خاصتان مع NAT، وإلى شهادة ACM لنطاقك:

```bash
aws cloudformation deploy --stack-name ea-hub --template-file deploy/cloud/aws/ea-hub.cfn.yaml \
  --capabilities CAPABILITY_IAM --parameter-overrides \
  VpcId=vpc-… PublicSubnets=subnet-a,subnet-b PrivateSubnets=subnet-c,subnet-d \
  CertificateArn=arn:aws:acm:… DomainName=hub.example.com AdminEmail=you@example.com
aws cloudformation describe-stacks --stack-name ea-hub --query 'Stacks[0].Outputs'
```

بعد ذلك:
- اجعل `hub.example.com` يشير إلى قيمة `LoadBalancerDns` من المخرجات.
- اقرأ كلمة مرور المدير الأولى المولّدة:
  ```bash
  aws secretsmanager get-secret-value --secret-id <قيمة AdminPassword من المخرجات> --query SecretString --output text
  ```

تعمل القاعدة على RDS PostgreSQL 17. يولّد RDS كلمة مرورها ويحفظها بنفسه في Secrets Manager.

## Google Cloud

```bash
cd deploy/cloud/gcp
terraform init
terraform apply -var project=my-project -var admin_email=you@example.com
terraform output url
terraform output -raw admin_password
```

احفظ ملف حالة Terraform (state) في مكان آمن، لأنه يحتوي على الأسرار المولّدة.

## بعد أول دخول

- **غيّر كلمة مرور المدير** من **My account**.
- **احذف سر كلمة مرور المدير الأولى** من المنصة:
  - Azure: السر `admin-password`.
  - AWS: السر `AdminPasswordSecret`.
  - Google Cloud: السر `ea-hub-admin-password`.
