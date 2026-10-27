'use strict';
(()=>{
 const frames=[...document.querySelectorAll('.phone-frame')],play=document.querySelector('#play'),cases=[...document.querySelectorAll('[data-scenario]')],query=new URLSearchParams(location.search);
 let flow,frame=0,lastBroadcast=0,closed=false;
 function createFlow(){return window.createYoduStartupFlow({forceNetworkFailure:query.get('network')==='poor',forceTimeout:query.get('startup')==='timeout',onChange:()=>{if(!closed&&flow){paint();run()}}})}
 function send(state,target){const message={type:'yodu-preview-state',state};if(target)target.postMessage(message,location.origin);else frames.forEach(item=>item.contentWindow?.postMessage(message,location.origin))}
 function paint(target){
  const state=flow.read();play.dataset.playing=String(state.playing);play.setAttribute('aria-label',state.playing?'暂停四版动效':'播放四版动效');
  const selected=state.phase==='checking'&&state.networkSample?.quality<.25?'network-error':state.phase;
  cases.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scenario===selected)));
  send(state,target);return state;
 }
 function stop(){cancelAnimationFrame(frame);frame=0}
 function tick(now){frame=0;const state=flow.read();if(now-lastBroadcast>=1000/30||!state.playing){paint();lastBroadcast=now}if(state.playing&&!document.hidden)frame=requestAnimationFrame(tick)}
 function run(){if(!closed&&!frame&&flow.read().playing&&!document.hidden)frame=requestAnimationFrame(tick)}
 function start(){flow.start();lastBroadcast=0;paint();run()}
 play.addEventListener('click',()=>{const state=flow.read();if(state.playing)flow.pause();else if(['idle','network-error','timeout','complete'].includes(state.phase))flow.start();else flow.resume();paint();if(flow.read().playing)run();else stop()});
 cases.forEach(button=>button.addEventListener('click',()=>{flow.showcase(button.dataset.scenario);paint();if(flow.read().playing)run();else stop()}));
 addEventListener('message',event=>{
  if(event.origin!==location.origin||!frames.some(item=>item.contentWindow===event.source))return;
  if(event.data?.type==='yodu-preview-ready')paint(event.source);
  else if(event.data?.type==='yodu-preview-restart')start();
 });
 frames.forEach(item=>item.addEventListener('load',()=>paint(item.contentWindow)));
 const resize=new ResizeObserver(entries=>entries.forEach(entry=>{entry.target.querySelector('iframe').style.transform='scale('+entry.contentRect.width/390+')'}));
 function observe(){document.querySelectorAll('.phone-window').forEach(item=>resize.observe(item))}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(!closed){paint();run()}});
 addEventListener('pagehide',()=>{closed=true;stop();resize.disconnect();flow.dispose()});
 addEventListener('pageshow',event=>{if(event.persisted){closed=false;flow=createFlow();observe();paint()}});
 flow=createFlow();observe();paint();
})();
