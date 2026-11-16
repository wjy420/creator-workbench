import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeAss,defaults} from './media.mjs';
import {addSubtitleBackground} from './subtitle-background.mjs';
export const filterPath=file=>file.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"'\\''");
const rendering=new Map();let queue=Promise.resolve();
// Render transparent subtitle pixels using exactly the same ASS and libass as export.
export function subtitlePreview(project,indices,folder,run){return overlayPreview(project,indices,folder,run,false)}
export function chapterPreview(project,folder,run){return overlayPreview(project,[],folder,run,true)}
async function overlayPreview(project,indices,folder,run,chapters){
 const c={...defaults,...project.config,barEnabled:false,...(chapters?{subtitleEnabled:false,subtitleBackgroundEnabled:false}:{chapterEnabled:false})};
 const subtitles=indices.map(i=>project.subtitles[i]).filter(Boolean).map(s=>({...s,start:0,end:1}));
 const ass=makeAss({...project,duration:chapters?project.duration:1,subtitles},c);
 const hash=crypto.createHash('sha256').update('rounded-background-v1'+ass+JSON.stringify([c.subtitleBackgroundEnabled,c.subtitleBackgroundColor,c.subtitleBackgroundOpacity,c.subtitleBackgroundPadding,c.subtitleBackgroundRadius])).digest('hex').slice(0,32);
 const out=path.join(folder,`subtitle-preview-${hash}.png`);
 try{await fs.access(out);return out}catch{}
 if(rendering.has(out))return rendering.get(out);
 const pending=queue.catch(()=>{}).then(async()=>{
  const assFile=path.join(folder,`subtitle-preview-${hash}.ass`);await fs.writeFile(assFile,ass);
  try{
   const w=project.width,h=project.height;
   const args=['-v','error','-f','lavfi','-i',`color=c=black:s=${w}x${h}:r=1,format=rgb24`,'-f','lavfi','-i',`color=c=white:s=${w}x${h}:r=1,format=rgb24`,'-filter_complex',`[0:v]subtitles=filename='${filterPath(assFile)}'[black];[1:v]subtitles=filename='${filterPath(assFile)}'[white];[black][white]hstack`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'];
   const pixels=await binaryRun(args);const rgba=Buffer.alloc(w*h*4);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const black=(y*w*2+x)*3,white=black+w*3,out=(y*w+x)*4;
    const alpha=255-Math.round(((pixels[white]-pixels[black])+(pixels[white+1]-pixels[black+1])+(pixels[white+2]-pixels[black+2]))/3);
    rgba[out+3]=Math.max(0,Math.min(255,alpha));
    if(alpha>0)for(let channel=0;channel<3;channel++)rgba[out+channel]=Math.min(255,Math.round(pixels[black+channel]*255/alpha));
   }
   addSubtitleBackground(rgba,w,h,c);
   await binaryRun(['-y','-v','error','-f','rawvideo','-pix_fmt','rgba','-s',`${w}x${h}`,'-i','pipe:0','-frames:v','1','-threads','1',out],rgba);
   return out;
  }
  finally{await fs.rm(assFile,{force:true})}
 });queue=pending;rendering.set(out,pending);
 try{return await pending}finally{rendering.delete(out)}
}

function binaryRun(args,input){return new Promise((resolve,reject)=>{const child=spawn('ffmpeg',args,{windowsHide:true});const chunks=[];let error='';child.stdout.on('data',x=>chunks.push(x));child.stderr.on('data',x=>error+=x);child.on('error',reject);child.on('close',code=>code?reject(new Error(error)):resolve(Buffer.concat(chunks)));child.stdin.on('error',()=>{});child.stdin.end(input)})}

export async function subtitleTimeline(p,folder,run,onProgress){
 const points=[...new Set([0,p.duration,...p.subtitles.flatMap(s=>[Math.max(0,Math.round(s.start*100)/100),Math.min(p.duration,Math.round(s.end*100)/100)])])].filter(t=>t>=0&&t<=p.duration).sort((a,b)=>a-b);
 const lines=['ffconcat version 1.0'];let last;
 for(let i=0;i<points.length-1;i++){
  const t=(points[i]+points[i+1])/2;const active=p.config.subtitleEnabled?p.subtitles.map((s,j)=>t>=Math.round(s.start*100)/100&&t<Math.round(s.end*100)/100?j:-1).filter(j=>j>=0):[];
  last=await subtitlePreview(p,active,folder,run);
  lines.push(`file '${last.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`,'option framerate 100',`duration ${(points[i+1]-points[i]).toFixed(6)}`);
  onProgress?.(Math.round(i/(points.length-1)*15));
 }
 if(last)lines.push(`file '${last.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`,'option framerate 100');
 const out=path.join(folder,'subtitle-timeline.ffconcat');await fs.writeFile(out,lines.join('\n'));return out;
}
