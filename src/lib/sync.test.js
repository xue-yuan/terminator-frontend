// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// A tiny fake API server: enough of /exercises and /workouts to exercise the
// outbox, conflict handling and id remapping end to end (no IndexedDB in
// happy-dom, so storage stays in memory).
const server = { exercises: new Map(), workouts: new Map(), bodyWeights: new Map(), requests: [] };
const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status });

function handle(method, path, body) {
  const [, resource, id] = path.replace('/api/v1', '').split('/');
  if (method === 'GET')
    return json(200, resource === 'exercises' ? [...server.exercises.values()] : resource === 'users' ? {} : []);
  if (resource === 'exercises' && method === 'PUT') {
    const clash = [...server.exercises.values()].find(
      (e) => e.name.toLowerCase() === body.name.toLowerCase() && e.id !== id,
    );
    if (clash) return json(409, { detail: { message: `"${clash.name}" already exists`, existing_id: clash.id } });
    const created = !server.exercises.has(id);
    server.exercises.set(id, { id, ...body, times_performed: 0, last_sets: [] });
    return json(created ? 201 : 200, server.exercises.get(id));
  }
  if (resource === 'body-weights' && method === 'PUT') {
    const created = !server.bodyWeights.has(id);
    server.bodyWeights.set(id, { id, ...body, updated_at: new Date().toISOString() });
    return json(created ? 201 : 200, server.bodyWeights.get(id));
  }
  if (resource === 'body-weights' && method === 'DELETE') {
    server.bodyWeights.delete(id);
    return json(204);
  }
  if (resource === 'workouts' && method === 'PUT') {
    const items = body.items.map((item) => {
      const byName = [...server.exercises.values()].find(
        (e) => e.name.toLowerCase() === item.exercise_name.toLowerCase(),
      );
      const exercise = server.exercises.get(item.exercise_id) ?? byName;
      return { ...item, exercise_id: exercise?.id ?? item.exercise_id };
    });
    const workout = { ...body, id, items, updated_at: new Date().toISOString() };
    server.workouts.set(id, workout);
    return json(201, workout);
  }
  return json(404, { detail: 'Not found' });
}

let data;
let sync;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  vi.stubGlobal('fetch', async (url, { method = 'GET', body } = {}) => {
    const parsed = body ? JSON.parse(body) : undefined;
    server.requests.push({ method, url, body: parsed });
    return handle(method, url, parsed);
  });
  const storage = await import('./storage');
  storage.save('auth', { accessToken: 'a', refreshToken: 'r', user: { id: 1 } });
  sync = await import('./sync');
  data = await import('./data');
});

beforeEach(async () => {
  await sync.flush();
  server.exercises.clear();
  server.workouts.clear();
  server.bodyWeights.clear();
  server.requests.length = 0;
});

const squatWorkout = (exerciseId) => ({
  id: crypto.randomUUID(),
  performed_at: '2026-11-15T08:00:00.000Z',
  name: null,
  notes: null,
  duration_seconds: 3600,
  plan_day_id: null,
  items: [
    {
      exercise_id: exerciseId,
      exercise_name: 'Squat',
      weight_unit: 'kg',
      superset: null,
      sets: [{ weight: 100, reps: 5, rpe: null }],
    },
  ],
});

describe('exercises created offline', () => {
  it('switch to the server’s exercise when it already has the name, before the workout is sent', async () => {
    const existing = crypto.randomUUID();
    server.exercises.set(existing, { id: existing, name: 'Squat' }); // e.g. from another device

    const localId = data.ensureExercise('squat');
    const workout = squatWorkout(localId);
    data.saveWorkout(workout);
    await sync.flush();

    const sent = server.requests.filter((r) => r.method === 'PUT').map((r) => r.url);
    expect(sent).toEqual([`/api/v1/exercises/${localId}`, `/api/v1/workouts/${workout.id}`]);
    expect(server.workouts.get(workout.id).items[0].exercise_id).toBe(existing);
    expect(sync.outbox()).toEqual([]);
    expect(data.exerciseById(localId)).toBeNull();
  });

  it('are created with their own id when the name is new', async () => {
    const localId = data.ensureExercise('Cable Fly');
    expect(data.exerciseByName('cable fly')?.pending).toBe(true); // usable right away
    await sync.flush();
    expect(server.exercises.get(localId)?.name).toBe('Cable Fly');
    expect(data.ensureExercise('CABLE FLY')).toBe(localId);
  });
});

describe('renaming', () => {
  it('onto a name another exercise has is reported, not silently remapped', async () => {
    const bench = crypto.randomUUID();
    const press = crypto.randomUUID();
    server.exercises.set(bench, { id: bench, name: 'Bench' });
    server.exercises.set(press, { id: press, name: 'Press' });
    await data.exercises.refresh();

    data.saveExercise(bench, { name: 'press' });
    await sync.flush();

    const [failed] = sync.failedEntries();
    expect(failed).toMatchObject({ type: 'exercise', entityId: bench });
    expect(failed.error).toMatch(/already exists/);
    expect(server.exercises.get(bench).name).toBe('Bench');
    sync.discardEntry(failed.version);
  });
});

describe('body weight', () => {
  it('is listed right away and synced, and deleting it reaches the server too', async () => {
    data.logBodyWeight({ weight: 80.4, unit: 'kg', measured_at: '2026-11-15T07:00:00.000Z' });
    const [entry] = data.bodyWeightList();
    expect(entry).toMatchObject({ weight: 80.4, unit: 'kg', pending: true });
    await sync.flush();
    expect(server.bodyWeights.get(entry.id)).toMatchObject({ weight: 80.4, unit: 'kg' });
    expect(data.bodyWeightList()[0].pending).toBeUndefined(); // the server's copy now

    data.deleteBodyWeight(entry.id);
    expect(data.bodyWeightList()).toEqual([]);
    await sync.flush();
    expect(server.bodyWeights.size).toBe(0);
  });
});

describe('uploading', () => {
  it('never drops a saved thing out of its list on the way to the server', async () => {
    // A page showing the workout (the Workout Complete card) would be torn
    // down and built again if it vanished for a moment, even a synchronous one.
    const { createEffect, createRoot } = await import('solid-js');
    const workout = squatWorkout(data.ensureExercise('Squat'));
    const seen = [];
    const dispose = createRoot((dispose) => {
      createEffect(() => seen.push(data.workoutList().some((w) => w.id === workout.id)));
      return dispose;
    });
    data.saveWorkout(workout);
    // Something queued after it: the workout's upload isn't the last one.
    data.logBodyWeight({ weight: 80, unit: 'kg', measured_at: '2026-11-15T07:00:00.000Z' });
    await sync.flush();
    dispose();

    expect(server.workouts.has(workout.id)).toBe(true);
    expect(sync.outbox()).toEqual([]);
    expect(seen.slice(seen.indexOf(true))).not.toContain(false);
    expect(data.workoutList().find((w) => w.id === workout.id).pending).toBeUndefined(); // the server's copy
  });
});
