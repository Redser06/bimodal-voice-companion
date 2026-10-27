import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';

const execFileAsync = promisify(execFile);

const SECOND_BRAIN_ROOT = '/Users/conorredmond/projects/redser-second-brain';

function getLocalLanIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  role: 'phone' | 'pad' | 'tv' | 'unified';
  label: string;
  connectedAt: string;
}

export function bimodalWsHubPlugin(): Plugin {
  let latestSessionState: unknown = null;
  const clients = new Map<WebSocket, ConnectedClient>();

  function broadcastPresence() {
    const surfaces = Array.from(clients.values()).map((c) => ({
      clientId: c.clientId,
      role: c.role,
      label: c.label,
      connectedAt: c.connectedAt,
    }));
    const payload = JSON.stringify({ type: 'presence_update', surfaces });
    for (const client of clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  return {
    name: 'bimodal-ws-hub-plugin',
    configureServer(server) {
      // 1. REST Endpoint: Network & Model Policy Discovery
      server.middlewares.use('/api/network-info', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            lanIp: getLocalLanIp(),
            port: 4321,
            secondBrainAvailable: fs.existsSync(SECOND_BRAIN_ROOT),
            hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY),
            modelPolicy: {
              fastVoiceLoop: 'gemini-3.8-flash',
              ttsVoiceModel: 'gemini-3.8-flash-tts',
              heavySynthesisLoop: 'gemini-4-argon',
            },
          })
        );
      });

      // 2. Studio-Grade Neural TTS Endpoint (`gemini-3.8-flash-tts`)
      server.middlewares.use('/api/tts', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const text = String(parsed.text || '').trim();
            const voice = String(parsed.voice || 'Kore');
            const style = String(
              parsed.style ||
                'warm, sharp executive colleague in a quick standup, natural conversational flow'
            );
            const apiKey =
              String(parsed.apiKey || '').trim() ||
              String(req.headers['x-gemini-api-key'] || '').trim() ||
              process.env.GEMINI_API_KEY ||
              '';

            if (!apiKey) {
              // Synthesize clean 24kHz WAV via macOS natural voice engine (`Moira` / `Daniel` / `Karen` / `Samantha`)
              const macVoiceMap: Record<string, string> = {
                Kore: 'Moira', // Natural Irish English voice
                Puck: 'Daniel', // Natural British English voice
                Aoede: 'Karen', // Natural Australian English voice
                Charon: 'Samantha', // Natural US English voice
              };
              const macVoice = macVoiceMap[voice] || 'Moira';
              const tmpWav = path.join(
                os.tmpdir(),
                `bimodal-tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`
              );
              try {
                await execFileAsync('say', [
                  '-v',
                  macVoice,
                  '-r',
                  '185',
                  '-o',
                  tmpWav,
                  '--data-format=LEI16@24000',
                  text,
                ]);
                const wavBuffer = fs.readFileSync(tmpWav);
                fs.unlinkSync(tmpWav);
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    ok: true,
                    model: `macOS-natural-24kHz (${macVoice})`,
                    voice,
                    mimeType: 'audio/wav',
                    audioBase64: wavBuffer.toString('base64'),
                  })
                );
                return;
              } catch {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    ok: false,
                    reason: 'no_api_key',
                  })
                );
                return;
              }
            }

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
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: false,
                  reason: 'empty_audio',
                })
              );
              return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                model: 'gemini-3.8-flash-tts',
                voice,
                mimeType,
                audioBase64: audioData,
              })
            );
          } catch (err) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                reason: 'api_error',
                error: String(err),
              })
            );
          }
        });
      });

      // 3. Second Brain MCP Direct Commit Endpoint
      server.middlewares.use('/api/second-brain/commit', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const slug = String(parsed.slug || 'voice-session-note')
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-');
            const title = String(parsed.title || 'Bimodal Voice Session Outcome');
            const summary = String(
              parsed.summary || 'Recorded via Bimodal Voice Companion.'
            );
            const dateStr = '2026-10-27';
            const relPath = `progress/antigravity/${dateStr}-${slug}.md`;
            const absPath = path.join(SECOND_BRAIN_ROOT, relPath);

            if (fs.existsSync(SECOND_BRAIN_ROOT)) {
              fs.mkdirSync(path.dirname(absPath), { recursive: true });
              const markdown = [
                '---',
                'kind: progress',
                `date: ${dateStr}`,
                'agent: antigravity',
                'projects:',
                '  - bimodal-voice-companion',
                'tags:',
                '  - voice-ai',
                '  - bimodal-canvas',
                'links: []',
                '---',
                `# ${title}`,
                '',
                '## What was done',
                '',
                summary,
                '',
                '## What is next',
                '',
                'Continue live bimodal voice + visual companion testing across LAN surfaces.',
                '',
              ].join('\n');
              fs.writeFileSync(absPath, markdown, 'utf8');
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                committedPath: relPath,
                timestamp: new Date().toISOString(),
              })
            );
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });

      // 4. WebSocket Presence & Deterministic Canvas State Bus (/ws-bimodal)
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (request: IncomingMessage, socket, head) => {
        if (request.url?.startsWith('/ws-bimodal')) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });

      wss.on('connection', (ws) => {
        const defaultClient: ConnectedClient = {
          ws,
          clientId: `surface-${Math.random().toString(36).slice(2, 8)}`,
          role: 'unified',
          label: 'LAN Browser Surface',
          connectedAt: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        };
        clients.set(ws, defaultClient);

        if (latestSessionState) {
          ws.send(JSON.stringify({ type: 'state_sync', state: latestSessionState }));
        }
        broadcastPresence();

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(String(raw));
            if (msg.type === 'register_surface') {
              const existing = clients.get(ws);
              if (existing) {
                existing.clientId = msg.clientId || existing.clientId;
                existing.role = msg.role || existing.role;
                existing.label = msg.label || existing.label;
                broadcastPresence();
              }
            } else if (msg.type === 'state_patch' && msg.state) {
              latestSessionState = msg.state;
              const broadcastMsg = JSON.stringify({
                type: 'state_sync',
                state: msg.state,
                senderId: msg.senderId,
              });
              for (const client of clients.keys()) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(broadcastMsg);
                }
              }
            }
          } catch {
            // Ignore malformed socket frames
          }
        });

        ws.on('close', () => {
          clients.delete(ws);
          broadcastPresence();
        });
      });
    },
  };
}
