import {
  episodeDurationSeconds,
  formatChrono,
  formatDuration,
  formatTime,
  KIND_LABELS,
  parisHour,
  parisWeekKey,
  secondsSince,
} from '@/lib/format';

describe('formatDuration', () => {
  it('renders seconds below a minute', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(40)).toBe('40 s');
    expect(formatDuration(59.4)).toBe('59 s');
  });

  it('renders minutes with a remainder', () => {
    expect(formatDuration(200)).toBe('3 min 20 s');
    expect(formatDuration(180)).toBe('3 min');
    expect(formatDuration(59.6)).toBe('1 min');
  });

  it('renders hours with zero-padded minutes', () => {
    expect(formatDuration(3900)).toBe('1 h 05 min');
    expect(formatDuration(7800)).toBe('2 h 10 min');
    expect(formatDuration(3600)).toBe('1 h 00 min');
  });

  it('clamps negative values to zero', () => {
    expect(formatDuration(-12)).toBe('0 s');
  });
});

describe('formatChrono', () => {
  it('renders mm:ss below an hour', () => {
    expect(formatChrono(5)).toBe('00:05');
    expect(formatChrono(1425)).toBe('23:45');
  });

  it('renders h:mm:ss from an hour up', () => {
    expect(formatChrono(5025)).toBe('1:23:45');
    expect(formatChrono(3600)).toBe('1:00:00');
  });

  it('clamps negative values to zero', () => {
    expect(formatChrono(-3)).toBe('00:00');
  });
});

describe('formatTime', () => {
  it('converts UTC to Europe/Paris (summer, UTC+2)', () => {
    expect(formatTime('2026-07-13T10:00:00Z')).toBe('12:00');
  });

  it('converts UTC to Europe/Paris (winter, UTC+1)', () => {
    expect(formatTime('2026-01-15T10:00:00Z')).toBe('11:00');
  });
});

describe('parisHour', () => {
  it('returns the local Paris hour for a UTC timestamp', () => {
    expect(parisHour('2026-07-13T10:00:00Z')).toBe(12);
  });

  it('rolls over midnight correctly', () => {
    // 23:30 UTC in summer is 01:30 the next day in Paris.
    expect(parisHour('2026-07-12T23:30:00Z')).toBe(1);
    // 23:30 UTC in winter is 00:30 the next day in Paris.
    expect(parisHour('2026-01-15T23:30:00Z')).toBe(0);
  });
});

describe('parisWeekKey', () => {
  it('computes the ISO week of the Paris-local date', () => {
    // 2026-07-13 is a Monday, ISO week 29.
    expect(parisWeekKey('2026-07-13T12:00:00Z')).toBe('2026-S29');
  });

  it('uses the Paris date, not the UTC date, at day boundaries', () => {
    // Sunday 2026-07-12 23:30 UTC is already Monday 13th in Paris → week 29.
    expect(parisWeekKey('2026-07-12T23:30:00Z')).toBe('2026-S29');
    // Sunday 2026-07-12 at noon UTC stays in week 28.
    expect(parisWeekKey('2026-07-12T12:00:00Z')).toBe('2026-S28');
  });

  it('zero-pads single-digit weeks', () => {
    expect(parisWeekKey('2026-01-07T12:00:00Z')).toBe('2026-S02');
  });
});

describe('secondsSince', () => {
  it('measures elapsed seconds against an explicit now', () => {
    const startedAt = '2026-07-13T10:00:00Z';
    const now = new Date('2026-07-13T10:01:30Z').getTime();
    expect(secondsSince(startedAt, now)).toBe(90);
  });
});

describe('episodeDurationSeconds', () => {
  it('returns the episode length in seconds', () => {
    expect(episodeDurationSeconds('2026-07-13T10:00:00Z', '2026-07-13T10:00:42Z')).toBe(42);
  });

  it('clamps inverted ranges to zero', () => {
    expect(episodeDurationSeconds('2026-07-13T10:01:00Z', '2026-07-13T10:00:00Z')).toBe(0);
  });
});

describe('KIND_LABELS', () => {
  it('covers every episode kind', () => {
    expect(KIND_LABELS.bark).toBeTruthy();
    expect(KIND_LABELS.howl).toBeTruthy();
    expect(KIND_LABELS.whine).toBeTruthy();
  });
});
