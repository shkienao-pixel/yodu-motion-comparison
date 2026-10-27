'use strict';
(()=>{
 const screen=document.querySelector('.alternative-screen'),heading=document.querySelector('h1'),copy=document.querySelector('.status-slot'),title=document.querySelector('[data-stage]'),dots=document.querySelector('.status-ellipsis'),announcement=document.querySelector('[data-announcement]'),fill=document.querySelector('.progress-fill'),percent=document.querySelector('[data-percent]'),bar=document.querySelector('[role="progressbar"]'),progress=document.querySelector('.progress-block'),gauge=document.querySelector('.network-gauge'),warning=document.querySelector('.warning'),retry=document.querySelector('.restart-task');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),embedded=parent!==window,mount=window.mountTaskStartupBends||window.initAlternativeBackground,query=new URLSearchParams(location.search);
 let cleanup=mount?.(screen),flow,frame=0,lastText='',lastPercent=-1,changedAt=0,closed=false,stateReceivedAt=performance.now();
 let state={phase:'idle',elapsed:0,progress:0,playing:false,stage:'准备启动',attempt:0};
 function needleAngle(quality,elapsed){
  const target=-90+quality*180;
  if(reduced.matches||elapsed>=4400)return target;
  const clamp=value=>Math.max(-90,Math.min(90,value));
  const points=[[0,-90],[1100,clamp(target-22)],[2050,clamp(target+13)],[3000,clamp(target-13)],[3850,clamp(target+7)],[4400,target]];
  for(let i=1;i<points.length;i++)if(elapsed<=points[i][0]){const [fromTime,fromAngle]=points[i-1],[toTime,toAngle]=points[i],t=Math.max(0,(elapsed-fromTime)/(toTime-fromTime)),smooth=t*t*(3-2*t);return fromAngle+(toAngle-fromAngle)*smooth}
  return target;
 }
 function drawNetworkGauge(){
  if(!gauge)return;
  const sample=state.networkSample||{quality:1,downloadMbps:32.6},quality=Math.max(0,Math.min(1,Number(sample.quality)||0));
  const elapsed=Math.min(5000,Math.max(0,(Number(state.elapsed)||0)+(state.playing?performance.now()-stateReceivedAt:0)));
  gauge.dataset.quality=quality<.25?'poor':'good';
  gauge.querySelector('.network-needle').style.transform='rotate('+needleAngle(quality,elapsed)+'deg)';
  gauge.querySelectorAll('[data-quality-index]').forEach(segment=>{const part=Math.max(0,Math.min(1,quality*4-Number(segment.dataset.qualityIndex)));segment.style.strokeDasharray=part+' 1'});
  const speed=gauge.querySelector('.network-speed-value'),speedText=Math.max(0,Number(sample.downloadMbps)||0).toFixed(1);if(speed.textContent!==speedText)speed.textContent=speedText;
  const label=gauge.querySelector('.network-quality-label'),qualityText='网络质量 '+Math.floor(quality*100)+'%';if(label.textContent!==qualityText)label.textContent=qualityText;
 }
 function draw(next){
  if(next){state=next;stateReceivedAt=performance.now()}
  const failed=state.phase==='network-error'||state.phase==='timeout',complete=state.phase==='complete',checking=state.phase==='checking';
  const value=state.phase==='network-error'?'请切换至更稳定的网络后运行':state.phase==='timeout'?'请重新启动任务':complete?'启动完成':state.stage||'准备启动';
  const headline=state.phase==='network-error'?'网络不稳定':state.phase==='timeout'?'启动超时':complete?'YODU已就绪':'YODU启动中';
  if(value!==lastText){title.textContent=value;announcement.textContent=failed?headline+'，'+value:value;lastText=value;changedAt=performance.now()}
  if(heading.textContent!==headline)heading.textContent=headline;
  screen.dataset.phase=state.phase;screen.dataset.paused=String(!state.playing||failed||complete||document.hidden);
  copy.style.opacity=failed||!state.playing||reduced.matches?'1':String(Math.min(1,(performance.now()-changedAt)/200));
  dots.hidden=failed||complete||state.phase==='idle';
  retry.hidden=!failed;progress.hidden=state.phase!=='starting'&&!complete&&state.phase!=='timeout';warning.hidden=failed||complete||state.phase==='idle';
  if(gauge){gauge.hidden=!checking;if(checking)drawNetworkGauge()}
  const valueProgress=Math.max(0,Math.min(1,Number(state.progress)||0));fill.style.transform='scaleX('+valueProgress+')';
  const whole=Math.floor(valueProgress*100);if(whole!==lastPercent){percent.textContent=whole;bar.setAttribute('aria-valuenow',whole);lastPercent=whole}
 }
 function stop(){cancelAnimationFrame(frame);frame=0}
 function tick(){frame=0;if(flow)draw(flow.read());else draw();if(!closed&&!document.hidden&&state.playing)frame=requestAnimationFrame(tick)}
 function run(){if(!frame&&!closed&&!document.hidden&&state.playing)frame=requestAnimationFrame(tick)}
 function createFlow(){return window.createYoduStartupFlow({forceNetworkFailure:query.get('network')==='poor',forceTimeout:query.get('startup')==='timeout',onChange:()=>{if(flow&&!closed){draw(flow.read());run()}}})}
 function begin(){flow.start();draw(flow.read());run()}
 function receive(event){if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='yodu-preview-state')return;const next=event.data.state;if(!next||typeof next.phase!=='string'||!Number.isFinite(next.progress))return;draw(next);if(state.playing)run();else stop()}
 retry.addEventListener('click',()=>{if(embedded)parent.postMessage({type:'yodu-preview-restart'},location.origin);else begin()});
 function visibility(){if(document.hidden){stop();screen.dataset.paused='true'}else{draw(flow?.read());run();if(embedded)parent.postMessage({type:'yodu-preview-ready'},location.origin)}}
 addEventListener('message',receive);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',()=>draw());
 addEventListener('pagehide',()=>{closed=true;stop();cleanup?.();cleanup=null;flow?.dispose();flow=null});
 addEventListener('pageshow',event=>{if(event.persisted){closed=false;cleanup=mount?.(screen);if(embedded)parent.postMessage({type:'yodu-preview-ready'},location.origin);else{flow=createFlow();begin()}}});
 if(embedded){draw();parent.postMessage({type:'yodu-preview-ready'},location.origin)}else{flow=createFlow();begin()}
})();
