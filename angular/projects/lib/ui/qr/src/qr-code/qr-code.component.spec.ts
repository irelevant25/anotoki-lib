import { TestBed } from '@angular/core/testing';
import { draw, kitProviders, settle } from '../../../src/testing';
import { encodeQr } from '../qr-encoder';
import { QrCodeComponent } from './qr-code.component';

const URI = 'otpauth://totp/anotoki:mira%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=anotoki';

describe('<anotoki-qr-code> and encodeQr()', () => {
  it('encodes a two-factor URI into a square symbol with its finder patterns', () => {
    const modules = encodeQr(URI);
    const size = modules.length;
    expect(modules.every((row) => row.length === size)).toBe(true);
    expect((size - 17) % 4).toBe(0);
    // The top-left finder: a dark 7x7 ring around a light ring around a dark 3x3 core.
    expect(modules[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(modules[1].slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(modules[3].slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
  });

  it('refuses what is too long for the versions it knows', () => {
    expect(() => encodeQr('x'.repeat(400))).toThrow();
  });

  it('draws dark runs on white with its quiet zone, named in the page language; nothing for a value too long', async () => {
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language: () => 'sk' })) });
    const fixture = await draw(QrCodeComponent, { value: URI });
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    const size = encodeQr(URI).length + 8;
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('QR kód');
    expect(svg.querySelectorAll('g rect').length).toBeGreaterThan(50);
    expect(svg.querySelector('g rect')?.getAttribute('x')).toBe('4');

    fixture.componentRef.setInput('label', 'The code for your app');
    fixture.componentRef.setInput('value', 'y'.repeat(400));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
    fixture.nativeElement.remove();
  });
});
