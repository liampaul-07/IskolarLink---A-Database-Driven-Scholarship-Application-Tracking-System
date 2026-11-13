# IskolarLink Troubleshooting

Common problems and their fixes. Find the symptom, read the cause, and follow the fix. For the endpoint rules see [api.md](api.md), and for the reset steps after running tests see [testing.md](testing.md).

## Quick reference

| Symptom | Most likely cause | Jump to |
|---|---|---|
| Server stops right after `npm start` | Missing `.env` or `JWT_SECRET` shorter than 32 characters | [1](#1-the-server-will-not-start) |
| Database error on start or on every request | MySQL not running, wrong credentials, or the database was not imported | [2](#2-database-connection-errors) |
| `Route not found` | Wrong path, wrong method, or missing `/api` | [3](#3-route-not-found) |
| 401 | No token, bad token, expired token, or wrong login | [4](#4-401-unauthorized) |
| 403 | Valid login but the role is not allowed | [5](#5-403-forbidden) |
| 409 | Duplicate, illegal phase change, or archived record | [6](#6-409-conflict) |
| 429 | Rate limit reached | [7](#7-429-too-many-requests) |
| Public lookup returns 404 for the demo record | Rate limit lock or changed data after tests | [8](#8-public-lookup-returns-404-after-tests) |
| Postman says `Could not send request` | The server is not running | [9](#9-postman-problems) |

## 1. The server will not start

**Symptom:** `npm start` prints a message and exits. The line `injected env (0) from .env` means the `.env` file was found but is empty, or was not found.

**Cause A: no `.env` file or an empty one.** The repo only ships `.env.example`, which is a template.

**Fix:**
1. In the project root (next to `package.json`), copy the template. In Git Bash use `cp .env.example .env`. In cmd use `copy .env.example .env`.
2. Open `.env` and fill in the values:
   ```text
   PORT=3000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=iskolarlink
   JWT_SECRET=<a long random string>
   ```
   On a default XAMPP install the user is `root` and the password is blank. Write no spaces around `=` and no quotes. The template has no `JWT_SECRET` line, so add it yourself.
3. Save the file and run `npm start` again.

**Cause B: `JWT_SECRET` is missing or shorter than 32 characters.** The server refuses to start and prints that it needs at least 32 characters.

**Fix:** generate a long secret and paste it after `JWT_SECRET=`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Do not share the secret, post it in a screenshot, or commit it. If it was exposed, generate a new one. Existing login tokens stop working when the secret changes, so log in again.

**Cause C: port 3000 is already in use** (`EADDRINUSE`). Another copy of the server is running. Close the other terminal running `npm start`, or change `PORT` in `.env`. If you change the port, the base URL changes too.

**Cause D: `bcrypt` fails to load.** Run `npm rebuild bcrypt`, or delete `node_modules` and run `npm install` again.

**Check that `.env` is not tracked by Git:** `git check-ignore .env` should print `.env`. Never commit it.

## 2. Database connection errors

| Message or behavior | Cause | Fix |
|---|---|---|
| `ECONNREFUSED` or the server cannot connect | MySQL is not running | Start **MySQL** in the XAMPP Control Panel and run `npm start` again. |
| `Access denied for user` | Wrong `DB_USER` or `DB_PASSWORD` | Use `root` and a blank password on default XAMPP, or the password you set. |
| `Unknown database` | `DB_NAME` does not match, or `schema.sql` was never imported | Open `http://localhost/phpmyadmin`, check the database name in the sidebar (it should be `iskolarlink`), and import the SQL files. |
| Tables exist but are empty | Only `schema.sql` was imported | Import `seed.sql`, then `seed_applicants.sql`. |
| `GET /api/health` returns 500 | The database query failed | Fix the cause above, then call `http://localhost:3000/api/health` again. It should return `status: ok` and `database: connected`. |

**Import order:** `database/schema.sql`, then `database/seed.sql`, then `database/seed_applicants.sql`. The data appears as tables inside the database, not as files, so open the database in phpMyAdmin and use **Structure** and **Browse** to check it.

## 3. "Route not found"

The server answered, but no route matches the method and path.

**Check:**
- The base path is `/api`. Use `http://localhost:3000/api/applications`, not `http://localhost:3000/applications`.
- The method is right. Creating a user is `POST /api/users`; `GET /api/users` lists them.
- The spelling matches `api.md` exactly, including `grant-schedule` and `auth/me`.
- In Postman, check that the `baseUrl` variable is exactly `http://localhost:3000/api`.
- Do not add a trailing space or a second slash.

## 4. 401 Unauthorized

The message tells you which kind of 401 you have.

| Message | Cause | Fix |
|---|---|---|
| `Authentication required.` | No token was sent | Add the header `Authorization: Bearer <token>`. In Postman, set the request's Authorization to Bearer Token. |
| `Invalid or expired token.` | The token is fake, tampered with, or expired (tokens last about 8 hours by default) | Log in again and use the new token. This is the most common 401 after a break. |
| `Invalid username or password.` | Wrong login | Check the username and password. The same message is used for unknown users, wrong passwords and inactive accounts, so you cannot tell them apart. |

**Also check:**
- The token variable actually holds a value. In Postman open the collection's **Variables** tab. If `adminToken` is empty, send the login request again. The variable must already exist for the login script to fill it.
- A deactivated user's token stops working immediately, because the server re-checks the account on every request.
- Changing `JWT_SECRET` invalidates every token that was issued before.

## 5. 403 Forbidden

You are logged in, but your role is not allowed to do this. Message: `You do not have permission to do this.`

Admin-only actions:
- Everything under `/users`
- Creating, changing and archiving programs, and creating, changing and deleting tiers
- Reopening an approved application (moving it from Approved back to For Evaluation)

**Fix:** log in as an admin and use that token. A 403 is not fixed by logging in again as the same staff user.

## 6. 409 Conflict

The request is valid, but it clashes with existing data or with a rule.

| Where | Typical cause | Fix |
|---|---|---|
| Create user | `That username is already taken.` | Choose a new username. |
| Create applicant | Same name and birth date already exists (letter case is ignored) | Use a different applicant or edit the existing one. |
| Create application | Same applicant, program and academic year already exists; the program is inactive or archived; the applicant is archived | Use a different year or program, or restore the archived record. |
| Change phase | The move is not an allowed transition, or a rule is unmet | Check the transition table in [erd.md](erd.md). Moving to For Evaluation needs documents marked complete. Approved needs eligibility `eligible` and a tier. Granted on a grant-type program needs a grant schedule. |
| Grant schedule | The program is non-grant, the application is not exactly Approved, or it is archived | Move the application to Approved first, or use a grant-type program. |
| Archive | The applicant or program still has open applications (not Ineligible or Granted) | Finish or close those applications first. |
| Update user | An admin tried to demote or deactivate their own account | Use a different admin account. |

## 7. 429 Too Many Requests

A rate limiter blocked you.

| Limit | Applies to |
|---|---|
| 10 failed logins in 15 minutes | One IP address. Successful logins are not counted. |
| 30 failed public lookups in 15 minutes | One IP address. Successful lookups are not counted. |
| 5 failed lookups against one reference in 15 minutes | One submitted reference. After that it is locked, even with correct details. |

**Fix:** the limits are kept in memory, so **restart the server** (Ctrl+C, then `npm start`). Waiting 15 minutes also clears them.

**Avoid it:** do not spam wrong passwords while testing. The test scripts in `tests/` trip these limits, so restart the server after running them (see [testing.md](testing.md)).

## 8. Public lookup returns 404 after tests

The public lookup returns the same `No matching application found.` for every failure, so the message alone does not tell you why. After running tests, the usual causes are:

1. **The reference is locked** by repeated failed attempts. Restart the server.
2. **The demo data was changed** by a test script (a new PIN, a changed birth date or an archived record). Re-import `database/seed_applicants.sql` in phpMyAdmin. If you also created test users or programs, drop the `iskolarlink` database and import all three files again in order.
3. **A typo.** The demo record is reference `S7H67DXZRY`, birth date `2005-03-14` (format `YYYY-MM-DD`), PIN `123456`. The reference is not case-sensitive, but the birth date and PIN must match exactly.
4. **The record has no PIN or is archived.** Both return 404 by design.

After fixing it, restart the server and try the demo lookup again.

## 9. Postman problems

| Symptom | Cause | Fix |
|---|---|---|
| `Could not send request` | The server is not running, or the URL is wrong | Start MySQL in XAMPP, run `npm start` in a terminal, and leave that terminal open. Open `http://localhost:3000/api/health` in a browser to check. |
| 400 `Validation failed` with every field `Required` | The body type is Text, so the server received an empty body | In the Body tab choose **raw** and set the dropdown to **JSON**. |
| 400 `Malformed JSON in request body.` | A typo in the JSON, such as a trailing comma or a missing quote | Fix the JSON. A valid body looks like `{ "username": "admin" }`. |
| A request does nothing different from its copy | Duplicated requests inherit the method, body type and script of the original | Check the method (GET or POST), the body type, and remove the token-saving script from failure-case requests. |
| `{{baseUrl}}` or a token shows red | No Postman environment is selected | This is only how Postman displays it. Hover over the variable to see its value, and make sure the variable is defined on the collection. |
| `cp` is not recognized | You are in cmd, not Git Bash | Use `copy` in cmd, or open a Git Bash terminal. |

## 10. Still stuck

1. Check `http://localhost:3000/api/health`. If it returns `status: ok` and `database: connected`, the server and database are fine and the problem is in the request.
2. Read the `message` in the response. The server never returns stack traces, but the message and status code usually point to the cause.
3. Write down the steps, the status code and the message (see section 4 of [testing.md](testing.md)) and share them with the team. Do not include `.env` contents or tokens.
