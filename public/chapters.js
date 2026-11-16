function chapterControls(){const item=p(),chapters=item.chapters||[];
 return parameterSection('chapterSection','章节调整','chapterEnabled',`${chapters.length} 个章节 · ${item.config.chapterFontSize} px`,
 parameterBlock('显示样式',`<div class="parameter-grid">${field('章节字号（px）','chapterFontSize')}${colorField('章节颜色','chapterColor')}</div>`)+
 parameterBlock('位置与分割线',`<div class="parameter-grid">${field('分割线长度（px）','chapterLineLength')}${field('分割线粗细（px）','chapterLineWidth')}${field('垂直偏移（px）','chapterOffset')}</div><p class="chapter-help">以进度条上沿为基准，正值上移、负值下移；文字与分割线共用中心，同步移动。</p>`)+
 parameterBlock('章节内容',`<p class="chapter-help">${state.settings.deepseekKeySet?'识别并校对文稿后，点击「生成章节」推断，也可手动编辑。':'生成章节需配置文案 API，也可手动添加。'}</p><div class="chapter-actions"><button class="btn primary generation-button" id="generateChapters">生成章节</button><button class="text-button" id="editChapters">编辑章节与时间 →</button></div><div id="chapterGenerationStatus" class="copy-generation-status hidden" role="status" aria-live="polite"></div><div id="chapterPreviewStatus" class="error-text hidden" role="status"></div><button class="text-button hidden" id="retryChapterPreview">重试章节预览</button><div class="chapter-list">${chapters.length?chapters.map(ch=>`<div><span>${esc(ch.title)}</span><small>${fmt(ch.start)}–${fmt(ch.end)}</small></div>`).join(''):'<p class="subtext">尚无章节。可从文稿生成，也可手动添加。</p>'}</div>`)+`<div id="chaptersPromptLogs" class="prompt-log-host"></div>`);
}
function bindChapterControls(){
 $('#generateChapters').onclick=()=>startTask('chapters');$('#editChapters').onclick=chapterEditor;
 $('#retryChapterPreview').onclick=()=>{const layer=$('#chapterLayer');if(layer)delete layer.dataset.chapterKey;paintChapters(p())};
 renderGenerationFeedback('chapters');renderPromptLogs();
}
function paintChapters(item){const layer=$('#chapterLayer');if(!layer)return;
 if(!item.config.chapterEnabled||!item.chapters?.length){layer.classList.add('hidden');delete layer.dataset.chapterKey;return}
 const rev=JSON.stringify([item.width,item.height,item.duration,item.config.chapterFontSize,item.config.chapterColor,item.config.chapterLineLength,item.config.chapterLineWidth,item.config.chapterOffset,item.config.barMargin,item.config.barHeight,item.chapters]);
 const url=`/api/chapter-preview?project=${item.id}&rev=${encodeURIComponent(rev)}`;
 if(layer.dataset.chapterKey===url)return;layer.dataset.chapterKey=url;layer.classList.add('hidden');
 const image=new Image(),status=$('#chapterPreviewStatus'),retry=$('#retryChapterPreview');status?.classList.add('hidden');retry?.classList.add('hidden');
 image.onload=()=>{if(!layer.isConnected||layer.dataset.chapterKey!==url)return;layer.src=url;layer.classList.remove('hidden')};
 image.onerror=()=>{if(!layer.isConnected||layer.dataset.chapterKey!==url)return;const current=$('#chapterPreviewStatus');if(current){current.textContent='章节预览生成失败，请重试。';current.classList.remove('hidden')}$('#retryChapterPreview')?.classList.remove('hidden')};image.src=url;
}
function chapterEditor(){const item=p(),chapters=structuredClone(item.chapters||[]);
 modal('章节调整',`<p>修改章节名称与起止时间（秒）。章节按时间排序，不能重叠；只在画面中显示名称与分割线。生成任务进行中也可以编辑，保存后会保留你的修改。</p><div class="sub-row muted chapter-row-heading"><span>开始</span><span>结束</span><span>章节名称</span></div><div id="chapterRows"></div><button class="btn quiet" id="addChapter">＋ 添加章节</button><div class="modal-actions"><button class="btn primary" id="saveChapters">保存章节</button></div>`,true);$('#modal').classList.add('chapter-editor');
 const draw=()=>{$('#chapterRows').innerHTML=chapters.map((ch,i)=>`<div class="sub-row chapter-row"><input class="control-input" data-chapter="${i}" data-key="start" inputmode="decimal" value="${esc(ch.start)}" aria-label="章节开始秒"><input class="control-input" data-chapter="${i}" data-key="end" inputmode="decimal" value="${esc(ch.end)}" aria-label="章节结束秒"><input class="control-input" data-chapter="${i}" data-key="title" value="${esc(ch.title)}" aria-label="章节名称"><button data-delete-chapter="${i}" aria-label="删除章节">×</button></div>`).join('');
  $$('[data-chapter]').forEach(input=>input.oninput=()=>{chapters[Number(input.dataset.chapter)][input.dataset.key]=input.dataset.key==='title'?input.value:input.value.trim()===''?NaN:Number(input.value)});
  $$('[data-delete-chapter]').forEach(button=>button.onclick=()=>{chapters.splice(Number(button.dataset.deleteChapter),1);draw()});
 };draw();
 $('#addChapter').onclick=()=>{chapters.sort((a,b)=>a.start-b.start);const last=chapters.at(-1);let start=last?.end||0;
  if(start>=item.duration){if(!Number.isFinite(last.start)||last.end-last.start<0.02)return demo('请先调整章节时间，留出新章节的时段');start=Math.round((last.start+last.end)/2*1000)/1000;last.end=start}
  chapters.push({start,end:item.duration,title:''});draw();
 };
 const dialog=$('#modal');$('#saveChapters').onclick=async()=>{const button=dialog.querySelector('#saveChapters');button.disabled=true;
  try{await api('/api/projects/'+item.id,{chapters},'PATCH');if(dialog.isConnected)dialog.remove();await refresh();demo('章节已保存，重新合成后应用到导出视频')}
  catch(e){if(dialog.isConnected)dialog.querySelector('#modalError').textContent=e.message;else error(e)}finally{button.disabled=false}
 };
}
