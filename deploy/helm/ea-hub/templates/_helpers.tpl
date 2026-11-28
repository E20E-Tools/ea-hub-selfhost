{{- define "ea-hub.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "ea-hub.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "ea-hub.selector" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ea-hub.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "ea-hub.secretName" -}}
{{- if .Values.secrets.create -}}{{ include "ea-hub.fullname" . }}{{- else -}}{{ required "secrets.existingSecret is required when secrets.create=false" .Values.secrets.existingSecret }}{{- end -}}
{{- end -}}

{{- define "ea-hub.cnpg" -}}
{{- if and .Values.postgres.enabled .Values.postgres.cloudnativepg.enabled -}}true{{- end -}}
{{- end -}}

{{- define "ea-hub.dbHost" -}}
{{- if include "ea-hub.cnpg" . -}}{{ include "ea-hub.fullname" . }}-pg-rw
{{- else if .Values.postgres.enabled -}}{{ include "ea-hub.fullname" . }}-postgres{{- else -}}{{ required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host }}{{- end -}}
{{- end -}}

{{- define "ea-hub.dbPort" -}}
{{- if .Values.postgres.enabled -}}5432{{- else -}}{{ .Values.externalDatabase.port }}{{- end -}}
{{- end -}}

{{- define "ea-hub.dbName" -}}
{{- if .Values.postgres.enabled -}}{{ .Values.postgres.database }}{{- else -}}{{ .Values.externalDatabase.database }}{{- end -}}
{{- end -}}

{{- define "ea-hub.dbAdminUser" -}}
{{- if .Values.postgres.enabled -}}postgres{{- else -}}{{ .Values.externalDatabase.adminUser }}{{- end -}}
{{- end -}}

{{/* Connection settings shared by the app, migrations and backups. */}}
{{- define "ea-hub.dbEnv" -}}
- name: DB_HOST
  value: {{ include "ea-hub.dbHost" . | quote }}
- name: DB_PORT
  value: {{ include "ea-hub.dbPort" . | quote }}
- name: DB_NAME
  value: {{ include "ea-hub.dbName" . | quote }}
{{- if and (not .Values.postgres.enabled) .Values.externalDatabase.sslmode }}
- name: DB_SSLMODE
  value: {{ .Values.externalDatabase.sslmode | quote }}
{{- end }}
{{- end -}}

{{- define "ea-hub.secretEnv" -}}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ include "ea-hub.secretName" .root }}
      key: {{ .key }}
      {{- if .optional }}
      optional: true
      {{- end }}
{{- end -}}

{{/* Environment of the web app. */}}
{{- define "ea-hub.appEnv" -}}
{{ include "ea-hub.dbEnv" . }}
- name: APP_DB_USER
  value: eahub_app
{{ include "ea-hub.secretEnv" (dict "root" . "name" "APP_DB_PASSWORD" "key" "app-db-password") }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "APP_ENCRYPTION_KEY" "key" "app-encryption-key") }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "CRON_SECRET" "key" "cron-secret") }}
- name: APP_URL
  value: {{ required "appUrl is required" .Values.appUrl | trimSuffix "/" | quote }}
- name: TRUST_PROXY_HOPS
  value: {{ .Values.trustProxyHops | quote }}
- name: STORAGE_MAX_UPLOAD_MB
  value: {{ .Values.storage.maxUploadMb | quote }}
- name: SMTP_HOST
  value: {{ .Values.smtp.host | quote }}
- name: SMTP_PORT
  value: {{ .Values.smtp.port | quote }}
- name: SMTP_SECURE
  value: {{ .Values.smtp.secure | quote }}
- name: SMTP_USER
  value: {{ .Values.smtp.user | quote }}
- name: SMTP_FROM
  value: {{ .Values.smtp.from | quote }}
- name: NOTIFY_FROM
  value: {{ .Values.mail.notifyFrom | quote }}
- name: NEWSLETTER_FROM
  value: {{ .Values.mail.newsletterFrom | quote }}
- name: TURNSTILE_SITE_KEY
  value: {{ .Values.features.turnstileSiteKey | quote }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "SMTP_PASSWORD" "key" "smtp-password" "optional" true) }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "RESEND_API_KEY" "key" "resend-api-key" "optional" true) }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "OPENAI_API_KEY" "key" "openai-api-key" "optional" true) }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "GROQ_API_KEY" "key" "groq-api-key" "optional" true) }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "TURNSTILE_SECRET_KEY" "key" "turnstile-secret-key" "optional" true) }}
{{- if .Values.metrics.enabled }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "METRICS_TOKEN" "key" "metrics-token" "optional" true) }}
{{- end }}
- name: STORAGE_BACKEND
  value: {{ .Values.storage.backend | quote }}
{{- with (.Values.tracing | default dict).otlpEndpoint }}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ . | quote }}
- name: OTEL_TRACES_SAMPLER_ARG
  value: {{ $.Values.tracing.samplingRatio | default 1 | quote }}
- name: OTEL_SERVICE_NAME
  value: {{ include "ea-hub.fullname" $ | quote }}
{{ include "ea-hub.secretEnv" (dict "root" $ "name" "OTEL_EXPORTER_OTLP_HEADERS" "key" "otel-headers" "optional" true) }}
{{- end }}
{{- with .Values.sso.oidc }}
{{- if and .issuer .clientId }}
{{- if and $.Values.secrets.create (not .clientSecret) }}
{{- fail "sso.oidc.clientSecret is required when sso.oidc.issuer and clientId are set" }}
{{- end }}
- name: OIDC_ISSUER
  value: {{ .issuer | quote }}
- name: OIDC_CLIENT_ID
  value: {{ .clientId | quote }}
- name: OIDC_SCOPES
  value: {{ .scopes | quote }}
- name: OIDC_BUTTON_LABEL
  value: {{ .buttonLabel | quote }}
- name: OIDC_ADMIN_EMAILS
  value: {{ .adminEmails | quote }}
- name: OIDC_ADMIN_GROUPS
  value: {{ .adminGroups | quote }}
- name: OIDC_GROUPS_CLAIM
  value: {{ .groupsClaim | quote }}
- name: OIDC_ALLOWED_DOMAINS
  value: {{ .allowedDomains | quote }}
- name: OIDC_AUTO_CREATE
  value: {{ .autoCreate | quote }}
- name: OIDC_REQUIRE_VERIFIED_EMAIL
  value: {{ .requireVerifiedEmail | quote }}
{{ include "ea-hub.secretEnv" (dict "root" $ "name" "OIDC_CLIENT_SECRET" "key" "oidc-client-secret") }}
{{- end }}
{{- end }}
{{- if eq .Values.storage.backend "s3" }}
- name: S3_BUCKET
  value: {{ required "storage.s3.bucket is required when storage.backend=s3" .Values.storage.s3.bucket | quote }}
- name: S3_REGION
  value: {{ .Values.storage.s3.region | quote }}
- name: S3_ENDPOINT
  value: {{ .Values.storage.s3.endpoint | quote }}
- name: S3_FORCE_PATH_STYLE
  value: {{ .Values.storage.s3.forcePathStyle | quote }}
- name: S3_PREFIX
  value: {{ .Values.storage.s3.prefix | quote }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "S3_ACCESS_KEY_ID" "key" "s3-access-key-id") }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "S3_SECRET_ACCESS_KEY" "key" "s3-secret-access-key") }}
{{- end }}
{{- end -}}

{{/* Environment of the migration step. */}}
{{- define "ea-hub.migrateEnv" -}}
{{ include "ea-hub.dbEnv" . }}
- name: POSTGRES_USER
  value: {{ include "ea-hub.dbAdminUser" . | quote }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "POSTGRES_PASSWORD" "key" "postgres-password") }}
- name: APP_DB_USER
  value: eahub_app
{{ include "ea-hub.secretEnv" (dict "root" . "name" "APP_DB_PASSWORD" "key" "app-db-password") }}
- name: ADMIN_EMAIL
  value: {{ .Values.admin.email | quote }}
{{ include "ea-hub.secretEnv" (dict "root" . "name" "ADMIN_PASSWORD" "key" "admin-password" "optional" true) }}
- name: ADMIN_RESET_PASSWORD
  value: {{ .Values.admin.resetPassword | quote }}
{{- end -}}

{{- define "ea-hub.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/* Secret value: from values.yaml, else the one already in the cluster, else random. */}}
{{- define "ea-hub.keep" -}}
{{- if .value -}}{{ .value | b64enc }}{{- else if hasKey .old .key -}}{{ index .old .key }}{{- else -}}{{ randAlphaNum .length | b64enc }}{{- end -}}
{{- end -}}

{{/* OpenShift runs pods under a random user ID: the Debian postgres image supports that
     (nss_wrapper); the Alpine default is swapped for it in OpenShift mode. */}}
{{- define "ea-hub.postgresImage" -}}
{{- if and .Values.openshift.enabled (eq .Values.postgres.image "postgres:16-alpine") -}}postgres:16{{- else -}}{{ .Values.postgres.image }}{{- end -}}
{{- end -}}

{{/* Uploads live on a volume ("true") or in an S3 bucket (empty). */}}
{{- define "ea-hub.fileStorage" -}}
{{- if ne .Values.storage.backend "s3" -}}true{{- end -}}
{{- end -}}

{{/* Pod spec of a backup run: shared by the daily CronJob and the pre-upgrade hook. */}}
{{- define "ea-hub.backupJobSpec" -}}
{{- $offsite := .Values.backup.offsite }}
{{- /* dig: values saved by an older release (helm upgrade --reuse-values) lack this key. */}}
{{- $encrypt := dig "encryption" "publicKey" "" .Values.backup }}
backoffLimit: 1
template:
  metadata:
    labels:
      {{- include "ea-hub.selector" . | nindent 6 }}
      app.kubernetes.io/component: backup
  spec:
    restartPolicy: Never
    {{- if and (include "ea-hub.fileStorage" .) (eq .Values.storage.accessMode "ReadWriteOnce") }}
    # The uploads volume is ReadWriteOnce: run next to the web pod to read it.
    affinity:
      podAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          - topologyKey: kubernetes.io/hostname
            labelSelector:
              matchLabels:
                {{- include "ea-hub.selector" . | nindent 16 }}
                app.kubernetes.io/component: web
    {{- end }}
    {{- if or $offsite.enabled $encrypt }}
    # Steps run in order: backup, then encryption (optional), then the offsite copy (optional).
    initContainers:
    {{- else }}
    containers:
    {{- end }}
      - name: backup
        image: {{ include "ea-hub.postgresImage" . }}
        command: ["/bin/sh", "/backup/backup.sh", "now"]
        env:
          - name: PGHOST
            value: {{ include "ea-hub.dbHost" . | quote }}
          - name: PGPORT
            value: {{ include "ea-hub.dbPort" . | quote }}
          - name: PGDATABASE
            value: {{ include "ea-hub.dbName" . | quote }}
          - name: PGUSER
            value: {{ include "ea-hub.dbAdminUser" . | quote }}
          {{- include "ea-hub.secretEnv" (dict "root" . "name" "PGPASSWORD" "key" "postgres-password") | nindent 10 }}
          {{- if and (not .Values.postgres.enabled) .Values.externalDatabase.sslmode }}
          - name: PGSSLMODE
            value: {{ .Values.externalDatabase.sslmode | quote }}
          {{- end }}
          - name: BACKUP_KEEP_DAYS
            value: {{ .Values.backup.keepDays | quote }}
        volumeMounts:
          - name: script
            mountPath: /backup
          - name: backups
            mountPath: /backups
          {{- if include "ea-hub.fileStorage" . }}
          - name: storage
            mountPath: /data/storage
            readOnly: true
          {{- end }}
    {{- if $encrypt }}
    {{- if not $offsite.enabled }}
    containers:
    {{- end }}
      - name: encrypt
        image: {{ include "ea-hub.image" . }}
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        command: ["node", "selfhost/scripts/backup-crypt.mjs", "encrypt-dir", "/backups"]
        env:
          - name: BACKUP_PUBLIC_KEY
            value: {{ $encrypt | quote }}
        volumeMounts:
          - name: backups
            mountPath: /backups
        securityContext:
          {{- if not .Values.openshift.enabled }}
          # Same user as the backup step (the postgres image runs as root), so it can replace
          # the plain files. On OpenShift every container of the pod gets the same random UID.
          runAsUser: 0
          runAsNonRoot: false
          {{- end }}
          {{- include "ea-hub.containerSecurity" . | nindent 10 }}
        resources:
          requests: { cpu: 10m, memory: 64Mi }
          limits: { memory: 512Mi }
    {{- end }}
    {{- if $offsite.enabled }}
    containers:
      - name: offsite
        image: {{ $offsite.image }}
        command: ["rclone"]
        args:
          - copy
          - /backups
          - "offsite:{{ required "backup.offsite.path is required (bucket/folder)" $offsite.path }}"
          - --exclude=*.partial/**
          - --max-age=48h
          - --stats-one-line
          - -v
        env:
          - name: HOME
            value: /tmp
          {{- range $k, $v := $offsite.config }}
          - name: RCLONE_CONFIG_OFFSITE_{{ $k | upper }}
            value: {{ $v | toString | quote }}
          {{- end }}
        {{- if or $offsite.existingSecret $offsite.credentials }}
        envFrom:
          - prefix: RCLONE_CONFIG_OFFSITE_
            secretRef:
              name: {{ $offsite.existingSecret | default (printf "%s-offsite" (include "ea-hub.fullname" .)) }}
        {{- end }}
        volumeMounts:
          - name: backups
            mountPath: /backups
            readOnly: true
        resources:
          requests: { cpu: 10m, memory: 64Mi }
          limits: { memory: 512Mi }
    {{- end }}
    volumes:
      - name: script
        configMap:
          name: {{ include "ea-hub.fullname" . }}-backup
      - name: backups
        persistentVolumeClaim:
          claimName: {{ include "ea-hub.fullname" . }}-backups
      {{- if include "ea-hub.fileStorage" . }}
      - name: storage
        persistentVolumeClaim:
          claimName: {{ .Values.storage.existingClaim | default (printf "%s-storage" (include "ea-hub.fullname" .)) }}
      {{- end }}
{{- end -}}

{{/* The PostgreSQL superuser password (base64), the same in every template of one render:
     the value you set, else the one already in the Secret, else one generated once. */}}
{{- define "ea-hub.postgresPasswordB64" -}}
{{- $root := .root -}}
{{- if $root.Values.secrets.postgresPassword -}}{{ $root.Values.secrets.postgresPassword | b64enc }}
{{- else if hasKey .old "postgres-password" -}}{{ index .old "postgres-password" }}
{{- else -}}
{{- if not (hasKey $root.Values.secrets "generatedPostgresPassword") -}}
{{- $_ := set $root.Values.secrets "generatedPostgresPassword" (randAlphaNum 32) -}}
{{- end -}}
{{ $root.Values.secrets.generatedPostgresPassword | b64enc }}
{{- end -}}
{{- end -}}

