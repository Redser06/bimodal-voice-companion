import { describe, expect, it } from 'vitest';
import {
  GEMINI_API_KEY_STORAGE_KEY,
  readBrowserGeminiApiKey,
  writeBrowserGeminiApiKey,
} from './geminiKeyStorage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe('browser Gemini key storage', () => {
  it('saves a key and Clear removes it', () => {
    const storage = memoryStorage();
    expect(readBrowserGeminiApiKey(storage)).toBe('');

    writeBrowserGeminiApiKey(storage, 'client-key-fixture');
    expect(storage.getItem(GEMINI_API_KEY_STORAGE_KEY)).toBe('client-key-fixture');
    expect(readBrowserGeminiApiKey(storage)).toBe('client-key-fixture');

    writeBrowserGeminiApiKey(storage, '');
    expect(storage.getItem(GEMINI_API_KEY_STORAGE_KEY)).toBeNull();
    expect(readBrowserGeminiApiKey(storage)).toBe('');
  });
});
