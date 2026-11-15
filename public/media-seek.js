const mediaPlaybackRequests=new WeakMap();
function mediaPlaybackState(media){if(!mediaPlaybackRequests.has(media))mediaPlaybackRequests.set(media,{version:0,wantsPlay:false,pending:null});return mediaPlaybackRequests.get(media)}
function pauseMedia(media){if(!media)return;const state=mediaPlaybackState(media);state.version++;state.wantsPlay=false;state.pending=null;media.pause()}
function playMedia(media,onError=()=>{}){if(!media||!media.isConnected)return Promise.resolve(false);const state=mediaPlaybackState(media);if(state.wantsPlay&&state.pending)return state.pending;const version=++state.version;state.wantsPlay=true;
 const request=Promise.resolve().then(()=>{if(state.version!==version||!state.wantsPlay||!media.isConnected)return false;return media.play()}).then(result=>result===false?false:true).catch(e=>{
  if(state.version!==version||!media.isConnected||e.name==='AbortError')return false;
  state.wantsPlay=false;const message=e.name==='NotAllowedError'?'浏览器尚未允许播放，请再点击播放按钮。':e.name==='NotSupportedError'?'无法播放此文件：浏览器不支持该编码，或媒体文件无法读取。':e.message||'播放失败，请稍后重试。';onError(new Error(message));return false;
 }).finally(()=>{if(state.version===version)state.pending=null});state.pending=request;return request;
}
function wantsMediaPlayback(media){const state=mediaPlaybackRequests.get(media);return !!(state?.wantsPlay&&state.pending)||!media.paused&&!media.ended}
function bindMediaSeek(bar,media,{fallbackDuration=0,onSeek=()=>{},onError=()=>{}}={}){
 bar._mediaSeek?.destroy();const controller=new AbortController(),listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:controller.signal});
 let pointerId=null,targetTime=0,resume=false,hoverTime=null;
 const duration=()=>Number.isFinite(media.duration)&&media.duration>0?media.duration:Number(fallbackDuration)||0;
 const ready=()=>Number.isFinite(media.duration)&&media.duration>0&&media.readyState>=1;
 const clock=t=>{const seconds=Math.max(0,Math.floor(t||0));return (seconds>=3600?Math.floor(seconds/3600)+':':'')+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
 bar.classList.add('media-seek');bar.setAttribute('role','slider');bar.setAttribute('aria-orientation','horizontal');bar.tabIndex=0;
 bar.innerHTML='<i class="media-seek-fill"></i><span class="media-seek-thumb" aria-hidden="true"></span><span class="media-seek-tooltip" aria-hidden="true"></span>';
 const tooltip=bar.querySelector('.media-seek-tooltip');
 function update(){const total=duration(),time=Math.min(total,Math.max(0,pointerId!==null?targetTime:media.currentTime||0)),percent=total?time/total*100:0;
  bar.style.setProperty('--played',percent+'%');bar.querySelector('i').style.width=percent+'%';bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-valuenow',time.toFixed(1));bar.setAttribute('aria-valuetext',clock(time)+' / '+clock(total));bar.setAttribute('aria-disabled',String(!ready()));
  const shown=pointerId!==null?targetTime:hoverTime??time;tooltip.textContent=clock(shown);bar.style.setProperty('--seek-hint',total?shown/total*100+'%':'0%');
 }
 function fromPointer(event){const rect=bar.getBoundingClientRect();return Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)))*duration()}
 function seek(time){if(!ready())return;targetTime=Math.max(0,Math.min(duration(),time));try{media.currentTime=targetTime;update();onSeek()}catch(e){onError(e)}}
 function finish(event){if(pointerId===null||event.pointerId!==pointerId)return;const captured=pointerId;pointerId=null;bar.classList.remove('is-dragging');if(bar.hasPointerCapture(captured))bar.releasePointerCapture(captured);update();if(resume&&media.isConnected)playMedia(media,onError);resume=false}
 listen(bar,'pointerdown',event=>{if(!ready()||pointerId!==null||!event.isPrimary||event.button!==0)return;event.preventDefault();bar.focus({preventScroll:true});pointerId=event.pointerId;resume=wantsMediaPlayback(media);pauseMedia(media);bar.classList.add('is-dragging');bar.setPointerCapture(pointerId);seek(fromPointer(event))});
 listen(bar,'pointermove',event=>{if(pointerId!==null){if(event.pointerId===pointerId)seek(fromPointer(event))}else{hoverTime=fromPointer(event);update()}});
 listen(bar,'pointerleave',()=>{hoverTime=null;update()});
 listen(bar,'pointerup',event=>{if(event.pointerId===pointerId)seek(fromPointer(event));finish(event)});
 listen(bar,'pointercancel',finish);listen(bar,'lostpointercapture',finish);
 listen(bar,'keydown',event=>{if(!ready())return;const total=duration(),step=event.shiftKey?1:5,current=media.currentTime||0,targets={ArrowLeft:current-step,ArrowRight:current+step,ArrowDown:current-step,ArrowUp:current+step,Home:0,End:total,PageDown:current-total*.1,PageUp:current+total*.1};if(event.key in targets){event.preventDefault();hoverTime=null;seek(targets[event.key])}});
 for(const type of ['loadedmetadata','durationchange','timeupdate','seeking','seeked','ended','emptied'])listen(media,type,update);
 bar._mediaSeek={update,destroy:()=>{controller.abort();if(pointerId!==null&&bar.hasPointerCapture(pointerId))bar.releasePointerCapture(pointerId)}};update();return bar._mediaSeek;
}
