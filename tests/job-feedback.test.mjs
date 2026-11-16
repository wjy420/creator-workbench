import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {visibleProjectJobs} from '../public/render-spec.js';
const job=(id,type,status,extra={})=>({id,type,status,projectId:'p',createdAt:Number(id)||0,progress:40,message:'正在处理',...extra});
const script=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const renderJobs=script.slice(script.indexOf('function renderJobs(){'),script.indexOf('function renderTaskResults('));
const renderResults=script.slice(script.indexOf('function renderTaskResults('),script.indexOf('function schedulePoll('));
function feedback(jobs,output){const root={innerHTML:''},saved={textContent:''},item={id:'p',name:'测试项目',output};
 vm.runInNewContext(renderJobs+';renderJobs()',{
  p:()=>item,state:{jobs},visualSpec:{visibleProjectJobs},esc:String,generationRequests:{},$:selector=>selector==='#jobArea'?root:saved,
  renderPipelineStages:()=>'',renderCoverResults:()=>{},renderTaskFeedback:()=>{},renderPromptLogs:()=>{},renderPipelinePanel:()=>{},renderProjectExportButton:()=>{}
 });return {html:root.innerHTML,saved:saved.textContent};
}
test('封面或文案先完成，运行中的合成和其它任务始终可见',()=>{
 const exporting=job('1','export','running'),copy=job('2','copy','running'),cover=job('3','cover','done');
 assert.deepEqual(visibleProjectJobs([exporting,copy,cover,job('4','copy','running',{projectId:'other'})],'p').map(j=>j.id),['1','3','2']);
 const result=feedback([exporting,copy,cover]);assert.ok(result.html.includes('data-job-id="1"'));assert.ok(result.html.includes('data-job-id="2"'));assert.ok(result.html.includes('data-job-id="3"'));assert.ok(result.html.includes('width:40%'));assert.equal(result.saved,'正在处理…');
 const failed=feedback([exporting,job('2','cover','error',{message:'封面失败'})]);assert.ok(failed.html.includes('data-job-id="1"'));assert.ok(failed.html.includes('封面失败'));assert.ok(failed.html.includes('width:40%'));
});
test('新任务消息不覆盖已完成视频，失败重试仍保留上次成功视频',()=>{
 const output={url:'/ready.mp4'},finished=job('1','export','done',{result:output}),cover=job('2','cover','done');
 const result=feedback([finished,cover],output);assert.ok(result.html.includes('下载视频'));assert.equal(result.html.split('href="/ready.mp4"').length-1,1);
 const retry=feedback([finished,job('2','export','error',{message:'模拟重试失败'}),job('3','copy','running')],output);assert.ok(retry.html.includes('模拟重试失败'));assert.ok(retry.html.includes('href="/ready.mp4"'));assert.ok(retry.html.includes('data-job-id="3"'));
 const partial=feedback([job('1','pipeline','error',{result:output,stages:{export:{status:'done'}}}),cover],output);assert.ok(partial.html.includes('href="/ready.mp4"'));
});
test('只保留最新合成和最近完成消息，不堆积已结束历史任务',()=>{
 const jobs=[job('1','copy','done'),job('2','export','done'),job('3','cover','done'),job('4','transcribe','done')];assert.deepEqual(visibleProjectJobs(jobs,'p').map(j=>j.id),['2','4']);
});
test('封面、文案和合成完成只更新对应结果，不重建参数表单和播放器',()=>{
 const original={id:'p',sourceUrl:'/source.mp4',subtitles:[{start:0,end:1,text:'字幕'}],chapters:[]};
 for(const [change,expected]of [[{cover:{horizontal:{url:'/cover.png'}}},{copy:0,output:0}],[{copy:{platforms:[]}},{copy:1,output:0}],[{output:{url:'/output.mp4'}},{copy:0,output:1}]]){
  const calls={all:0,copy:0,output:0},updated={...structuredClone(original),...change};
  vm.runInNewContext(renderResults+';renderTaskResults(previous)',{previous:original,p:()=>updated,currentView:'work',renderedProjectId:'p',$:()=>({}),renderAll:()=>calls.all++,renderCopy:()=>calls.copy++,renderExportPanel:()=>calls.output++});
  assert.deepEqual(calls,{all:0,...expected});
 }
});
