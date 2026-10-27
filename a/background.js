/* React Bits Color Bends, adapted to the approved white startup scene.
   Original component and license: vendor/react-bits/ (MIT + Commons Clause). */
(function(){
 'use strict';
 const scriptURL=new URL(document.currentScript?.src||'task-startup-bends.js',document.baseURI);
 const fragmentURL=new URL('task-startup-bends.frag',scriptURL);fragmentURL.search=scriptURL.search;
 const mounted=new WeakMap();
 let sourcePromise;
 function fragmentSource(){
  if(!sourcePromise)sourcePromise=fetch(fragmentURL.href).then(response=>{if(!response.ok)throw Error('Startup background unavailable');return response.text()}).catch(error=>{sourcePromise=null;throw error});
  return sourcePromise;
 }
 window.mountTaskStartupBends=function(surface){
  if(!surface)return ()=>{};
  mounted.get(surface)?.();
  const layer=document.createElement('div');layer.className='color-bends-layer';layer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');layer.append(canvas);surface.prepend(layer);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let gl,program,buffer,observer,uniforms,raf=0,last=0,lastDraw=0,time=0,disposed=false,lost=false,pageHidden=false;
  const shaders=new Set();
  function stop(){cancelAnimationFrame(raf);raf=0;last=0}
  function cleanup(){
   if(disposed)return;
   disposed=true;stop();observer?.disconnect();
   reduce.removeEventListener('change',resume);document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow);
   canvas.removeEventListener('webglcontextlost',onContextLost);
   if(gl){
    shaders.forEach(shader=>gl.deleteShader(shader));shaders.clear();
    if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);
    if(!lost)gl.getExtension('WEBGL_lose_context')?.loseContext();
   }
   layer.remove();
   if(mounted.get(surface)===cleanup){mounted.delete(surface);delete surface.dataset.bendsReady}
  }
  mounted.set(surface,cleanup);
  function onContextLost(){lost=true;cleanup()}
  function onPageHide(){pageHidden=true;stop()}
  function onPageShow(){pageHidden=false;resume()}
  function compile(type,source){
   const shader=gl.createShader(type);shaders.add(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'Startup shader compilation failed');
   return shader;
  }
  function paint(){
   if(disposed||lost||!uniforms||document.hidden||pageHidden)return;
   gl.uniform1f(uniforms.time,time);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function resize(){
   if(disposed||lost||!uniforms)return;
   const r=surface.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.35);
   canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));
   gl.viewport(0,0,canvas.width,canvas.height);
   gl.uniform2f(uniforms.canvas,Math.max(r.width,r.height*(750/598)),r.height);paint();
  }
  function loop(now){
   raf=0;if(disposed||lost||document.hidden||pageHidden||reduce.matches)return;
   if(!surface.isConnected){cleanup();return}
   const dt=last?Math.min(.08,(now-last)/1000):0;last=now;
   if(surface.dataset.paused!=='true')time+=dt;
   if(now-lastDraw>=1000/30){paint();lastDraw=now}
   raf=requestAnimationFrame(loop);
  }
  function resume(){
   stop();if(disposed||lost||!uniforms||document.hidden||pageHidden)return;
   paint();if(!reduce.matches)raf=requestAnimationFrame(loop);
  }
  (async()=>{
   try{
    const fragment=await fragmentSource();if(disposed)return;
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
    if(!gl){cleanup();return}
    const vertex='attribute vec2 aPosition; varying vec2 vUv; void main(){vUv=aPosition*0.5+0.5;gl_Position=vec4(aPosition,0.0,1.0);}';
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Startup shader link failed');
    shaders.forEach(shader=>gl.deleteShader(shader));shaders.clear();
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const loc=name=>gl.getUniformLocation(program,name);uniforms={time:loc('uTime'),canvas:loc('uCanvas')};
    const float=(name,value)=>gl.uniform1f(loc(name),value),integer=(name,value)=>gl.uniform1i(loc(name),value);
    float('uSpeed',.2);float('uScale',1);float('uFrequency',1);float('uWarpStrength',1);float('uMouseInfluence',1);float('uParallax',.5);float('uNoise',.15);float('uIntensity',1.5);float('uBandWidth',6);
    integer('uTransparent',1);integer('uIterations',1);integer('uColorCount',1);
    gl.uniform2f(loc('uPointer'),0,0);gl.uniform2f(loc('uRot'),Math.cos(Math.PI/2),Math.sin(Math.PI/2));
    const colors=new Float32Array(24);colors.set([168/255,85/255,247/255]);gl.uniform3fv(loc('uColors[0]'),colors);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
    observer=new ResizeObserver(resize);observer.observe(surface);
    reduce.addEventListener('change',resume);document.addEventListener('visibilitychange',resume);
    window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);
    canvas.addEventListener('webglcontextlost',onContextLost);
    resize();surface.dataset.bendsReady='true';resume();
   }catch(error){
    if(disposed)return;
    cleanup();console.warn('Startup animation uses its CSS fallback.',error.message);
   }
  })();
  return cleanup;
 };
})();
