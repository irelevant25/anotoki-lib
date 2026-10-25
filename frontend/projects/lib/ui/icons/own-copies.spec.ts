import { registerAdminIcons } from '@anotoki/lib/admin/parts';
import { IconPaths, IconSet } from '@anotoki/lib/ui/config';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import * as family from '@anotoki/lib/ui/icons';
import { registerPageIcons as registerPeopleIcons } from '../../people/page/src/icons';
import { registerPageIcons as registerTranslationsIcons } from '../../translations/admin/src/icons';
import { registerAudioPlayerIcons } from '../audio-player/src/icons';
import { registerDateFieldIcons } from '../date-field/src/icons';
import { registerFilePickerIcons } from '../file-picker/src/icons';
import { registerHtmlEditorIcons } from '../html-editor/src/icons';
import { registerRichTextIcons } from '../rich-text/src/icons';

/**
 * The lazy pages carry their own copies of the family's icons they draw - the admin tools' pages, the People page, the
 * translations admin pages, and the kit's pieces of 0.6.0 that draw some (the date field's calendar, the file picker's,
 * the rich-text toolbar's) - never an import of @anotoki/lib/ui/icons, which a site may load up front for its own: one
 * file is one chunk, and the pages' icons would sit in its first load. The copies stay the family's drawings.
 */
describe("the lazy pages' own icons: the family's, path for path", () => {
  const registered = (register: (icons: AnotokiIcons) => void): IconSet => {
    const set: IconSet = {};
    register({ has: () => false, register: (more: IconSet) => Object.assign(set, more) } as unknown as AnotokiIcons);
    return set;
  };
  const familyIcon = (name: string): IconPaths | undefined => (family as Record<string, IconPaths>)[`icon${name[0].toUpperCase()}${name.slice(1)}`];

  // The admin tools' 19 since 0.6.0: their upload is the family's iconUpload now, drawn the same.
  for (const [pages, register, copies] of [
    ['the admin tools', registerAdminIcons, 19],
    ['the People page', registerPeopleIcons, 1],
    ['the translations admin', registerTranslationsIcons, 7],
    ['the date field', registerDateFieldIcons, 1],
    ['the file picker', registerFilePickerIcons, 2],
    // Every one of the toolbar's twelve, indent and outdent among them (the family's since 0.6.0).
    ['the rich-text toolbar', registerRichTextIcons, 12],
    // 0.11.0: the audio player's play, pause and stop; the HTML editor's highlighter (its source's brackets are its own).
    ['the audio player', registerAudioPlayerIcons, 3],
    ['the HTML editor', registerHtmlEditorIcons, 1],
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

describe("the family's set (0.6.0): the build analyzer's own icons, drawn as the others are", () => {
  it('rocket, upload, lightbulb, pause, minus, wrench, gamepad and save: paths on the 24-unit grid, data alone', () => {
    const icons = family as Record<string, IconPaths>;
    for (const name of ['iconRocket', 'iconUpload', 'iconLightbulb', 'iconPause', 'iconMinus', 'iconWrench', 'iconGamepad', 'iconSave']) {
      const paths = icons[name];
      expect(Array.isArray(paths) && paths.length > 0, name).toBe(true);
      for (const d of paths) {
        expect(d, name).toMatch(/^M[0-9.]/);
        // On the grid: the first number after every absolute move or line (M, H, V, L) within 0..24.
        const numbers = [...d.matchAll(/[MHVL]\s*(-?[0-9.]+)/g)].map((match) => Number(match[1]));
        expect(
          numbers.every((n) => n >= 0 && n <= 24),
          `${name}: ${d}`,
        ).toBe(true);
      }
    }
  });
});
