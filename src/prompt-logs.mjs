import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export function createPromptLogs({directory,remote,secrets}){
 const loaded=new Map(),queues=new Map();
 const clean=value=>{
  const keys=secrets().filter(x=>typeof x==='string'&&x.length>3);
  const visit=v=>{if(typeof v==='string'){for(const key of keys)v=v.split(key).join('[已隐藏]');return v.replace(/Bearer\s+[^\s"']+/gi,'Bearer [已隐藏]')}
   if(Array.isArray(v))return v.map(visit);
   if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([key,val])=>[key,/^(authorization|api[_-]?key|secret|access[_-]?token)$/i.test(key)?'[已隐藏]':visit(val)]));return v};
  return visit(value);
 };
 async function records(p){if(!loaded.has(p.id))loaded.set(p.id,fs.readFile(path.join(directory(p),'prompt-logs.json'),'utf8').then(JSON.parse).then(async list=>{let changed=false;for(const entry of list)if(entry.status==='running'){entry.status='interrupted';entry.error='上次请求未记录完成状态，可能在应用重启前中断。';changed=true}if(changed)await persist(p,list);return list}).catch(e=>{if(e.code==='ENOENT')return [];loaded.delete(p.id);throw e}));return loaded.get(p.id)}
 function persist(p,list){const snapshot=JSON.stringify(list,null,2),file=path.join(directory(p),'prompt-logs.json');const promise=(queues.get(p.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.writeFile(file+'.tmp',snapshot);await fs.rename(file+'.tmp',file)});queues.set(p.id,promise);return promise}
 async function request(p,j,kind,base,endpoint,key,body){
  const started=Date.now();let url='';try{const parsed=new URL(base.replace(/\/$/,'')+endpoint);url=parsed.origin+parsed.pathname}catch{}
  const entry=clean({id:crypto.randomUUID(),jobId:j.id,category:kind.category,stage:kind.stage||'generation',slot:kind.slot||null,model:body.model,size:body.size||null,endpoint:url,createdAt:new Date(started).toISOString(),status:'running',httpStatus:null,durationMs:null,requestBody:body});
  const list=await records(p);list.push(entry);await persist(p,list);
  try{const result=await remote(base,endpoint,key,body,false,status=>{entry.httpStatus=status});if(Array.isArray(body.messages)){entry.responseOutput=clean({model:result.model||body.model,messages:(result.choices||[]).map(choice=>({role:choice.message?.role||'assistant',content:choice.message?.content??null,finishReason:choice.finish_reason??null}))});entry.hasResponseOutput=true}entry.status='done';entry.finishedAt=new Date().toISOString();entry.durationMs=Date.now()-started;await persist(p,list);return result}
  catch(e){entry.status='error';entry.error=clean(e.message||String(e));entry.finishedAt=new Date().toISOString();entry.durationMs=Date.now()-started;await persist(p,list);throw new Error(entry.error)}
 }
 async function list(p,{category,limit=10,offset=0}={}){const all=(await records(p)).filter(x=>!category||x.category===category).slice().reverse();return {total:all.length,entries:all.slice(offset,offset+limit).map(({requestBody,responseOutput,...metadata})=>metadata)}}
 async function detail(p,id){const entry=(await records(p)).find(x=>x.id===id);if(!entry)throw new Error('提示词日志不存在');return entry}
 return {request,list,detail};
}
