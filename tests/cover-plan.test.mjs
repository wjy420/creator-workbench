import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../public/render-spec.js';
import {coverPlanRequest,parseCoverPlan,updateCoverPrompt} from '../src/cover-plan.mjs';
test('一次 LLM 请求包含视频素材与两版参数，生成两条共同风格的独立提示词',()=>{
 const body=coverPlanRequest({name:'项目',subtitles:[{text:'视频内容'}],copy:{coverTitle:'标题'}},'用户方向',defaults,'test-model');
 const input=JSON.parse(body.messages[1].content);assert.equal(input.transcript,'视频内容');assert.equal(input.direction,'用户方向');assert.equal(input.targets.horizontal.ratio,'16:9');assert.equal(input.targets.vertical.ratio,'9:16');
 const plan=parseCoverPlan({choices:[{message:{content:JSON.stringify({sharedStyle:'统一蓝金配色、同一个主体',horizontalPrompt:'横版居左标题',verticalPrompt:'竖版上方标题'})}}]},defaults);
 for(const slot of ['horizontal','vertical'])assert.ok(plan[slot].prompt.includes(plan.sharedStyle));assert.ok(plan.horizontal.prompt.includes('1280x720'));assert.ok(plan.vertical.prompt.includes('720x1280'));assert.notEqual(plan.horizontal.prompt,plan.vertical.prompt);
 assert.throws(()=>parseCoverPlan({choices:[{message:{content:'{}'}}]},defaults),/不完整/);assert.throws(()=>parseCoverPlan({choices:[{message:{content:'not json'}}]},defaults),/JSON/);
});
test('编辑只更新指定版方案，保留原图实际提示词，拒绝空值和过期方案',()=>{
 const p={coverPlan:{id:'current',horizontal:{prompt:'原横版',width:1280,height:720},vertical:{prompt:'原竖版',width:720,height:1280}},cover:{horizontal:{prompt:'原图实际请求'}}};
 const edited='  自定义横版提示词\n新构图  ';const result=updateCoverPrompt(p,'horizontal',edited,'current');assert.equal(result.target.prompt,edited);assert.equal(p.coverPlan.vertical.prompt,'原竖版');assert.equal(p.cover.horizontal.prompt,'原图实际请求');
 assert.throws(()=>updateCoverPrompt(p,'vertical','  ','current'),/不能为空/);assert.throws(()=>updateCoverPrompt(p,'horizontal','旧页面修改','outdated'),/方案已更新/);
 const legacy={cover:{horizontal:{prompt:'旧图提示词',width:1000,height:600,requestedWidth:1280,requestedHeight:720}}};updateCoverPrompt(legacy,'horizontal','新提示词',null);assert.equal(legacy.coverPlan.horizontal.width,1280);assert.ok(legacy.coverPlan.id);assert.equal(legacy.cover.horizontal.prompt,'旧图提示词');
});
