import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const CHANNEL = (process.env.KICK_CHANNEL || '').replace('https://kick.com/', '').replace('@', '').trim().toLowerCase();
const MANUAL_CHATROOM_ID = (process.env.KICK_CHATROOM_ID || '').trim();
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const ENTRY_COMMAND = (process.env.ENTRY_COMMAND || '!duel').trim().toLowerCase();
const MAX_HP = Number(process.env.MAX_HP || 100);
const HIT_MIN = Number(process.env.HIT_MIN || 7);
const HIT_MAX = Number(process.env.HIT_MAX || 18);
const ROUND_MS = Number(process.env.ROUND_MS || 950);
const PUSHER_KEY = '32cbd69e4b950bf97679';
const PUSHER_URL = `wss://ws-us2.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=7.6.0&flash=false`;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const publicDir = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(publicDir));

const state = {
  channel: CHANNEL,
  command: ENTRY_COMMAND,
  chatroomId: MANUAL_CHATROOM_ID || null,
  connected: false,
  lastError: null,
  pool: [],
  poolMap: new Map(),
  locked: false,
  currentDuel: null,
  history: [],
  recentEntries: []
};

function safeUser(u){ return String(u || '').replace(/^@/,'').trim().slice(0,30); }
function publicState(){
  return {
    channel: state.channel,
    command: state.command,
    chatroomId: state.chatroomId,
    connected: state.connected,
    lastError: state.lastError,
    pool: state.pool,
    poolCount: state.pool.length,
    locked: state.locked,
    currentDuel: state.currentDuel,
    history: state.history.slice(0,20),
    recentEntries: state.recentEntries.slice(0,25)
  };
}
function emitState(){ io.emit('state', publicState()); }
function adminOk(req){ return String(req.headers['x-admin-pin'] || req.query.pin || req.body?.pin || '') === String(ADMIN_PIN); }
function addEntry(username){
  username = safeUser(username);
  if (!username || state.locked) return false;
  const key = username.toLowerCase();
  if (state.poolMap.has(key)) return false;
  state.poolMap.set(key, username);
  state.pool.push(username);
  state.recentEntries.unshift({ username, at: new Date().toISOString() });
  state.recentEntries = state.recentEntries.slice(0, 50);
  emitState();
  return true;
}
function resetPool(){ state.pool=[]; state.poolMap=new Map(); state.recentEntries=[]; emitState(); }
function randomPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function rollTwo(){
  if (state.pool.length < 2) throw new Error('Need at least 2 people in the pool');
  const a = randomPick(state.pool);
  let b = randomPick(state.pool);
  while (b.toLowerCase() === a.toLowerCase()) b = randomPick(state.pool);
  const duel = { id: Date.now(), status: 'fighting', fighter1: a, fighter2: b, hp1: MAX_HP, hp2: MAX_HP, maxHp: MAX_HP, log: [`${a} challenged ${b}!`], winner: null, loser: null };
  state.currentDuel = duel;
  emitState();
  startBattle(duel.id);
  return duel;
}
function startBattle(id){
  const timer = setInterval(() => {
    const d = state.currentDuel;
    if (!d || d.id !== id || d.status !== 'fighting') return clearInterval(timer);
    const attackerOne = Math.random() < 0.5;
    const dmg = Math.floor(HIT_MIN + Math.random() * (HIT_MAX - HIT_MIN + 1));
    const crit = Math.random() < 0.12;
    const finalDmg = crit ? dmg * 2 : dmg;
    if (attackerOne) { d.hp2 = Math.max(0, d.hp2 - finalDmg); d.log.unshift(`${d.fighter1} hits ${d.fighter2} for ${finalDmg}${crit ? ' CRIT' : ''}`); }
    else { d.hp1 = Math.max(0, d.hp1 - finalDmg); d.log.unshift(`${d.fighter2} hits ${d.fighter1} for ${finalDmg}${crit ? ' CRIT' : ''}`); }
    d.log = d.log.slice(0, 6);
    if (d.hp1 <= 0 || d.hp2 <= 0) {
      d.status = 'finished';
      d.winner = d.hp1 > 0 ? d.fighter1 : d.fighter2;
      d.loser = d.hp1 > 0 ? d.fighter2 : d.fighter1;
      d.log.unshift(`${d.winner} wins the duel!`);
      state.history.unshift({ time: new Date().toISOString(), winner: d.winner, loser: d.loser });
      state.history = state.history.slice(0, 50);
      clearInterval(timer);
    }
    emitState();
  }, ROUND_MS);
}

app.get('/', (req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.get('/overlay', (req,res)=>res.sendFile(path.join(publicDir,'overlay.html')));
app.get('/api/state', (req,res)=>res.json(publicState()));
app.post('/api/test-entry', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); addEntry(req.body?.username || 'TestUser'); res.json(publicState()); });
app.post('/api/lock', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.locked=true; emitState(); res.json(publicState()); });
app.post('/api/unlock', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.locked=false; emitState(); res.json(publicState()); });
app.post('/api/reset', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); resetPool(); res.json(publicState()); });
app.post('/api/clear-duel', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.currentDuel=null; emitState(); res.json(publicState()); });
app.post('/api/roll', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); try{ res.json(rollTwo()); }catch(e){ res.status(400).json({error:e.message}); } });
app.get('/api/export.csv', (req, res) => {
  const rows = [['username'], ...state.pool.map(u => [u])];
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="kick-duel-entries.csv"');
  res.send(csv);
});

io.on('connection', socket => socket.emit('state', publicState()));

function normalizeMessageText(raw) { return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''; }
function extractChatPayload(event) { let data = event?.data; if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return null; } } return data || null; }
function getUsername(payload) { return payload?.sender?.username || payload?.sender?.name || payload?.user?.username || payload?.username || payload?.sender_username || null; }
function getMessage(payload) { return payload?.content || payload?.message || payload?.text || payload?.body || ''; }
function handleChatMessage(payload) {
  const username = getUsername(payload);
  const message = normalizeMessageText(getMessage(payload)).toLowerCase();
  if (!username || !message) return;
  if (message === ENTRY_COMMAND || message.startsWith(ENTRY_COMMAND + ' ')) addEntry(username);
}

async function resolveChatroomId(slug) {
  if (MANUAL_CHATROOM_ID) return MANUAL_CHATROOM_ID;
  if (!slug) throw new Error('Missing KICK_CHANNEL in Railway Variables');
  const urls = [`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, `https://kick.com/api/v1/channels/${encodeURIComponent(slug)}`];
  let lastStatus = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'accept': 'application/json,text/plain,*/*', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'referer': `https://kick.com/${slug}` } });
      lastStatus = `${res.status} ${res.statusText}`;
      if (!res.ok) continue;
      const data = await res.json();
      const id = data?.chatroom?.id || data?.livestream?.chatroom?.id || data?.chatroom_id;
      if (id) return String(id);
    } catch (err) { lastStatus = err.message; }
  }
  throw new Error(`Could not resolve Kick chatroom ID (${lastStatus}). Add KICK_CHATROOM_ID manually in Railway Variables.`);
}

let ws = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
async function connectKick() {
  clearTimeout(reconnectTimer);
  try { state.chatroomId = await resolveChatroomId(CHANNEL); state.lastError = null; }
  catch (err) { state.connected = false; state.lastError = err.message; emitState(); scheduleReconnect(); return; }
  ws = new WebSocket(PUSHER_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
  ws.on('open', () => { state.connected = true; state.lastError = null; reconnectAttempt = 0; emitState(); });
  ws.on('message', (buf) => {
    let event; try { event = JSON.parse(buf.toString()); } catch { return; }
    if (event.event === 'pusher:connection_established') {
      const channels = [`chatrooms.${state.chatroomId}.v2`, `chatroom.${state.chatroomId}`];
      for (const channel of channels) ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel } }));
      return;
    }
    if (event.event === 'pusher:ping') { ws.send(JSON.stringify({ event: 'pusher:pong', data: {} })); return; }
    if (event.event === 'App\\Events\\ChatMessageEvent' || event.event === 'App\\Events\\MessageSentEvent') {
      const payload = extractChatPayload(event); handleChatMessage(payload);
    }
  });
  ws.on('close', () => { state.connected = false; emitState(); scheduleReconnect(); });
  ws.on('error', (err) => { state.connected = false; state.lastError = err.message; emitState(); });
}
function scheduleReconnect() { const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt++)); reconnectTimer = setTimeout(connectKick, delay); }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kick Duel Giveaway running on port ${PORT}`);
  console.log(`Dashboard: /  Overlay: /overlay  Channel: ${CHANNEL || 'NOT SET'}`);
  connectKick();
});
