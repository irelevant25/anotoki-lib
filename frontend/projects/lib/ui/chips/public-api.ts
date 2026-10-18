/*
 * @anotoki/lib/ui/chips - chips: button[anotokiChip] (a small round-ended button, a toggle or a step in its state),
 * <anotoki-chip-group> (choice chips: one choice - a radio group - or several - toggles -, a field of the kit's) and
 * <anotoki-chip-list> (the things a person chose or added, each with a button that takes it away). Its words
 * (`anotoki.chips.*`) are @anotoki/lib/words/chips, read by the chips themselves.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export type { ChipTone } from './src/chip/chip.component';
export { ChipComponent } from './src/chip/chip.component';
export type { ChipOption } from './src/chip-group/chip-group.component';
export { ChipGroupComponent } from './src/chip-group/chip-group.component';
export type { ChipItem } from './src/chip-list/chip-list.component';
export { ChipListComponent } from './src/chip-list/chip-list.component';
