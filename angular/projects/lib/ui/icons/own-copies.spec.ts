import { registerAdminIcons } from '@anotoki/lib/admin/parts';
import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import * as family from '@anotoki/lib/ui/icons';
import { registerPageIcons as registerPeopleIcons } from '../../people/page/src/icons';
import { registerPageIcons as registerTranslationsIcons } from '../../translations/admin/src/icons';

/**
 * The lazy pages carry their own copies of the family's icons they draw - the admin tools' pages, the People page, the
 * translations admin pages - never an import of @anotoki/lib/ui/icons, which a site may load up front for its own:
 * one file is one chunk, and the pages' icons would sit in its first load. The copies stay the family's drawings.
 */
describe("the lazy pages' own icons: the family's, path for path", () => {
  const registered = (register: (icons: AnotokiIcons) => void): IconSet => {
    const set: IconSet = {};
    register({ has: () => false, register: (more: IconSet) => Object.assign(set, more) } as unknown as AnotokiIcons);
    return set;
  };
  const familyIcon = (name: string): IconPaths | undefined => (family as Record<string, IconPaths>)[`icon${name[0].toUpperCase()}${name.slice(1)}`];

  for (const [pages, register, copies] of [
    ['the admin tools', registerAdminIcons, 18],
    ['the People page', registerPeopleIcons, 1],
    ['the translations admin', registerTranslationsIcons, 7],
  ] as const) {
    it(`${pages}: each icon of the family's set drawn as the set draws it`, () => {
      const set = registered(register);
      const ofTheFamily = Object.keys(set).filter((name) => familyIcon(name) !== undefined);
      expect(ofTheFamily.length).toBe(copies);
      for (const name of ofTheFamily) {
        expect(set[name], name).toEqual(familyIcon(name));
      }
    });
  }
});
