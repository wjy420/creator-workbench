import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestTaskLanes,taskLanes,jobForLane} from '../public/render-spec.js';
test('不同生产线路独立占用，同一任务或构图才能冲突',()=>{
 assert.deepEqual(taskLanes({type:'copy',status:'running'}),['copy']);
 assert.deepEqual(taskLanes({type:'cover',coverSlot:'horizontal',status:'running'}),['coverHorizontal']);
 assert.deepEqual(requestTaskLanes('cover','vertical'),['coverVertical']);
 assert.deepEqual(requestTaskLanes('cover'),['cover','coverHorizontal','coverVertical']);
 assert.deepEqual(taskLanes({type:'export',status:'done'}),[]);
});
test('完整封面阶段同时占用两版，但分别报告单图的成功与失败',()=>{
 const job={type:'pipeline',status:'running',activeLane:'cover',progress:50,message:'正在等待竖版',stages:{cover:{status:'running',message:'正在等待竖版',coverStages:{horizontal:{status:'done',progress:100,message:'已完成'},vertical:{status:'running'}}}}};
 assert.deepEqual(taskLanes(job),['pipeline','cover','coverHorizontal','coverVertical']);assert.equal(jobForLane(job,'coverHorizontal').status,'done');assert.equal(jobForLane(job,'coverVertical').message,'正在等待竖版');assert.equal(jobForLane(job,'cover').status,'running');
 job.status='error';job.message='竖版失败';assert.equal(jobForLane(job,'coverHorizontal').status,'done');assert.equal(jobForLane(job,'coverVertical').status,'error');
});
test('一键处理只占用当前阶段，其它阶段独立展示状态',()=>{
 const p={type:'pipeline',status:'running',createdAt:1,activeLane:'coverHorizontal',message:'正在生成横版',progress:0,stages:{copy:{status:'done',createdAt:2,message:'已完成',progress:100},coverHorizontal:{status:'running',createdAt:3}}};
 assert.deepEqual(taskLanes(p),['pipeline','coverHorizontal']);
 assert.equal(jobForLane(p,'copy').status,'done');assert.equal(jobForLane(p,'coverHorizontal').message,'正在生成横版');assert.equal(jobForLane(p,'export'),null);
});
