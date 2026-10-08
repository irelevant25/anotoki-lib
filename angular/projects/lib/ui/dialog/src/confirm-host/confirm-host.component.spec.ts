import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, press, settle, words } from '../../../src/testing';
import { ConfirmService } from '../confirm.service';
import { ConfirmHostComponent } from './confirm-host.component';

describe('ConfirmService and <anotoki-confirm-host>: "Are you sure?"', () => {
  let confirm: ConfirmService;
  let host: HTMLElement;
  let fixture: Awaited<ReturnType<typeof draw<ConfirmHostComponent>>>;

  async function setUp(language = 'en'): Promise<void> {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => language })) });
    confirm = TestBed.inject(ConfirmService);
    fixture = await draw(ConfirmHostComponent);
    host = fixture.nativeElement;
  }

  afterEach(() => host.remove());

  const answer = (which: 'yes' | 'no') => host.querySelector<HTMLButtonElement>(`[data-answer=${which}]`)!;

  it('asks in a small dialog, the focus on the no; yes answers true', async () => {
    await setUp();
    const asked = confirm.ask({ title: 'Delete the survey?', message: 'Its answers go with it.', confirmLabel: 'Delete', tone: 'danger' });
    await settle(fixture);
    expect(host.querySelector('dialog')?.getAttribute('data-size')).toBe('sm');
    expect(words(host.querySelector('h2'))).toBe('Delete the survey?');
    expect(words(host.querySelector('.message'))).toBe('Its answers go with it.');
    expect(document.activeElement).toBe(answer('no'));
    expect(words(answer('no'))).toBe('Cancel');
    expect(words(answer('yes'))).toBe('Delete');
    expect(answer('yes').classList).toContain('is-danger');

    answer('yes').click();
    expect(await asked).toBe(true);
    await settle(fixture);
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('no, Escape - and a second question - answer false', async () => {
    await setUp();
    const first = confirm.ask({ title: 'One?' });
    await settle(fixture);
    const second = confirm.ask({ title: 'Two?' });
    expect(await first).toBe(false);
    await settle(fixture);
    expect(words(host.querySelector('h2'))).toBe('Two?');
    press(answer('no'), 'Escape');
    expect(await second).toBe(false);

    const third = confirm.ask({ title: 'Three?' });
    await settle(fixture);
    expect(answer('yes').classList).toContain('is-primary');
    answer('no').click();
    expect(await third).toBe(false);
  });

  it('words its buttons in the page language when the question does not', async () => {
    await setUp('sk');
    void confirm.ask({ title: 'Odhlásiť sa?' });
    await settle(fixture);
    expect(words(answer('no'))).toBe('Zrušiť');
    expect(words(answer('yes'))).toBe('Potvrdiť');
    confirm.settle(false);
  });
});
