import { describe, expect, it } from 'vite-plus/test';
import { changeOver, spanLabel } from './trend';

const entry = (date, weight) => ({ measured_at: `${date}T07:00:00`, weight });
const weight = (e) => e.weight;

describe('changeOver', () => {
  it('compares with the entry closest to 30 days before the latest', () => {
    const list = [entry('2026-11-24', 80), entry('2026-11-10', 81), entry('2026-10-26', 82.5), entry('2026-10-01', 84)];
    expect(changeOver(list, weight)).toEqual({ delta: -2.5, days: 29 });
  });

  it('says how far back it really is when nothing is near a month ago', () => {
    const list = [entry('2026-11-24', 80), entry('2026-11-21', 80.6)];
    const change = changeOver(list, weight);
    expect(change.days).toBe(3);
    expect(change.delta).toBeCloseTo(-0.6);
    expect(spanLabel(change.days)).toBe('3 days');
  });

  it('needs two entries', () => {
    expect(changeOver([entry('2026-11-24', 80)], weight)).toBeNull();
  });

  it('labels the span', () => {
    expect([0, 1, 30].map(spanLabel)).toEqual(['Same day', '1 day', '30 days']);
  });
});
