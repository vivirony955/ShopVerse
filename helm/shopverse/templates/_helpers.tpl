{{/*
ShopVerse Helm chart helpers — names, labels, image refs.
Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
*/}}

{{/* Chart base name — overrideable via .Values.nameOverride */}}
{{- define "shopverse.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully-qualified app name. Default "<release>-<chart>" but truncates to fit
the 63-char DNS-1123 label limit. Allows .Values.fullnameOverride for
operators who want a fixed name across releases.
*/}}
{{- define "shopverse.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart label, used for sentinel "app.kubernetes.io/managed-by" etc. */}}
{{- define "shopverse.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels — applied to every resource */}}
{{- define "shopverse.labels" -}}
helm.sh/chart: {{ include "shopverse.chart" . }}
{{ include "shopverse.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels — must be IMMUTABLE per Kubernetes spec */}}
{{- define "shopverse.selectorLabels" -}}
app.kubernetes.io/name: {{ include "shopverse.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Per-component selector labels (backend / worker / frontend) */}}
{{- define "shopverse.backendSelectorLabels" -}}
{{ include "shopverse.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end -}}

{{- define "shopverse.workerSelectorLabels" -}}
{{ include "shopverse.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end -}}

{{- define "shopverse.frontendSelectorLabels" -}}
{{ include "shopverse.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end -}}

{{/* ServiceAccount name */}}
{{- define "shopverse.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "shopverse.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Backend image ref — picks .Chart.AppVersion when tag is empty */}}
{{- define "shopverse.backendImage" -}}
{{- $tag := default .Chart.AppVersion .Values.image.backend.tag -}}
{{- printf "%s:%s" .Values.image.backend.repository $tag -}}
{{- end -}}

{{- define "shopverse.frontendImage" -}}
{{- $tag := default .Chart.AppVersion .Values.image.frontend.tag -}}
{{- printf "%s:%s" .Values.image.frontend.repository $tag -}}
{{- end -}}

{{/* Secret name — external secret takes precedence */}}
{{- define "shopverse.secretName" -}}
{{- if .Values.secrets.external -}}
{{- .Values.secrets.existingSecretName -}}
{{- else -}}
{{- printf "%s-secrets" (include "shopverse.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "shopverse.configMapName" -}}
{{- printf "%s-config" (include "shopverse.fullname" .) -}}
{{- end -}}

{{/* Shared env block — references config + secret. Pulled into deployments. */}}
{{- define "shopverse.commonEnv" -}}
envFrom:
  - configMapRef:
      name: {{ include "shopverse.configMapName" . }}
  - secretRef:
      name: {{ include "shopverse.secretName" . }}
{{- end -}}
