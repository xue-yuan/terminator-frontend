// Weights are stored as entered, with their unit, because gym equipment is
// labelled in kg or lb. Conversion only happens for display (charts, totals).

export const KG_PER_LB = 0.45359237;
export const UNITS = ['kg', 'lb'];

/** Convert a weight between units. Unknown/missing unit means kg (older data). */
export function convert(value, from = 'kg', to = 'kg') {
  if (!value || (from ?? 'kg') === (to ?? 'kg')) return value;
  return from === 'lb' ? value * KG_PER_LB : value / KG_PER_LB;
}

/** Round a converted weight to something loadable (nearest 0.5). */
export const roundWeight = (value) => Math.round(value * 2) / 2;
