// EA-Hub on Azure Container Apps: one deployment creates everything in a resource group.
//
//   az group create -n ea-hub-rg -l westeurope
//   az deployment group create -g ea-hub-rg -f deploy/cloud/azure/main.bicep \
//     -p adminEmail=you@example.com adminPassword='…' postgresPassword="$(openssl rand -hex 24)" \
//        encryptionKey="$(openssl rand -hex 32)" cronSecret="$(openssl rand -hex 24)"
//
// Resources: Log Analytics, Container Apps environment, PostgreSQL Flexible Server 16,
// storage account + Azure Files share (uploads), the EA-Hub container app and 3 scheduled jobs.
// The app prepares the database on start (MIGRATE_ON_START) and creates the first admin.

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Short name used as a prefix for resource names.')
@maxLength(12)
param name string = 'eahub'

@description('Container image of EA-Hub.')
param image string = 'ghcr.io/e20e-tools/ea-hub-selfhost:1.1.0'

@description('E-mail of the first admin account.')
param adminEmail string

@description('Password of the first admin account (10+ characters). Change it after the first sign-in.')
@secure()
@minLength(10)
param adminPassword string

@description('Password of the PostgreSQL admin user.')
@secure()
@minLength(16)
param postgresPassword string

@description('Root secret of the app (32+ characters). Never change it after the first start.')
@secure()
@minLength(32)
param encryptionKey string

@description('Secret the scheduled jobs send to the app.')
@secure()
@minLength(16)
param cronSecret string

@description('PostgreSQL compute tier and size.')
param postgresSku string = 'Standard_B1ms'
param postgresTier string = 'Burstable'

@description('Your own address (https://hub.example.com) once a custom domain is bound; empty = the generated address.')
param appUrl string = ''

var suffix = uniqueString(resourceGroup().id)
var pgAdmin = 'eahubadmin'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: '${name}-pg-${suffix}'
  location: location
  sku: { name: postgresSku, tier: postgresTier }
  properties: {
    version: '16'
    administratorLogin: pgAdmin
    administratorLoginPassword: postgresPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pg
  name: 'eahub'
}

// 0.0.0.0 = allow connections from Azure services (the container app). Use VNet
// integration instead for a private database.
resource pgAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower('${take(name, 8)}files${take(suffix, 8)}')
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: '${storage.name}/default/uploads'
  properties: { shareQuota: 5 }
}

resource envStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: env
  name: 'uploads'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: 'uploads'
      accessMode: 'ReadWrite'
    }
  }
  dependsOn: [share]
}

var generatedUrl = 'https://${name}.${env.properties.defaultDomain}'
var url = empty(appUrl) ? generatedUrl : appUrl
var dbHost = '${pg.name}.postgres.database.azure.com'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      secrets: [
        { name: 'db-password', value: postgresPassword }
        { name: 'enc-key', value: encryptionKey }
        { name: 'cron-secret', value: cronSecret }
        { name: 'admin-password', value: adminPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'ea-hub'
          image: image
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'APP_URL', value: url }
            { name: 'DB_HOST', value: dbHost }
            { name: 'DB_NAME', value: 'eahub' }
            { name: 'DB_SSLMODE', value: 'require' }
            { name: 'APP_DB_USER', value: pgAdmin }
            { name: 'APP_DB_PASSWORD', secretRef: 'db-password' }
            { name: 'APP_ENCRYPTION_KEY', secretRef: 'enc-key' }
            { name: 'CRON_SECRET', secretRef: 'cron-secret' }
            { name: 'MIGRATE_ON_START', value: 'true' }
            { name: 'ADMIN_EMAIL', value: adminEmail }
            { name: 'ADMIN_PASSWORD', secretRef: 'admin-password' }
            { name: 'TRUST_PROXY_HOPS', value: '1' }
          ]
          volumeMounts: [{ volumeName: 'uploads', mountPath: '/data/storage' }]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 3000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 3000 }, periodSeconds: 10 }
            { type: 'Startup', httpGet: { path: '/healthz', port: 3000 }, periodSeconds: 10, failureThreshold: 30 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
      volumes: [
        {
          name: 'uploads'
          storageType: 'AzureFile'
          storageName: envStorage.name
          mountOptions: 'uid=1000,gid=0,dir_mode=0775,file_mode=0664'
        }
      ]
    }
  }
  dependsOn: [pgDb, pgAzure]
}

var jobs = [
  { name: 'newsletter', cron: '0 6 * * *' }
  { name: 'daily-cleanup', cron: '30 2 * * *' }
  { name: 'semantic-index', cron: '15 3 * * *' }
]

resource scheduled 'Microsoft.App/jobs@2024-03-01' = [for job in jobs: {
  name: '${name}-${job.name}'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 900
      replicaRetryLimit: 1
      scheduleTriggerConfig: { cronExpression: job.cron, parallelism: 1, replicaCompletionCount: 1 }
      secrets: [{ name: 'cron-secret', value: cronSecret }]
    }
    template: {
      containers: [
        {
          name: 'job'
          image: image
          command: ['node', 'selfhost/scripts/run-job.mjs', job.name]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'JOB_BASE_URL', value: url }
            { name: 'CRON_SECRET', secretRef: 'cron-secret' }
          ]
        }
      ]
    }
  }
  dependsOn: [app]
}]

@description('Open this address and sign in at /admin.')
output url string = url
output postgresServer string = dbHost
