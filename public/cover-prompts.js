const coverPromptEditors=new Map();
function coverPromptEditorState(item,slot){
 const source=item.coverPlan?.[slot]||item.cover?.[slot];if(!source?.prompt)return null;
 const key=item.id+':'+slot,revision=item.coverPlan?.[slot]?item.coverPlan.id:'legacy';let st=coverPromptEditors.get(key);
 if(!st||st.revision!==revision){st={key,slot,projectId:item.id,revision,base:source.prompt,value:source.prompt,open:st?.open||false,saving:false,error:''};coverPromptEditors.set(key,st)}
 else if(st.base!==source.prompt){if(st.value===st.base||st.value===source.prompt)st.value=source.prompt;st.base=source.prompt}
 return st;
}
function renderCoverPromptEditors(){if(!p())return;$$('[data-cover-prompt-editor]').forEach(root=>{const st=coverPromptEditorState(p(),root.dataset.coverPromptEditor);if(st)renderCoverPromptEditor(root,st)});updateCoverPromptBusy()}
function renderCoverPromptEditor(root,st){const label=st.slot==='horizontal'?'横版':'竖版',bodyId=st.slot+'CoverPromptBody';
 root.innerHTML=`<button class="cover-prompt-toggle" aria-expanded="${st.open}" aria-controls="${bodyId}"><span>${label}提示词</span><span class="cover-prompt-toggle-meta">查看与编辑<svg><use href="#chevron"/></svg></span></button><div id="${bodyId}" class="cover-prompt-body${st.open?'':' hidden'}"><label class="sr-only" for="${st.slot}CoverImagePrompt">${label}封面提示词</label><textarea id="${st.slot}CoverImagePrompt" class="control-input cover-image-prompt" rows="10" spellcheck="false">${esc(st.value)}</textarea><p class="cover-prompt-hint">单张重新生成直接使用这里的内容，不再调用 LLM。</p><div class="cover-prompt-save-row"><span data-cover-prompt-save-status role="status" aria-live="polite"></span><button class="btn quiet" data-save-cover-prompt>保存修改</button></div></div>`;
 root.querySelector('.cover-prompt-toggle').onclick=()=>{st.open=!st.open;renderCoverPromptEditor(root,st);updateCoverPromptBusy()};
 root.querySelector('textarea').oninput=e=>{st.value=e.target.value;st.error='';updateCoverPromptSaveState(root,st)};
 root.querySelector('[data-save-cover-prompt]').onclick=()=>saveCoverPrompt(st,root);
 updateCoverPromptSaveState(root,st);
}
function updateCoverPromptSaveState(root,st){const status=root.querySelector('[data-cover-prompt-save-status]'),changed=st.value!==st.base;status.textContent=st.error||(st.saving?'正在保存…':changed?'尚未保存 · 重新生成时会自动使用修改':'已保存');status.classList.toggle('is-error',!!st.error);const button=root.querySelector('[data-save-cover-prompt]');button.disabled=st.saving||!changed||!st.value.trim();button.textContent=st.saving?'正在保存…':'保存修改'}
function updateCoverPromptBusy(){if(!p())return;const id=p().id;$$('[data-cover-prompt-editor]').forEach(root=>{const slot=root.dataset.coverPromptEditor,st=coverPromptEditorState(p(),slot);if(!st)return;const lane=slot==='horizontal'?'coverHorizontal':'coverVertical',busy=generationRequests.cover.get(id)?.status==='submitting'||generationRequests[lane].get(id)?.status==='submitting'||state.jobs.some(j=>j.projectId===id&&visualSpec.taskLanes(j).includes(lane));root.querySelector('textarea').disabled=!!busy;updateCoverPromptSaveState(root,st);if(busy)root.querySelector('[data-save-cover-prompt]').disabled=true})}
async function saveCoverPrompt(st,root){if(st.saving)return;const item=p(),value=st.value,planId=item.coverPlan?.id||null;st.saving=true;st.error='';updateCoverPromptSaveState(root,st);
 try{const result=await api(`/api/projects/${item.id}/coverprompt`,{slot:st.slot,prompt:value,planId},'PATCH');item.coverPlan??={id:result.planId};item.coverPlan[st.slot]=result.target;st.revision=result.planId;st.base=result.target.prompt}
 catch(e){st.error=e.message}
 finally{st.saving=false;if(p()?.id===item.id&&root.isConnected){updateCoverPromptSaveState(root,st);updateCoverPromptBusy()}}
}
function regenerateCover(slot){const item=p(),st=item&&coverPromptEditorState(item,slot);if(!st)return demo('请先生成封面');if(!st.value.trim()){st.open=true;st.error='提示词不能为空';renderCoverPromptEditors();return}startTask('cover',{slot,imagePrompt:st.value,planId:item.coverPlan?.id||null})}
