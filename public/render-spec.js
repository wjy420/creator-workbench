// Shared source-pixel geometry for browser previews and FFmpeg exports.
export const referenceSubtitleStyle={subtitleColor:'#65efb3',subtitleOutlineWidth:0,subtitleBackgroundEnabled:true,subtitleBackgroundColor:'#000000',subtitleBackgroundOpacity:100,subtitleBackgroundPadding:18,subtitleBackgroundRadius:16};
export const defaults={barEnabled:true,barColor:'#648bff',barOpacity:100,barBackgroundColor:'#ffffff',barBackgroundOpacity:35,barHeight:4,barMargin:48,subtitleEnabled:true,fontSize:42,subtitleColor:'#ffffff',subtitleOutlineColor:'#202020',subtitleOutlineWidth:2,subtitleBackgroundEnabled:false,subtitleBackgroundColor:'#000000',subtitleBackgroundOpacity:65,subtitleBackgroundPadding:8,subtitleMargin:110,maxChars:18,musicEnabled:true,musicVolume:15,ducking:true,fadeIn:1.5,fadeOut:2,bitrateKbps:3000,resolution:'1080p',coverHorizontalResolution:'1K',coverHorizontalRatio:'16:9',coverVerticalResolution:'1K',coverVerticalRatio:'9:16',...referenceSubtitleStyle};
export function barLayout(p,c){const margin=c.barMargin;return {x:margin,y:p.height-margin-c.barHeight,width:Math.max(0,p.width-2*margin),height:c.barHeight}}
export function assColor(hex,opacity=100){const alpha=Math.round(255*(1-opacity/100)).toString(16).padStart(2,'0');return '&H'+alpha+hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3)}
export function rgba(hex,opacity=100){return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${(255-Math.round(255*(1-opacity/100)))/255})`}
export function subtitleLines(text,maxChars){const clean=text.replace(/[{}\\]/g,'').replace(/\r/g,'');return clean.split('\n').flatMap(line=>{const chars=Array.from(line);const out=[];for(let i=0;i<chars.length;i+=maxChars)out.push(chars.slice(i,i+maxChars).join(''));return out}).join('\\N')}
export const resolutionOptions=[['480p','480p'],['720p','720p'],['1080p','1080p'],['2k','2K'],['original','原画']];
export function outputSize(p,resolution='1080p'){
 const shortEdge={'480p':480,'720p':720,'1080p':1080,'2k':1440}[resolution];
 const scale=shortEdge?shortEdge/Math.min(p.width,p.height):1;
 const even=n=>Math.max(2,Math.round(n/2)*2);
 return {width:even(p.width*scale),height:even(p.height*scale)};
}

export const coverResolutionOptions=[['1K','1K'],['2K','2K'],['4K','4K']];
export const coverRatioOptions=[['16:9','16:9'],['9:16','9:16'],['4:3','4:3'],['3:4','3:4'],['1:1','1:1']];
export function coverSize(resolution,ratio){
 const sizes={
  '1K':{'16:9':[1280,720],'9:16':[720,1280],'4:3':[1152,864],'3:4':[864,1152],'1:1':[1024,1024]},
  '2K':{'16:9':[2048,1152],'9:16':[1152,2048],'4:3':[2048,1536],'3:4':[1536,2048],'1:1':[2048,2048]},
  '4K':{'16:9':[3840,2160],'9:16':[2160,3840],'4:3':[3264,2448],'3:4':[2448,3264],'1:1':[2880,2880]}
 };const [width,height]=sizes[resolution][ratio];return {width,height};
}
export function requestTaskLanes(type,slot){
 if(type==='cover')return slot==='horizontal'?['coverHorizontal']:slot==='vertical'?['coverVertical']:['cover','coverHorizontal','coverVertical'];
 return ['copy','transcribe','export','pipeline'].includes(type)?[type]:[];
}
export function taskLanes(job){
 if(job.status!=='running')return [];
 if(job.type==='pipeline'){const running=Object.entries(job.stages||{}).filter(([,stage])=>stage.status==='running').flatMap(([lane])=>lane==='cover'?requestTaskLanes('cover'):[lane]);return [...new Set(['pipeline',...running,...(!running.length&&job.activeLane?(job.activeLane==='cover'?requestTaskLanes('cover'):[job.activeLane]):[])])];}
 return requestTaskLanes(job.type,job.coverSlot);
}
export function jobForLane(job,lane){
 const slot=lane==='coverHorizontal'?'horizontal':lane==='coverVertical'?'vertical':null,parent=job.type==='pipeline'?job.stages?.cover:job,coverStage=slot&&parent?.coverStages?.[slot];
 if(coverStage){const stage=coverStage.status==='running'&&(parent.status==='error'||job.status==='error')?{...coverStage,status:'error',message:parent.message||job.message}:coverStage;return {...job,...stage,message:stage.status==='running'?parent.message:stage.message,progress:stage.status==='running'?parent.progress:stage.progress}}
 if(job.type!=='pipeline')return requestTaskLanes(job.type,job.coverSlot).includes(lane)?job:null;
 if(lane==='pipeline')return job;
 const stage=job.stages?.[lane]||(['coverHorizontal','coverVertical'].includes(lane)?job.stages?.cover:null);if(!stage)return null;
 return {...job,...stage,createdAt:stage.createdAt||job.createdAt,message:stage.message||job.message,progress:stage.progress??job.progress};
}
