// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('index page (landing)', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.setItem('zenaim.lang', 'en');
    document.body.innerHTML = [
      '<span data-i18n="app.unofficial"></span>',
      '<h1 data-i18n="index.hero.title"></h1>',
      '<a data-i18n="index.cta.open" href="#"></a>',
      '<button id="connect-button" data-i18n="index.cta.connect"></button>',
      '<button id="demo-button" data-i18n="connect.demo"></button>',
      '<p id="connect-status"></p>',
      '<p id="unsupported" hidden></p>',
      '<div id="device-info-slot"></div>',
    ].join('');
    await import('../src/scripts/index-app');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills the static translations on load', () => {
    expect(document.querySelector('h1')?.textContent).toBe('Configure the ZENAIM KEYBOARD from your browser');
    expect(document.querySelector('#connect-button')?.textContent).toBe('Connect keyboard');
    expect(document.querySelector('#demo-button')?.textContent).toBe('Try demo mode');
    expect(document.querySelector('[data-i18n="app.unofficial"]')?.textContent).toBe('Unofficial');
  });

  it('re-fills the static translations on language change', async () => {
    const i18n = await import('../src/lib/ui/i18n');
    i18n.setLang('ja');
    expect(document.querySelector('h1')?.textContent).toBe('ZENAIM KEYBOARD をブラウザから設定');
  });
});
