import {defaults,resolutionOptions,coverResolutionOptions,coverRatioOptions} from '../public/render-spec.js';

export function normalizeConfig(input={}){
 const c={...defaults,...input};
 // Legacy projects used Mbps. Migrate once to the explicit kbps field.
 if(input.bitrateKbps===undefined&&input.bitrate!==undefined)c.bitrateKbps=Number(input.bitrate)*1000;
 if(input.resolution===undefined&&c.bitrateKbps===12000)c.bitrateKbps=3000;
 delete c.bitrate;
 return c;
}
export function validateConfig(input){
 const c=normalizeConfig(input);
 for(const key of ['coverHorizontalResolution','coverVerticalResolution'])if(!coverResolutionOptions.some(([v])=>v===c[key]))throw new Error('请选择有效的封面分辨率');
 for(const key of ['coverHorizontalRatio','coverVerticalRatio'])if(!coverRatioOptions.some(([v])=>v===c[key]))throw new Error('请选择有效的封面比例');
 if(!resolutionOptions.some(([value])=>value===c.resolution))throw new Error('请选择有效的导出分辨率');
 const number=(key,label,{positive=false,nonnegative=false,percent=false,integer=false}={})=>{
  if(c[key]===''||c[key]===null||typeof c[key]==='boolean')throw new Error(`${label}请输入有效数字`);
  const n=Number(c[key]);
  if(!Number.isFinite(n))throw new Error(`${label}请输入有效数字`);
  if(positive&&n<=0)throw new Error(`${label}必须大于 0`);
  if(nonnegative&&n<0)throw new Error(`${label}不能为负数`);
  if(percent&&(n<0||n>100))throw new Error(`${label}应在 0–100% 之间`);
  if(integer&&!Number.isInteger(n))throw new Error(`${label}请输入整数`);
  c[key]=n;
 };
 for(const [key,label] of [['bitrateKbps','视频码率（kbps）'],['fontSize','字号'],['chapterFontSize','章节字号']])number(key,label,{positive:true});
 for(const [key,label] of [['chapterLineLength','分割线长度'],['chapterLineWidth','分割线粗细'],['barHeight','进度条高度'],['subtitleOutlineWidth','描边粗细'],['subtitleBackgroundPadding','背景内边距'],['subtitleBackgroundRadius','背景圆角'],['fadeIn','淡入'],['fadeOut','淡出']])number(key,label,{nonnegative:true});
 for(const [key,label] of [['chapterOffset','章节垂直偏移'],['barMargin','进度条边距'],['subtitleMargin','字幕边距']])number(key,label);
 number('maxChars','每行字数',{positive:true,integer:true});
 for(const key of ['barOpacity','barBackgroundOpacity','subtitleBackgroundOpacity'])number(key,'不透明度',{percent:true});
 number('musicVolume','音乐音量',{nonnegative:true});
 for(const key of ['chapterColor','barColor','barBackgroundColor','subtitleColor','subtitleOutlineColor','subtitleBackgroundColor'])if(!/^#[0-9a-f]{6}$/i.test(c[key]))throw new Error('颜色请填写 #RRGGBB');
 return c;
}
