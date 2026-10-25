import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AnotokiDateOrder } from '@anotoki/lib/ui/config';
import { AnotokiAgoPipe, AnotokiDatePipe } from '@anotoki/lib/ui/dates';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { showcaseDateChoices } from './date-choices';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Dates and "x ago" (0.11.0): moments and a calendar day written by the account's date order and clock - chosen here
 * as an account would (provideAnotokiUi's dateChoices) - or the page language's way; and how long ago or how soon, in
 * the page's language and its plurals (switch the language in the bar).
 */
@Component({
  selector: 'show-dates-demo',
  imports: [AnotokiAgoPipe, AnotokiDatePipe, PageHeaderComponent, SegmentedComponent],
  templateUrl: './dates-demo.component.html',
  styleUrl: './dates-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatesDemoComponent {
  private readonly now = Date.now();

  protected readonly orders: readonly SegmentedOption[] = [
    { value: '', label: 'The language’s' },
    { value: 'dmy_dot', label: '6.10.2026' },
    { value: 'dmy_slash', label: '06/10/2026' },
    { value: 'mdy_slash', label: '10/06/2026' },
    { value: 'ymd_dash', label: '2026-10-06' },
  ];
  protected readonly clocks: readonly SegmentedOption[] = [
    { value: '', label: 'The language’s' },
    { value: '24', label: '24 hours' },
    { value: '12', label: '12 hours' },
  ];
  protected readonly order = signal(showcaseDateChoices()?.date_format ?? '');
  protected readonly clock = signal(showcaseDateChoices()?.time_format ?? '');

  /** Moments around now, and a calendar day. */
  protected readonly moments = [
    { name: '20 seconds ago', value: this.now - 20_000 },
    { name: '1 minute ago', value: this.now - MINUTE - 5_000 },
    { name: '3 minutes ago', value: this.now - 3 * MINUTE },
    { name: '5 hours ago', value: this.now - 5 * HOUR },
    { name: 'A day ago', value: this.now - DAY - HOUR },
    { name: '2 days ago', value: this.now - 2 * DAY },
    { name: '5 days ago', value: this.now - 5 * DAY },
    { name: '10 days ago', value: this.now - 10 * DAY },
    { name: 'In 2 hours', value: this.now + 2 * HOUR + MINUTE },
    { name: 'In 3 days', value: this.now + 3 * DAY },
    { name: 'A calendar day', value: '2026-12-24' },
  ];
  protected readonly longAgo = this.now - 400 * DAY;

  protected setOrder(order: string): void {
    this.order.set(order);
    this.apply();
  }

  protected setClock(clock: string): void {
    this.clock.set(clock);
    this.apply();
  }

  private apply(): void {
    const date_format = (this.order() || null) as AnotokiDateOrder | null;
    const time_format = (this.clock() || null) as '24' | '12' | null;
    showcaseDateChoices.set(date_format || time_format ? { date_format, time_format } : null);
  }
}
