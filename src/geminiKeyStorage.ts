export const GEMINI_API_KEY_STORAGE_KEY = 'bimodal_gemini_api_key';

type KeyReader = Pick<Storage, 'getItem'>;
type KeyWriter = Pick<Storage, 'setItem' | 'removeItem'>;

export function readBrowserGeminiApiKey(storage: KeyReader): string {
  try {
    return (storage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeBrowserGeminiApiKey(storage: KeyWriter, key: string): void {
  try {
    if (key) {
      storage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
    } else {
      storage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    }
  } catch {
    // Private mode or a full quota should not throw into the voice UI.
  }
}
