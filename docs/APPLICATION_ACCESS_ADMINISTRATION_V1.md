# Application access administration V1

Status: implemented for the hosted administrator workspace.

## Purpose

SimuLedger application access is separate from deployment authentication. The
hosting identity boundary supplies a verified email address; SimuLedger maps
that address to a server-owned user ID and application roles.

The administrator workspace can:

- list active and disabled application users;
- provision access for a verified email address;
- assign one or more learner, instructor, scenario-author, rater, or
  administrator roles;
- update those roles; and
- disable or reactivate application access; and
- review the latest 100 append-only access commands, newest first.

It does not create passwords, authenticate an email address, synchronize an
institutional directory, create courses, or create a multi-tenant account.

## Authorization and routes

Only an authenticated `administrator` may request:

```text
GET  /api/v1/admin/users
GET  /api/v1/admin/access-audit
POST /api/v1/admin/users
```

Role values and target status come from the submitted administration command.
The performing administrator always comes from the authenticated principal.
A request cannot assert who performed the change.

## Command contract

The mutation contains:

```text
commandId
email
status
roles
```

The email is normalized to lowercase. New server-owned user IDs are derived
deterministically from the normalized email and are never accepted from the
client. At least one unique recognized role is required.

Every command ID is stored in `application_access_commands` with its normalized
request, result projection, timestamp, and performing administrator. Repeating
the same command returns the recorded result. Reusing its ID with different
content or a different administrator is a conflict.

The user projection, role replacement, and audit command are one D1 batch.
Partial role updates are not published.

The audit route is a bounded read-only projection. It reports the command,
target user, resulting status and roles, authoritative timestamp, and the
authenticated administrator who performed the change. It never accepts actor
identity from the client and does not mutate the stored command history.

## Safety boundary

An administrator cannot use this interface to disable their own account or
remove their own administrator role. Users are disabled rather than deleted,
so assignment, event, rating, and audit references remain intact.

Disabled users no longer resolve to an active application principal. Their
stored roles remain available for an explicit later reactivation.
