import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import crypto from 'node:crypto';
import {makeAss,defaults} from '../src/media.mjs';
import {chapterPreview,filterPath} from '../src/preview.mjs';
const folder=path.resolve('data/chapters-tests',crypto.randomUUID());await fs.mkdir(folder,{recursive:true});
const input=path.join(folder,'input.mp4'),stub=path.join(folder,'whisper.mjs');
const ff=args=>{const r=spawnSync('ffmpeg',['-y','-v','error',...args],{windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());return r.stdout};
ff(['-f','lavfi','-i','color=c=0x242424:s=640x360:r=10','-f','lavfi','-i','sine=frequency=440','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',input]);
const subtitles=[{start:0.2,end:1.6,text:'先介绍视频的开场内容'},{start:2,end:3.8,text:'接着说明详细的操作步骤'}];
await fs.writeFile(stub,`import fs from 'node:fs/promises';await fs.writeFile(process.argv[process.argv.indexOf('--output')+1],JSON.stringify({model:'stub',device:'cpu',language:'zh',segments:${JSON.stringify(subtitles)}}));`);
let release=null,fail=false,calls=0;
const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls++;assert.equal(body.model,'chapter-mock');assert.deepEqual(JSON.parse(body.messages[1].content).transcript.map(s=>s.text),subtitles.map(s=>s.text));if(release)await release.promise;
 res.setHeader('Content-Type','application/json');res.statusCode=fail?503:200;res.end(JSON.stringify(fail?{error:{message:'模拟章节服务失败'}}:{choices:[{message:{content:JSON.stringify({chapters:[{startIndex:0,title:'内容介绍'},{startIndex:1,title:'操作步骤'}]})}}]}));
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`,service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:path.join(folder,'workspace'),WHISPER_PYTHON:process.execPath,WHISPER_SCRIPT:stub},windowsHide:true,stdio:'pipe'});let log='';service.stderr.on('data',d=>log+=d);
const state=async()=>(await fetch(base+'/api/state')).json();
async function call(url,body={},method='POST',ok=true){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await r.json();assert.equal(r.ok,ok,JSON.stringify(result));return result}
async function waitFor(predicate){for(let i=0;i<400;i++){const s=await state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,40))}throw new Error('等待超时 '+log)}
const jobDone=async job=>{const s=await waitFor(s=>s.jobs.find(j=>j.id===job.id)?.status!=='running');return {job:s.jobs.find(j=>j.id===job.id),state:s}};
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
 const uploaded=await fetch(base+'/api/upload?name='+encodeURIComponent('章节测试.mp4'),{method:'POST',body:await fs.readFile(input)});assert.ok(uploaded.ok);const p=await uploaded.json(),url='/api/projects/'+p.id;
 let result=await jobDone(await call(url+'/chapters'));assert.equal(result.job.status,'error');assert.match(result.job.message,/文稿/);
 result=await jobDone(await call(url+'/transcribe'));assert.equal(result.job.status,'done');assert.equal(result.state.projects[0].chapters,undefined);assert.equal(calls,0,'无 Key 时本地识别不能调用云端');
 await call('/api/settings',{deepseekBase:`http://127.0.0.1:${mock.address().port}`,deepseekKey:'chapter-test-only',deepseekModel:'chapter-mock'});
 const chapterJobsBefore=(await state()).jobs.filter(j=>j.type==='chapters').length;await jobDone(await call(url+'/transcribe'));let s=await state();assert.equal(calls,0,'已配置 Key 且开启章节时，单独识别也不得调用 LLM');assert.equal(s.projects[0].chapters,undefined);assert.equal(s.jobs.filter(j=>j.type==='chapters').length,chapterJobsBefore,'单独识别不得创建章节任务');await jobDone(await call(url+'/chapters'));s=await state();assert.equal(s.projects[0].chapters[0].start,0);assert.equal(s.projects[0].chapters[0].end,2);assert.equal(s.projects[0].chapters[1].end,4);
 // A delayed response must neither overwrite saved edits nor permit duplicate chapter jobs.
 let resolve;release={promise:new Promise(r=>resolve=r)};release.resolve=resolve;const before=calls,job=await call(url+'/chapters');await waitFor(()=>calls>before);const duplicate=await call(url+'/chapters',{},'POST',false);assert.match(duplicate.error,/正在进行/);
 const edited=[{start:0,end:1,title:'手工开场'},{start:1.5,end:4,title:'手工步骤'}];await call(url,{chapters:edited},'PATCH');resolve();release=null;result=await jobDone(job);assert.equal(result.job.status,'error');assert.match(result.job.message,/已保留/);assert.deepEqual(result.state.projects[0].chapters,edited);
 await call(url,{chapters:[{start:0,end:3,title:'重叠一'},{start:2,end:4,title:'重叠二'}]},'PATCH',false);assert.deepEqual((await state()).projects[0].chapters,edited);
 fail=true;result=await jobDone(await call(url+'/chapters'));assert.equal(result.job.status,'error');assert.deepEqual(result.state.projects[0].chapters,edited);fail=false;
 const callsBeforeRecognition=calls;result=await jobDone(await call(url+'/transcribe'));assert.equal(result.job.status,'done');assert.equal(calls,callsBeforeRecognition);assert.deepEqual(result.state.projects[0].chapters,edited,'重新识别须保留已编辑章节');
 await call(url,{chapters:[]},'PATCH');fail=true;result=await jobDone(await call(url+'/transcribe'));assert.equal(result.job.status,'done');assert.equal(calls,callsBeforeRecognition,'章节服务不可用也不能影响独立字幕识别');assert.deepEqual(result.state.projects[0].chapters,[]);assert.deepEqual(result.state.projects[0].subtitles,subtitles);fail=false;
 await jobDone(await call(url+'/chapters'));s=await state();const config={...s.projects[0].config,resolution:'original',fontSize:24,subtitleMargin:100,chapterFontSize:22,chapterLineLength:40,chapterLineWidth:4,chapterOffset:34,barMargin:24,barHeight:6};await call(url,{config},'PATCH');
 result=await jobDone(await call(url+'/export'));assert.equal(result.job.status,'done',result.job.message);assert.ok((await fetch(base+result.job.result.url)).ok);
 const current=(await state()).projects[0],projectFolder=path.join(folder,'workspace',p.id),png=await chapterPreview(current,projectFolder),ass=path.join(folder,'chapters.ass');
 await fs.writeFile(ass,makeAss(current,{...defaults,...config,barEnabled:false,subtitleEnabled:false}));
 const direct=ff(['-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-vf',`subtitles=filename='${filterPath(ass)}'`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
 const composited=ff(['-f','lavfi','-i','color=c=0x242424:s=640x360:r=1,format=rgba','-i',png,'-filter_complex','[0:v][1:v]overlay=format=rgb:alpha=straight','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
 let diff=0,active=0;for(let i=0;i<direct.length;i++){diff+=Math.abs(direct[i]-composited[i]);if(direct[i]!==36)active++}assert.ok(active>100,'章节名称和分割线必须被渲染');assert.ok(diff/direct.length<0.04,'章节预览与导出 libass 像素不一致');
 ff(['-i',path.join(projectFolder,current.output.file),'-ss','1','-frames:v','1',path.join(folder,'export-frame.png')]);
 const exported=ff(['-i',path.join(folder,'export-frame.png'),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);let chapterPixels=0;for(let y=285;y<330;y++)for(let x=24;x<616;x++)if(exported[(y*640+x)*3]>150)chapterPixels++;assert.ok(chapterPixels>100,'实际 MP4 应包含章节');
 // Measure actual transparent pixels: visible text and separator share a center.
 const bounds=(pixels,x0,x1)=>{let left=640,right=-1,top=360,bottom=-1;for(let y=0;y<360;y++)for(let x=x0;x<x1;x++){const i=(y*640+x)*4;if(pixels[i+3]>128&&pixels[i]>180){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}return {width:right-left+1,height:bottom-top+1,center:(top+bottom+1)/2,top,bottom}};
 for(const variant of [{chapterLineLength:40,chapterLineWidth:4,chapterOffset:34},{chapterLineLength:40,chapterLineWidth:4,chapterOffset:54},{chapterLineLength:16,chapterLineWidth:2,chapterOffset:34},{chapterLineLength:16,chapterLineWidth:2,chapterOffset:-12}]){
  const changed={...current,config:{...config,...variant}},file=await chapterPreview(changed,projectFolder),pixels=ff(['-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);const line=bounds(pixels,312,328),text=bounds(pixels,32,304),center=360-config.barMargin-config.barHeight-variant.chapterOffset;
  assert.equal(line.height,variant.chapterLineLength,'分割线可见像素长度应与参数一致');assert.equal(line.width,variant.chapterLineWidth,'分割线可见像素粗细应与参数一致');assert.equal(line.center,center,'分割线须围绕共用中心对称');assert.ok(Math.abs(text.center-line.center)<=3,`文字与分割线没有水平居中：${JSON.stringify({variant,line,text})}`);
 }
 for(const key of ['chapterLineLength','chapterLineWidth']){const file=await chapterPreview({...current,config:{...config,[key]:0}},projectFolder),pixels=ff(['-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);assert.ok(bounds(pixels,312,328).width<1,'零长度或零粗细应隐藏分割线')}
 const layoutPreset=await call('/api/presets',{name:'章节布局测试预设',config,musicId:null});await call(url,{config:{...config,chapterLineLength:9,chapterLineWidth:1,chapterOffset:-4}},'PATCH');const reapplied=await call(url,{presetId:layoutPreset.id},'PATCH');assert.equal(reapplied.config.chapterLineLength,40);assert.equal(reapplied.config.chapterLineWidth,4);assert.equal(reapplied.config.chapterOffset,34);
 const stored=JSON.parse(await fs.readFile(path.join(folder,'workspace','workspace.json'),'utf8'));assert.equal(stored.projects[0].config.chapterLineLength,40);assert.equal(stored.projects[0].config.chapterLineWidth,4);assert.equal(stored.projects[0].config.chapterOffset,34);
 const bundle=await call(url+'/bundle');assert.ok(bundle.files.includes('章节.json'));const logs=await (await fetch(base+url+'/promptlogs?category=chapters')).json();assert.ok(logs.total>=3);assert.ok(!JSON.stringify(logs).includes('chapter-test-only'));
 console.log('PASS: 隔离服务验证字幕识别独立于章节生成、手动生成、编辑保存、任务防重复、异步保护、失败保留、真实 MP4、居中与线条像素尺寸、预览导出一致、布局预设和项目打包。');console.log(JSON.stringify({base,folder,projectId:p.id}));
 if(process.env.CHAPTER_UI==='1'){console.log('UI_READY：按回车结束隔离测试服务');await once(process.stdin,'data');process.stdin.pause()}
}finally{release?.resolve?.();if(service.exitCode===null){service.kill();await once(service,'exit')}await new Promise(r=>mock.close(r))}
