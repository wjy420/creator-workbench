export function mergeSettings(current, input) {
  const next={...current};
  for(const key of ['deepseekBase','deepseekModel','imageBase','imageModel','deepseekKey','imageKey']){
    if(typeof input[key]!=='string')continue;
    const value=input[key].trim();
    // Empty or whitespace-only password fields always preserve saved keys.
    if(key.endsWith('Key')&&!value)continue;
    next[key]=value;
  }
  if(input.whisperModel!==undefined){
    if(!['tiny','base','small','medium','large-v3','turbo'].includes(input.whisperModel))throw new Error('不支持的本地 Whisper 模型');
    next.whisperModel=input.whisperModel;
  }
  if(input.whisperDevice!==undefined){
    if(!['auto','cpu','cuda'].includes(input.whisperDevice))throw new Error('无效的运行设备');
    next.whisperDevice=input.whisperDevice;
  }
  if(input.whisperLanguage!==undefined){
    if(!['zh','en','auto'].includes(input.whisperLanguage))throw new Error('无效的识别语言');
    next.whisperLanguage=input.whisperLanguage;
  }
  return next;
}
