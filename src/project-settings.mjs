import {normalizeConfig,validateConfig} from './config.mjs';
const musicIdentity=p=>p.musicId|| (p.music?'legacy:'+p.music:null);
export function sameConfig(a,b){const left=normalizeConfig(a),right=normalizeConfig(b),value=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():v;return [...new Set([...Object.keys(left),...Object.keys(right)])].every(key=>value(left[key])===value(right[key]))}
export function matchesPreset(p,preset){return !!preset&&sameConfig(p.config,preset.config)&&musicIdentity(p)===(preset.musicId||null)}
export async function applyProjectSettings(p,body,{presets,chooseMusic,chooseLegacyMusic}){
 const preset=body.presetId!=null?presets.find(x=>x.id===body.presetId):null;if(body.presetId!=null&&!preset)throw new Error('预设不存在');
 const config=preset?validateConfig(preset.config):body.config?validateConfig(body.config):null;
 const musicRequested=!!preset||body.musicId!==undefined||!!body.musicFrom,draft={...p};
 if(musicRequested){if(preset){await chooseMusic(draft,preset.musicId||null);if(!preset.musicId&&preset.musicFrom)await chooseLegacyMusic(draft,preset.musicFrom)}else if(body.musicFrom)await chooseLegacyMusic(draft,body.musicFrom);else await chooseMusic(draft,body.musicId||null)}
 const changed=!!config&&!sameConfig(p.config,config)||musicRequested&&musicIdentity(p)!==musicIdentity(draft);
 if(config)p.config=config;
 if(musicRequested)for(const key of ['music','musicName','musicId']){if(draft[key]===undefined)delete p[key];else p[key]=draft[key]}
 if(preset)p.presetId=preset.id;else if(changed||body.presetId===null)p.presetId=null;
 return p;
}
