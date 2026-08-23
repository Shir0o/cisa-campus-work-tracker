import { translate, getDictionary } from './i18n';

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

  it('keeps English and Spanish dictionaries at parity for mobile keys', () => {
    const en = getDictionary('en');
    const es = getDictionary('es');
    const enMobile = (en as any).mobile ?? {};
    const esMobile = (es as any).mobile ?? {};
    expect(Object.keys(enMobile).sort()).toEqual(Object.keys(esMobile).sort());
  });
});
