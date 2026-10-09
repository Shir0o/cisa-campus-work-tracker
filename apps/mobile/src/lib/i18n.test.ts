import { translate, getDictionary } from './i18n';
import * as fs from 'fs';
import * as path from 'path';

function collectMobileKeys(root: string): string[] {
  const keys = new Set<string>();
  const pattern = /\bt\(\s*(['"`])((?:mobile)\.[A-Za-z0-9_.]+)\1/g;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        const text = fs.readFileSync(p, 'utf8');
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(text)) !== null) keys.add(m[2]);
      }
    }
  };
  walk(root);
  return [...keys];
}

function resolves(dict: unknown, key: string): boolean {
  let cur: any = dict;
  for (const segment of key.split('.')) {
    if (cur && typeof cur === 'object' && segment in cur) cur = cur[segment];
    else return false;
  }
  return typeof cur === 'string';
}

describe('mobile i18n', () => {
  it('resolves nested keys in English', () => {
    expect(translate('mobile.nav.today', 'en')).toBe('Today');
    expect(translate('actions.cancel', 'en')).toBe('Cancel');
  });

  it('resolves nested keys in Spanish', () => {
    expect(translate('mobile.nav.today', 'es')).toBe('Hoy');
    expect(translate('actions.cancel', 'es')).toBe('Cancelar');
  });

  it('falls back to English when a Spanish key is missing', () => {
    expect(translate('mobile.nav.today', 'es')).not.toBe('mobile.nav.today');
    expect(translate('definitely.missing.key', 'es')).toBe('definitely.missing.key');
  });

  it('falls back to the supplied fallback before returning the key', () => {
    expect(translate('missing.key', 'en', 'Fallback')).toBe('Fallback');
  });

  it('has a dictionary entry for every t(\'mobile.…\') key used in the app (#1415)', () => {
    const usedKeys = collectMobileKeys(path.resolve(__dirname, '..'));
    expect(usedKeys.length).toBeGreaterThan(0);

    const en = getDictionary('en');
    const es = getDictionary('es');
    const missingEn = usedKeys.filter((key) => !resolves(en, key)).sort();
    const missingEs = usedKeys.filter((key) => !resolves(es, key)).sort();

    expect({ missingEn, missingEs }).toEqual({ missingEn: [], missingEs: [] });
  });

  it('keeps English and Spanish dictionaries at parity for mobile keys', () => {
    const en = getDictionary('en');
    const es = getDictionary('es');
    const enMobile = (en as any).mobile ?? {};
    const esMobile = (es as any).mobile ?? {};
    expect(Object.keys(enMobile).sort()).toEqual(Object.keys(esMobile).sort());
  });
});
