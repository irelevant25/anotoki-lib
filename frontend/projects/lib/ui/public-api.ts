/*
 * @anotoki/lib/ui - the core of the anotoki family's UI kit: configuration and
 * words, icons, buttons, spinner, badge, alert, card, empty and error states,
 * page header, avatar, segmented choice, autofocus, and the DOM helpers - and
 * the library's words of the kit's namespaces (`anotoki.language|ui|topbar|
 * theme.*`, English and Slovak). Every module's words are @anotoki/lib/words.
 *
 * Re-exports only: each piece is an entry point of its own (@anotoki/lib/ui/button,
 * /spinner, /config, ...), because a site's build places whole files - a whole
 * entry point - in a chunk. With the core in one file, a first page using the
 * button (the status page does) took every piece any lazy page used into the
 * first load; one file per piece, it takes only what it uses. Nothing here may
 * hold code of its own (scripts/check-package.mjs says so), and nothing in a
 * piece imports from here.
 *
 * The rest of the kit is in entry points that are not re-exported -
 * @anotoki/lib/ui/menu, /dialog, /toast, /forms, /tabs, /pagination, /drawer,
 * /tooltip, /copy, /qr, /icons.
 */

export type { AnotokiUiConfig, AnotokiWordKey, AnotokiWordTable, IconPaths, IconSet, KitLibraryKey, LibraryKey, ModuleLibraryWords, WordParams } from '@anotoki/lib/ui/config';
export {
  ANOTOKI_ICONS,
  ANOTOKI_LIBRARY_WORDS,
  ANOTOKI_UI_CONFIG,
  ANOTOKI_WORD_KEYS,
  AnotokiWords,
  BUILT_IN_WORDS,
  KIT_LIBRARY_WORDS,
  fillWords,
  provideAnotokiUi,
  provideLibraryWords,
} from '@anotoki/lib/ui/config';
export type { KitIconName } from '@anotoki/lib/ui/icon';
export { AnotokiIcons, IconComponent, KIT_ICONS, circle, rect } from '@anotoki/lib/ui/icon';
export { isShown, keepOnScreen, mediaQuery, tabbable, uniqueId } from '@anotoki/lib/ui/dom';

export type { ButtonSize, ButtonVariant } from '@anotoki/lib/ui/button';
export { ButtonComponent } from '@anotoki/lib/ui/button';
export { SpinnerComponent } from '@anotoki/lib/ui/spinner';
export type { BadgeTone } from '@anotoki/lib/ui/badge';
export { BadgeComponent } from '@anotoki/lib/ui/badge';
export type { AlertTone } from '@anotoki/lib/ui/alert';
export { AlertComponent } from '@anotoki/lib/ui/alert';
export { CardComponent } from '@anotoki/lib/ui/card';
export { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
export { ErrorStateComponent } from '@anotoki/lib/ui/error-state';
export { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
export { AvatarComponent, initialsOf } from '@anotoki/lib/ui/avatar';
export type { SegmentedOption } from '@anotoki/lib/ui/segmented';
export { SegmentedComponent } from '@anotoki/lib/ui/segmented';
export { AutofocusDirective } from '@anotoki/lib/ui/autofocus';
