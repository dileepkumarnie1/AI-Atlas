# Admin Page Enhancement Requirements (Legacy)

Note: This document describes a prior Netlify-based architecture and endpoints. The current deployment no longer uses Netlify functions. Keep this file for historical reference only.

# Admin Page Enhancements — Requirements

This document outlines a secure, extensible Admin Dashboard for AI Atlas. It complements the existing discovery/export pipeline and the email-based approval links.

## Goals
- Role-gated access: only Firebase users with custom claim `admin: true` can access admin features.
- Serverless-first: all writes via Netlify Functions using Firebase Admin SDK (no client-side elevated rights).
- Auditable actions: every approve/reject/edit is recorded with who/when/what and optional reason.

## MVP features (phase 1)
- Pending approvals queue
  - List Firestore `pending_tools` with name, domain, link, createdAt.
  - Approve/Reject inline (single/bulk) with optional reason for rejection.
  - Audit log per action.
- Manual publish trigger
  - Button to run the exporter (GitHub Actions workflow_dispatch) and show status link.
- Discovery controls
  - Run discovery on-demand (optionally dry-run) and show summary.
- Health & diagnostics
  - Approval-link health (APPROVAL_BASE_URL, function reachability).
  - Recent discovery/function errors; env checklist (non-secret presence).

## Advanced features (phase 2)
- Tool curation editor: edit published tool metadata with validation and preview.
- Popularity insights: visualize computed popularity vs overrides; one-click recalc.
- Source policy management: edit JSON files (`data/*.json`) via PRs with schema validation + diff preview.
- Source reliability console: stats per discovery source, mute/ban controls.
- Role management: add/remove admins via a protected endpoint (wrap `set-admin-claim.mjs`).
- Batch import: upload JSON/CSV as a pending batch; dry-run review and staged import.
- Sandbox publish: write to a staging `public/tools.sandbox.json` for preview.

## API endpoints (Netlify Functions)
All admin endpoints require Authorization: `Bearer <Firebase ID token>` and `admin` custom claim.
- GET /.netlify/functions/admin-list-pending?limit=50&status=pending
  - Returns pending tools list with paging cursors (future) and basic metadata.
- POST /.netlify/functions/admin-review
  - Body: `{ id: string, action: 'approve'|'reject', reason?: string }`
  - Approve writes to `tools` and marks pending as resolved; reject marks pending as rejected.
  - Writes to `audit_logs` collection: `{ actorUid, actorEmail, action, targetId, targetType, reason?, ts }`.

Future endpoints:
- POST admin-run-discovery, POST admin-run-export
- POST admin-pr-config-change, POST admin-edit-tool
- POST admin-set-admin, GET admin-health, GET admin-audit-logs

## UI structure
- Sections: Approvals, Discovery, Publish, Sources & Policies, Popularity, Logs, Settings & Roles.
- Approvals table: Name, Source, Reliability (if available), Added, Actions; bulk select; rejection reason modal.

## Security considerations
- Validate Firebase ID tokens server-side and ensure `admin` claim.
- Never expose service account; functions use Admin SDK only.
- Rate limit and log all admin mutations; audit log append-only.
- CORS only for the site origin; preflight support.

## Priorities — next tasks
1) Build protected Admin shell at `/admin` with sign-in + claim gate.
2) Implement admin functions: list-pending + approve/reject (with audit logs).
3) Wire Approvals UI to these endpoints.
4) Add Publish Now and Run Discovery Now.
5) Add Sources & Policies editor with PR creation.
6) Add Audit Log view and health diagnostics.
7) Role management UI.
