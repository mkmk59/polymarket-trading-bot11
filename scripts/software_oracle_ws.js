// Lightweight Software Oracle WebSocket
// Emits JSON messages: { prob_up, prob_down, ts }
// Source: Polymarket Gamma API prices + small noise
// Env: SOFTWARE_WS_PORT (default 5001), ORACLE_NOISE (default 0.02)

const { WebSocketServer } = require('ws');
const axios = require('axios');

const PORT = parseInt(process.env.SOFTWARE_WS_PORT || '5001', 10);
const NOISE = Math.max(0, Math.min(0.2, parseFloat(process.env.ORACLE_NOISE || '0.02')));

function generateBitcoinSlug() {
  const now = new Date();
  // Use local time like bot does
  const monthName = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const day = now.getDate();
  const hour = now.getHours();
  const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
  return `bitcoin-up-or-down-${monthName}-${day}-${timeStr}-et`;
}

async function fetchMarket(slug) {
  try {
    const resp = await axios.get(`https://gamma-api.polymarket.com/markets`, { params: { slug } });
    const data = resp.data;
    const market = Array.isArray(data) && data.length > 0
      ? data[0]
      : (data?.data && Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null);
    return market || null;
  } catch (err) {
    return null;
  }
}

function parseTokens(market) {
  const tokens = market?.tokens || [];
  let up = null, down = null;
  for (const t of tokens) {
    const outcome = String(t.outcome || '').toLowerCase();
    if (!up && (outcome.includes('up') || outcome.includes('yes') || outcome.includes('higher'))) up = t;
    if (!down && (outcome.includes('down') || outcome.includes('no') || outcome.includes('lower'))) down = t;
  }
  return { up, down };
}

function priceFromToken(t) {
  if (!t) return undefined;
  if (t.price != null && !isNaN(parseFloat(t.price))) return parseFloat(t.price);
  const bid = t.best_bid ?? t.bestBid ?? (t.bids?.[0]?.price);
  const ask = t.best_ask ?? t.bestAsk ?? (t.asks?.[0]?.price);
  if (bid != null && ask != null) {
    const b = parseFloat(String(bid));
    const a = parseFloat(String(ask));
    if (!isNaN(b) && !isNaN(a) && b > 0 && a > 0) return (b + a) / 2.0;
  }
  return undefined;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const wss = new WebSocketServer({ port: PORT });
let lastPayload = null;

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ info: 'software_oracle_ws connected', ts: Date.now() }));
  if (lastPayload) ws.send(JSON.stringify(lastPayload));
});

console.log(`Software Oracle WS listening on ws://0.0.0.0:${PORT}`);

async function loop() {
  const slug = generateBitcoinSlug();
  const market = await fetchMarket(slug);
  if (!market) {
    // fallback: neutral 50/50
    const prob_up = 50 + (Math.random() - 0.5) * (NOISE * 100);
    const payload = { prob_up: clamp(prob_up, 1, 99), prob_down: clamp(100 - prob_up, 1, 99), ts: Date.now() };
    lastPayload = payload;
    for (const c of wss.clients) { try { c.send(JSON.stringify(payload)); } catch {} }
    return;
  }
  const { up, down } = parseTokens(market);
  const pUp = priceFromToken(up); // 0..1
  let prob_up;
  if (pUp && pUp > 0) {
    // derive from market with slight noise to create opportunities
    const noisy = clamp(pUp + (Math.random() - 0.5) * NOISE, 0.01, 0.99);
    prob_up = noisy * 100;
  } else {
    prob_up = 50 + (Math.random() - 0.5) * (NOISE * 100);
  }
  const payload = { prob_up: clamp(prob_up, 1, 99), prob_down: clamp(100 - prob_up, 1, 99), ts: Date.now() };
  lastPayload = payload;
  for (const c of wss.clients) { try { c.send(JSON.stringify(payload)); } catch {} }
}

setInterval(loop, 3000);
