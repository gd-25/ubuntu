import {
  computeTransition,
  isUbuntuAlone,
  solitudeTypeOf,
  type Positions,
} from '../house';

const pos = (overrides: Partial<Positions>): Positions => ({
  greg: 'salon',
  fiona: 'salon',
  ubuntu: 'salon',
  ...overrides,
});

describe('solitudeTypeOf', () => {
  it('est `away` quand les deux humains sont dehors', () => {
    expect(solitudeTypeOf(pos({ greg: 'dehors', fiona: 'dehors' }))).toBe('away');
  });

  it('est `away` quand les deux humains sont sur le palier', () => {
    expect(solitudeTypeOf(pos({ greg: 'couloir_ext', fiona: 'couloir_ext' }))).toBe('away');
  });

  it('est `away` avec un humain dehors et un sur le palier', () => {
    expect(solitudeTypeOf(pos({ greg: 'dehors', fiona: 'couloir_ext' }))).toBe('away');
  });

  it('est `in_home` (semi-seul) quand un humain reste dans une autre pièce', () => {
    expect(solitudeTypeOf(pos({ greg: 'dehors', fiona: 'bureau' }))).toBe('in_home');
    expect(solitudeTypeOf(pos({ greg: 'chambre', fiona: 'bureau' }))).toBe('in_home');
  });
});

describe('isUbuntuAlone', () => {
  it('est seul quand aucun humain ne partage sa pièce', () => {
    expect(isUbuntuAlone(pos({ greg: 'bureau', fiona: 'dehors' }))).toBe(true);
  });

  it("n'est pas seul quand un humain est dans la même pièce", () => {
    expect(isUbuntuAlone(pos({ greg: 'salon', fiona: 'dehors' }))).toBe(false);
  });

  it("n'est jamais seul en balade (dehors)", () => {
    expect(isUbuntuAlone(pos({ ubuntu: 'dehors', greg: 'bureau', fiona: 'bureau' }))).toBe(false);
  });
});

describe('computeTransition', () => {
  it('détecte le début de solitude avec le bon type', () => {
    const prev = pos({});
    const next = pos({ greg: 'couloir_ext', fiona: 'couloir_ext' });
    const t = computeTransition(prev, next);
    expect(t.aloneStarted).toBe(true);
    expect(t.solitudeType).toBe('away');
  });

  it('détecte le passage en semi-seul quand les humains changent de pièce', () => {
    const prev = pos({});
    const next = pos({ greg: 'chambre', fiona: 'bureau' });
    const t = computeTransition(prev, next);
    expect(t.aloneStarted).toBe(true);
    expect(t.solitudeType).toBe('in_home');
  });

  it('détecte la fin de solitude quand un humain revient', () => {
    const prev = pos({ greg: 'dehors', fiona: 'dehors' });
    const next = pos({ greg: 'salon', fiona: 'dehors' });
    const t = computeTransition(prev, next);
    expect(t.aloneEnded).toBe(true);
  });
});
