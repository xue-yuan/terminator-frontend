// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

// Start like a device that has used the app before: exercises and the library
// already cached when lib/data.js loads (its views are computed right away).
let data;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  const storage = await import('./storage');
  storage.save('cacheVersion', 2);
  storage.save('cache:exercises', [
    { id: 'pec', name: 'Pec Deck', muscle_group: null, times_performed: 3, last_performed_at: '2026-11-16T12:00:00Z' },
    { id: 'own', name: '下胸機械', muscle_group: null, times_performed: 1, last_performed_at: '2026-11-15T12:00:00Z' },
  ]);
  storage.save('cache:catalog', [
    { id: 1, name: 'Decline Chest Press Machine', zh: '下斜推胸機', aka: '機械下胸 下胸機械', muscle_group: 'chest' },
    { id: 2, name: 'Pec Deck', zh: '蝴蝶機夾胸', aka: '機械夾胸', muscle_group: 'chest' },
  ]);
  data = await import('./data');
});

describe('the exercise library', () => {
  it('labels your exercises with its Chinese names and muscle groups', () => {
    expect(data.catalogEntry('  pec deck ')).toMatchObject({ zh: '蝴蝶機夾胸', muscle_group: 'chest' });
    expect(data.muscleOf({ name: 'Pec Deck', muscle_group: null })).toBe('chest');
    expect(data.muscleOf({ name: 'Pec Deck', muscle_group: 'arms' })).toBe('arms'); // your own choice wins
    expect(data.catalogEntry('下胸機械')).toBeNull(); // a name, not an alias
  });

  it('suggests your exercises (recent first), then the rest of the library', () => {
    expect(data.exerciseOptions()).toEqual([
      { name: 'Pec Deck', zh: '蝴蝶機夾胸', aka: '機械夾胸', mine: true },
      { name: '下胸機械', zh: undefined, aka: undefined, mine: true },
      { name: 'Decline Chest Press Machine', zh: '下斜推胸機', aka: '機械下胸 下胸機械' },
    ]);
  });

  it('shows an admin’s change at once', () => {
    data.catalog.update((list) => list.map((e) => (e.id === 2 ? { ...e, zh: '夾胸機' } : e)));
    expect(data.exerciseOptions()[0].zh).toBe('夾胸機');
    expect(data.catalogEntry('Pec Deck').zh).toBe('夾胸機');
  });
});
