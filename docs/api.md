# IskolarLink API Contract (v0.1 draft)

Base URL: `http://localhost:3000/api`. All requests and responses are JSON.

## Conventions

**Response format (every endpoint):**

```json
{ "success": true,  "message": "Application created.", "data": { } }
{ "success": false, "message": "Validation failed.",    "data": { "errors": [ { "field": "birthDate", "message": "Required." } ] } }
```

`data` is `null` when there is nothing to return. Error responses never contain stack traces or SQL errors.

**Status codes:** 200 OK, 201 Created, 400 validation or malformed input, 401 not logged in or bad token, 403 wrong role, 404 not found, 409 conflict (duplicate or illegal state change), 429 rate limited, 500 unexpected server error (generic message).

**Auth:** `POST /auth/login` returns a JWT. Send it on every staff route as `Authorization: Bearer <token>`. Roles: `admin`, `staff`.

**Lists:** support `page` (default 1) and `limit` (default 10, max 100). A list response looks like:

```json
{ "items": [ ], "pagination": { "page": 1, "limit": 10, "total": 42 } }
```

**Naming:** JSON uses camelCase (`applicantId`); database columns use snake_case. Controllers convert.

**Archiving replaces deletion** for applicants, programs and applications. Archived records are hidden from lists unless `archived=true` is passed.

---

## Access summary

| Area                  | Public | Staff | Admin |
|-----------------------|:------:|:-----:|:-----:|
| Health, public lookup |   Y    |   Y   |   Y   |
| Login                 |   Y    |   Y   |   Y   |
| Applicants            |        |   Y   |   Y   |
| Applications + workflow |      |   Y   |   Y   |
| Programs and tiers: read |     |   Y   |   Y   |
| Programs and tiers: write |    |       |   Y   |
| Dashboard             |        |   Y   |   Y   |
| Users                 |        |       |   Y   |

---

## Health

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | none | 200 `{ status: "ok", database: "connected" }`; 500 if the DB query fails |

## Auth

| Method | Path | Body | Success | Failures |
|--------|------|------|---------|----------|
| POST | `/auth/login` | `{ username, password }` | 200 `{ token, user: { id, username, fullName, role } }` | 400 missing fields; 401 one generic "Invalid username or password." for every failure (including inactive accounts) |
| GET | `/auth/me` | none | 200 `{ id, username, fullName, role }` | 401 |

## Users (admin only)

| Method | Path | Body | Success | Failures |
|--------|------|------|---------|----------|
| GET | `/users` | none | 200 list (no password hashes) | 401, 403 |
| POST | `/users` | `{ username, password, fullName, role }` | 201 user | 400; 409 username taken |
| PATCH | `/users/:id` | any of `{ fullName, role, isActive, password }` | 200 user | 400; 404 |

## Scholarship programs

| Method | Path | Auth | Body or query | Success | Failures |
|--------|------|------|---------------|---------|----------|
| GET | `/programs` | staff+ | `?type=grant\|non_grant&status=active\|inactive&archived=true&q=` | 200 list | |
| GET | `/programs/:id` | staff+ | | 200 program with `tiers: []` | 404 |
| POST | `/programs` | admin | `{ name, description?, type, criteria?, minGwa?, maxHouseholdIncome?, status? }` | 201 | 400; 409 duplicate name |
| PUT | `/programs/:id` | admin | same fields | 200 | 400; 404; 409 |
| PATCH | `/programs/:id/archive` | admin | `{ archived: true\|false }` | 200 | 404; 409 if it has open applications (not Ineligible or Granted) |

**Tiers**

| Method | Path | Auth | Body | Success | Failures |
|--------|------|------|------|---------|----------|
| GET | `/programs/:id/tiers` | staff+ | | 200 list | 404 |
| POST | `/programs/:id/tiers` | admin | `{ tierName, description?, defaultAmount? }` | 201 | 400; 404; 409 duplicate tier name in that program |
| PUT | `/tiers/:id` | admin | same fields | 200 | 400; 404; 409 |
| DELETE | `/tiers/:id` | admin | | 200 | 404; 409 if any application uses it |

## Applicants

| Method | Path | Body or query | Success | Failures |
|--------|------|---------------|---------|----------|
| GET | `/applicants` | `?q=<name>&archived=true&page&limit` | 200 list | |
| GET | `/applicants/:id` | | 200 applicant with `applications: []` summary | 404 |
| POST | `/applicants` | `{ firstName, middleName?, lastName, birthDate, sex?, email?, contactNumber?, address, school?, courseOrStrand?, yearLevel?, gwa?, householdIncome? }` | 201 | 400; 409 same name and birth date exists |
| PUT | `/applicants/:id` | same fields | 200 | 400; 404; 409 |
| PATCH | `/applicants/:id/archive` | `{ archived }` | 200 | 404 |

Dates use `YYYY-MM-DD`.

## Applications

| Method | Path | Body or query | Success | Failures |
|--------|------|---------------|---------|----------|
| GET | `/applications` | `?q=<name or reference>&phase&eligibility&programId&tierId&dateFrom&dateTo&archived&page&limit` | 200 list (each row: id, referenceNo, applicantName, programName, academicYear, phase, eligibility, tier, createdAt) | 400 bad filter value |
| GET | `/applications/:id` | | 200 full record: application, applicant, program, tier, `grantSchedule` (or null), `history: []` | 404 |
| POST | `/applications` | `{ applicantId, programId, academicYear, docsComplete?, remarks? }` | 201 record with generated `referenceNo`; phase starts as Submitted; first history row written in the same transaction | 400; 404 applicant or program not found; 409 duplicate (same applicant, program, year); 409 program inactive or archived |
| PUT | `/applications/:id` | `{ academicYear?, docsComplete?, remarks? }` (workflow fields are not editable here) | 200 | 400; 404; 409 duplicate |
| PATCH | `/applications/:id/archive` | `{ archived }` | 200 | 404 |
| GET | `/applications/:id/history` | | 200 timeline: oldPhase, newPhase, changedByName, remarks, changedAt | 404 |

### Workflow endpoints

All three run in a transaction and write a `status_history` row when the phase changes.

| Method | Path | Body | Rules | Failures |
|--------|------|------|-------|----------|
| PATCH | `/applications/:id/phase` | `{ newPhase, remarks?, reason? }` | Must follow the allowed transitions (see `erd.md`). `For Evaluation` requires `docsComplete = true`. `Approved` requires eligibility `eligible` and a tier. `Ineligible` requires `reason`, sets eligibility to `ineligible` and clears the tier. `Granted` requires a grant schedule when the program is grant-type. | 400 bad phase value or missing reason; 404; 409 illegal transition or unmet rule |
| PATCH | `/applications/:id/eligibility` | `{ eligibility: "eligible", tierId? }` | Only while phase is `For Evaluation`. `tierId` must belong to the application's program. To mark someone ineligible, use `/phase` with `Ineligible`. | 400; 404; 409 wrong phase or tier from another program |
| PATCH | `/applications/:id/tier` | `{ tierId }` | Blocked unless eligibility is `eligible`. Tier must belong to the application's program. | 400; 404; 409 |

### Grant schedule

| Method | Path | Body | Success | Failures |
|--------|------|------|---------|----------|
| GET | `/applications/:id/grant-schedule` | | 200 or 404 if none | 404 |
| PUT | `/applications/:id/grant-schedule` | `{ releaseDate, venue, amount }` (create or replace) | 200 or 201 | 400; 404; 409 program is non-grant, or application is not yet Approved |
| DELETE | `/applications/:id/grant-schedule` | | 200 | 404; 409 if already Granted |

## Dashboard

| Method | Path | Success |
|--------|------|---------|
| GET | `/dashboard` | 200 `{ totalApplications, byPhase: { "Submitted": n, ... }, eligibility: { eligible, ineligible, pending }, byTier: [ { program, tier, count } ], upcomingReleases: [ { referenceNo, applicantName, releaseDate, venue, amount } ] }`. Archived applications are excluded. Upcoming releases are the next 10 with a date on or after today. |

## Public lookup (no login, rate limited)

| Method | Path | Body | Success | Failure |
|--------|------|------|---------|---------|
| POST | `/public/lookup` | `{ referenceNo, birthDate }` | 200 (see below) | 404 `"No matching application found."` for **every** failure: wrong reference, wrong birth date, blank values, archived record. 429 when rate limited. |

Success returns only these fields:

```json
{
  "referenceNo": "K7M2QX9PAD",
  "phase": "Approved",
  "eligibility": "eligible",
  "tier": "Tier 1",
  "program": "Municipal Scholarship",
  "grantSchedule": { "releaseDate": "2026-12-10", "venue": "Municipal Hall", "amount": 5000 },
  "timeline": [ { "phase": "Submitted", "date": "2026-10-01" } ]
}
```

It never returns the applicant's address, contact details, internal remarks, staff names, or the ineligibility reason text.

Open decision: whether a public applicant should see the ineligibility reason. The default here is no (they see only the "ineligible" result).