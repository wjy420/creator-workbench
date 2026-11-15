import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../public/media-seek.js',import.meta.url),'utf8');
function runtime(){const context=vm.createContext({Promise,WeakMap,Error});vm.runInContext(source,context);return context}
function media(){return {isConnected:true,paused:true,ended:false,calls:0,play(){this.calls++;this.paused=false;return new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject})},pause(){this.paused=true;this.reject?.(Object.assign(new Error('The play() request was interrupted by a call to pause().'),{name:'AbortError'}))}}}
test('快速播放后暂停取消未启动的请求，保持暂停且不误报失败',async()=>{const r=runtime(),m=media(),errors=[];const result=r.playMedia(m,e=>errors.push(e));r.pauseMedia(m);assert.equal(await result,false);assert.equal(m.calls,0);assert.equal(m.paused,true);assert.equal(errors.length,0)});
test('已经发出的播放被拖动或切页暂停打断，不显示 AbortError',async()=>{const r=runtime(),m=media(),errors=[];const result=r.playMedia(m,e=>errors.push(e));await Promise.resolve();assert.equal(m.calls,1);r.pauseMedia(m);assert.equal(await result,false);assert.equal(errors.length,0);assert.equal(m.paused,true)});
test('恢复播放请求不会被旧请求清理，重复播放合并为同一请求',async()=>{const r=runtime(),m=media(),errors=[];const old=r.playMedia(m,e=>errors.push(e));await Promise.resolve();r.pauseMedia(m);const latest=r.playMedia(m,e=>errors.push(e));assert.equal(r.playMedia(m),latest);await Promise.resolve();m.resolve();assert.equal(await old,false);assert.equal(await latest,true);assert.equal(m.calls,2);assert.equal(m.paused,false);assert.equal(errors.length,0)});
test('真实的不支持格式错误仍反馈，已离开页面的播放器不会自行恢复',async()=>{const r=runtime(),m=media(),errors=[];m.play=()=>Promise.reject(Object.assign(new Error('unsupported'),{name:'NotSupportedError'}));assert.equal(await r.playMedia(m,e=>errors.push(e)),false);assert.match(errors[0].message,/不支持该编码/);m.isConnected=false;m.calls=0;await r.playMedia(m,e=>errors.push(e));assert.equal(m.calls,0);assert.equal(errors.length,1)});
