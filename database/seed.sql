-- IskolarLink seed data (FICTIONAL DATA ONLY)
-- Run AFTER schema.sql. Users, programs and tiers for now; applicants and applications come later.

USE iskolarlink;

-- TEST ACCOUNTS (development only, never reuse these passwords anywhere real).
-- Passwords are stored as bcrypt hashes:
--   admin   / Admin@12345   (role: admin)
--   staff1  / Staff@12345   (role: staff)
--   staff2  / Staff@12345   (role: staff, INACTIVE: login must be refused)
INSERT INTO users (id, username, password_hash, full_name, role, is_active)
VALUES
  (1, 'admin',  '$2b$10$egycuRYIYblOOvhHmMwrE.tqPOi8.87I5B2Di3fJJPhvjnQnbjgTq', 'System Administrator', 'admin', 1),
  (2, 'staff1', '$2b$10$LbIdH.zRGPXcjN/YA9B9q.lWYAKdmlxHoEdmjG0m3FSrj7yiciSmy', 'Maria Santos',        'staff', 1),
  (3, 'staff2', '$2b$10$ymMpvacelSL2dSpre5c.gONrsN3SdzxJDRzTEppLKLhp5jWRUwuRG', 'Juan Dela Cruz',      'staff', 0);

INSERT INTO scholarship_programs
  (id, name, description, type, criteria, min_gwa, max_household_income, status)
VALUES
  (1, 'Municipal Academic Scholarship',
      'Financial grant for high-performing college students residing in the municipality.',
      'grant', 'Resident for at least 3 years; enrolled in a recognized college or university.',
      85.00, 25000.00, 'active'),
  (2, 'Youth Skills Training Program',
      'Non-cash scholarship covering tuition at accredited technical training centers.',
      'non_grant', 'Aged 18 to 25; enrolled in a TESDA-accredited course.',
      NULL, 20000.00, 'active'),
  (3, 'Barangay Educational Assistance',
      'One-time cash assistance for senior high school students from partner barangays.',
      'grant', 'Certificate of indigency required.',
      80.00, 15000.00, 'active'),
  (4, 'Legacy Honors Scholarship',
      'Former program kept for record purposes.',
      'non_grant', 'No longer accepting applications.',
      90.00, NULL, 'inactive');

INSERT INTO program_tiers (program_id, tier_name, description, default_amount)
VALUES
  (1, 'Tier 1', 'Full support',    10000.00),
  (1, 'Tier 2', 'Partial support',  6000.00),
  (1, 'Tier 3', 'Basic support',    3000.00),
  (2, 'Full',   'Full tuition coverage',  NULL),
  (2, 'Half',   'Half tuition coverage',  NULL),
  (3, 'Standard', 'Standard assistance', 2500.00),
  (4, 'Honors', 'Honors recognition',     NULL);