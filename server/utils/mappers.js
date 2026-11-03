// Converts database rows (snake_case) to API objects (camelCase).
// mysql2 returns DECIMAL columns as strings, so numbers are converted here.

const num = (v) => (v === null || v === undefined ? null : Number(v));

function toProgram(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    criteria: r.criteria,
    minGwa: num(r.min_gwa),
    maxHouseholdIncome: num(r.max_household_income),
    status: r.status,
    isArchived: Boolean(r.is_archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function toTier(r) {
  return {
    id: r.id,
    programId: r.program_id,
    tierName: r.tier_name,
    description: r.description,
    defaultAmount: num(r.default_amount)
  };
}

function toUser(r) {
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    role: r.role,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at
  };
}

function toApplicant(r) {
  return {
    id: r.id,
    firstName: r.first_name,
    middleName: r.middle_name,
    lastName: r.last_name,
    birthDate: r.birth_date,
    sex: r.sex,
    email: r.email,
    contactNumber: r.contact_number,
    address: r.address,
    school: r.school,
    courseOrStrand: r.course_or_strand,
    yearLevel: r.year_level,
    gwa: num(r.gwa),
    householdIncome: num(r.household_income),
    isArchived: Boolean(r.is_archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// One row of the applications list (joined with applicant, program and tier).
function toApplicationRow(r) {
  return {
    id: r.id,
    referenceNo: r.reference_no,
    applicantId: r.applicant_id,
    applicantName: r.applicant_name,
    programId: r.program_id,
    programName: r.program_name,
    academicYear: r.academic_year,
    phase: r.current_phase,
    eligibility: r.eligibility,
    tier: r.tier_name,
    docsComplete: Boolean(r.docs_complete),
    isArchived: Boolean(r.is_archived),
    createdAt: r.created_at
  };
}

function toGrantSchedule(r) {
  return {
    id: r.id,
    releaseDate: r.release_date,
    venue: r.venue,
    amount: num(r.amount)
  };
}

function toHistoryEntry(r) {
  return {
    id: r.id,
    oldPhase: r.old_phase,
    newPhase: r.new_phase,
    changedByName: r.changed_by_name,
    remarks: r.remarks,
    changedAt: r.changed_at
  };
}

module.exports = {
  num, toProgram, toTier, toUser, toApplicant, toApplicationRow, toGrantSchedule, toHistoryEntry
};