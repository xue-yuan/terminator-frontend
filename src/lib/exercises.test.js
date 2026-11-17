import { describe, expect, it } from 'vite-plus/test';
import { groupAfterRename } from './exercises';

describe('groupAfterRename', () => {
  const original = { name: 'Dumbbell Fly', group: 'chest' };

  it('takes the library’s group for the new name', () => {
    expect(groupAfterRename({ name: 'lateral raise ', original, current: 'chest', libraryGroup: 'shoulders' })).toBe(
      'shoulders',
    );
  });

  it('keeps the shown group for a name the library doesn’t know', () => {
    expect(groupAfterRename({ name: 'Cable Y Raise', original, current: 'shoulders', libraryGroup: undefined })).toBe(
      'shoulders',
    );
  });

  it('goes back to the exercise’s own group when the name is back to what it was', () => {
    expect(groupAfterRename({ name: 'dumbbell fly', original, current: 'shoulders', libraryGroup: 'chest' })).toBe(
      'chest',
    );
    const ownChoice = { name: 'Pec Deck', group: 'arms' }; // set by hand, unlike the library's chest
    expect(groupAfterRename({ name: 'Pec Deck', original: ownChoice, current: 'chest', libraryGroup: 'chest' })).toBe(
      'arms',
    );
  });

  it('never overrides a group picked by hand', () => {
    expect(
      groupAfterRename({ name: 'Lateral Raise', original, current: 'arms', picked: true, libraryGroup: 'shoulders' }),
    ).toBe('arms');
  });
});
