# One-command cloud deployments

Ready-made templates that create **everything** EA-Hub needs on each cloud: the app, a managed PostgreSQL 16, storage for uploads, secrets, HTTPS and the daily jobs. They replace the step-by-step commands of the guides in [docs/en](../../docs/en/README.md).

| Cloud | Template | One click / one command |
|---|---|---|
| **Azure** Container Apps | [`azure/main.bicep`](azure/main.bicep) (ARM: `azure/azuredeploy.json`) | [![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FE20E-Tools%2Fea-hub-selfhost%2Fmain%2Fdeploy%2Fcloud%2Fazure%2Fazuredeploy.json) |
| **AWS** ECS on Fargate | [`aws/ea-hub.cfn.yaml`](aws/ea-hub.cfn.yaml) (CloudFormation) | `aws cloudformation deploy …` (below), or upload it in **CloudFormation → Create stack** |
| **Google Cloud** Run | [`gcp/main.tf`](gcp/main.tf) (Terraform) | `terraform apply` (below) |

> **Status:** the templates are validated in CI: Bicep compiles, `cfn-lint` passes, and `terraform validate` passes. They have not yet been deployed end-to-end on a live subscription. The app inside them is the same image that passes all CI tests.

## Azure

Click **Deploy to Azure**, choose a resource group, and fill in the form:
- the admin e-mail and password;
- a PostgreSQL password;
- `encryptionKey`, 32 or more random characters, which you must keep and never change;
- `cronSecret`.

Or use the CLI:

```bash
az group create -n ea-hub-rg -l westeurope
az deployment group create -g ea-hub-rg -f deploy/cloud/azure/main.bicep \
  -p adminEmail=you@example.com adminPassword='choose-a-long-password' \
     postgresPassword="$(openssl rand -hex 24)" encryptionKey="$(openssl rand -hex 32)" \
     cronSecret="$(openssl rand -hex 24)"
az deployment group show -g ea-hub-rg -n main --query properties.outputs.url.value -o tsv
```

## AWS

You need a VPC with 2 public subnets and 2 private subnets (with NAT), plus an ACM certificate for your domain:

```bash
aws cloudformation deploy --stack-name ea-hub --template-file deploy/cloud/aws/ea-hub.cfn.yaml \
  --capabilities CAPABILITY_IAM --parameter-overrides \
  VpcId=vpc-… PublicSubnets=subnet-a,subnet-b PrivateSubnets=subnet-c,subnet-d \
  CertificateArn=arn:aws:acm:… DomainName=hub.example.com \
  AdminEmail=you@example.com AdminPassword='choose-a-long-password' DbPassword="$(openssl rand -hex 20)"
aws cloudformation describe-stacks --stack-name ea-hub --query 'Stacks[0].Outputs'
```

Point `hub.example.com` to the `LoadBalancerDns` output.

## Google Cloud

```bash
cd deploy/cloud/gcp
terraform init
terraform apply -var project=my-project -var admin_email=you@example.com
terraform output url
terraform output -raw admin_password
```

The `terraform apply` step needs `gcloud` signed in, because it sets the app address after the service is created. Keep the Terraform state safe, because it contains the generated secrets.

## After the first sign-in

- **Change the admin password** in **My account**.
- **Remove the first-admin password secret** from the platform:
  - Azure: the `admin-password` secret.
  - AWS: the `AdminPasswordSecret`.
  - Google Cloud: the `ea-hub-admin-password` secret.
