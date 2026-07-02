let state={}, lastDuelId=null, playedEvents=new Set();
const socket=io(); socket.on('state',s=>{state=s; render();});
setInterval(async()=>{try{state=await fetch('/api/state').then(r=>r.json()); render();}catch(e){}},1000);
function $(id){return document.getElementById(id)}
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function render(){
 $('ocount').textContent=state.entrants?.length||0; $('ocmd').textContent=state.command||'!duel';
 const d=state.duel; const arena=document.querySelector('.arena');
 if(!d){ arena.className='arena'; $('p1').textContent='PLAYER 1'; $('p2').textContent='PLAYER 2'; setHp(1,100); setHp(2,100); $('timer').textContent='Waiting'; $('status').textContent='ROLL TWO FIGHTERS'; $('winner').textContent=''; return; }
 if(d.id!==lastDuelId){ lastDuelId=d.id; playedEvents=new Set(); }
 $('p1').textContent='@'+d.p1; $('p2').textContent='@'+d.p2;
 const elapsed=Math.min(15000, Date.now()-d.startedAt); const remain=Math.max(0, Math.ceil((15000-elapsed)/1000));
 $('timer').textContent=d.status==='finished'?'Finished':'00:'+String(remain).padStart(2,'0');
 let hp1=100,hp2=100;
 for(const ev of d.events||[]){ if(elapsed>=ev.t*1000){ hp1=ev.hp1; hp2=ev.hp2; if(!playedEvents.has(ev.t)){ playedEvents.add(ev.t); impact(ev.attacker); }}}
 if(d.status==='finished'||elapsed>=15000){ hp1=d.winnerSide===1?Math.max(hp1,1):0; hp2=d.winnerSide===2?Math.max(hp2,1):0; arena.className='arena finished'; $('status').textContent='DUEL COMPLETE'; $('winner').textContent='🏆 @'+d.winner+' WINS'; f1.classList.toggle('win',d.winnerSide===1); f2.classList.toggle('win',d.winnerSide===2); f1.classList.toggle('lose',d.winnerSide!==1); f2.classList.toggle('lose',d.winnerSide!==2);
 } else { arena.className='arena fighting'; $('status').textContent='SWORDS CLASHING'; $('winner').textContent=''; f1.className='fighter fighter-left'; f2.className='fighter fighter-right'; }
 setHp(1,hp1); setHp(2,hp2);
}
function setHp(side,val){ val=Math.max(0,Math.min(100,Math.round(val))); $(`hp${side}`).style.width=val+'%'; $(`hp${side}txt`).textContent=val; }
function impact(attacker){ const arena=document.querySelector('.arena'); arena.classList.remove('hit1','hit2'); void arena.offsetWidth; arena.classList.add(attacker===1?'hit1':'hit2'); spark.classList.remove('boom'); void spark.offsetWidth; spark.classList.add('boom'); setTimeout(()=>arena.classList.remove('hit1','hit2'),260); }
