# Bimodal Voice + Visual Companion ("Show Me" Architecture)

Standalone hybrid bimodal workflow application implementing the approved **9.7/10 Office Hours Spec**:
- **Primary Channel (Voice Jewel)**: Strictly governed by a **2-sentence / 35-word BLUF (Bottom Line Up Front)** contract (`gemini-3.8-flash`) with active voice barge-in interruption.
- **Secondary Channel (Zero-Code LAN Visual Surfaces)**: Loop 2 (`gemini-4-argon` / `gemini-3.8-flash`) pre-stages structured JSON state in the background on every turn across three deterministic artifact engines. Saying **"Show me"** reveals the pre-staged canvas in `<50ms` and shifts the voice agent into a live canvas controller.

## Three Built-In Voice-Controlled Artifact Engines

1. **Engine 1 — Live Data & Slicing Canvas (`gp-golf-margins`)**:
   - Interactive financial & margin matrix (`Custom Drivers`, `Irons & Wedges`, `Custom Fitting Studio`, `Apparel & Waterproofs`, `Golf Balls`).
   - Voice mutations: *"Remove sales of golf balls from the analysis"*, *"Zoom in on Q3"*, *"Show me this as a waterfall chart"*, *"Show me this as a line chart"*, *"Show me this as a stacked bar chart"*.
2. **Engine 2 — Spatial / Carpenter CAD Blueprint Canvas (`carpenter-workbench`)**:
   - Hands-free woodworking blueprint (`French Roubo Split-Top White Oak Workbench`).
   - Voice mutations: *"Zoom in on the mortise joint"*, *"Switch units to inches"*, *"Zoom in on the cut list"*, *"Mark step 2 done"*.
3. **Engine 3 — Second Brain & Multi-Thread Executive Deck (`second-brain-standup`)**:
   - Live mirror of `/Users/conorredmond/projects/redser-second-brain` with voice status filtering (*"Filter to failed runs"*, *"Filter to action required"*) and direct MCP commit (*"Write to Second Brain"*).

## Zero-Code Multi-Device LAN Sync

Run locally on your Wi-Fi network:

```bash
npm run dev
```

Open on any device on the same LAN (zero PIN codes required):
- `http://<LAN-IP>:4321/` — Unified Split View (Voice Jewel + Companion Canvas)
- `http://<LAN-IP>:4321/?surface=phone` — Phone / Android Auto Primary + Parked Digest Queue
- `http://<LAN-IP>:4321/?surface=pad` — Workbench iPad Pro Interactive Receiver
- `http://<LAN-IP>:4321/?surface=tv` — Office 65" Wall Display Receiver

## Gemini API key

The Gemini API key lives in the browser. A labelled password field (**Gemini API key**) saves it to `localStorage` on that device. **Clear** removes it.

Speech requests that call Gemini (`POST /api/tts`) send the key on that request only, in the `x-gemini-api-key` header and the JSON `apiKey` field. The server uses the key for the duration of the call and then drops it. It does not read a Gemini key from environment variables or files, and it does not write, cache, or log the key. A request without a key is rejected. The key is not put on the LAN WebSocket state bus, which is cached and broadcast to other surfaces.

Without a key stored in the browser, spoken replies stay on the device and use the browser speech engine.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```
