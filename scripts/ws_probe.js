// Simple WebSocket probe script
// Usage: node scripts/ws_probe.js ws://host:port

const WebSocket = require('ws');

const url = process.argv[2] || process.env.SOFTWARE_WS_URL || 'ws://45.130.166.119:5001';
const timeoutMs = parseInt(process.env.WS_PROBE_TIMEOUT || '20000', 10);

console.log(`Probing WebSocket: ${url}`);

let messageCount = 0;
const ws = new WebSocket(url);

const done = (code = 0) => {
  try { ws.close(); } catch {}
  console.log(`Probe finished. Messages received: ${messageCount}`);
  process.exit(code);
};

ws.on('open', () => {
  console.log('WS open: connected successfully');
});

ws.on('message', (data) => {
  messageCount++;
  // Print first few messages verbosely
  if (messageCount <= 5) {
    try {
      const txt = data.toString();
      console.log(`WS message #${messageCount}:`, txt.slice(0, 500));
    } catch (e) {
      console.log(`WS message #${messageCount}: (binary ${data.length} bytes)`);
    }
  }
});

ws.on('error', (err) => {
  console.error('WS error:', err && err.message ? err.message : err);
});

ws.on('close', (code, reason) => {
  console.log(`WS closed: code=${code} reason=${reason}`);
});

setTimeout(() => {
  console.log(`Timeout ${timeoutMs}ms reached.`);
  done(0);
}, timeoutMs);
