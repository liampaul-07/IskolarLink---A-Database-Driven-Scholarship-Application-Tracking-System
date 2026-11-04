# IskolarLink API Contract (v0.3 draft)

Base URL: `http://localhost:3000/api`. All requests and responses are JSON.

## Conventions

**Response format (every endpoint):**

```json
{ "success": true,  "message": "Application created.", "data": { } }
{ "success": false, "message": "Validation failed.",    "data": { "errors": [ { "field": "birthDate", "message": "Required." } ] } }
```

`data` is `null` when there is nothing to return. Error responses never contain stack traces or SQL errors.

**Status codes:** 200 OK, 201 Created, 400 validation or malformed input, 401 not logged in or bad token, 403 wrong role, 404 not found, 409 conflict (duplicate or illegal state change), 429 rate limited, 500 unexpected server error (generic message).

**Auth:** `POST /auth/login` returns a JWT (HS256, expires after `JWT_EXPIRES_IN`, default 8h). Send it on every staff route as `Authorization: Bearer <token>`. Roles: `admin`, `staff`. The server re-checks the account in the database on every request, so a deactivated user's token stops working immediately and a role change applies immediately. A missing, malformed, tampered or expired token gets 401.

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
| Applications + workflow + lookup PIN issue/re-issue |      |   Y   |   Y   |
| Reopen an approved application |  |   | Y   |
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
| POST | `/auth/login` | `{ username, password }` | 200 `{ token, user: { id, username, fullName, role } }` | 400 missing fields; 401 one generic "Invalid username or password." for every failure (unknown user, wrong password, inactive account); 429 after 10 failed attempts in 15 minutes from one IP (successful logins are not counted; resets when the server restarts) |
| GET | `/auth/me` | none | 200 `{ id, username, fullName, role }` | 401 |

## Users (admin only)

| Method | Path | Body | Success | Failures |
|--------|------|------|---------|----------|
| GET | `/users` | `?page&limit` | 200 `{ items, pagination }` (items: id, username, fullName, role, isActive, createdAt; never password hashes) | 401, 403 |
| POST | `/users` | `{ username, password, fullName, role? }` (role defaults to `staff`) | 201 user | 400 (see rules); 409 username taken |
| PATCH | `/users/:id` | any of `{ fullName, role, isActive, password }`, at least one | 200 user | 400 bad value or empty body; 404; 409 admin tried to demote or deactivate their own account |

Rules: username is 3 to 50 characters (letters, numbers, dot, dash, underscore); password is 8 to 72 characters with at least one letter and one number; passwords are stored only as bcrypt hashes. `isActive` must be a boolean.

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
| PATCH | `/applicants/:id/archive` | `{ archived: true\|false }` | 200 | 400; 404; 409 when archiving an applicant who still has open applications (not Ineligible or Granted) |

Applicant rules: `firstName`, `lastName`, `birthDate` and `address` are required. `birthDate` must be a real date and not in the future. `email`, `contactNumber`, `sex` (`male` or `female`) and the numbers (`gwa` 0 to 99.99, `householdIncome` 0 or more) are validated when given. Blank optional fields are stored as null. The duplicate check ignores letter case. `q` on the list searches first, middle and last name, and "first last".

Dates use `YYYY-MM-DD`.

## Applications

| Method | Path | Body or query | Success | Failures |
|--------|------|---------------|---------|----------|
| GET | `/applications` | `?q=<name or reference>&phase&eligibility&programId&tierId&dateFrom&dateTo&archived&page&limit` | 200 list (each row: id, referenceNo, applicantName, programName, academicYear, phase, eligibility, tier, createdAt) | 400 bad filter value |
| GET | `/applications/:id` | | 200 full record: application, applicant, program, tier, `grantSchedule` (or null), `history: []`. Never includes the PIN or its hash. | 404 |
| POST | `/applications` | `{ applicantId, programId, academicYear, docsComplete?, remarks? }` | 201 record with generated `referenceNo` and a one-time `lookupPin` (6 digits, shown only in this response); phase starts as Submitted; first history row written in the same transaction | 400; 404 applicant or program not found; 409 duplicate (same applicant, program, year); 409 program inactive or archived; 409 applicant archived |
| PUT | `/applications/:id` | `{ academicYear?, docsComplete?, remarks? }`, at least one (workflow fields are not editable here; sending only those gives 400). A blank `remarks` clears it. | 200 | 400; 404; 409 duplicate; 409 the application is archived (restore it first) |
| PATCH | `/applications/:id/archive` | `{ archived }` | 200 | 404 |
| PATCH | `/applications/:id/pin` | none | 200 `{ id, referenceNo, lookupPin }` (new 6-digit PIN, shown only in this response; the old PIN stops working immediately) | 401; 404; 409 the application is archived |
| GET | `/applications/:id/history` | | 200 timeline: oldPhase, newPhase, changedByName, remarks, changedAt | 404 |

Application rules: `academicYear` looks like `2026-2027` (the second year is the first plus one). The reference number is 10 random characters from `A-H J-K M-N P-Z 2-9` (no 0, O, 1, I or L). New applications always start as Submitted with a pending eligibility. The list searches `q` against first name, last name, "first last" and the reference number; `dateFrom` and `dateTo` filter on the created date (inclusive); `phase`, `eligibility`, `programId` and `tierId` must each be a single valid value (400 otherwise).

Lookup PIN: every application gets a random 6-digit PIN (leading zeros kept) when it is created. Only a bcrypt hash is stored, so the PIN cannot be shown again; if the applicant loses it, staff re-issue one with `PATCH /applications/:id/pin`. Staff give the reference number and PIN to the applicant, who also needs their birth date to use the public lookup.

### Workflow endpoints

All workflow endpoints require login (staff or admin). Each one runs in a transaction with the application row locked (`SELECT ... FOR UPDATE`), so two simultaneous changes cannot both succeed, and each returns the full application record (same shape as `GET /applications/:id`). They return 409 on an archived application. A `status_history` row is written only when the phase changes, so `/eligibility` and `/tier` do not add history rows.

Check order, so status codes are predictable: body validation (400), application not found (404), archived (409), reopen role (403), then transition and rule checks (409).

| Method | Path | Body | Rules | Failures |
|--------|------|------|-------|----------|
| PATCH | `/applications/:id/phase` | `{ newPhase, remarks?, reason? }` (`remarks` and `reason` are at most 255 characters) | Must follow the allowed transitions (see `erd.md`). `For Evaluation` requires `docsComplete = true`. `Approved` requires eligibility `eligible` and a tier. `Ineligible` requires `reason`, sets eligibility to `ineligible` and clears the tier. `Granted` requires a grant schedule when the program is grant-type. **Reopen:** `newPhase: "For Evaluation"` from `Approved` is allowed for `admin` only and requires `reason` (saved to the history remarks); eligibility and tier are kept. The history remark is the `reason` on a reopen, otherwise `remarks`, falling back to `reason`. | 400 bad phase value or missing reason; 403 reopen attempted by staff; 404; 409 illegal transition or unmet rule |
| PATCH | `/applications/:id/eligibility` | `{ eligibility: "eligible", tierId? }` | Only while phase is `For Evaluation`. Only `"eligible"` is accepted here; any other value is 400 (to mark someone ineligible, use `/phase` with `Ineligible`). `tierId` is optional and must belong to the application's program. | 400; 404; 409 wrong phase, archived, or tier from another program |
| PATCH | `/applications/:id/tier` | `{ tierId }` | Only while phase is `For Evaluation` and eligibility is `eligible`. Tier must belong to the application's program. To change a tier after approval, an admin reopens the application first. | 400; 404; 409 |

### Grant schedule

| Method | Path | Body | Success | Failures |
|--------|------|------|---------|----------|
| GET | `/applications/:id/grant-schedule` | | 200 schedule | 404 application not found, or it has no schedule |
| PUT | `/applications/:id/grant-schedule` | `{ releaseDate, venue, amount }` (create or replace). `releaseDate` is a valid `YYYY-MM-DD`; `venue` is at most 150 characters; `amount` is greater than 0 and at most 99999999.99. | 201 created, 200 replaced (data: the schedule) | 400; 404; 409 program is non-grant, application is not exactly `Approved`, or application is archived |
| DELETE | `/applications/:id/grant-schedule` | | 200 | 404 no schedule; 409 if the application is `Granted` or archived |

## Dashboard

| Method | Path | Success |
|--------|------|---------|
| GET | `/dashboard` | 200 `{ totalApplications, byPhase: { "Submitted": n, ... }, eligibility: { eligible, ineligible, pending }, byTier: [ { program, tier, count } ], upcomingReleases: [ { referenceNo, applicantName, releaseDate, venue, amount } ] }`. Archived applications are excluded. Upcoming releases are the next 10 with a date on or after today. |

 Only applications currently `Approved` count as upcoming (Granted ones are already released; reopened ones are not ready). `byPhase` and `eligibility` always include every key, with 0 when empty. `byTier` lists only applications that have a tier.

## Public lookup (no login, rate limited)

| Method | Path | Body | Success | Failure |
|--------|------|------|---------|---------|
| POST | `/public/lookup` | `{ referenceNo, birthDate, pin }` | 200 (see below) | 404 `"No matching application found."` for **every** failure: wrong reference, birth date or PIN; blank or non-string values; archived record; application with no PIN; locked reference. 429 from the IP limiter. |

Protection: a reference number alone is not enough. The applicant must also give their birth date and the 6-digit PIN issued by staff. Every failure returns the identical 404, and the server always performs one bcrypt comparison (against a dummy hash when the reference does not exist) so response time does not reveal which references are valid. `referenceNo` is case-insensitive.

Rate limits (both in memory, both reset when the server restarts):
- **Per IP:** failed lookups are limited to 30 per 15 minutes (429). Successful lookups are not counted.
- **Per reference:** 5 failures against one submitted reference string lock it for 15 minutes. Failures are counted for any submitted string, real or not, so a lock reveals nothing. A locked reference gets the same generic 404, even with correct details.

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

`grantSchedule` is included only when the phase is `Approved` or `Granted`; otherwise it is `null` (for example after an admin reopens an application). A reopened application shows `For Evaluation` again in the timeline; the reopen reason is not shown.

It never returns the applicant's address, contact details, internal remarks, staff names, or the ineligibility reason text.

Open decision: whether a public applicant should see the ineligibility reason. The default here is no (they see only the "ineligible" result).