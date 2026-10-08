import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';

/** "Japanese Academy" -> "JA", "mira" -> "M", "" -> "?": the first letter of the first two words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => [...word][0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * A picture standing for a person or an application - or the initials of its
 * name when there is none, or it does not load (a moved file, an address the
 * site's Content-Security-Policy refuses): never a broken image.
 *
 * Decorative: the name is always written next to it.
 */
@Component({
  selector: 'anotoki-avatar',
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-avatar', '[style.--_avatar-size.px]': 'size()', '[attr.data-shape]': 'shape()' },
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly imageUrl = input<string | null | undefined>(null);
  readonly size = input(40);
  /** `rounded` (an application's square), `circle` (a person). */
  readonly shape = input<'rounded' | 'circle'>('rounded');

  /** The image did not load; a new address is tried again. */
  protected readonly failed = linkedSignal({ source: this.imageUrl, computation: () => false });
  protected readonly initials = computed(() => initialsOf(this.name()));
}
