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

module.exports = { num, toProgram, toTier };