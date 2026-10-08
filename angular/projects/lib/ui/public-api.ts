/*
 * @anotoki/lib/ui - the core of the anotoki family's UI kit: configuration and
 * words, icons, buttons, spinner, badge, alert, card, empty and error states,
 * page header, avatar, segmented choice, autofocus, and the DOM helpers - and
 * the library's own words (every `anotoki.*` key, English and Slovak), which
 * the kit, the migrations module and the translations module read.
 *
 * Small and eager (the shell uses it); the rest of the kit is in entry points
 * of its own - @anotoki/lib/ui/menu, /dialog, /toast, /forms, /tabs,
 * /pagination, /drawer, /tooltip, /copy, /qr, /icons - so what only a lazy
 * page uses stays out of a site's first load.
 */

export type { AnotokiUiConfig, IconPaths, IconSet } from './src/config';
export { ANOTOKI_ICONS, ANOTOKI_UI_CONFIG, provideAnotokiUi } from './src/config';
export type { LibraryKey } from './src/library-words';
export { LIBRARY_WORDS } from './src/library-words';
export type { AnotokiWordKey, AnotokiWordTable } from './src/words';
export { ANOTOKI_WORD_KEYS, BUILT_IN_WORDS } from './src/words';
export type { WordParams } from './src/anotoki-words.service';
export { AnotokiWords, fillWords } from './src/anotoki-words.service';
export type { KitIconName } from './src/icons';
export { AnotokiIcons, KIT_ICONS, circle, rect } from './src/icons';
export { isShown, keepOnScreen, mediaQuery, tabbable, uniqueId } from './src/dom';

export { IconComponent } from './src/icon/icon.component';
export type { ButtonSize, ButtonVariant } from './src/button/button.component';
export { ButtonComponent } from './src/button/button.component';
export { SpinnerComponent } from './src/spinner/spinner.component';
export type { BadgeTone } from './src/badge/badge.component';
export { BadgeComponent } from './src/badge/badge.component';
export type { AlertTone } from './src/alert/alert.component';
export { AlertComponent } from './src/alert/alert.component';
export { CardComponent } from './src/card/card.component';
export { EmptyStateComponent } from './src/empty-state/empty-state.component';
export { ErrorStateComponent } from './src/error-state/error-state.component';
export { PageHeaderComponent } from './src/page-header/page-header.component';
export { AvatarComponent, initialsOf } from './src/avatar/avatar.component';
export type { SegmentedOption } from './src/segmented/segmented.component';
export { SegmentedComponent } from './src/segmented/segmented.component';
export { AutofocusDirective } from './src/autofocus.directive';
