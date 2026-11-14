# IskolarLink Testing

This document explains how to run the test scripts, how to reset the database afterwards, and records the manual QA checks that were actually performed. For the endpoint contract see [api.md](api.md). If something fails, see [troubleshooting.md](troubleshooting.md).

## 1. Before you test

1. Start **Apache** and **MySQL** in the XAMPP Control Panel.
2. Import the database in phpMyAdmin, in this order: `database/schema.sql`, `database/seed.sql`, `database/seed_applicants.sql`.
3. Create `.env` from `.env.example` and fill in the database values and a `JWT_SECRET` of at least 32 characters.
4. Start the server with `npm start`. The API is at `http://localhost:3000/api`.

Use fictional data only. Never run the test scripts against a database you care about.

## 2. Automated test scripts

The scripts live in `tests/`. Run each one from the project root in a second terminal while the server is running:

```bash
node tests/<file-name>.js
```

| File | How to run | What it covers |
|---|---|---|
| `tests/auth-smoke.js` | `node tests/auth-smoke.js` | Login (success and failure), `GET /auth/me`, and missing or bad tokens. [CONFIRM] |
| `tests/workflow-smoke.js` | `node tests/workflow-smoke.js` | 39 checks: phase transitions, illegal moves (409), documents and tier rules, ineligible reasons, admin-only reopen (403 for staff), grant schedules, and the order of error codes. |
| `tests/lookup-smoke.js` | `node tests/lookup-smoke.js` | 27 checks: public lookup with reference, birth date and PIN, the identical 404 for every failure, the per-IP limiter, the per-reference lockout, and whitelisted output. Run it on a freshly started server. |
| `tests/dashboard-smoke.js` | `node tests/dashboard-smoke.js` | 17 checks: totals, every phase and eligibility key present, tier counts and upcoming releases. |
| `tests/security-smoke.js` | `node tests/security-smoke.js` | 24 checks: 401 without a token on 32 staff routes, forged and `alg=none` tokens, 403 for staff on admin-only routes, stored script text kept as data, security headers, and no stack traces or SQL in errors. |
| `tests/records-smoke.js` | `node tests/records-smoke.js` | [CONFIRM] Create, read, update and archive for applicants, applications and programs (inferred from the file name). |

The four counted suites add up to 107 automated checks (39 + 27 + 17 + 24). All of them passed on the last full run. Add the counts for `auth-smoke.js` and `records-smoke.js` once you have run them.

### Warning: the scripts change your data and trip the rate limiters

- **They create rows.** Applications, applicants, users and history rows are added to the database and are not removed afterwards.
- **They trip the rate limiters.** Failed logins and failed lookups count toward the limits (login: 10 failures in 15 minutes per IP; public lookup: 30 failures per IP and 5 per reference in 15 minutes). The limits are held in memory, so a restart clears them.
- **They can change the demo records.** The demo lookup (reference `S7H67DXZRY`, birth date `2005-03-14`, PIN `123456`; more examples in [demo-data.md](demo-data.md)) may stop working after a run, because the lookup limiter locks a reference after repeated failures and the scripts may change the demo application.

### Reset after running the scripts

1. Stop the server (Ctrl+C in the terminal that runs it).
2. In phpMyAdmin, re-import `database/seed_applicants.sql`. This restores the demo applicants and applications.
3. If you also created test users, programs or tiers, do a full reset instead: drop the `iskolarlink` database in phpMyAdmin, then import `schema.sql`, `seed.sql` and `seed_applicants.sql` in that order.
4. Start the server again with `npm start`. This also clears the rate limits.
5. Check the demo lookup works before a demo or a QA session.

## 3. Manual QA checklist

These checks were run by hand with Postman against the local API. The Postman collection requests are named after the checks below. Only checks that were really performed are marked Pass. Everything else is marked **Not yet tested** so this list can be trusted.

**Legend:** Pass = behaved as documented in `api.md`. Retest = the test did not prove what it was meant to prove. Not yet tested = not performed.

**Environment:** local XAMPP (MariaDB), Node.js server on port 3000, Postman, seeded data. Auth checks were run on 2026-11-05 and Users checks on 2026-11-11.

### 3.1 Login and sessions

| # | Check | Expected | Result | Notes |
|---|---|---|---|---|
| 1 | Log in as `admin` | 200, token, role `admin` | Pass | Returned user id 1, role `admin`. |
| 2 | Log in as `staff1` | 200, token, role `staff` | Pass | Returned user id 2, role `staff`. |
| 3 | Log in with a wrong password | 401, generic message | Pass | `Invalid username or password.` |
| 4 | Log in with a missing field | 400 `Validation failed` | Retest | The body had a trailing comma, so the server returned 400 `Malformed JSON in request body.` instead. Resend with valid JSON that only omits the password. |
| 5 | Log in as inactive `staff2` | 401, generic message | Retest | A wrong password was used, so this does not yet prove the account is refused because it is inactive. Retest with staff2's correct password. |
| 6 | `GET /auth/me` with a valid token | 200, current user | Pass | Returned the admin user. |
| 7 | `GET /auth/me` with no token | 401 | Pass | `Authentication required.` |
| 8 | `GET /auth/me` with a fake token | 401 | Pass | `Invalid or expired token.` A different message from check 7. |
| 9 | Use a token after it expires (about 8 hours) | 401 | Pass | Seen when old tokens were reused days later: 401 `Invalid or expired token.` |

### 3.2 Staff versus admin access

| # | Check | Expected | Result | Notes |
|---|---|---|---|---|
| 10 | `GET /users` with no token | 401 | Pass | |
| 11 | `GET /users` with a staff token | 403 | Pass | `You do not have permission to do this.` |
| 12 | `GET /users` with an admin token | 200, list without password hashes | Not yet tested | |
| 13 | `POST /users` as admin with valid data | 201 | Pass | New user id 4, role defaulted to `staff`, no password in the response. |
| 14 | `POST /users` with a username that exists | 409 | Pass | `That username is already taken.` |
| 15 | `POST /users` with a 3-character password | 400 | Pass | `password: Must be 8 to 72 characters.` |
| 16 | `POST /users` with a staff token | 403 | Not yet tested | |
| 17 | `PATCH /users/:id` (update, deactivate, self-demotion 409) | 200, 400, 404, 409 | Not yet tested | |
| 18 | Staff blocked from program and tier writes | 403 | Not yet tested | |
| 19 | Staff blocked from reopening an approved application | 403 | Not yet tested | |

### 3.3 Applications and workflow

| # | Check | Expected | Result | Notes |
|---|---|---|---|---|
| 20 | Create an application | 201, reference number and one-time PIN | Not yet tested | |
| 21 | Create a duplicate application (same applicant, program, year) | 409 | Not yet tested | |
| 22 | Move Submitted to Under Review | 200, history row added | Not yet tested | |
| 23 | Move Under Review to For Evaluation with documents incomplete | 409 | Not yet tested | |
| 24 | Move through For Evaluation, Approved and Granted | 200 at each step | Not yet tested | |
| 25 | Make an illegal move (for example Submitted straight to Granted) | 409 | Not yet tested | |
| 26 | Mark Ineligible without a reason | 400 | Not yet tested | |
| 27 | Set and delete a grant schedule | 201 or 200, then 200 | Not yet tested | |
| 28 | Re-issue a lookup PIN | 200, new PIN, old PIN stops working | Not yet tested | |

### 3.4 Public lookup and dashboard

| # | Check | Expected | Result | Notes |
|---|---|---|---|---|
| 29 | Lookup with the demo reference, birth date and PIN | 200, limited fields only | Not yet tested | |
| 30 | Lookup with a wrong PIN, wrong birth date or unknown reference | 404, identical generic message | Not yet tested | |
| 31 | Repeated failed lookups | 429 from the limiter, or a locked reference | Not yet tested | |
| 32 | `GET /dashboard` totals, phase counts and upcoming releases | 200, numbers match the data | Not yet tested | |

### 3.5 Front-end pages

| # | Check | Expected | Result | Notes |
|---|---|---|---|---|
| 33 | Staff login page | Logs in, refuses `staff2` | Not yet tested | |
| 34 | Applicants, applications, programs and users pages | Each page loads and works | Not yet tested | |
| 35 | Public lookup page | Shows status for the demo record | Not yet tested | |

### 3.6 Summary so far

- **Passed:** 12 checks (1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 14, 15).
- **Retest:** 2 checks (4 and 5). Both are problems with how the test was set up, not defects in the API.
- **Not yet tested:** the rest, including all application workflow, public lookup, dashboard and front-end checks.
- **Defects found:** none so far. Every executed check matched `api.md`.

Update the Result column as more checks are run, and record the date of each run.

## 4. Reporting a problem

Write each problem down with enough detail for someone else to reproduce it:

```text
Title:        short description
Where:        endpoint or page, and which account (admin, staff1, no login)
Steps:        1. ...  2. ...  3. ...
Expected:     what api.md says should happen
Actual:       status code and message that came back
Data used:    fictional values only
```

## 5. Test data created during QA

The Users checks created a test user (`test.user1`). Test users are fictional and local only. Before a demo, do the full reset described in section 2 so the database matches the seed files.