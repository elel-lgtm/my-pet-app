import { ICONS } from '@/components/ui';

describe('icon registry', () => {
  it('gives every icon a rendering on both platforms', () => {
    for (const [name, mapping] of Object.entries(ICONS)) {
      expect({ name, sf: typeof mapping.sf, material: typeof mapping.material }).toEqual({
        name,
        sf: 'string',
        material: 'string',
      });
    }
  });

  it('covers every tab in the owner navigation', () => {
    // The tab layout cannot reference an icon that is not registered; this fails loudly if one
    // is renamed out from under it.
    for (const tabIcon of ['home', 'pets', 'map', 'alerts', 'settings'] as const) {
      expect(ICONS[tabIcon]).toBeDefined();
    }
  });
});
