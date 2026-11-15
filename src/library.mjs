import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {createWriteStream,createReadStream} from 'node:fs';
export async function createLibrary({db,data,probe,save,jobs,send,json,fileResponse}){
 db.music??=[];db.artifacts??=[];const musicDir=path.join(data,'music');await fs.mkdir(musicDir,{recursive:true});
 const project=id=>{const p=db.projects.find(x=>x.id===id);if(!p)throw new Error('项目不存在');return p};
 const safeProjectDir=id=>{if(!/^[a-z0-9-]+$/i.test(id))throw new Error('无效项目');const folder=path.resolve(data,id);if(path.dirname(folder)!==path.resolve(data))throw new Error('无效项目路径');return folder};
 const busy=id=>{if([...jobs.values()].some(j=>j.projectId===id&&j.status==='running'))throw new Error('项目正在处理，请完成后再删除')};
 async function enrollMusic(file,name){const hash=crypto.createHash('sha256');for await(const c of createReadStream(file))hash.update(c);const digest=hash.digest('hex'),existing=db.music.find(x=>x.hash===digest);if(existing)return existing;const meta=await probe(file);if(!meta.streams.some(x=>x.codec_type==='audio'))throw new Error('文件不包含音频');const id=crypto.randomUUID(),filename=id+path.extname(name).toLowerCase();await fs.copyFile(file,path.join(musicDir,filename));const item={id,name,file:filename,url:'/library/music/'+id,hash:digest,duration:Number(meta.format.duration)||0,size:(await fs.stat(file)).size,createdAt:Date.now()};db.music.push(item);return item}
 async function chooseMusic(p,id){if(!id){delete p.music;delete p.musicName;delete p.musicId;return}const m=db.music.find(x=>x.id===id);if(!m)throw new Error('音乐不存在');const file='music-'+m.file;await fs.copyFile(path.join(musicDir,m.file),path.join(safeProjectDir(p.id),file));p.music=file;p.musicName=m.name;p.musicId=m.id}
 async function addArtifact(p,info){const file=info.file;if(path.basename(file)!==file)throw new Error('无效文件名');const size=(await fs.stat(path.join(safeProjectDir(p.id),file))).size;const a={id:crypto.randomUUID(),projectId:p.id,projectName:p.name,date:new Date().toISOString(),url:`/media/${p.id}/${encodeURIComponent(file)}`,size,...info};db.artifacts.unshift(a);return a}
 if(!db.libraryVersion){
  for(const p of db.projects){
   if(p.music)try{p.musicId=(await enrollMusic(path.join(safeProjectDir(p.id),p.music),p.musicName||p.music)).id}catch{}
   if(p.output)try{const file=decodeURIComponent(p.output.url.split('?')[0].split('/').at(-1));p.output.file=file;const a=await addArtifact(p,{file,type:'video',label:'合成视频',date:p.output.date||new Date(p.createdAt).toISOString(),width:p.output.width||p.width,height:p.output.height||p.height});p.output.artifactId=a.id}catch{}
   if(p.cover){p.cover.artifactIds??=[];for(const [file,label,key]of [['cover-source.png','封面合成图','url'],['cover-horizontal.png','横版封面','horizontalUrl'],['cover-vertical.png','竖版封面','verticalUrl']])try{const meta=await probe(path.join(safeProjectDir(p.id),file));const a=await addArtifact(p,{file,type:'image',label,width:meta.streams[0].width,height:meta.streams[0].height});p.cover[key]=a.url;p.cover.artifactIds.push(a.id)}catch{}}
  }
  for(const preset of db.presets){const from=db.projects.find(p=>p.id===preset.musicFrom);if(from?.musicId)preset.musicId=from.musicId}
  db.libraryVersion=1;await save();
 }
 async function route(req,res,u){
  if(u.pathname==='/api/music'&&req.method==='POST'){
   const name=path.basename(u.searchParams.get('name')||'audio.mp3'),temp=path.join(musicDir,'upload-'+crypto.randomUUID()+path.extname(name));
   try{await pipeline(req,createWriteStream(temp));const m=await enrollMusic(temp,name);await save();send(res,200,m)}finally{await fs.rm(temp,{force:true})}return true;
  }
  let match=u.pathname.match(/^\/library\/music\/([a-z0-9-]+)$/i);if(match){const m=db.music.find(x=>x.id===match[1]);if(!m)throw new Error('音乐不存在');await fileResponse(req,res,path.join(musicDir,m.file));return true}
  match=u.pathname.match(/^\/api\/music\/([a-z0-9-]+)$/i);if(match&&req.method==='DELETE'){const m=db.music.find(x=>x.id===match[1]);if(!m)throw new Error('音乐不存在');await fs.rm(path.join(musicDir,m.file),{force:true});db.music=db.music.filter(x=>x!==m);for(const preset of db.presets)if(preset.musicId===m.id){delete preset.musicId;delete preset.musicFrom}await save();send(res,200,{ok:true});return true}
  match=u.pathname.match(/^\/api\/artifacts\/([a-z0-9-]+)$/i);if(match&&req.method==='DELETE'){const a=db.artifacts.find(x=>x.id===match[1]);if(!a)throw new Error('记录不存在');busy(a.projectId);const p=project(a.projectId);await fs.rm(path.join(safeProjectDir(p.id),a.file),{force:true});db.artifacts=db.artifacts.filter(x=>x!==a);if(p.output?.artifactId===a.id){delete p.output;for(const [id,j]of jobs)if(j.projectId===p.id&&(j.type==='export'||j.type==='pipeline'))jobs.delete(id)}if(p.cover){for(const key of ['url','horizontalUrl','verticalUrl'])if(p.cover[key]?.split('?')[0]===a.url.split('?')[0])delete p.cover[key];for(const slot of ['horizontal','vertical'])if(p.cover[slot]?.artifactId===a.id)delete p.cover[slot];p.cover.artifactIds=p.cover.artifactIds?.filter(id=>id!==a.id);if(p.cover.mode==='separate'?!p.cover.horizontal&&!p.cover.vertical:!p.cover.url)delete p.cover}await save();send(res,200,{ok:true});return true}
  match=u.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/i);if(match&&req.method==='DELETE'){const p=project(match[1]);busy(p.id);await fs.rm(safeProjectDir(p.id),{recursive:true,force:true});db.projects=db.projects.filter(x=>x!==p);db.artifacts=db.artifacts.filter(x=>x.projectId!==p.id);for(const preset of db.presets)if(preset.musicFrom===p.id)delete preset.musicFrom;for(const [id,j]of jobs)if(j.projectId===p.id)jobs.delete(id);await save();send(res,200,{ok:true});return true}
  match=u.pathname.match(/^\/api\/presets\/([a-z0-9-]+)$/i);if(match&&req.method==='DELETE'){if(db.presets.length<=1)throw new Error('至少保留一个预设');db.presets=db.presets.filter(x=>x.id!==match[1]);for(const p of db.projects)if(p.presetId===match[1])p.presetId=null;await save();send(res,200,{ok:true});return true}
  return false;
 }
 return {route,enrollMusic,chooseMusic,addArtifact};
}
