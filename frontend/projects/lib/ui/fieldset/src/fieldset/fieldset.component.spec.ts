import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle, words } from '../../../src/testing';
import { FieldsetComponent } from './fieldset.component';

@Component({
  selector: 'anotoki-test-fieldsets',
  imports: [FieldsetComponent],
  template: `
    <anotoki-fieldset id="stats" legend="Base stats" [columns]="columns()" hint="At level 90" [plain]="plain()">
      <label>HP <input /></label>
      <label>ATK <input /></label>
    </anotoki-fieldset>
    <anotoki-fieldset id="quiet" legend="Hidden name" hideLegend><input aria-label="x" /></anotoki-fieldset>
  `,
})
class FieldsetsPageComponent {
  readonly columns = signal(3);
  readonly plain = signal(false);
}

describe('<anotoki-fieldset>: fields under one name, in columns', () => {
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<FieldsetsPageComponent>>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    fixture = await draw(FieldsetsPageComponent);
    host = fixture.nativeElement;
  });

  afterEach(() => host.remove());

  const set = (id = 'stats') => host.querySelector<HTMLElement>(`#${id}`)!;

  it('a real fieldset named by its legend, its hint tied to it, the fields inside', () => {
    const fieldset = set().querySelector('fieldset')!;
    expect(words(fieldset.querySelector('legend'))).toBe('Base stats');
    expect(words(document.getElementById(fieldset.getAttribute('aria-describedby')!))).toBe('At level 90');
    expect(fieldset.querySelectorAll('.anotoki-fieldset__fields input').length).toBe(2);
    expect(set('quiet').querySelector('legend')?.classList).toContain('anotoki-visually-hidden');
    expect(set('quiet').querySelector('fieldset')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('its columns and its box are the page’s to set', async () => {
    expect(set().style.getPropertyValue('--_fieldset-columns')).toBe('3');
    expect(set().classList).not.toContain('anotoki-fieldset--plain');
    fixture.componentInstance.columns.set(2);
    fixture.componentInstance.plain.set(true);
    await settle(fixture);
    expect(set().style.getPropertyValue('--_fieldset-columns')).toBe('2');
    expect(set().classList).toContain('anotoki-fieldset--plain');
  });
});
