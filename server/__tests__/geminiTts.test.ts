import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create, constructed } = vi.hoisted(() => ({
  create: vi.fn(),
  constructed: [] as Array<{ apiKey: string }>,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    interactions = { create };
    constructor(opts: { apiKey: string }) {
      constructed.push(opts);
    }
  },
}));

import {
  GEMINI_KEY_REQUIRED_ERROR,
  handleTtsRequest,
  readClientGeminiApiKey,
} from '../geminiTts';
import { bimodalWsHubPlugin } from '../wsHubPlugin';

type TtsMiddleware = (req: EventEmitter & { method?: string; headers: Record<string, string | undefined> }, res: {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (payload?: string) => void;
}) => void;

function ttsMiddleware(): TtsMiddleware {
  let handler: TtsMiddleware | undefined;
  const plugin = bimodalWsHubPlugin();
  const configure = plugin.configureServer;
  if (typeof configure !== 'function') {
    throw new Error('TTS plugin did not expose configureServer');
  }
  configure.call(
    {} as never,
    {
      middlewares: {
        use(route: string, routeHandler: TtsMiddleware) {
          if (route === '/api/tts') handler = routeHandler;
        },
      },
    } as never
  );
  if (!handler) throw new Error('TTS route was not registered');
  return handler;
}

function postTts(body: string, headers: Record<string, string | undefined> = {}) {
  const handler = ttsMiddleware();
  return new Promise<{ statusCode: number; body: string }>((resolve) => {
    const req = new EventEmitter() as EventEmitter & {
      method?: string;
      headers: Record<string, string | undefined>;
    };
    req.method = 'POST';
    req.headers = headers;
    const res = {
      statusCode: 200,
      setHeader() {},
      end(payload?: string) {
        resolve({ statusCode: res.statusCode, body: payload || '' });
      },
    };
    handler(req, res);
    req.emit('data', Buffer.from(body));
    req.emit('end');
  });
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverDir, '..');

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      files.push(...listTypeScriptFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('browser-supplied Gemini key', () => {
  beforeEach(() => {
    create.mockReset();
    constructed.length = 0;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('the TTS route rejects a missing key even when the environment has one', async () => {
    process.env.GEMINI_API_KEY = 'env-key-fixture';
    const result = await postTts(JSON.stringify({ text: 'Hello', voice: 'Kore' }));
    expect(result.statusCode).toBe(400);
    expect(result.body).not.toContain('env-key-fixture');
    expect(JSON.parse(result.body)).toEqual({ ok: false, error: GEMINI_KEY_REQUIRED_ERROR });
    expect(constructed).toHaveLength(0);
  });

  it('rejects a TTS request that does not include a key', async () => {
    const result = await handleTtsRequest({
      rawBody: JSON.stringify({ text: 'Hello', voice: 'Kore' }),
      headerValue: undefined,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ ok: false, error: GEMINI_KEY_REQUIRED_ERROR });
    expect(constructed).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not read a Gemini key from the environment', async () => {
    process.env.GEMINI_API_KEY = 'env-key-fixture';
    process.env.GOOGLE_API_KEY = 'env-key-fixture';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'env-key-fixture';

    const result = await handleTtsRequest({
      rawBody: JSON.stringify({ text: 'Hello', voice: 'Kore' }),
      headerValue: undefined,
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(constructed).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('env-key-fixture');
    expect(readClientGeminiApiKey({ bodyApiKey: undefined, headerValue: undefined })).toBe('');
  });

  it('uses the key from the request body and not the environment', async () => {
    process.env.GEMINI_API_KEY = 'env-key-fixture';
    create.mockResolvedValue({
      output_audio: { data: 'YQ==', mime_type: 'audio/wav' },
    });

    const result = await handleTtsRequest({
      rawBody: JSON.stringify({
        text: 'Hello',
        voice: 'Kore',
        apiKey: 'client-key-fixture',
      }),
      headerValue: undefined,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.audioBase64).toBe('YQ==');
    expect(constructed).toEqual([{ apiKey: 'client-key-fixture' }]);
    expect(JSON.stringify(create.mock.calls)).not.toContain('client-key-fixture');
    expect(JSON.stringify(create.mock.calls)).not.toContain('env-key-fixture');
  });

  it('accepts the key from the x-gemini-api-key header', async () => {
    create.mockResolvedValue({
      output_audio: { data: 'YQ==', mime_type: 'audio/wav' },
    });

    const result = await handleTtsRequest({
      rawBody: JSON.stringify({ text: 'Hello' }),
      headerValue: 'header-key-fixture',
    });

    expect(result.body.ok).toBe(true);
    expect(constructed).toEqual([{ apiKey: 'header-key-fixture' }]);
  });

  it('does not include the key in an upstream error response', async () => {
    create.mockRejectedValue(new Error('upstream rejected client-key-fixture'));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await handleTtsRequest({
        rawBody: JSON.stringify({ text: 'Hello', apiKey: 'client-key-fixture' }),
        headerValue: undefined,
      });

      expect(result.body.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('client-key-fixture');
      const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain('client-key-fixture');
    } finally {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it('server sources do not read a Gemini key from env or files', () => {
    const files = listTypeScriptFiles(serverDir).filter(
      (file) => !file.includes(`${path.sep}__tests__${path.sep}`) && !file.endsWith('.test.ts')
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/GEMINI_API_KEY/);
      expect(source, file).not.toMatch(/GOOGLE_API_KEY/);
      expect(source, file).not.toMatch(/GOOGLE_GENERATIVE_AI_API_KEY/);
      expect(source, file).not.toMatch(/process\.env\.[A-Z0-9_]*(KEY|TOKEN|SECRET)/);
      expect(source, file).not.toMatch(/readFileSync\([^)]*api[_-]?key/i);
    }

    const plugin = readFileSync(path.join(serverDir, 'wsHubPlugin.ts'), 'utf8');
    expect(plugin).toContain('handleTtsRequest');
    expect(plugin).not.toContain('hasServerGeminiKey');

    const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    expect(readme).toMatch(/localStorage/);
    expect(readme).toMatch(/x-gemini-api-key/);
    expect(readme).not.toMatch(/GEMINI_API_KEY\s*=/);
  });
});
