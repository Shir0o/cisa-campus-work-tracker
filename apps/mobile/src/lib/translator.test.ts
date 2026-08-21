import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  translateText,
  translateBatch,
  prefetchTranslations,
  getCachedTranslation,
  setCachedTranslation,
  clearTranslationCache,
  computeTranslationHash,
  subscribeTranslation,
} from './translator';

describe('mobile translator client', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearTranslationCache();
    await AsyncStorage.clear();
  });

  it('computes consistent SHA-256 hashes for strings in mobile environment', () => {
    const hash1 = computeTranslationHash('es', 'Hello mobile');
    const hash2 = computeTranslationHash('es', 'Hello mobile');
    const hash3 = computeTranslationHash('es', '  Hello mobile  ');
    const hashOtherLang = computeTranslationHash('fr', 'Hello mobile');

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
    expect(hash1).not.toBe(hashOtherLang);
    expect(hash1.length).toBe(64);
  });

  it('returns original text immediately when target language is English or text is empty', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const res1 = await translateText('Hello', 'en');
    const res2 = await translateText('   ', 'es');
    const res3 = await translateText('', 'es');

    expect(res1).toBe('Hello');
    expect(res2).toBe('   ');
    expect(res3).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('stores and retrieves translations from in-memory L1 and AsyncStorage L2 cache', () => {
    expect(getCachedTranslation('Prayer on mobile', 'es')).toBeNull();

    setCachedTranslation('Prayer on mobile', 'Oración en el móvil', 'es');

    expect(getCachedTranslation('Prayer on mobile', 'es')).toBe('Oración en el móvil');
  });

  it('batches concurrent translation requests into a single API call', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: 'es',
        translations: [
          { original: 'Mobile 1', translated: 'Móvil 1', hash: 'h1', cached: false },
          { original: 'Mobile 2', translated: 'Móvil 2', hash: 'h2', cached: false },
        ],
      }),
    } as any);

    const [t1, t2] = await Promise.all([
      translateText('Mobile 1', 'es'),
      translateText('Mobile 2', 'es'),
    ]);

    expect(t1).toBe('Móvil 1');
    expect(t2).toBe('Móvil 2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('translateBatch translates multiple texts concurrently', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: 'es',
        translations: [
          { original: 'Bread', translated: 'Pan', hash: 'h1', cached: false },
          { original: 'Water', translated: 'Agua', hash: 'h2', cached: false },
        ],
      }),
    } as any);

    const res = await translateBatch(['Bread', 'Water'], 'es');
    expect(res).toEqual(['Pan', 'Agua']);
    fetchMock.mockRestore();
  });

  it('prefetchTranslations warms cache in background', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        targetLang: 'es',
        translations: [
          { original: 'Background task', translated: 'Tarea en segundo plano', hash: 'h1', cached: false },
        ],
      }),
    } as any);

    await prefetchTranslations(['Background task'], 'es');
    expect(getCachedTranslation('Background task', 'es')).toBe('Tarea en segundo plano');
    fetchMock.mockRestore();
  });

  it('falls back gracefully to raw text when API call fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Offline'));

    const res = await translateText('Network error string', 'es');
    expect(res).toBe('Network error string');

    fetchMock.mockRestore();
    warnSpy.mockRestore();
  });

  it('supports reactive subscriptions on cached translation updates', () => {
    const cb = jest.fn();
    const hash = computeTranslationHash('es', 'Subscribe string');

    const unsubscribe = subscribeTranslation(hash, cb);
    setCachedTranslation('Subscribe string', 'Cadena suscrita', 'es');

    expect(cb).toHaveBeenCalledWith('Cadena suscrita');

    unsubscribe();
    setCachedTranslation('Subscribe string', 'Otra cadena', 'es');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
