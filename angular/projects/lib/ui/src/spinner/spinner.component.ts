import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { AnotokiWords } from '../anotoki-words.service';

const SIZES = { sm: 16, md: 24, lg: 36 } as const;

/**
 * A spinner, with something to say or none.
 *
 * With a `label` it is a `role="status"` region, so "Loading…" is announced
 * when it appears; a bare `label` attribute says the kit's own "Loading…" in
 * the page's language. Without one it is decoration - inside a busy button,
 * whose own aria-busy already says it.
 *
 * `delay` (ms) keeps it out of sight that long: an answer that comes quickly
 * never makes the page flicker.
 *
 * Under reduced motion it keeps turning, slowly: a loading indicator that does
 * not move reads as a page that has frozen.
 */
@Component({
  selector: 'anotoki-spinner',
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-spinner', '[class.is-inline]': 'inline()' },
})
export class SpinnerComponent implements OnInit {
  private readonly words = inject(AnotokiWords);
  private readonly destroyRef = inject(DestroyRef);

  readonly size = input<keyof typeof SIZES>('md');
  /** What it says: a string, '' (a bare attribute) for the kit's "Loading…", null for nothing. */
  readonly label = input<string | null>(null);
  readonly showLabel = input(false);
  /** In a line of text: it sits on the text's middle. */
  readonly inline = input(false);
  /** Milliseconds before it shows. */
  readonly delay = input(0);

  protected readonly px = computed(() => SIZES[this.size()]);
  protected readonly said = computed(() => {
    const label = this.label();
    if (label === null || label === undefined) {
      return null;
    }
    return label === '' ? this.words.t('ui.loading') : label;
  });
  /** The kit's own word, when it is not in the page's language. */
  protected readonly lang = computed(() => (this.label() === '' ? this.words.foreignLang() : null));

  private readonly elapsed = signal(false);
  protected readonly shown = computed(() => this.delay() <= 0 || this.elapsed());

  ngOnInit(): void {
    // The delay is about this appearance: read once, when the spinner comes.
    const delay = this.delay();
    if (delay > 0) {
      const timer = setTimeout(() => this.elapsed.set(true), delay);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    }
  }
}
