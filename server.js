require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const axios = require('axios');
const WebSocket = require('ws');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CHANNEL = (process.env.KICK_CHANNEL || '').replace('@','').trim().toLowerCase();
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const ENTRY_COMMAND = (process.env.ENTRY_COMMAND || '!duel').trim().toLowerCase();
const MAX_HP = Number(process.env.MAX_HP || 100);
const HIT_MIN = Number(process.env.HIT_MIN || 7);
const HIT_MAX = Number(process.env.HIT_MAX || 18);
const ROUND_MS = Number(process.env.ROUND_MS || 950);

const state = {
  channel: CHANNEL,
  command: ENTRY_COMMAND,
  connected: false,
  lastError: null,
  pool: [],
  poolMap: new Map(),
  locked: false,
  currentDuel: null,
  history: []
};

function safeUser(u){ return String(u || '').replace(/^@/,'').trim().slice(0,30); }
function publicState(){
  return {
    channel: state.channel,
    command: state.command,
    connected: state.connected,
    lastError: state.lastError,
    pool: state.pool,
    poolCount: state.pool.length,
    locked: state.locked,
    currentDuel: state.currentDuel,
    history: state.history.slice(0,20)
  };
}
function emitState(){ io.emit('state', publicState()); }
function adminOk(req){ return (req.headers['x-admin-pin'] || req.query.pin || req.body.pin) == ADMIN_PIN; }
function addEntry(username){
  username = safeUser(username);
  if (!username || state.locked) return false;
  const key = username.toLowerCase();
  if (state.poolMap.has(key)) return false;
  state.poolMap.set(key, username);
  state.pool.push(username);
  emitState();
  return true;
}
function resetPool(){ state.pool=[]; state.poolMap=new Map(); emitState(); }
function randomPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function rollTwo(){
  if (state.pool.length < 2) throw new Error('Need at least 2 people in the pool');
  const a = randomPick(state.pool);
  let b = randomPick(state.pool);
  while (b.toLowerCase() === a.toLowerCase()) b = randomPick(state.pool);
  const duel = {
    id: Date.now(),
    status: 'fighting',
    fighter1: a,
    fighter2: b,
    hp1: MAX_HP,
    hp2: MAX_HP,
    maxHp: MAX_HP,
    log: [`${a} challenged ${b}!`],
    winner: null,
    loser: null
  };
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
    if (attackerOne) {
      d.hp2 = Math.max(0, d.hp2 - finalDmg);
      d.log.unshift(`${d.fighter1} hits ${d.fighter2} for ${finalDmg}${crit ? ' CRIT' : ''}`);
    } else {
      d.hp1 = Math.max(0, d.hp1 - finalDmg);
      d.log.unshift(`${d.fighter2} hits ${d.fighter1} for ${finalDmg}${crit ? ' CRIT' : ''}`);
    }
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

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/overlay', (req,res)=>res.sendFile(path.join(__dirname,'public','overlay.html')));
app.get('/api/state', (req,res)=>res.json(publicState()));
app.post('/api/test-entry', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); addEntry(req.body.username||'TestUser'); res.json(publicState()); });
app.post('/api/lock', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.locked=true; emitState(); res.json(publicState()); });
app.post('/api/unlock', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.locked=false; emitState(); res.json(publicState()); });
app.post('/api/reset', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); resetPool(); res.json(publicState()); });
app.post('/api/clear-duel', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); state.currentDuel=null; emitState(); res.json(publicState()); });
app.post('/api/roll', (req,res)=>{ if(!adminOk(req)) return res.status(401).json({error:'Bad PIN'}); try{ res.json(rollTwo()); }catch(e){ res.status(400).json({error:e.message}); } });

io.on('connection', socket => socket.emit('state', publicState()));

async function getChannelInfo(channel){
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`;
  const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
  return data;
}
function connectKick(){
  if (!CHANNEL) { state.lastError = 'Missing KICK_CHANNEL'; emitState(); return; }
  (async()=>{
    try {
      const info = await getChannelInfo(CHANNEL);
      const chatroomId = info?.chatroom?.id;
      if (!chatroomId) throw new Error('Could not find chatroom id. Is KICK_CHANNEL correct?');
      const ws = new WebSocket('wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false');
      ws.on('open', () => {
        ws.send(JSON.stringify({ event:'pusher:subscribe', data:{ auth:'', channel:`chatrooms.${chatroomId}.v2` }}));
        state.connected = true; state.lastError = null; emitState();
      });
      ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.event === 'App\\Events\\ChatMessageEvent') {
            const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
            const content = String(data?.content || data?.message || '').trim().toLowerCase();
            const username = data?.sender?.username || data?.user?.username || data?.username;
            if (content === ENTRY_COMMAND || content.startsWith(ENTRY_COMMAND + ' ')) addEntry(username);
          }
        } catch (_) {}
      });
      ws.on('close', () => { state.connected=false; state.lastError='Kick chat disconnected. Reconnecting...'; emitState(); setTimeout(connectKick, 5000); });
      ws.on('error', err => { state.connected=false; state.lastError=err.message; emitState(); });
    } catch (e) {
      state.connected=false; state.lastError=e.message; emitState(); setTimeout(connectKick, 10000);
    }
  })();
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kick Duel Giveaway running on port ${PORT}`);
  console.log(`Dashboard: /  Overlay: /overlay  Channel: ${CHANNEL || 'NOT SET'}`);
  connectKick();
});
