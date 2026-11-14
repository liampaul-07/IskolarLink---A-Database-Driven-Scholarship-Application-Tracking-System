# IskolarLink

A scholarship application tracker for a Philippine municipal scholarship office. Staff encode applications, move them through phases, record eligibility and tiers, and schedule grant releases. Applicants check their status on a public lookup page using a reference number, birth date and PIN.

> School project (Integrative Programming 2). Prototype only. All data is fictional. Not for real personal data.

Proposal name: ScholarTrack.

## Features

- **Application tracking** through six phases: Submitted, Under Review, For Evaluation, Approved, Ineligible, Granted.
- **Eligibility and tiers** per scholarship program, decided by staff.
- **Grant release scheduling** (date, venue, amount) for grant-type programs.
- **Admin-only reopen** of an approved application, with a required reason and a permanent audit trail.
- **Public status lookup** protected by reference number + birth date + staff-issued 6-digit PIN.
- **Dashboard** with totals by phase, eligibility, tier and upcoming releases.
- **Staff and admin roles**, enforced on the server.
- **Archiving instead of deleting**, so history stays intact.

## Tech stack

HTML / CSS / vanilla JavaScript front end, Node.js + Express API, MariaDB (MySQL-compatible, via XAMPP), `mysql2` (parameterized queries only), `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `express-rate-limit`.

## Requirements

- Node.js (v18 or newer)
- XAMPP with MariaDB / MySQL running (phpMyAdmin for imports)

## Setup

1. Clone the repository and open a terminal in the project folder.
2. Start **Apache** and **MySQL** in XAMPP.
3. In phpMyAdmin, at the **server level** (not inside a database), import these files **in this order**:
   1. `database/schema.sql` (creates the `iskolarlink` database; **erases existing data**)
   2. `database/seed.sql` (users, programs, tiers)
   3. `database/seed_applicants.sql` (24 applicants, 22 applications, history, grant schedules)
4. Create a `.env` file in the project root by copying `.env.example`, then fill in the values (see [troubleshooting.md](docs/troubleshooting.md#1-the-server-will-not-start) for a ready example). It must define the database connection and `JWT_SECRET` (at least 32 characters; the server refuses to start otherwise). Optional: `JWT_EXPIRES_IN` (default `8h`) and `CORS_ORIGIN` (for example `http://localhost:3000`). **Never commit `.env`.**
5. Install and start:

```bash
npm install
npm start
```

6. Open http://localhost:3000. The API is at http://localhost:3000/api (health check: `/api/health`).

Something not working? See [docs/troubleshooting.md](docs/troubleshooting.md).

## Test accounts (seed data only)

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin@12345` | admin | Can manage users, programs, tiers and reopen approved applications |
| `staff1` | `Staff@12345` | staff | Day-to-day application work |
| `staff2` | `Staff@12345` | staff | **Inactive**: login is refused on purpose |

These are development accounts only. Never reuse these passwords anywhere real.

## Demo PIN

Every **seeded** application uses the demo PIN **`123456`**. This is demo data only. Applications created through the API get a random PIN, shown once at creation.

The full list of seeded reference numbers is in [docs/demo-data.md](docs/demo-data.md). Good public lookup examples (PIN `123456`):

| Shows | Reference number | Birth date |
|---|---|---|
| Submitted | `S7H67DXZRY` | 2005-03-14 |
| Approved, with release schedule | `BGX8FBXU85` | 2005-06-15 |
| Granted | `U9MGUB2DFW` | 2005-02-02 |
| Ineligible (reason hidden) | `DYUV86NM3R` | 2007-12-19 |

## Running the automated tests

Start the server first, then in another terminal:

```bash
node tests/auth-smoke.js
node tests/workflow-smoke.js
node tests/lookup-smoke.js
node tests/dashboard-smoke.js
node tests/security-smoke.js
```

Notes:
- The tests **create rows** and the lookup test deliberately **trips the rate limiters**. After running them, re-import `database/seed_applicants.sql` and restart the server.
- Run `lookup-smoke.js` on a freshly started server.
- Full details and the manual QA checklist are in [docs/testing.md](docs/testing.md).

## Project structure

```
database/   schema.sql, seed.sql, seed_applicants.sql
docs/       api.md, erd.md, architecture.md, testing.md, troubleshooting.md, demo-data.md
public/     front-end pages, css/, js/
server/     app.js, server.js, config/, controllers/, middleware/, routes/, utils/
tests/      automated smoke tests
```

## Documentation

| File | What it covers |
|---|---|
| [docs/api.md](docs/api.md) | Every endpoint, request/response shape and error code. |
| [docs/erd.md](docs/erd.md) | Entity relationship diagram, allowed phase transitions, and which rules the database vs the backend enforces. |
| [docs/architecture.md](docs/architecture.md) | The three layers, how a request travels through the server, folder structure and what each table stores. |
| [docs/testing.md](docs/testing.md) | How to run the test scripts, how to reset afterwards, and the manual QA checklist. |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common problems and fixes (startup, database, 401/403/409/429, lookup, Postman). |
| [docs/demo-data.md](docs/demo-data.md) | Demo logins, the demo PIN and every seeded reference number with its birth date. |

## Security summary

- Parameterized queries only (no string-built SQL).
- Passwords and lookup PINs stored only as bcrypt hashes.
- JWT authentication with a live database check of the user on every request; role checks on the server.
- One generic error for every failed login and every failed public lookup.
- Rate limiting on login and on the public lookup (per IP and per reference number).
- `helmet` security headers with a content security policy, CORS limited to one origin, 100 KB body limit, `Cache-Control: no-store` on API responses.
- Generic 500 errors: stack traces and SQL errors never reach the client.

## Known limitations

- Prototype for one office; fictional data only.
- No online applications, document uploads, email or SMS.
- Rate limits are kept in memory and reset when the server restarts.
- JWTs cannot be revoked individually before they expire (8 hours by default).
- Seeded applications share one demo PIN.
- No password reset flow.

## Contributing

Work on a branch and open a pull request into `main`. Do not push straight to `main`.

**Branch names:** `type/short-description`, lowercase with hyphens.

| Prefix | Use for |
|---|---|
| `feature/` | new functionality (`feature/public-lookup`) |
| `fix/` | bug fixes (`fix/login-error-message`) |
| `docs/` | documentation only (`docs/project-documentation`) |
| `test/` | adding or changing tests |
| `refactor/` | restructuring without changing behavior |
| `chore/` | setup, dependencies, config |

**Commit messages:** [Conventional Commits](https://www.conventionalcommits.org/), in the form `type(scope): short description`. Use the imperative, lowercase, no period at the end.

```bash
git commit -m "feat(lookup): add PIN-protected public status lookup"
git commit -m "fix(auth): return one generic error for failed logins"
git commit -m "docs: add architecture and testing guides"
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `chore`, `perf`. Make one commit per logical change. Never commit `.env` or real secrets.

## Team

| Member | Role |
|---|---|
| Liam | Database, backend, API, authentication and security |
| Catherine | Front end |
| Evan | QA, documentation, diagrams, seed data |