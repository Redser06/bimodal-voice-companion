import { GoogleGenAI } from '@google/genai';

export const GEMINI_KEY_REQUIRED_ERROR =
  'A Gemini API key is required. Send it on this request in the JSON body as apiKey or in the x-gemini-api-key header.';

/**
 * Key supplied on this request only. Never reads the environment or the filesystem.
 * Body field wins when both the body and the header are present.
 */
export function readClientGeminiApiKey(input: {
  bodyApiKey: unknown;
  headerValue: string | string[] | undefined;
}): string {
  const fromBody = normalizeKey(input.bodyApiKey);
  if (fromBody) return fromBody;
  if (Array.isArray(input.headerValue)) {
    for (const value of input.headerValue) {
      const fromHeader = normalizeKey(value);
      if (fromHeader) return fromHeader;
    }
    return '';
  }
  return normalizeKey(input.headerValue);
}

function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  let out = text.split(secret).join('[redacted]');
  const encoded = encodeURIComponent(secret);
  if (encoded && encoded !== secret) {
    out = out.split(encoded).join('[redacted]');
  }
  return out;
}

export async function handleTtsRequest(input: {
  rawBody: string;
  headerValue: string | string[] | undefined;
}): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  let parsed: Record<string, unknown>;
  try {
    const json = JSON.parse(input.rawBody || '{}') as unknown;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return {
        statusCode: 400,
        body: { ok: false, error: 'Request body must be a JSON object.' },
      };
    }
    parsed = json as Record<string, unknown>;
  } catch {
    return {
      statusCode: 400,
      body: { ok: false, error: 'Request body must be JSON.' },
    };
  }

  const text = String(parsed.text || '').trim();
  const voice = String(parsed.voice || 'Kore');
  const style = String(
    parsed.style ||
      'warm, sharp executive colleague in a quick standup, natural conversational flow'
  );
  const apiKey = readClientGeminiApiKey({
    bodyApiKey: parsed.apiKey,
    headerValue: input.headerValue,
  });

  if (!apiKey) {
    return {
      statusCode: 400,
      body: { ok: false, error: GEMINI_KEY_REQUIRED_ERROR },
    };
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create({
      model: 'gemini-3.8-flash-tts',
      input: [
        {
          type: 'user_input',
          content: [
            {
              type: 'text',
              text,
              annotations: [
                {
                  type: 'speech_metadata',
                  style,
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice }],
      },
    });

    const audioData = interaction.output_audio?.data;
    const mimeType = interaction.output_audio?.mime_type || 'audio/wav';

    if (!audioData) {
      return {
        statusCode: 200,
        body: { ok: false, error: 'Gemini returned no audio.' },
      };
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        model: 'gemini-3.8-flash-tts',
        voice,
        mimeType,
        audioBase64: audioData,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini request failed';
    return {
      statusCode: 200,
      body: {
        ok: false,
        error: redactSecret(message, apiKey),
      },
    };
  }
}
