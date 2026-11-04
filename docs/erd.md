# IskolarLink ERD and Status Transitions

## ERD (Mermaid)

```mermaid
erDiagram
    users ||--o{ status_history : "changed_by"
    applicants ||--o{ applications : "has"
    scholarship_programs ||--o{ applications : "receives"
    scholarship_programs ||--o{ program_tiers : "defines"
    program_tiers |o--o{ applications : "assigned"
    applications ||--o{ status_history : "logs"
    applications ||--o| grant_schedules : "scheduled"

    users {
        int id PK
        varchar username UK
        varchar password_hash
        varchar full_name
        enum role "admin, staff"
        tinyint is_active
    }
    applicants {
        int id PK
        varchar first_name
        varchar last_name
        date birth_date
        varchar address
        decimal gwa
        decimal household_income
        tinyint is_archived
    }
    scholarship_programs {
        int id PK
        varchar name UK
        enum type "grant, non_grant"
        text criteria
        enum status "active, inactive"
        tinyint is_archived
    }
    program_tiers {
        int id PK
        int program_id FK
        varchar tier_name
        decimal default_amount
    }
    applications {
        int id PK
        char reference_no UK
        int applicant_id FK
        int program_id FK
        varchar academic_year
        enum current_phase
        enum eligibility "pending, eligible, ineligible"
        varchar ineligibility_reason
        int tier_id FK
        tinyint docs_complete
        text remarks
        varchar lookup_pin_hash
        tinyint is_archived
    }
    status_history {
        int id PK
        int application_id FK
        enum old_phase
        enum new_phase
        int changed_by FK
        varchar remarks
        timestamp changed_at
    }
    grant_schedules {
        int id PK
        int application_id FK, UK
        date release_date
        varchar venue
        decimal amount
    }
```

Note: `program_tiers` is added beyond the five tables in the proposal so tiers are a real foreign key instead of free text. The proposal says the ERD is finalized at defense, so this is fine.

## Allowed phase transitions

| From             | To                              | Extra rule                                                    |
|------------------|---------------------------------|---------------------------------------------------------------|
| (new)            | Submitted                       | Set on creation, first history row                            |
| Submitted        | Under Review                    |                                                               |
| Under Review     | For Evaluation                  | `docs_complete` must be 1                                     |
| Under Review     | Ineligible                      | Reason required (e.g. incomplete or invalid documents)        |
| For Evaluation   | Approved                        | `eligibility` = eligible and a tier assigned                  |
| For Evaluation   | Ineligible                      | Reason required                                               |
| Approved         | Granted                         | Grant-type program must have a grant schedule                 |
| Approved         | For Evaluation                  | **Reopen.** Admin only. Reason required and saved in history. Eligibility and tier are kept; the application must be approved again |
| Ineligible       | (none)                          | Terminal                                                      |
| Granted          | (none)                          | Terminal                                                      |

Every transition updates `applications` and inserts into `status_history` in one transaction. The application row is locked (`SELECT ... FOR UPDATE`) for the duration, so simultaneous changes are processed one at a time. Marking an application Ineligible also sets `eligibility = 'ineligible'`, saves the reason and clears the tier in the same transaction.

## Rules the database enforces vs. the backend

| Rule                                          | Enforced by                      |
|-----------------------------------------------|----------------------------------|
| Duplicate application (applicant + program + year) | UNIQUE `uq_application_dup`  |
| Duplicate applicant (name + birth date)       | UNIQUE `uq_applicant_identity`   |
| Ineligible requires reason                    | CHECK `chk_reason_required` (and backend) |
| Tier only on eligible applicants              | CHECK `chk_tier_only_eligible` (and backend) |
| One grant schedule per application            | UNIQUE `uq_schedule_application` |
| Grant schedule only for grant-type programs   | Backend (spans tables)           |
| Grant schedule only while the application is Approved | Backend                  |
| Tier belongs to the application's program     | Backend (spans tables)           |
| Tier changes only while For Evaluation        | Backend                          |
| Legal phase transitions                       | Backend (table above)            |
| Reopen is admin-only and needs a reason       | Backend (role check + validation) |
| Phase and eligibility stay in sync on Ineligible | Backend (one transaction), backed by the CHECK constraints |
| Simultaneous changes to one application       | Backend (row lock inside the transaction) |