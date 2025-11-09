# Investigating Data Deletions in Google Cloud Shell

This guide provides commands to check what data was deleted and how it was deleted in your Firebase/Google Cloud project.

## Prerequisites

1. Open [Google Cloud Shell](https://shell.cloud.google.com/)
2. Make sure you're authenticated and have the correct project selected

## Step 1: Set Your Project ID

Replace `YOUR_PROJECT_ID` with your actual Firebase/Google Cloud project ID:

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Verify the project
gcloud config get-value project
```

## Step 2: Check Firestore Deletion Audit Logs

### View all Firestore delete operations (last 7 days)

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

### View Firestore deletions in a readable format

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=50 \
  --format="table(timestamp, protoPayload.methodName, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail)" \
  --freshness=7d
```

### View deletions for a specific collection (e.g., userDocuments)

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument" AND protoPayload.resourceName=~"userDocuments"' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

### View deletions for payments collection

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument" AND protoPayload.resourceName=~"payments"' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

## Step 3: Check All Data Modification Operations

### View all write operations (create, update, delete)

```bash
gcloud logging read \
  'resource.type="firestore_database" AND (protoPayload.methodName=~"Write" OR protoPayload.methodName=~"Delete")' \
  --limit=100 \
  --format="table(timestamp, protoPayload.methodName, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail)" \
  --freshness=7d
```

## Step 4: Check Deletions by Specific User/Service Account

### Replace EMAIL with the user/service account email

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument" AND protoPayload.authenticationInfo.principalEmail="EMAIL"' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

## Step 5: Export Deletion Logs to a File

### Export to JSON file

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=1000 \
  --format=json \
  --freshness=7d > deletions_log.json
```

### Export to CSV (requires jq - install with: sudo apt-get install jq)

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=1000 \
  --format=json \
  --freshness=7d | jq -r '.[] | [.timestamp, .protoPayload.methodName, .protoPayload.resourceName, .protoPayload.authenticationInfo.principalEmail] | @csv' > deletions_log.csv
```

## Step 6: Check Cloud Storage Deletions (if using Storage)

```bash
gcloud logging read \
  'resource.type="gcs_bucket" AND protoPayload.methodName="storage.objects.delete"' \
  --limit=50 \
  --format="table(timestamp, protoPayload.methodName, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail)" \
  --freshness=7d
```

## Step 7: Check Firebase Admin SDK Operations

If deletions were made via Firebase Admin SDK:

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.serviceName="firestore.googleapis.com" AND protoPayload.methodName=~"Delete"' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

## Step 8: Detailed View with Request Payload

To see what was actually deleted (document paths, etc.):

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=20 \
  --format=json \
  --freshness=7d | jq '.[] | {timestamp, method: .protoPayload.methodName, resource: .protoPayload.resourceName, user: .protoPayload.authenticationInfo.principalEmail, request: .protoPayload.request}'
```

## Step 9: Check for Batch Deletions

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName=~"BatchWrite" AND protoPayload.request.writes[].delete!=null' \
  --limit=50 \
  --format=json \
  --freshness=7d
```

## Step 10: Time-Range Specific Queries

### Last 24 hours

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=50 \
  --format=json \
  --freshness=1d
```

### Specific date range (replace dates)

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument" AND timestamp>="2024-01-01T00:00:00Z" AND timestamp<="2024-01-31T23:59:59Z"' \
  --limit=50 \
  --format=json
```

## Understanding the Output

- **timestamp**: When the deletion occurred
- **protoPayload.methodName**: The method used (e.g., `DeleteDocument`, `BatchWrite`)
- **protoPayload.resourceName**: The document/collection path that was deleted
- **protoPayload.authenticationInfo.principalEmail**: Who/what performed the deletion
- **protoPayload.request**: Detailed request information including document paths

## Quick Summary Command

Get a quick summary of all deletions:

```bash
gcloud logging read \
  'resource.type="firestore_database" AND protoPayload.methodName="google.firestore.v1.Firestore.DeleteDocument"' \
  --limit=100 \
  --format="value(timestamp, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail)" \
  --freshness=7d | sort
```

## Troubleshooting

If you don't see any logs:
1. Check that audit logging is enabled for Firestore
2. Verify you have the correct project selected
3. Check that you have the necessary IAM permissions (`roles/logging.viewer` or `roles/logging.privateLogViewer`)
4. Try increasing the time range (change `--freshness=7d` to `--freshness=30d`)

## Enable Audit Logging (if not already enabled)

If audit logs are not available, you may need to enable them:

```bash
# Enable Data Access audit logs for Firestore
gcloud logging sinks create firestore-audit-logs \
  bigquery.googleapis.com/projects/YOUR_PROJECT_ID/datasets/audit_logs \
  --log-filter='resource.type="firestore_database"'
```

Note: This requires BigQuery to be set up for log storage.

