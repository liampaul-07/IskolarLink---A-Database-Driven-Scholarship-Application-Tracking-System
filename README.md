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
4. Create a `.env` file in the project root. Ask the project owner for the values. It must define the database connection, `JWT_SECRET` (at least 32 characters; the server refuses to start otherwise), and optionally `JWT_EXPIRES_IN` (default `8h`) and `CORS_ORIGIN` (for example `http://localhost:3000`). **Never commit `.env`.**
5. Install and start:

```bash
npm install
npm start
```

6. Open http://localhost:3000. The API is at http://localhost:3000/api (health check: `/api/health`).

## Test accounts (seed data only)

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin@12345` | admin | Can manage users, programs, tiers and reopen approved applications |
| `staff1` | `Staff@12345` | staff | Day-to-day application work |
| `staff2` | `Staff@12345` | staff | **Inactive**: login is refused on purpose |

These are development accounts only. Never reuse these passwords anywhere real.

## Demo PIN

Every **seeded** application uses the demo PIN **`123456`**. This is demo data only. Applications created through the API get a random PIN, shown once at creation.

Good public lookup examples (PIN `123456`):

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

## Project structure

```
database/   schema.sql, seed.sql, seed_applicants.sql
docs/       api.md (API contract), erd.md (ERD and phase transitions)
public/     front-end pages, css/, js/
server/     app.js, server.js, config/, controllers/, middleware/, routes/, utils/
tests/      automated smoke tests
```

## Documentation

- `docs/api.md`: every endpoint, request/response shape and error code.
- `docs/erd.md`: entity relationship diagram and the allowed phase transitions.

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

## Team

| Member | Role |
|---|---|
| Liam | Database, backend, API, authentication and security |
| Catherine | Front end |
| Evan | QA, documentation, diagrams, seed data |
