import { octaveBoundaries, octaveCount, octaveX, volumeFraction } from '../timeline';

const MIN = 60_000;

describe('octaveX', () => {
  const W = 300;

  it('ancre le présent au bord droit', () => {
    expect(octaveX(0, 64 * MIN, W)).toBe(W);
  });

  it('place la dernière minute sur la moitié droite (linéaire)', () => {
    expect(octaveX(MIN, 64 * MIN, W)).toBe(W / 2);
    expect(octaveX(30_000, 64 * MIN, W)).toBe(W - W / 4);
  });

  it('donne une bande égale à chaque octave dans la moitié gauche', () => {
    const span = 64 * MIN; // 6 octaves
    const half = W / 2;
    const band = half / 6;
    expect(octaveX(2 * MIN, span, W)).toBeCloseTo(half - band);
    expect(octaveX(4 * MIN, span, W)).toBeCloseTo(half - 2 * band);
    expect(octaveX(8 * MIN, span, W)).toBeCloseTo(half - 3 * band);
    expect(octaveX(64 * MIN, span, W)).toBeCloseTo(0);
  });

  it('reste monotone : plus vieux = plus à gauche', () => {
    const span = 90 * MIN;
    let prev = Infinity;
    for (const age of [0, 5_000, MIN, 3 * MIN, 10 * MIN, 45 * MIN, 90 * MIN]) {
      const x = octaveX(age, span, W);
      expect(x).toBeLessThanOrEqual(prev);
      prev = x;
    }
  });

  it('retombe sur du linéaire pour les sessions courtes (≤ 2 min)', () => {
    expect(octaveX(30_000, 2 * MIN, W)).toBe(W - W / 4);
    expect(octaveX(2 * MIN, 2 * MIN, W)).toBe(0);
  });

  it('borne les âges hors plage', () => {
    expect(octaveX(-5_000, 64 * MIN, W)).toBe(W);
    expect(octaveX(120 * MIN, 64 * MIN, W)).toBe(0);
  });
});

describe('octaveCount / octaveBoundaries', () => {
  it('compte les octaves nécessaires', () => {
    expect(octaveCount(MIN)).toBe(1);
    expect(octaveCount(64 * MIN)).toBe(6);
    expect(octaveCount(240 * MIN)).toBe(8);
  });

  it('liste les frontières 1, 2, 4… min sous la durée', () => {
    expect(octaveBoundaries(10 * MIN)).toEqual([MIN, 2 * MIN, 4 * MIN, 8 * MIN]);
    expect(octaveBoundaries(90_000)).toEqual([]);
  });
});

describe('volumeFraction', () => {
  it('grimpe avec le volume, bornée à 0.18..1', () => {
    expect(volumeFraction(0.003)).toBeCloseTo(0.18);
    expect(volumeFraction(0.08)).toBe(1);
    expect(volumeFraction(0.75)).toBe(1);
    expect(volumeFraction(0.0005)).toBeCloseTo(0.18);
    const low = volumeFraction(0.01);
    const high = volumeFraction(0.04);
    expect(high).toBeGreaterThan(low);
  });

  it('valeur médiane sans mesure (épisode manuel)', () => {
    expect(volumeFraction(null)).toBe(0.55);
    expect(volumeFraction(undefined)).toBe(0.55);
  });
});
