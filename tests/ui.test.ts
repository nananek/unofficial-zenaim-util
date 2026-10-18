// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Headless integration test for the configurator UI. It drives the real
 * `config-app` module against the in-memory mock device (demo mode), so it
 * covers the connection flow, the tab rendering and the write sequences
 * without needing a browser or hardware.
 */

async function waitFor<T>(probe: () => T | null | undefined, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the UI');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function button(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!match) throw new Error(`no button labelled "${text}"`);
  return match as HTMLButtonElement;
}

function buttonContaining(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text),
  );
  if (!match) throw new Error(`no button containing "${text}"`);
  return match as HTMLButtonElement;
}

describe('configurator UI (demo mode)', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.setItem('zenaim.lang', 'en');
    document.body.innerHTML = '<div id="config-root"></div><div id="overlay-slot"></div>';
    vi.stubGlobal('confirm', () => true);
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
    await import('../src/scripts/config-app');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the connection tab and lists all tabs', () => {
    const tabs = [...document.querySelectorAll('#config-root .tabs button')].map((b) => b.textContent);
    expect(tabs).toEqual(['Connection', 'Actuation', 'Lighting', 'Backup']);
    expect(button('Select a device')).toBeTruthy();
  });

  it('connects in demo mode and shows the device information', async () => {
    button('Try demo mode').click();
    const info = await waitFor(() => document.querySelector('#device-info'));
    const text = info.textContent ?? '';
    expect(text).toContain('KB007-DGBK');
    expect(text).toContain('1.2.5');
    expect(text).toContain('108');
  });

  it('loads actuation points and renders one named cell per key', async () => {
    button('Try demo mode').click();
    await waitFor(() => document.querySelector('#device-info'));

    button('Actuation').click();
    button('Load').click();

    const cells = await waitFor(() => {
      const found = document.querySelectorAll('.key-grid .key-cell');
      return found.length === 108 ? found : null;
    });
    expect(cells).toHaveLength(108);

    // ZK1 80US cells show key names; positions without a key keep the #NN label.
    expect((cells[0] as HTMLButtonElement).textContent).toBe('Esc');
    expect((cells[0] as HTMLButtonElement).getAttribute('aria-label')).toContain('Esc');
    expect((cells[0] as HTMLButtonElement).getAttribute('aria-label')).toContain('R1 C1');
    expect((cells[31] as HTMLButtonElement).textContent).toBe('#32');
    expect((cells[96] as HTMLButtonElement).textContent).toBe('Space');
    expect((cells[30] as HTMLButtonElement).textContent).toBe('=');
    expect((cells[66] as HTMLButtonElement).textContent).toBe("'");
    const footnote = document.querySelector('.keymap-footnote')?.textContent;
    expect(footnote).toContain('ZK1 80US');
    expect(footnote).toContain('remapping');

    // The selected-key card pairs the key name with the matrix position.
    document.querySelector<HTMLButtonElement>('.key-cell[data-index="0"]')!.click();
    const card = document.querySelector('.selected-key-card')!;
    expect(card.querySelector('strong')?.textContent).toBe('Esc');
    expect(card.querySelector('.muted')?.textContent).toContain('Matrix R1 · C1');

    // Editing a key updates the selected cell only (no full re-render).
    document.querySelector<HTMLButtonElement>('.key-cell[data-index="5"]')!.click();
    const range = document.querySelector<HTMLInputElement>('.field input[type="range"]')!;
    range.value = '900';
    range.dispatchEvent(new Event('input'));
    const selected = document.querySelector('.key-cell.is-selected');
    expect(selected?.getAttribute('title')).toContain('F5');
    expect(selected?.getAttribute('title')).toContain('900');
  });

  it('writes actuation points and reports a successful verify', async () => {
    button('Try demo mode').click();
    await waitFor(() => document.querySelector('#device-info'));
    button('Actuation').click();
    button('Load').click();
    await waitFor(() => (document.querySelectorAll('.key-cell').length === 108 ? true : null));

    buttonContaining('Write (AllSet').click();
    const notice = await waitFor(() => {
      const element = document.querySelector('#config-root .notice.ok');
      return element?.textContent ? element : null;
    });
    expect(notice.textContent).toContain('read-back matched');
  });

  it('renders the lighting panel with five indicator colour pickers', async () => {
    button('Try demo mode').click();
    await waitFor(() => document.querySelector('#device-info'));
    button('Lighting').click();
    button('Load').click();
    const colors = await waitFor(() => {
      const found = document.querySelectorAll('input[type="color"]');
      return found.length === 5 ? found : null;
    });
    expect(colors).toHaveLength(5);
    const mode = await waitFor(() => document.querySelector<HTMLSelectElement>('.field select'));
    expect(mode.options.length).toBe(7); // MONO..REACTIVE
  });

  it('creates a backup from the backup tab', async () => {
    button('Try demo mode').click();
    await waitFor(() => document.querySelector('#device-info'));
    button('Backup').click();
    button('Download backup').click();
    const notice = await waitFor(() => document.querySelector('#config-root .notice.ok'));
    expect(notice.textContent).toContain('Done');
  });

  it('asks for a connection before showing device tabs', () => {
    button('Actuation').click();
    expect(document.querySelector('#config-root .notice')?.textContent).toContain('Connect a device first');
  });
});
