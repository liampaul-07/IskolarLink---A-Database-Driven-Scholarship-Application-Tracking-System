-- IskolarLink schema (MySQL 8.0.16+ required: CHECK constraints are enforced)
-- Recreates the database from scratch: mysql -u root -p < schema.sql

DROP DATABASE IF EXISTS iskolarlink;
CREATE DATABASE iskolarlink
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE iskolarlink;

-- ---------------------------------------------------------------
-- users: staff and admin accounts
-- ---------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt hash only
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- applicants: personal and contact information
-- ---------------------------------------------------------------
CREATE TABLE applicants (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name     VARCHAR(60)  NOT NULL,
  middle_name    VARCHAR(60)  NULL,
  last_name      VARCHAR(60)  NOT NULL,
  birth_date     DATE         NOT NULL,           -- also the public lookup verifier
  sex            ENUM('male','female') NULL,
  email          VARCHAR(100) NULL,
  contact_number VARCHAR(20)  NULL,
  address        VARCHAR(255) NOT NULL,
  school         VARCHAR(120) NULL,
  course_or_strand VARCHAR(100) NULL,
  year_level     VARCHAR(20)  NULL,
  gwa            DECIMAL(4,2) NULL,               -- for simple threshold checks
  household_income DECIMAL(12,2) NULL,            -- monthly, for threshold checks
  is_archived    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- blocks the same person being encoded twice
  UNIQUE KEY uq_applicant_identity (last_name, first_name, birth_date),
  KEY idx_applicants_name (last_name, first_name),
  CONSTRAINT chk_applicant_gwa CHECK (gwa IS NULL OR gwa >= 0),
  CONSTRAINT chk_applicant_income CHECK (household_income IS NULL OR household_income >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- scholarship_programs
-- ---------------------------------------------------------------
CREATE TABLE scholarship_programs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  description TEXT         NULL,
  type        ENUM('grant','non_grant') NOT NULL,
  criteria    TEXT         NULL,                  -- human-readable eligibility notes
  min_gwa     DECIMAL(4,2) NULL,                  -- optional threshold helpers
  max_household_income DECIMAL(12,2) NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  is_archived TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_program_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- program_tiers: tiers per program (normalized so applications can FK to it)
-- ---------------------------------------------------------------
CREATE TABLE program_tiers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id   INT UNSIGNED NOT NULL,
  tier_name    VARCHAR(50)  NOT NULL,             -- e.g. 'Tier 1', 'Full', 'Half'
  description  VARCHAR(255) NULL,
  default_amount DECIMAL(10,2) NULL,              -- suggested release amount (grant programs)
  PRIMARY KEY (id),
  UNIQUE KEY uq_tier_per_program (program_id, tier_name),
  CONSTRAINT fk_tiers_program FOREIGN KEY (program_id)
    REFERENCES scholarship_programs (id),
  CONSTRAINT chk_tier_amount CHECK (default_amount IS NULL OR default_amount >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- applications: the core entity
-- ---------------------------------------------------------------
CREATE TABLE applications (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_no         CHAR(10)     NOT NULL,     -- random, non-sequential (generated in backend)
  applicant_id         INT UNSIGNED NOT NULL,
  program_id           INT UNSIGNED NOT NULL,
  academic_year        VARCHAR(9)   NOT NULL,     -- e.g. '2026-2027'
  current_phase        ENUM('Submitted','Under Review','For Evaluation',
                            'Approved','Ineligible','Granted')
                       NOT NULL DEFAULT 'Submitted',
  eligibility          ENUM('pending','eligible','ineligible') NOT NULL DEFAULT 'pending',
  ineligibility_reason VARCHAR(255) NULL,
  tier_id              INT UNSIGNED NULL,
  docs_complete        TINYINT(1)   NOT NULL DEFAULT 0,  -- requirements received/checked by staff
  remarks              TEXT         NULL,         -- internal; never exposed by public lookup
  lookup_pin_hash      VARCHAR(255) NULL,         -- stretch: staff-issued PIN
  is_archived          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reference_no (reference_no),
  -- one application per applicant, program, and school year
  UNIQUE KEY uq_application_dup (applicant_id, program_id, academic_year),
  KEY idx_app_phase (current_phase),
  KEY idx_app_eligibility (eligibility),
  KEY idx_app_program (program_id),
  KEY idx_app_tier (tier_id),
  CONSTRAINT fk_app_applicant FOREIGN KEY (applicant_id) REFERENCES applicants (id),
  CONSTRAINT fk_app_program   FOREIGN KEY (program_id)   REFERENCES scholarship_programs (id),
  CONSTRAINT fk_app_tier      FOREIGN KEY (tier_id)      REFERENCES program_tiers (id),
  -- ineligible results must carry a reason
  CONSTRAINT chk_reason_required CHECK (
    eligibility <> 'ineligible' OR (ineligibility_reason IS NOT NULL AND ineligibility_reason <> '')
  ),
  -- tiers only for eligible applicants
  CONSTRAINT chk_tier_only_eligible CHECK (tier_id IS NULL OR eligibility = 'eligible')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- status_history: log of every phase change
-- ---------------------------------------------------------------
CREATE TABLE status_history (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  old_phase      ENUM('Submitted','Under Review','For Evaluation',
                      'Approved','Ineligible','Granted') NULL,  -- NULL on first entry
  new_phase      ENUM('Submitted','Under Review','For Evaluation',
                      'Approved','Ineligible','Granted') NOT NULL,
  changed_by     INT UNSIGNED NOT NULL,
  remarks        VARCHAR(255) NULL,
  changed_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_app (application_id, changed_at),
  CONSTRAINT fk_history_app  FOREIGN KEY (application_id) REFERENCES applications (id),
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by)     REFERENCES users (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- grant_schedules: release details for grant-type applications
-- (grant-type-only rule is enforced in the backend, since it spans tables)
-- ---------------------------------------------------------------
CREATE TABLE grant_schedules (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  release_date   DATE          NOT NULL,
  venue          VARCHAR(150)  NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_application (application_id),   -- one schedule per application
  KEY idx_schedule_date (release_date),
  CONSTRAINT fk_schedule_app FOREIGN KEY (application_id) REFERENCES applications (id),
  CONSTRAINT chk_schedule_amount CHECK (amount > 0)
) ENGINE=InnoDB;