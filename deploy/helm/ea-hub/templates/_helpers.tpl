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

{{- define "ea-hub.dbHost" -}}
{{- if .Values.postgres.enabled -}}{{ include "ea-hub.fullname" . }}-postgres{{- else -}}{{ required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host }}{{- end -}}
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
