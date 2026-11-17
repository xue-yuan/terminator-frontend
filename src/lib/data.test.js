// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

// Start like a device that has used the app before: exercises and the library
// already cached when lib/data.js loads (its views are computed right away).
// A recent workout kept whole on the device, and the brief list of all of them
// (which also has an older one, and the recent one before an edit).
const recent = {
  id: 'w-recent',
  name: 'Push',
  performed_at: '2026-11-16T10:00:00Z',
  duration_seconds: 3600,
  updated_at: '2026-11-16T11:00:00Z',
  items: [
    {
      exercise_id: 'pec',
      exercise_name: 'Pec Deck',
      sets: [
        { weight: 20, reps: 12, kind: 'warmup' },
        { weight: 40, reps: 10, kind: 'working' },
        { weight: 40, reps: 9, kind: 'working' },
      ],
    },
  ],
};
const older = { id: 'w-older', name: 'Legs', performed_at: '2026-03-02T10:00:00Z', duration_seconds: null, sets: 18 };

let data;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  vi.doMock('./storage', async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      initialRecords: (store) => (store === 'workouts' ? [recent] : original.initialRecords(store)),
    };
  });
  const storage = await import('./storage');
  const staleRecent = {
    id: recent.id,
    name: 'Push',
    performed_at: recent.performed_at,
    duration_seconds: 3600,
    sets: 1,
  };
  storage.save('cache:activity', [staleRecent, older]);
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

describe('the training calendar’s list of workouts', () => {
  const byId = () => Object.fromEntries(data.activityList().map((a) => [a.id, a]));

  it('has every workout, the ones kept on the device as they are there', () => {
    expect(byId()).toEqual({
      'w-recent': { id: 'w-recent', name: 'Push', performed_at: recent.performed_at, duration_seconds: 3600, sets: 2 },
      'w-older': older,
    });
  });

  it('drops a workout deleted on the device before the server hears of it', () => {
    data.deleteWorkout('w-older');
    expect(Object.keys(byId())).toEqual(['w-recent']);
  });
});
