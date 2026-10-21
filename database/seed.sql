-- IskolarLink seed data (FICTIONAL DATA ONLY)
-- Run AFTER schema.sql. Programs and tiers only for now; users and applicants come later.

USE iskolarlink;

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