import {
  computeTransition,
  departureTypeOf,
  isOnUbuntuMat,
  isUbuntuAlone,
  MAGNET_SPOTS,
  solitudeTypeOf,
  spaceAt,
  UBUNTU_MAT_SPOT,
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

describe('departureTypeOf', () => {
  it('est `duo` quand les deux humains sont partis', () => {
    expect(departureTypeOf(pos({ greg: 'dehors', fiona: 'couloir_ext' }))).toBe('duo');
  });

  it('est `solo_greg` quand seul Greg est parti', () => {
    expect(departureTypeOf(pos({ greg: 'dehors', fiona: 'bureau' }))).toBe('solo_greg');
  });

  it('est `solo_fiona` quand seule Fiona est partie', () => {
    expect(departureTypeOf(pos({ greg: 'salon', fiona: 'couloir_ext' }))).toBe('solo_fiona');
  });

  it('retombe sur `duo` pour un départ semi-seul depuis l’intérieur', () => {
    expect(departureTypeOf(pos({ greg: 'bureau', fiona: 'chambre' }))).toBe('duo');
  });
});

describe('points aimantés (MAGNET_SPOTS)', () => {
  it('chaque pièce intérieure garde au moins un point', () => {
    const spaces = new Set(MAGNET_SPOTS.map((s) => spaceAt(s.x, s.y)));
    for (const space of ['bureau', 'chambre', 'salon', 'sdb', 'wc', 'couloir_int', 'balcon']) {
      expect(spaces).toContain(space);
    }
  });

  it('le centre du tapis d’Ubuntu est un point aimanté', () => {
    expect(
      MAGNET_SPOTS.some((s) => s.x === UBUNTU_MAT_SPOT.x && s.y === UBUNTU_MAT_SPOT.y)
    ).toBe(true);
  });

  it('la grille est espacée : nettement moins de points que de cases', () => {
    expect(MAGNET_SPOTS.length).toBeLessThan(70);
  });
});

describe('isOnUbuntuMat', () => {
  it('reconnaît le point du tapis (et lui seul)', () => {
    expect(isOnUbuntuMat(UBUNTU_MAT_SPOT.x, UBUNTU_MAT_SPOT.y)).toBe(true);
    // La place haute du canapé, juste en dessous, n'est pas le tapis.
    expect(isOnUbuntuMat(330, 552)).toBe(false);
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
