# EA-Hub on Google Cloud Run with Cloud SQL for PostgreSQL 16, a Cloud Storage bucket for
# uploads, Secret Manager and Cloud Scheduler.
#
#   cd deploy/cloud/gcp
#   terraform init
#   terraform apply -var project=my-project -var admin_email=you@example.com
#
# Secrets (database password, root key, cron secret, first admin password) are generated
# here and kept in Secret Manager; the admin password is printed with
#   terraform output -raw admin_password
# The image is pulled through an Artifact Registry remote repository that mirrors ghcr.io,
# because Cloud Run only pulls from Artifact Registry or Docker Hub.

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = ">= 6.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

variable "project" { type = string }
variable "region" {
  type    = string
  default = "europe-west1"
}
variable "name" {
  type    = string
  default = "ea-hub"
}
variable "image_tag" {
  type    = string
  default = "1.1.0"
}
variable "admin_email" { type = string }
variable "sql_tier" {
  type    = string
  default = "db-custom-1-3840"
}
variable "app_url" {
  description = "Your own https address once a domain is mapped; empty = the run.app address."
  type        = string
  default     = ""
}

provider "google" {
  project = var.project
  region  = var.region
}

data "google_project" "this" {}

locals {
  services = [
    "run.googleapis.com", "sqladmin.googleapis.com", "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com", "cloudscheduler.googleapis.com",
    "servicenetworking.googleapis.com", "compute.googleapis.com",
  ]
  image = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.ghcr.repository_id}/e20e-tools/ea-hub-selfhost:${var.image_tag}"
  # Cloud Run's deterministic address: https://<service>-<project number>.<region>.run.app
  url = var.app_url != "" ? var.app_url : "https://${var.name}-${data.google_project.this.number}.${var.region}.run.app"
  jobs = {
    newsletter       = "0 6 * * *"
    "daily-cleanup"  = "30 2 * * *"
    "semantic-index" = "15 3 * * *"
  }
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ---------- image: Artifact Registry remote repository for ghcr.io ----------
resource "google_artifact_registry_repository" "ghcr" {
  location      = var.region
  repository_id = "ghcr"
  format        = "DOCKER"
  mode          = "REMOTE_REPOSITORY"
  remote_repository_config {
    description = "ghcr.io mirror"
    docker_repository {
      custom_repository { uri = "https://ghcr.io" }
    }
  }
  depends_on = [google_project_service.apis]
}

# ---------- private network for Cloud SQL ----------
data "google_compute_network" "default" {
  name       = "default"
  depends_on = [google_project_service.apis]
}

resource "google_compute_global_address" "private_services" {
  name          = "${var.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = data.google_compute_network.default.id
}

resource "google_service_networking_connection" "private" {
  network                 = data.google_compute_network.default.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ---------- database ----------
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "db" {
  name                = "${var.name}-sql"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true
  settings {
    tier = var.sql_tier
    ip_configuration {
      ipv4_enabled    = false
      private_network = data.google_compute_network.default.id
    }
    backup_configuration {
      enabled                        = true
      start_time                     = "01:00"
      point_in_time_recovery_enabled = true
    }
  }
  depends_on = [google_service_networking_connection.private]
}

resource "google_sql_database" "eahub" {
  name     = "eahub"
  instance = google_sql_database_instance.db.name
}

resource "google_sql_user" "postgres" {
  name     = "postgres"
  instance = google_sql_database_instance.db.name
  password = random_password.db.result
}

# ---------- uploads ----------
resource "google_storage_bucket" "uploads" {
  name                        = "${var.project}-${var.name}-uploads"
  location                    = var.region
  uniform_bucket_level_access = true
  versioning { enabled = true }
}

# ---------- identity and secrets ----------
resource "google_service_account" "run" {
  account_id   = "${var.name}-run"
  display_name = "EA-Hub Cloud Run"
}

resource "google_storage_bucket_iam_member" "uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.run.email}"
}

resource "random_password" "enc_key" {
  length  = 64
  special = false
}
resource "random_password" "cron" {
  length  = 48
  special = false
}
resource "random_password" "admin" {
  length  = 20
  special = false
}

locals {
  secrets = {
    "db-password"    = random_password.db.result
    "enc-key"        = random_password.enc_key.result
    "cron-secret"    = random_password.cron.result
    "admin-password" = random_password.admin.result
  }
}

resource "google_secret_manager_secret" "s" {
  for_each  = local.secrets
  secret_id = "${var.name}-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "s" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.s[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "s" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.s[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# ---------- the app ----------
resource "google_cloud_run_v2_service" "app" {
  name                = var.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.run.email
    timeout         = "3600s"
    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = "default"
        subnetwork = "default"
      }
    }
    volumes {
      name = "uploads"
      gcs {
        bucket        = google_storage_bucket.uploads.name
        read_only     = false
        mount_options = ["uid=1000", "gid=0", "file-mode=664", "dir-mode=775"]
      }
    }
    containers {
      image = local.image
      ports { container_port = 3000 }
      resources {
        limits            = { cpu = "1", memory = "2Gi" }
        cpu_idle          = false # CPU always allocated: live chat and background work
        startup_cpu_boost = true
      }
      volume_mounts {
        name       = "uploads"
        mount_path = "/data/storage"
      }
      env {
        name  = "APP_URL"
        value = local.url
      }
      env {
        name  = "DB_HOST"
        value = google_sql_database_instance.db.private_ip_address
      }
      env {
        name  = "DB_NAME"
        value = "eahub"
      }
      env {
        name  = "DB_SSLMODE"
        value = "require"
      }
      env {
        name  = "APP_DB_USER"
        value = "postgres"
      }
      env {
        name  = "MIGRATE_ON_START"
        value = "true"
      }
      env {
        name  = "ADMIN_EMAIL"
        value = var.admin_email
      }
      env {
        name  = "TRUST_PROXY_HOPS"
        value = "1"
      }
      dynamic "env" {
        for_each = {
          APP_DB_PASSWORD    = "db-password"
          APP_ENCRYPTION_KEY = "enc-key"
          CRON_SECRET        = "cron-secret"
          ADMIN_PASSWORD     = "admin-password"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.s[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get { path = "/healthz" }
        period_seconds    = 10
        failure_threshold = 30
      }
      liveness_probe {
        http_get { path = "/healthz" }
        period_seconds = 30
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.s,
    google_secret_manager_secret_iam_member.s,
    google_sql_database.eahub,
    google_sql_user.postgres,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------- scheduled jobs ----------
resource "google_cloud_scheduler_job" "jobs" {
  for_each         = local.jobs
  name             = "${var.name}-${each.key}"
  region           = var.region
  schedule         = each.value
  time_zone        = "Etc/UTC"
  attempt_deadline = "900s"
  http_target {
    http_method = "GET"
    uri         = "${local.url}/api/public/jobs/${each.key}"
    headers     = { Authorization = "Bearer ${random_password.cron.result}" }
  }
  depends_on = [google_project_service.apis]
}

output "url" {
  value       = "${local.url}/admin"
  description = "Sign in here."
}

output "admin_password" {
  value     = random_password.admin.result
  sensitive = true
}
