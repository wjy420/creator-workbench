import {requestTaskLanes,taskLanes} from '../public/render-spec.js';
const names={transcribe:'字幕识别',chapters:'章节生成',copy:'平台文案',cover:'封面生成',export:'视频合成'};
export function updatePipelineProgress(job){if(job.type!=='pipeline'||job.status!=='running')return;const entries=Object.entries(job.stages||{});if(!entries.length)return;job.progress=Math.min(99,Math.round(entries.reduce((sum,[,stage])=>sum+(stage.status==='done'||stage.status==='error'||stage.status==='blocked'?100:stage.progress||0),0)/entries.length));job.message=entries.map(([lane,stage])=>`${names[lane]}${stage.status==='done'?'已完成':stage.status==='error'?'失败':stage.status==='blocked'?'未开始':stage.status==='waiting'?'等待中':stage.progress>0?' '+Math.round(stage.progress)+'%':'进行中'}`).join(' · ')}
export async function runPipeline({project:p,job:j,jobs,save,transcribe,chapters,copy,cover,compose}){
 j.stages=Object.fromEntries(Object.keys(names).filter(lane=>lane!=='chapters'||chapters).map(lane=>[lane,{status:'waiting',createdAt:Date.now(),progress:0,message:'等待文稿准备完成'}]));
 async function stage(lane,operation){const current=j.stages[lane],lanes=lane==='cover'?requestTaskLanes('cover'):[lane];current.message='等待同类任务完成';
  while([...jobs.values()].some(other=>other.id!==j.id&&other.projectId===p.id&&taskLanes(other).some(x=>lanes.includes(x))))await new Promise(r=>setTimeout(r,100));
  current.status='running';current.createdAt=Date.now();current.message='准备中';Object.defineProperties(current,{id:{value:j.id},projectId:{value:p.id},type:{value:'pipeline'}});updatePipelineProgress(j);
  try{const result=await operation(current);current.status='done';current.progress=100;current.message='已完成';await save();return result}
  catch(e){current.status='error';current.message=e.message;throw e}finally{current.finishedAt=Date.now();updatePipelineProgress(j)}
 }
 try{if(p.subtitles?.length)Object.assign(j.stages.transcribe,{status:'done',progress:100,message:'使用已有文稿',finishedAt:Date.now()});else await stage('transcribe',async current=>{if(!p.subtitles?.length)return transcribe(current)})}
 catch(e){for(const lane of Object.keys(j.stages).filter(lane=>lane!=='transcribe'))Object.assign(j.stages[lane],{status:'blocked',message:'字幕识别失败，未开始'});throw e}
 const chapterResult=chapters?stage('chapters',chapters).then(()=>null,e=>e):Promise.resolve(null);
 const results=await Promise.allSettled([stage('copy',copy),stage('cover',cover),(async()=>{if(chapters)await chapterResult;return stage('export',async current=>{const result=await compose(current);j.result=result;return result})})()]);
 const failures=results.map((result,index)=>result.status==='rejected'?`${names[['copy','cover','export'][index]]}：${result.reason.message}`:null).filter(Boolean);const chapterError=await chapterResult;if(chapterError)failures.push('章节生成：'+chapterError.message);if(failures.length)throw new Error(failures.join('；')+'。已成功的结果已保留。');return results[2].value;
}
