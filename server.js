const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const CHANNEL = (process.env.KICK_CHANNEL || '').replace('@','').trim();
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const ENTRY_COMMAND = (process.env.ENTRY_COMMAND || '!duel').toLowerCase();

const state = {
  channel: CHANNEL,
  connected: false,
  lastError: '',
  command: ENTRY_COMMAND,
  entrants: [],
  entrantSet: new Set(),
  duel: null,
  history: []
};

app.use(express.json());
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store'); next();});
app.use(express.static(path.join(__dirname,'public')));
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/overlay', (req,res)=>res.sendFile(path.join(__dirname,'public','overlay.html')));
app.get('/api/state', (req,res)=>res.json(serialize()));

function checkPin(req){ return !ADMIN_PIN || req.headers['x-admin-pin'] === ADMIN_PIN || req.query.pin === ADMIN_PIN; }
function serialize(){ return {...state, entrantSet: undefined}; }
function emit(){ io.emit('state', serialize()); }
function addEntrant(username){
  if(!username) return;
  const key = username.toLowerCase();
  if(state.entrantSet.has(key)) return;
  state.entrantSet.add(key); state.entrants.push(username); emit();
}
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pickTwo(){
  const arr=[...state.entrants];
  if(arr.length<2) return null;
  const i=rand(0,arr.length-1); const a=arr.splice(i,1)[0];
  const j=rand(0,arr.length-1); const b=arr.splice(j,1)[0];
  return [a,b];
}
function buildTimeline(winnerSide){
  const events=[]; let hp1=100, hp2=100;
  const hits = [1.4,2.5,3.7,4.8,6.0,7.2,8.4,9.6,10.8,12.0,13.2,14.2];
  for(let idx=0; idx<hits.length; idx++){
    let attacker = Math.random()<0.5 ? 1 : 2;
    if(idx>8) attacker = winnerSide;
    let dmg = idx===hits.length-1 ? 999 : rand(6,15);
    if(attacker===1) hp2=Math.max(winnerSide===2?8:0, hp2-dmg); else hp1=Math.max(winnerSide===1?8:0, hp1-dmg);
    if(idx===hits.length-1){ if(winnerSide===1) hp2=0; else hp1=0; }
    events.push({t:hits[idx], attacker, hp1, hp2, crit: idx===hits.length-1 || dmg>=14});
  }
  return events;
}

app.post('/api/manual-entry', (req,res)=>{ if(!checkPin(req)) return res.status(403).json({error:'bad pin'}); addEntrant(req.body.username); res.json({ok:true}); });
app.post('/api/reset', (req,res)=>{ if(!checkPin(req)) return res.status(403).json({error:'bad pin'}); state.entrants=[]; state.entrantSet=new Set(); state.duel=null; emit(); res.json({ok:true}); });
app.post('/api/roll', (req,res)=>{
  if(!checkPin(req)) return res.status(403).json({error:'bad pin'});
  const picked=pickTwo(); if(!picked) return res.status(400).json({error:'Need at least 2 entrants'});
  const winnerSide = Math.random()<0.5 ? 1 : 2;
  const winner = winnerSide===1 ? picked[0] : picked[1];
  const duel={ id:Date.now(), p1:picked[0], p2:picked[1], winner, winnerSide, startedAt:Date.now(), durationMs:15000, status:'fighting', events:buildTimeline(winnerSide)};
  state.duel=duel; state.history.unshift({winner, p1:picked[0], p2:picked[1], at:new Date().toISOString()});
  setTimeout(()=>{ if(state.duel && state.duel.id===duel.id){ state.duel.status='finished'; emit(); } }, 15000);
  emit(); res.json({ok:true, duel});
});

io.on('connection', s=>s.emit('state', serialize()));

async function startKick(){
  if(!CHANNEL){ state.lastError='Missing KICK_CHANNEL'; emit(); return; }
  try{
    const kick = require('@retconned/kick-js');
    const Client = kick.KickClient || kick.Client || kick.default || kick;
    const client = new Client(CHANNEL, { logger:false, readOnly:true });
    const onMsg = (msg)=>{
      const username = msg?.sender?.username || msg?.user?.username || msg?.username || msg?.sender || 'unknown';
      const content = String(msg?.content || msg?.message || msg?.text || '').trim();
      if(content.toLowerCase().startsWith(ENTRY_COMMAND)) addEntrant(username);
    };
    if(client.on){
      client.on('ready',()=>{state.connected=true; state.lastError=''; emit();});
      client.on('message',onMsg); client.on('chatMessage',onMsg); client.on('ChatMessage',onMsg);
      client.on('error',(e)=>{state.connected=false; state.lastError=e.message||String(e); emit();});
    }
    if(client.login) await client.login(); else if(client.connect) await client.connect();
    state.connected=true; state.lastError=''; emit();
  }catch(e){ state.connected=false; state.lastError=e.message||String(e); emit(); console.error(e); }
}

server.listen(PORT,'0.0.0.0',()=>{ console.log(`Duel minigame running on ${PORT}`); startKick(); });
