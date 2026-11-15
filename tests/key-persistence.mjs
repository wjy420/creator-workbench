import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-key-test-'));
const base='http://127.0.0.1:8773';
async function start(){const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8773',DATA_DIR:data},windowsHide:true,stdio:'pipe'});for(let i=0;i<50;i++){try{if((await fetch(base+'/api/state')).ok)return child}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('测试服务未启动')}
async function stop(child){const closed=new Promise(r=>child.once('exit',r));child.kill();await closed}
async function post(body){const r=await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json()}
let service;
try{
 service=await start();await post({deepseekKey:'test-deepseek-only',imageKey:'test-image-only'});
 await post({deepseekKey:'',imageKey:'   ',whisperModel:'base'});
 await stop(service);service=await start();
 const state=await(await fetch(base+'/api/state')).json();assert.equal(state.settings.deepseekKeySet,true);assert.equal(state.settings.imageKeySet,true);assert.equal(state.settings.deepseekKey,undefined);assert.equal(state.settings.whisperModel,'base');
 const disk=JSON.parse(await fs.readFile(path.join(data,'workspace.json'),'utf8'));assert.equal(disk.settings.deepseekKey,'test-deepseek-only');assert.equal(disk.settings.imageKey,'test-image-only');
 console.log('PASS: 保存一次、空白重存、进程重启后密钥保持，前端不返回密钥。');
}finally{if(service)await stop(service);await fs.rm(data,{recursive:true,force:true})}
