import { HINT_BREAKER_MS, HINT_FAILED_WAIT_MS, hintMayHop, markerKey, readHint, readMarker, writeMarker } from './hint';

describe('the hint and its marker', () => {
  beforeEach(() => localStorage.clear());

  it('reads the hint by its name, in its shape only', () => {
    const value = 'Qm9vdHN0cmFwLWhpbnQtMTI';
    expect(readHint(`a=1; anotoki_signed_in=${value}; b=2`, 'anotoki_signed_in')).toBe(value);
    expect(readHint(`anotoki_signed_in=${encodeURIComponent(value)}`, 'anotoki_signed_in')).toBe(value);
    for (const cookies of [
      '',
      'anotoki_signed_in=',
      'anotoki_signed_in=short',
      `anotoki_signed_in=${value}!`,
      `x_anotoki_signed_in=${value}`,
      `anotoki_signed_in=${'a'.repeat(65)}`,
      'anotoki_signed_in=%E0%A4%A',
    ]) {
      expect(readHint(cookies, 'anotoki_signed_in')).toBeNull();
    }
  });

  it('lets a value go once, at most one a minute, ten minutes after a failed probe', () => {
    const now = 1_800_000_000_000;
    expect(hintMayHop(null, 'a', now)).toBe(true);
    expect(hintMayHop({ value: 'a', at: now - 86_400_000 }, 'a', now)).toBe(false);
    expect(hintMayHop({ value: 'a', at: now - HINT_BREAKER_MS + 1 }, 'b', now)).toBe(false);
    expect(hintMayHop({ value: 'a', at: now - HINT_BREAKER_MS }, 'b', now)).toBe(true);
    expect(hintMayHop({ value: 'a', at: now - HINT_FAILED_WAIT_MS + 1, failed: true }, 'a', now)).toBe(false);
    expect(hintMayHop({ value: 'a', at: now - HINT_FAILED_WAIT_MS, failed: true }, 'a', now)).toBe(true);
    expect(hintMayHop({ value: 'a', at: now + 3_600_000 }, 'b', now)).toBe(true);
    expect(hintMayHop({ value: 'a', at: now + 3_600_000 }, 'a', now)).toBe(false);
  });

  it('keeps the marker beside the tokens, reading back what it wrote', () => {
    expect(markerKey('genshin')).toBe('anotoki-auth:genshin:hint');
    expect(writeMarker(localStorage, 'genshin', { value: 'a', at: 5 })).toBe(true);
    expect(readMarker(localStorage, 'genshin')).toEqual({ value: 'a', at: 5 });
    expect(writeMarker(localStorage, 'genshin', { value: 'a', at: 6, failed: true })).toBe(true);
    expect(readMarker(localStorage, 'genshin')).toEqual({ value: 'a', at: 6, failed: true });
    localStorage.setItem(markerKey('genshin'), '{"value": 3}');
    expect(readMarker(localStorage, 'genshin')).toBeNull();
    localStorage.setItem(markerKey('genshin'), 'not json');
    expect(readMarker(localStorage, 'genshin')).toBeNull();

    const refusing = { setItem: () => undefined, getItem: () => null } as unknown as Storage;
    expect(writeMarker(refusing, 'genshin', { value: 'a', at: 1 })).toBe(false);
  });
});
