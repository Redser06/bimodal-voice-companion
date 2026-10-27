import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

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
      // 1. REST Endpoints for LAN discovery & Second Brain MCP bridge
      server.middlewares.use('/api/network-info', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            lanIp: getLocalLanIp(),
            port: 4321,
            secondBrainAvailable: fs.existsSync(SECOND_BRAIN_ROOT),
            modelPolicy: {
              fastVoiceLoop: 'gemini-3.8-flash',
              heavySynthesisLoop: 'gemini-4-argon',
            },
          })
        );
      });

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
            const summary = String(parsed.summary || 'Recorded via Bimodal Voice Companion.');
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

      // 2. WebSocket Presence & Deterministic Canvas State Bus (/ws-bimodal)
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
          connectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
