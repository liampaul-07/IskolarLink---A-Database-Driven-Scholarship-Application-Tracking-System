# IskolarLink demo data

Everything here is fictional demo data from the seed files. It is safe to keep in the repository. Do not put real passwords, real personal data or a real `.env` in this file.

If you deploy IskolarLink where other people can reach it, change the admin password and do not write the new one here.

## Staff logins

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin@12345` | admin | Users, programs, tiers, and reopening approved applications |
| `staff1` | `Staff@12345` | staff | Day-to-day application work |
| `staff2` | `Staff@12345` | staff | **Inactive.** Login is refused on purpose. |

## Public lookup

Open the home page and enter the reference number, the birth date (`YYYY-MM-DD`) and the PIN. Every seeded application uses the PIN **`123456`**. Applications created through the API get a random PIN, shown once at creation. The reference number is not case-sensitive.

## Scholarship programs and tiers

| Id | Program | Type | Status | Tiers |
|---|---|---|---|---|
| 1 | Municipal Academic Scholarship | grant | active | Tier 1 (10,000), Tier 2 (6,000), Tier 3 (3,000) |
| 2 | Youth Skills Training Program | non-grant | active | Full, Half (no amount) |
| 3 | Barangay Educational Assistance | grant | active | Standard (2,500) |
| 4 | Legacy Honors Scholarship | non-grant | **inactive** | Honors (no amount) |

Creating an application for program 4 returns a 409, because the program is inactive.

## Seeded applications

All academic year 2026-2027. PIN `123456` for every row.

| # | Reference no. | Applicant | Birth date | Program | Phase | Tier | Release date |
|---|---|---|---|---|---|---|---|
| 1 | `S7H67DXZRY` | Ana Cruz | 2005-03-14 | Municipal Academic Scholarship | Submitted | - | - |
| 2 | `PYKU4XTZS4` | Miguel Reyes | 2004-11-02 | Municipal Academic Scholarship | Submitted | - | - |
| 3 | `K5JABEX7W9` | Bianca Villanueva | 2006-07-21 | Barangay Educational Assistance | Submitted | - | - |
| 4 | `8GJZSRT35S` | Carlo Ramos | 2005-01-30 | Youth Skills Training Program | Submitted | - | - |
| 5 | `Y8B5KMR84D` | Daniela Torres | 2004-09-09 | Municipal Academic Scholarship | Under Review | - | - |
| 6 | `9CXJ7SNDG2` | Elijah Navarro | 2005-05-18 | Youth Skills Training Program | Under Review | - | - |
| 7 | `RVU85CW4GH` | Francine Bautista | 2007-02-25 | Barangay Educational Assistance | Under Review | - | - |
| 8 | `AMYVV3896S` | Gabriel Mendoza | 2004-12-12 | Municipal Academic Scholarship | Under Review | - | - |
| 9 | `CQYF8E448V` | Hannah Castillo | 2005-08-03 | Municipal Academic Scholarship | For Evaluation | Tier 2 | - |
| 10 | `7CB5NXN839` | Ian Domingo | 2003-04-27 | Youth Skills Training Program | For Evaluation | - | - |
| 11 | `S9RVW4FEVT` | Jasmine Aquino | 2007-10-06 | Barangay Educational Assistance | For Evaluation | Standard | - |
| 12 | `BGX8FBXU85` | Kevin Pascual | 2005-06-15 | Municipal Academic Scholarship | Approved | Tier 1 | 2026-11-27 |
| 13 | `UQ6CPKFNFJ` | Lorraine Fernandez | 2004-03-22 | Municipal Academic Scholarship | Approved | Tier 3 | - |
| 14 | `6GHA9C7RXM` | Marco Garcia | 2003-09-30 | Youth Skills Training Program | Approved | Full | - |
| 15 | `VKVJYUED4J` | Nicole Salazar | 2007-01-11 | Barangay Educational Assistance | Approved | Standard | 2026-12-04 |
| 16 | `K8MFJJCAQ6` | Oscar Valdez | 2004-05-05 | Municipal Academic Scholarship | Ineligible | - | - |
| 17 | `DYUV86NM3R` | Patricia Cabrera | 2007-12-19 | Barangay Educational Assistance | Ineligible | - | - |
| 18 | `K95NB2ZQ7A` | Quennie Soriano | 2002-08-08 | Youth Skills Training Program | Ineligible | - | - |
| 19 | `U9MGUB2DFW` | Rafael Aguilar | 2005-02-02 | Municipal Academic Scholarship | Granted | Tier 2 | 2026-09-11 |
| 20 | `H3EFUAYZ8U` | Sofia Mercado | 2007-04-14 | Barangay Educational Assistance | Granted | Standard | 2026-09-15 |
| 21 | `BX695T5JMX` | Tristan Manalo | 2003-11-23 | Youth Skills Training Program | Granted | Half | - |
| 22 | `U5JM6GNNRX` | Ana Cruz | 2005-03-14 | Barangay Educational Assistance | Under Review | - | - |

Ana Cruz has two applications: #1 (Municipal Academic Scholarship) and #22 (Barangay Educational Assistance). Program 2 is still free for her.

## Release schedules

| Application | Reference no. | Release date | Venue | Amount |
|---|---|---|---|---|
| #12 (Approved) | `BGX8FBXU85` | 2026-11-27 | Municipal Hall, Session Room B | 10,000.00 |
| #15 (Approved) | `VKVJYUED4J` | 2026-12-04 | Municipal Hall, Session Room A | 2,500.00 |
| #19 (Granted) | `U9MGUB2DFW` | 2026-09-11 | Scholarship Office, Ground Floor | 6,000.00 |
| #20 (Granted) | `H3EFUAYZ8U` | 2026-09-15 | Scholarship Office, Ground Floor | 2,500.00 |

The dashboard's "upcoming releases" list shows only Approved applications whose release date is today or later, so #12 and #15 drop off after their dates. After that, schedule a new release to show the list.

## Good examples for a demo

| To show | Use |
|---|---|
| A new, untouched application | `S7H67DXZRY`, 2005-03-14 |
| Approved with a release schedule | `BGX8FBXU85`, 2005-06-15 |
| Approved with no schedule yet | `UQ6CPKFNFJ`, 2004-03-22 |
| Granted | `U9MGUB2DFW`, 2005-02-02 |
| Ineligible (the reason is hidden from the applicant) | `DYUV86NM3R`, 2007-12-19 |
| A wrong PIN, wrong date or unknown reference | Any of the above with a changed value: the same "No matching application found." every time |

To create a new application without a 409, pick an applicant and a program that is not already paired for 2026-2027. For example, applicant #2 (Miguel Reyes) has only program 1, so program 2 or 3 is free for him.

## Resetting the demo data

The smoke tests create rows and trip the rate limiters, and a demo changes records. To restore the seed:

1. Stop the server.
2. Re-import `database/seed_applicants.sql` in phpMyAdmin (it replaces all applicants, applications, history and schedules, and keeps users, programs and tiers).
3. If you also created users, programs or tiers (for example `test.user1` from the QA checks), drop the `iskolarlink` database and import `schema.sql`, `seed.sql` and `seed_applicants.sql` in that order.
4. Start the server again. This also clears the rate limits.