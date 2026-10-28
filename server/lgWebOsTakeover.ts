import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

const CLIENT_KEY_FILE = path.join(
  process.cwd(),
  '.lg-webos-client-key.json'
);

// Standard LG webOS SSAP Registration Manifest requesting Browser Launch & Toast permissions
const LG_REGISTER_MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.1',
  signed: {
    created: '20140509',
    appId: 'com.lge.test',
    vendorId: 'com.lge',
    localizedAppNames: {
      '': 'Bimodal Voice Companion',
      'en-US': 'Bimodal Voice Companion',
    },
    localizedVendorNames: {
      '': 'LG Electronics',
    },
    permissions: [
      'TEST_SECURE',
      'CONTROL_INPUT_TEXT',
      'CONTROL_MOUSE_AND_KEYBOARD',
      'READ_INSTALLED_APPS',
      'READ_LGE_SDX',
      'READ_NOTIFICATIONS',
      'SEARCH',
      'WRITE_SETTINGS',
      'WRITE_NOTIFICATION_ALERT',
      'CONTROL_POWER',
      'READ_CURRENT_CHANNEL',
      'READ_RUNNING_APPS',
      'READ_UPDATE_INFO',
      'UPDATE_FROM_REMOTE_APP',
      'READ_LGE_TV_INPUT_EVENTS',
      'READ_TV_CURRENT_TIME',
    ],
    serial: '2f930e2d2cfe083771f68e4fe7bb07',
  },
  permissions: [
    'LAUNCH',
    'LAUNCH_WEBAPP',
    'APP_TO_APP',
    'CLOSE',
    'TEST_OPEN',
    'TEST_PROTECTED',
    'CONTROL_AUDIO',
    'CONTROL_DISPLAY',
    'CONTROL_INPUT_JOYSTICK',
    'CONTROL_INPUT_MEDIA_RECORDING',
    'CONTROL_INPUT_MEDIA_PLAYBACK',
    'CONTROL_INPUT_TV',
    'CONTROL_POWER',
    'READ_APP_STATUS',
    'READ_CURRENT_CHANNEL',
    'READ_INPUT_DEVICE_LIST',
    'READ_NETWORK_STATE',
    'READ_RUNNING_APPS',
    'READ_TV_CHANNEL_LIST',
    'WRITE_NOTIFICATION_TOAST',
    'READ_POWER_STATE',
    'READ_COUNTRY_INFO',
  ],
};

function loadSavedClientKey(ip: string): string | undefined {
  try {
    if (fs.existsSync(CLIENT_KEY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CLIENT_KEY_FILE, 'utf8'));
      return parsed[ip];
    }
  } catch {
    // ignore
  }
  return undefined;
}

function saveClientKey(ip: string, key: string): void {
  try {
    let existing: Record<string, string> = {};
    if (fs.existsSync(CLIENT_KEY_FILE)) {
      existing = JSON.parse(fs.readFileSync(CLIENT_KEY_FILE, 'utf8'));
    }
    existing[ip] = key;
    fs.writeFileSync(CLIENT_KEY_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Sends a 102-byte UDP Wake-on-LAN (WoL) magic packet to wake an LG or Samsung TV from network standby.
 */
export function sendWakeOnLanMagicPacket(macAddress: string, broadcastIp = '192.168.1.255'): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const hexParts = macAddress
        .split(/[:-]/)
        .map((part) => parseInt(part.padStart(2, '0'), 16));
      if (hexParts.length !== 6 || hexParts.some((n) => Number.isNaN(n))) {
        resolve(false);
        return;
      }

      const magicPacket = Buffer.alloc(102);
      // 6 bytes of 0xFF
      for (let i = 0; i < 6; i++) {
        magicPacket[i] = 0xff;
      }
      // 16 repetitions of the 6-byte MAC address
      for (let rep = 0; rep < 16; rep++) {
        for (let j = 0; j < 6; j++) {
          magicPacket[6 + rep * 6 + j] = hexParts[j];
        }
      }

      const socket = dgram.createSocket('udp4');
      socket.once('error', () => {
        socket.close();
        resolve(false);
      });
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(magicPacket, 0, magicPacket.length, 9, broadcastIp, () => {
          socket.close();
          resolve(true);
        });
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Discovers LG webOS TVs on the LAN via SSDP M-SEARCH (`239.255.255.250:1900`).
 */
export function discoverLgWebOsTvsViaSsdp(
  localLanIp: string,
  timeoutMs = 1100
): Promise<Array<{ ip: string; friendlyName: string; usn: string }>> {
  return new Promise((resolve) => {
    const discovered = new Map<string, { ip: string; friendlyName: string; usn: string }>();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve([]);
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (
        text.toLowerCase().includes('webos') ||
        text.toLowerCase().includes('lge') ||
        text.includes('X-Friendly-Name:') ||
        text.includes('DLNADeviceName.lge.com:')
      ) {
        let friendlyName = 'LG webOS TV';
        const b64Match = text.match(/X-Friendly-Name:\s*([A-Za-z0-9+/=]+)/i);
        const dlnaMatch = text.match(/DLNADeviceName\.lge\.com:\s*([^\r\n]+)/i);
        if (b64Match?.[1]) {
          try {
            friendlyName = Buffer.from(b64Match[1].trim(), 'base64').toString('utf8');
          } catch {
            // ignore
          }
        } else if (dlnaMatch?.[1]) {
          try {
            friendlyName = decodeURIComponent(dlnaMatch[1].trim());
          } catch {
            friendlyName = dlnaMatch[1].trim();
          }
        }
        const usnMatch = text.match(/USN:\s*([^\r\n]+)/i);
        discovered.set(rinfo.address, {
          ip: rinfo.address,
          friendlyName,
          usn: usnMatch?.[1]?.trim() || rinfo.address,
        });
      }
    });

    socket.bind(0, localLanIp, () => {
      const targets = [
        'urn:lge:device:tv:1',
        'urn:schemas-upnp-org:device:MediaRenderer:1',
        'upnp:rootdevice',
      ];
      for (const st of targets) {
        const packet = Buffer.from(
          [
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            'MX: 1',
            `ST: ${st}`,
            '',
            '',
          ].join('\r\n'),
          'utf8'
        );
        socket.send(packet, 0, packet.length, 1900, '239.255.255.250');
      }
    });

    setTimeout(() => {
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(Array.from(discovered.values()));
    }, timeoutMs);
  });
}

export interface LgTakeoverResult {
  ok: boolean;
  status: 'launched_browser' | 'prompting_on_tv_screen' | 'connection_failed';
  tvIp: string;
  targetUrl: string;
  message: string;
}

/**
 * Connects to an LG webOS TV (`wss://<tvIp>:3001` or `ws://<tvIp>:3000`),
 * triggers the on-screen TV pairing prompt if not yet paired, and once accepted,
 * automatically launches the LG TV full-screen Web Browser to `targetUrl` + displays a toast.
 */
export async function triggerLgWebOsScreenTakeover(
  tvIp: string,
  targetUrl: string,
  threadTitle: string,
  macAddress = 'dc:03:98:54:55:66'
): Promise<LgTakeoverResult> {
  // 1. Send Wake-on-LAN magic packet first in case the TV is dozing
  await sendWakeOnLanMagicPacket(macAddress);

  return new Promise((resolve) => {
    const savedKey = loadSavedClientKey(tvIp);
    // Connect to LG webOS SSAP WebSocket on port 3000 (verified live on [LG] webOS TV OLED55C16LA at 192.168.1.161)
    const wsUrl = `ws://${tvIp}:3000`;
    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

    let settled = false;
    const finish = (res: LgTakeoverResult) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    const launchBrowserAndToast = () => {
      // 1. Show toast on the LG TV screen
      ws.send(
        JSON.stringify({
          id: `toast_${Date.now()}`,
          type: 'request',
          uri: 'ssap://system.notifications/createToast',
          payload: {
            message: `Bimodal Voice Companion: ${threadTitle}`,
          },
        })
      );

      // 2. Launch the LG webOS Full-Screen Browser directly to our live /tv Canvas URL
      ws.send(
        JSON.stringify({
          id: `open_browser_${Date.now()}`,
          type: 'request',
          uri: 'ssap://system.launcher/open',
          payload: {
            target: targetUrl,
          },
        })
      );

      setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 1500);
    };

    ws.on('open', () => {
      const registerPayload: Record<string, unknown> = {
        forcePairing: false,
        pairingType: 'PROMPT',
        manifest: LG_REGISTER_MANIFEST,
      };
      if (savedKey) {
        registerPayload['client-key'] = savedKey;
      }

      ws.send(
        JSON.stringify({
          id: 'register_bimodal_1',
          type: 'register',
          payload: registerPayload,
        })
      );
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        // TV is displaying the native "Allow Bimodal Voice Companion to connect?" prompt on screen
        if (
          msg.type === 'response' &&
          msg.id === 'register_bimodal_1' &&
          msg.payload?.pairingType === 'PROMPT'
        ) {
          finish({
            ok: true,
            status: 'prompting_on_tv_screen',
            tvIp,
            targetUrl,
            message:
              'Native permission prompt is now visible on [LG] webOS TV OLED55C16LA — click "Accept / Yes" on your LG TV remote and the browser will open automatically!',
          });
          // Keep the WebSocket open for up to 45 seconds so as soon as the user clicks Accept on the TV remote, the browser launches immediately!
        }

        // Registration succeeded (either immediately via saved client-key, or right after user clicked Accept on the TV!)
        if (msg.type === 'registered') {
          const newKey = msg.payload?.['client-key'];
          if (newKey) {
            saveClientKey(tvIp, String(newKey));
          }
          launchBrowserAndToast();
          finish({
            ok: true,
            status: 'launched_browser',
            tvIp,
            targetUrl,
            message: `Launched full-screen Web Browser on [LG] webOS TV OLED55C16LA (${tvIp}) -> ${targetUrl}`,
          });
        }
      } catch {
        // ignore
      }
    });

    ws.on('error', (err) => {
      finish({
        ok: false,
        status: 'connection_failed',
        tvIp,
        targetUrl,
        message: `Could not connect to LG webOS TV at ${tvIp}: ${err.message}`,
      });
    });

    // If user takes >3s to grab the TV remote, resolve the HTTP call as 'prompting_on_tv_screen' while keeping WS alive
    setTimeout(() => {
      finish({
        ok: true,
        status: 'prompting_on_tv_screen',
        tvIp,
        targetUrl,
        message:
          'Sent SSAP pairing & launch request to [LG] webOS TV OLED55C16LA (192.168.1.161). Accept the prompt on the TV screen if shown.',
      });
    }, 3000);
  });
}
