import http from 'node:http';
import {runPipeline,updatePipelineProgress} from './src/pipeline.mjs';
import {createPromptLogs} from './src/prompt-logs.mjs';
import {buildProjectBundle} from './src/project-bundle.mjs';
import {applyProjectSettings,matchesPreset} from './src/project-settings.mjs';
import {coverPlanRequest,parseCoverPlan,updateCoverPrompt} from './src/cover-plan.mjs';
import {createLibrary} from './src/library.mjs';
import {validateConfig,normalizeConfig} from './src/config.mjs';
import {videoRateArgs,measuredRates} from './src/encoding.mjs';
import {referenceSubtitleStyle,outputSize,coverSize,requestTaskLanes,taskLanes} from './public/render-spec.js';
import {subtitlePreview,subtitleTimeline} from './src/preview.mjs';
import {mergeSettings} from './src/settings.mjs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {makeAss,parseSrt,toSrt,defaults} from './src/media.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),data=process.env.DATA_DIR||path.join(root,'data'),port=Number(process.env.PORT||8769);
await fsp.mkdir(data,{recursive:true});
const dbFile=path.join(data,'workspace.json');
let db;try{db=JSON.parse(await fsp.readFile(dbFile,'utf8'));}catch{db={projects:[],presets:[{id:'default',name:'日常口播 · 简洁蓝',config:defaults}],settings:{deepseekBase:'https://api.deepseek.com',deepseekModel:'deepseek-flash',imageBase:'https://yunwu.org/v1',imageModel:'gpt-image-2.5-flare-c',asrBase:'https://yunwu.org/v1',asrModel:'whisper-1'}};}
db.settings={whisperModel:'small',whisperDevice:'auto',whisperLanguage:'zh',...db.settings};
const whisperPython=process.env.WHISPER_PYTHON||path.join(root,'.venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
const whisperScript=process.env.WHISPER_SCRIPT||path.join(root,'scripts','whisper_local.py');
const whisperRuntimeArgs=whisperScript.endsWith('.py')?['-u']:[];
const whisperCache=process.env.WHISPER_CACHE||path.join(data,'models');
let whisperQueue=Promise.resolve();
for(const p of db.projects)p.config=normalizeConfig({...p.config,...(p.config?.subtitleBackgroundRadius===undefined?referenceSubtitleStyle:{})});
for(const p of db.presets)p.config=normalizeConfig(p.config);
let saveQueue=Promise.resolve();function save(){const snapshot=JSON.stringify(db,null,2);saveQueue=saveQueue.catch(()=>{}).then(async()=>{await fsp.writeFile(dbFile+'.tmp',snapshot);await fsp.rename(dbFile+'.tmp',dbFile)});return saveQueue;}
const jobs=new Map();
const promptLogs=createPromptLogs({directory:p=>path.join(data,p.id),remote,secrets:()=>[db.settings.deepseekKey,db.settings.imageKey,db.settings.asrKey]});
const library=await createLibrary({db,data,probe,save,jobs,send,json,fileResponse});
const bundleDir=path.join(data,'project-bundles'),bundles=new Map();await fsp.mkdir(bundleDir,{recursive:true});for(const file of await fsp.readdir(bundleDir))if(/^[a-f0-9-]+\.zip$/.test(file)){const target=path.join(bundleDir,file);if(Date.now()-(await fsp.stat(target)).mtimeMs>3600000)await fsp.rm(target,{force:true})}
let correctedPreset=false;for(const p of db.projects)if(p.presetId&&!matchesPreset(p,db.presets.find(x=>x.id===p.presetId))){p.presetId=null;correctedPreset=true}if(correctedPreset)await save();
function run(exe,args,onProgress){return new Promise((resolve,reject)=>{let out='',err='';const child=spawn(exe,args,{windowsHide:true});child.stdout.on('data',d=>{out+=d;onProgress?.(d.toString())});child.stderr.on('data',d=>err=(err+d).slice(-14000));child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(new Error(err.slice(-2500)||`${exe} 退出码 ${code}`)));});}
async function probe(file){return JSON.parse(await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));}
function project(id){const p=db.projects.find(x=>x.id===id);if(!p)throw new Error('项目不存在');return p;}
const dir=p=>path.join(data,p.id);const urlFile=(p,name)=>`/media/${p.id}/${encodeURIComponent(name)}`;
const cleanName=s=>path.basename(s||'file').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,150);
function task(type,p,fn,metadata={}){const id=crypto.randomUUID();const j={id,type,projectId:p?.id,status:'running',progress:0,message:'准备中',createdAt:Date.now(),...metadata};jobs.set(id,j);Promise.resolve().then(()=>fn(j)).then(async r=>{j.result=r;j.status='done';j.progress=100;j.message='已完成';await save()}).catch(e=>{j.status='error';j.message=e.message});return j;}
async function json(req){let s='';for await(const c of req){s+=c;if(s.length>4e6)throw new Error('请求过大')}return s?JSON.parse(s):{};}
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
async function remote(base,endpoint,key,body,form=false,onResponse){if(!/^https?:\/\//.test(base))throw new Error('API 地址必须以 http:// 或 https:// 开头');if(!key)throw new Error('请先在设置中填写 API Key');const r=await fetch(base.replace(/\/$/,'')+endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(600000)});onResponse?.(r.status);const text=await r.text();let result;try{result=JSON.parse(text)}catch{throw new Error(`接口返回非 JSON（HTTP ${r.status}），请检查地址`)}if(!r.ok||result.error)throw new Error(`API ${r.status}: ${String(result.error?.message||result.message||text).slice(0,600)}`);return result;}
function publicSettings(){const s={...db.settings};for(const k of ['deepseekKey','imageKey','asrKey']){s[k+'Set']=!!s[k];delete s[k]}return s;}
async function transcribe(p,j){
if(!p.hasAudio)throw new Error('此视频没有音轨，可手动导入字幕');
const s={...db.settings};j.message='等待本地 Whisper 识别';
const operation=whisperQueue.catch(()=>{}).then(async()=>{
 const audio=path.join(dir(p),'whisper-audio.wav'),output=path.join(dir(p),'whisper-result.json');
 try{
  j.message='正在本地提取音轨';
  await run('ffmpeg',['-y','-i',path.join(dir(p),p.source),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',audio]);
  let pending='';
  await run(whisperPython,[...whisperRuntimeArgs,whisperScript,'--input',audio,'--output',output,'--cache',whisperCache,'--model',s.whisperModel,'--device',s.whisperDevice,'--language',s.whisperLanguage],chunk=>{
   pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const event=JSON.parse(line);if(event.message)j.message=event.message;if(Number.isFinite(event.progress))j.progress=Math.min(99,event.progress)}catch{}}
  });
  const result=JSON.parse(await fsp.readFile(output,'utf8'));
  const segments=result.segments.filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.start<p.duration).map(x=>({...x,start:Math.max(0,x.start),end:Math.min(p.duration,x.end)}));
  if(!segments.length)throw new Error('本地 Whisper 未检测到讲话内容，请检查音轨或手动导入字幕');
  p.subtitles=segments;p.transcription={engine:'faster-whisper',model:result.model,device:result.device,language:result.language};
  return {count:segments.length,...p.transcription};
 }finally{await fsp.rm(audio,{force:true})}
});whisperQueue=operation;return operation;
}
async function copywriting(p,j,prompt){if(!p.subtitles?.length)throw new Error('请先识别讲话内容或导入字幕');const s=db.settings,originalPrompt=p.prompt;j.message='正在理解视频并生成四个平台的文案';const r=await promptLogs.request(p,j,{category:'copy'},s.deepseekBase,'/chat/completions',s.deepseekKey,{model:s.deepseekModel,messages:[{role:'system',content:'你是中文自媒体编辑。只以提供的文稿为事实依据，不编造收益、数据或经历。用户提示仅用于创作方向。返回 JSON 对象，字段 platforms 是数组，恰好包含四项，platform 分别为抖音、视频号、小红书、B站，每项有 title、description、tags(字符串数组)、alternatives(2个备选标题)。另有 coverTitle(简短封面标题)、coverPrompt(有创意且贴合内容的中文封面视觉描述)。自定义创作方向同时用于 title、alternatives 和 description 的内容重点、受众与语气，但必须忠于文稿。标题可以按平台特点有吸引力，不承诺流量。description 必须是简单的视频内容介绍：只写 1 句自然语言，建议 20–50 个汉字，最多 60 字，直接说明这条视频讲了什么。不要复述完整文稿，不要写步骤、目录、报告结构或分析过程；不要分段、列点、堆砌术语、写营销口号或引导点赞关注，也不要把话题标签写入简介。四个平台的简介都保持同样简洁，不能因为平台差异扩写。tags 单独返回，最多 3 个。'},{role:'user',content:JSON.stringify({direction:prompt,transcript:p.subtitles.map(x=>x.text).join('\n').slice(0,80000)})}],response_format:{type:'json_object'},stream:false});let text=r.choices?.[0]?.message?.content;if(!text)throw new Error('模型未返回文案');const parsed=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));if(!Array.isArray(parsed.platforms)||parsed.platforms.length!==4)throw new Error('文案结构不完整，请重试');for(const item of parsed.platforms){if(typeof item.title!=='string'||typeof item.description!=='string')throw new Error('返回文案缺少标题或简介')}p.copy=parsed;if(p.prompt===originalPrompt)p.prompt=prompt;await fsp.writeFile(path.join(dir(p),'copy.json'),JSON.stringify(parsed,null,2));return parsed;}
async function cover(p,j,direction,onlySlot,imagePrompt,planId,planningContext=p){
 const s={...db.settings},c=validateConfig(p.config),originalDirection=p.coverDirection;
 if(!onlySlot)j.coverStages=Object.fromEntries(['horizontal','vertical'].map(slot=>[slot,{status:'running',createdAt:Date.now(),progress:0}]));
 let plan;
 if(onlySlot){if(imagePrompt!==undefined){updateCoverPrompt(p,onlySlot,imagePrompt,planId);await save()}const saved=p.coverPlan?.[onlySlot]||p.cover?.[onlySlot];if(!saved?.prompt)throw new Error('没有可复用的提示词，请先点击「生成封面」');plan={[onlySlot]:structuredClone(saved)};}
 else{
  j.message='正在由 LLM 策划风格统一的横竖版提示词';
  const response=await promptLogs.request(p,j,{category:'cover',stage:'planning'},s.deepseekBase,'/chat/completions',s.deepseekKey,coverPlanRequest(planningContext,direction,c,s.deepseekModel));
  plan={...parseCoverPlan(response,c),id:crypto.randomUUID(),createdAt:new Date().toISOString()};p.coverPlan=plan;if(p.coverDirection===originalDirection)p.coverDirection=direction;await save();
 }
 const targets=[['horizontal','横版封面','coverHorizontal'],['vertical','竖版封面','coverVertical']].filter(([slot])=>!onlySlot||slot===onlySlot);
 let completed=0;j.message=onlySlot?'正在复用提示词重新生成'+targets[0][1]:'提示词策划完成，正在生成横竖两张封面';
 const results=await Promise.allSettled(targets.map(async([slot,label,prefix])=>{
  const saved=plan[slot],resolution=saved.resolution||c[prefix+'Resolution'],ratio=saved.ratio||c[prefix+'Ratio'],size={width:saved.requestedWidth||saved.width,height:saved.requestedHeight||saved.height},prompt=saved.prompt;
  if(!size.width||!size.height)Object.assign(size,coverSize(resolution,ratio));
  try{
   const r=await promptLogs.request(p,j,{category:'cover',slot},s.imageBase,'/images/generations',s.imageKey,{model:s.imageModel,prompt,size:`${size.width}x${size.height}`,n:1});
   const item=r.data?.[0];let bytes;
   if(item?.b64_json)bytes=Buffer.from(item.b64_json,'base64');else if(item?.url){const response=await fetch(item.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('图片下载失败');bytes=Buffer.from(await response.arrayBuffer())}else throw new Error('生图接口未返回图片或下载地址');
   if(bytes.length>60e6)throw new Error('图片文件过大');
   const file=crypto.randomUUID()+`-cover-${slot}.png`,absolute=path.join(dir(p),file);await fsp.writeFile(absolute,bytes);
   let stream;try{stream=(await probe(absolute)).streams.find(x=>x.codec_type==='video');if(!stream?.width||!stream?.height)throw new Error('生图接口未返回有效图片')}catch(e){await fsp.rm(absolute,{force:true});throw e}
   const artifact=await library.addArtifact(p,{file,type:'image',label,width:stream.width,height:stream.height,resolution,ratio,requestedWidth:size.width,requestedHeight:size.height});
   if(p.cover?.mode!=='separate'){
    const previous=p.cover;const legacy=key=>{const url=previous?.[key+'Url'];if(!url)return null;const record=db.artifacts.find(a=>a.url===url);return {url,width:record?.width,height:record?.height,artifactId:record?.id}};
    p.cover={mode:'separate',horizontal:legacy('horizontal'),vertical:legacy('vertical')};
   }
   p.cover[slot]={url:artifact.url,width:stream.width,height:stream.height,resolution,ratio,requestedWidth:size.width,requestedHeight:size.height,exactSize:stream.width===size.width&&stream.height===size.height,artifactId:artifact.id,prompt,planId:p.coverPlan?.id||null,date:artifact.date};
   p.cover[slot+'Url']=artifact.url;p.cover.artifactIds=[p.cover.horizontal?.artifactId,p.cover.vertical?.artifactId].filter(Boolean);await save();
   if(!onlySlot)Object.assign(j.coverStages[slot],{status:'done',progress:100,message:'已完成'});
  }catch(e){const message=`${label}生成失败：${e.message}`;if(!onlySlot)Object.assign(j.coverStages[slot],{status:'error',message});throw new Error(message)}finally{completed++;j.progress=Math.round(completed/targets.length*95);if(completed<targets.length)j.message='已处理 '+completed+'/'+targets.length+' 张封面，正在等待另一张';}
 }));
 const failures=results.filter(x=>x.status==='rejected');if(failures.length)throw new Error(failures.map(x=>x.reason.message).join('；')+'。已成功的图片已保留，可在图下单独重新生成。');
 return p.cover;
}
async function exportVideo(live,j){const p=structuredClone(live);const c=validateConfig(p.config);const size=outputSize(p,c.resolution);const folder=dir(p);const ass=makeAss(p,{...c,subtitleEnabled:false});await fsp.writeFile(path.join(folder,'render.ass'),ass,'utf8');await fsp.writeFile(path.join(folder,'subtitles.srt'),toSrt(p.subtitles||[]),'utf8');const assPath=path.join(folder,'render.ass').replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"'\\''");const args=['-y','-i',path.join(folder,p.source)];let filters=[];if(c.musicEnabled&&p.music){args.push('-stream_loop','-1','-i',path.join(folder,p.music));const gain=c.musicVolume/100,fade=`afade=t=in:st=0:d=${c.fadeIn},afade=t=out:st=${Math.max(0,p.duration-c.fadeOut)}:d=${c.fadeOut}`;filters.push(`[1:a]volume=${gain},${fade}[bg]`);if(p.hasAudio){if(c.ducking){filters.push('[0:a]asplit=2[voice][side]','[bg][side]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[duck]','[voice][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]')}else filters.push('[0:a][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]')}else filters.push('[bg]anull[a]');}
j.message='正在准备与预览一致的字幕图层';
const subtitleInput=c.musicEnabled&&p.music?2:1;
const timeline=await subtitleTimeline({...p,config:c},folder,run,n=>j.progress=n);
args.push('-f','concat','-safe','0','-i',timeline);
filters.push(`[0:v]subtitles=filename='${assPath}'[base]`,`[base][${subtitleInput}:v]overlay=format=auto:alpha=straight:eof_action=repeat,scale=${size.width}:${size.height}:flags=lanczos,setsar=1,format=yuv420p[v]`);
args.push('-filter_complex',filters.join(';'),'-map','[v]');if(c.musicEnabled&&p.music)args.push('-map','[a]');else args.push('-map','0:a?');args.push('-c:v','libx264','-preset','fast',...videoRateArgs(c.bitrateKbps),'-c:a','aac','-b:a','192k','-t',String(p.duration),'-movflags','+faststart','-progress','pipe:1','-nostats',path.join(folder,'export-working.mp4'));j.message='正在渲染视频';await run('ffmpeg',args,chunk=>{const m=[...chunk.matchAll(/out_time_us=(\d+)/g)].at(-1);if(m)j.progress=Math.min(99,15+Math.round(Number(m[1])/1e6/p.duration*84))});const outputFile='output-'+crypto.randomUUID()+'.mp4';await fsp.rename(path.join(folder,'export-working.mp4'),path.join(folder,outputFile));const measured=measuredRates(await probe(path.join(folder,outputFile)));const artifact=await library.addArtifact(p,{file:outputFile,type:'video',label:'合成视频',width:size.width,height:size.height});p.output={file:outputFile,artifactId:artifact.id,url:artifact.url,date:new Date().toISOString(),requestedBitrateKbps:c.bitrateKbps,rateControl:'fixed',width:size.width,height:size.height,resolution:c.resolution,...measured};live.output=p.output;return p.output;}
async function fileResponse(req,res,file){let handle,st;try{handle=await fsp.open(file,'r');st=await handle.stat()}catch{await handle?.close();return send(res,404,{error:'文件不存在'})}const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.mp4':'video/mp4','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.flac':'audio/flac','.wav':'audio/wav','.png':'image/png','.srt':'text/plain; charset=utf-8','.json':'application/json','.zip':'application/zip'}[path.extname(file)]||'application/octet-stream';let start=0,end=st.size-1;const range=req.headers.range;if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){await handle.close();return res.writeHead(416).end()}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end){await handle.close();return res.writeHead(416,{'Content-Range':`bytes */${st.size}`}).end()}}res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${st.size}`}:{})});if(req.method==='HEAD'||!st.size){await handle.close();return res.end()}const stream=handle.createReadStream({start,end,autoClose:true});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,`http://127.0.0.1:${port}`);if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return send(res,403,{error:'仅允许本机访问'});if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return send(res,403,{error:'不允许跨站请求'});
if(await library.route(req,res,u))return;
if(u.pathname==='/api/service-info'&&req.method==='GET')return send(res,200,{app:'creator-workbench',pid:process.pid,root});
const bundleMatch=u.pathname.match(/^\/api\/project-bundles\/([a-f0-9-]+)$/);if(bundleMatch&&req.method==='GET'){const bundle=bundles.get(bundleMatch[1]);if(!bundle)throw new Error('下载已过期，请重新导出项目');res.setHeader('Content-Disposition',`attachment; filename="project.zip"; filename*=UTF-8''${encodeURIComponent(bundle.filename)}`);res.once('close',()=>{bundles.delete(bundleMatch[1]);fsp.rm(bundle.file,{force:true}).catch(()=>{})});return fileResponse(req,res,bundle.file)}
if(u.pathname==='/api/state'){for(const job of jobs.values())updatePipelineProgress(job);return send(res,200,{projects:db.projects,presets:db.presets,music:db.music,artifacts:db.artifacts,settings:publicSettings(),jobs:[...jobs.values()]});}
if(u.pathname==='/api/settings'&&req.method==='POST'){const b=await json(req);db.settings=mergeSettings(db.settings,b);await save();return send(res,200,publicSettings())}
if(u.pathname==='/api/presets'&&req.method==='POST'){const b=await json(req);if(!b.name?.trim())throw new Error('请输入预设名称');const x={id:crypto.randomUUID(),name:b.name.trim().slice(0,80),config:validateConfig(b.config),musicFrom:b.musicFrom||null,musicId:b.musicId||null};db.presets.push(x);await save();return send(res,200,x)}
if(u.pathname==='/api/defaultpreset'&&req.method==='POST'){const b=await json(req);const index=db.presets.findIndex(x=>x.id===b.id);if(index<0)throw new Error('预设不存在');db.presets.unshift(db.presets.splice(index,1)[0]);await save();return send(res,200,{ok:true})}if(u.pathname==='/api/upload'&&req.method==='POST'){const type=u.searchParams.get('type')||'video';let p;if(type==='music')p=project(u.searchParams.get('id'));else{p={id:crypto.randomUUID(),name:cleanName(u.searchParams.get('name')).replace(/\.[^.]+$/,''),config:structuredClone(db.presets[0].config),presetId:db.presets[0].id,subtitles:[],createdAt:Date.now()};await fsp.mkdir(dir(p),{recursive:true})}const name=(type==='music'?'music-':'source-')+cleanName(u.searchParams.get('name'));const dest=path.join(dir(p),name);try{await pipeline(req,fs.createWriteStream(dest));const meta=await probe(dest);if(type==='music'){if(!meta.streams.some(x=>x.codec_type==='audio'))throw new Error('文件不包含音轨');p.music=name;p.musicName=cleanName(u.searchParams.get('name'));p.musicId=(await library.enrollMusic(dest,p.musicName)).id;p.presetId=null;}else{const v=meta.streams.find(x=>x.codec_type==='video');if(!v)throw new Error('文件不包含视频');const duration=Number(meta.format.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('无法读取视频时长');Object.assign(p,{source:name,width:v.width,height:v.height,duration,size:Number(meta.format.size),hasAudio:meta.streams.some(x=>x.codec_type==='audio'),sourceUrl:urlFile(p,name)});db.projects.unshift(p);const musicId=db.presets[0].musicId;if(musicId){await library.chooseMusic(p,musicId)}const musicFrom=!musicId&&db.presets[0].musicFrom;if(musicFrom){const from=db.projects.find(x=>x.id===musicFrom);if(from?.music){await fsp.copyFile(path.join(dir(from),from.music),path.join(dir(p),from.music));p.music=from.music;p.musicName=from.musicName}}}await save();return send(res,200,p)}catch(e){await fsp.rm(dest,{force:true});throw e}}
if(u.pathname==='/api/subtitle-preview'&&req.method==='GET'){const p=project(u.searchParams.get('project'));const indices=(u.searchParams.get('indices')||'').split(',').map(Number);if(indices.length>20||indices.some(i=>!Number.isInteger(i)||i<0||i>=p.subtitles.length))throw new Error('字幕位置无效');const file=await subtitlePreview(structuredClone(p),indices,dir(p),run);return fileResponse(req,res,file)}
const match=u.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(\w+))?$/);if(match){const p=project(match[1]),action=match[2];
if(action==='promptlogs'&&req.method==='GET'){
 const category=u.searchParams.get('category');if(category&&!['copy','cover'].includes(category))throw new Error('无效日志分类');
 const entry=u.searchParams.get('entry');if(entry)return send(res,200,await promptLogs.detail(p,entry));
 const limit=Math.max(1,Math.min(50,Number(u.searchParams.get('limit'))||10)),offset=Math.max(0,Number(u.searchParams.get('offset'))||0);
 return send(res,200,await promptLogs.list(p,{category,limit,offset}));
}
if(action==='bundle'&&req.method==='POST'){const snapshot=structuredClone(p),id=crypto.randomUUID(),file=path.join(bundleDir,id+'.zip'),result=await buildProjectBundle(snapshot,dir(p),file),filename=cleanName(p.name)+'-项目结果.zip';bundles.set(id,{file,filename});setTimeout(()=>{bundles.delete(id);fsp.rm(file,{force:true}).catch(()=>{})},3600000).unref();return send(res,200,{...result,filename,url:'/api/project-bundles/'+id})}
if(action==='subtitles'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/x-subrip; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`attachment; filename="subtitles.srt"; filename*=UTF-8''${encodeURIComponent(p.name+'.srt')}`});return res.end(toSrt(p.subtitles||[]))}
if(action==='metadata'&&req.method==='GET'){const source=measuredRates(await probe(path.join(dir(p),p.source)));const output=p.output?measuredRates(await probe(path.join(dir(p),p.output.file||'output.mp4'))):null;return send(res,200,{source,output})}
const b=await json(req);const validSlot=['horizontal','vertical'].includes(b.slot);
if(action==='coverprompt'&&req.method==='PATCH'){
 const lanes=requestTaskLanes('cover',b.slot);if([...jobs.values()].some(j=>j.projectId===p.id&&taskLanes(j).some(l=>lanes.includes(l))))throw new Error('该版封面正在生成，请完成后再保存提示词');
 const result=updateCoverPrompt(p,b.slot,b.prompt,b.planId);await save();return send(res,200,result);
}
if(action==='cover'&&b.slot!=null&&!validSlot)throw new Error('请选择横版或竖版封面');
const requested=requestTaskLanes(action,b.slot);
if(req.method==='POST'&&requested.length&&[...jobs.values()].some(j=>j.projectId===p.id&&taskLanes(j).some(lane=>requested.includes(lane))))throw new Error('这个任务正在进行，请勿重复提交');
if(!action&&req.method==='PATCH'){await applyProjectSettings(p,b,{presets:db.presets,chooseMusic:library.chooseMusic,chooseLegacyMusic:async(target,id)=>{const from=project(id);if(!from.music)throw new Error('音乐源不存在');if(from.id!==target.id)await fsp.copyFile(path.join(dir(from),from.music),path.join(dir(target),from.music));target.music=from.music;target.musicName=from.musicName;if(from.musicId)target.musicId=from.musicId;else delete target.musicId}});if(b.subtitles){if(!Array.isArray(b.subtitles)||b.subtitles.some(x=>!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.start<0||x.end<=x.start||x.end>p.duration+1||typeof x.text!=='string'))throw new Error('字幕时间无效');p.subtitles=b.subtitles}if(b.copy)p.copy=b.copy;if(typeof b.prompt==='string')p.prompt=b.prompt;if(typeof b.coverDirection==='string')p.coverDirection=b.coverDirection;await save();return send(res,200,p)}if(action==='srt'){p.subtitles=parseSrt(b.text).filter(x=>x.start<p.duration).map(x=>({...x,end:Math.min(x.end,p.duration)}));if(!p.subtitles.length)throw new Error('没有读取到有效 SRT 字幕');await save();return send(res,200,p)}const actions={transcribe:j=>transcribe(p,j),copy:j=>copywriting(p,j,(b.prompt??p.prompt??'').trim()),cover:j=>cover(p,j,(b.prompt??p.coverDirection??'').trim(),b.slot,b.imagePrompt,b.planId),export:j=>exportVideo(p,j)};if(action==='pipeline'&&req.method==='POST'){const prompt=(b.prompt??p.prompt??'').trim(),direction=b.coverDirection??p.coverDirection??'';return send(res,202,task('pipeline',p,j=>runPipeline({project:p,job:j,jobs,save,transcribe:stage=>transcribe(p,stage),copy:stage=>copywriting(p,stage,prompt),cover:stage=>cover(p,stage,direction,undefined,undefined,undefined,{...structuredClone(p),copy:null}),compose:stage=>exportVideo(p,stage)})));}if(actions[action]&&req.method==='POST')return send(res,202,task(action,p,actions[action],action==='cover'?{coverSlot:b.slot||null}:{}));}
if(u.pathname==='/api/whisper'){try{const output=await run(whisperPython,[...whisperRuntimeArgs,whisperScript,'--check','--cache',whisperCache,'--model',db.settings.whisperModel,'--device',db.settings.whisperDevice]);return send(res,200,JSON.parse(output.trim().split('\n').at(-1)))}catch(e){return send(res,200,{ready:false,message:e.message})}}
if(u.pathname==='/api/health'){const result=await Promise.allSettled([run('ffmpeg',['-version']),run('ffprobe',['-version'])]);return send(res,200,{ffmpeg:result[0].status==='fulfilled',ffprobe:result[1].status==='fulfilled'})}
if(u.pathname.startsWith('/media/')){const parts=u.pathname.split('/').filter(Boolean);if(parts.length!==3)throw new Error('无效路径');project(parts[1]);const name=decodeURIComponent(parts[2]);if(name!==path.basename(name)||name.includes('..'))throw new Error('无效路径');return fileResponse(req,res,path.join(data,parts[1],name))}
const allowed={'/':'index.html','/app.js':'app.js','/library.js':'library.js','/media-seek.js':'media-seek.js','/prompt-logs.js':'prompt-logs.js','/cover-prompts.js':'cover-prompts.js','/pipeline-panel.js':'pipeline-panel.js','/app.css':'app.css','/render-spec.js':'render-spec.js'};if(allowed[u.pathname])return fileResponse(req,res,path.join(root,'public',allowed[u.pathname]));send(res,404,{error:'未找到此接口'});
}catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end()}});
server.requestTimeout=0;server.listen(port,'127.0.0.1',()=>console.log(`自媒体工作台：http://127.0.0.1:${port}`));
