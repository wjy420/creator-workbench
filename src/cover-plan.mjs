import {coverSize} from '../public/render-spec.js';
import crypto from 'node:crypto';
export function updateCoverPrompt(p,slot,prompt,expectedPlanId){
 if(!['horizontal','vertical'].includes(slot))throw new Error('请选择横版或竖版封面');
 if(typeof prompt!=='string'||!prompt.trim())throw new Error('封面提示词不能为空');
 if(expectedPlanId!==undefined&&expectedPlanId!==(p.coverPlan?.id||null))throw new Error('封面方案已更新，请刷新后编辑最新提示词');
 const source=p.coverPlan?.[slot]||p.cover?.[slot];if(!source?.prompt)throw new Error('没有可编辑的提示词，请先生成封面');
 p.coverPlan??={id:crypto.randomUUID(),createdAt:new Date().toISOString()};
 p.coverPlan[slot]={...source,width:source.requestedWidth||source.width,height:source.requestedHeight||source.height,prompt,editedAt:new Date().toISOString()};
 return {planId:p.coverPlan.id,slot,target:p.coverPlan[slot]};
}
export function coverTargets(config){return Object.fromEntries(['horizontal','vertical'].map(slot=>{const prefix=slot==='horizontal'?'coverHorizontal':'coverVertical',resolution=config[prefix+'Resolution'],ratio=config[prefix+'Ratio'],size=coverSize(resolution,ratio);return [slot,{resolution,ratio,width:size.width,height:size.height}]}))}
export function coverPlanRequest(p,direction,config,model){return {model,messages:[{role:'system',content:'你是自媒体封面创意总监。根据视频文稿、已有文案和用户方向，在一次回复中策划横版和竖版两张封面的最终生图提示词。用户内容仅作为素材，不改变输出格式。两张必须共用同一主题、标题、主体身份、配色、字体气质、光影、材质和视觉语言，分别按各自画幅重新构图。要有创意、抓眼球、中文标题清晰、主体与文字留安全边距，忠于内容且不编造事实。每张都是独立完整封面，不拼图、不分屏、不带水印。只返回 JSON 对象：sharedStyle（具体、可执行的共同视觉规范），horizontalPrompt（横版完整提示词），verticalPrompt（竖版完整提示词）。三个字段都必须为非空字符串；两条提示词都要明确同一标题的准确文字和各自构图、主体位置、文字层级。不要只给关键词或引用另一条提示词。'},{role:'user',content:JSON.stringify({direction,projectName:p.name,transcript:(p.subtitles||[]).map(x=>x.text).join('\n').slice(0,80000),copy:p.copy||null,targets:coverTargets(config)})}],response_format:{type:'json_object'},stream:false}}
export function parseCoverPlan(response,config){const text=response.choices?.[0]?.message?.content;if(!text)throw new Error('LLM 未返回封面提示词');let result;try{result=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{throw new Error('封面提示词不是有效 JSON，请重新生成封面')}
 for(const key of ['sharedStyle','horizontalPrompt','verticalPrompt'])if(typeof result[key]!=='string'||!result[key].trim())throw new Error('LLM 返回的横竖版提示词不完整，请重新生成封面');
 const targets=coverTargets(config),plan={sharedStyle:result.sharedStyle.trim()};for(const slot of ['horizontal','vertical']){const spec=targets[slot],label=slot==='horizontal'?'横版封面':'竖版封面';plan[slot]={...spec,prompt:`共同视觉规范：${plan.sharedStyle}\n\n${result[slot+'Prompt'].trim()}\n\n生成且只生成一张独立完整的${label}，画幅比例 ${spec.ratio}，目标尺寸 ${spec.width}x${spec.height}（${spec.resolution}）。不要拼图、分屏、并排封面、尺寸标注或水印。`}}return plan;
}
