import fs from 'node:fs/promises';
import path from 'node:path';
import {toSrt} from './media.mjs';
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const crc=(value,bytes)=>{for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return value};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b},u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b};
async function writeZip(file,entries){const archive=await fs.open(file,'wx'),central=[];let offset=0n;
 const write=async bytes=>{let pos=0;while(pos<bytes.length){const result=await archive.write(bytes,pos,bytes.length-pos);pos+=result.bytesWritten;offset+=BigInt(result.bytesWritten)}};
 try{for(const entry of entries){const name=Buffer.from(entry.name),size=entry.handle?(await entry.handle.stat({bigint:true})).size:BigInt(entry.bytes.length),start=offset,extra=Buffer.concat([u16(1),u16(16),u64(size),u64(size)]);let checksum=0xffffffff;
  await write(Buffer.concat([u32(0x04034b50),u16(45),u16(0x808),u16(0),u16(0),u16(33),u32(0),u32(0xffffffff),u32(0xffffffff),u16(name.length),u16(extra.length),name,extra]));
  const chunks=entry.handle?entry.handle.createReadStream({autoClose:false,highWaterMark:1024*1024}):[entry.bytes];for await(const bytes of chunks){checksum=crc(checksum,bytes);await write(bytes)}checksum=(checksum^0xffffffff)>>>0;
  await write(Buffer.concat([u32(0x08074b50),u32(checksum),u64(size),u64(size)]));const zip64=Buffer.concat([u16(1),u16(24),u64(size),u64(size),u64(start)]);
  central.push(Buffer.concat([u32(0x02014b50),u16(45),u16(45),u16(0x808),u16(0),u16(0),u16(33),u32(checksum),u32(0xffffffff),u32(0xffffffff),u16(name.length),u16(zip64.length),u16(0),u16(0),u16(0),u32(0),u32(0xffffffff),name,zip64]));
 }const centralStart=offset;for(const record of central)await write(record);const centralSize=offset-centralStart,zip64Offset=offset,count=entries.length;
 await write(Buffer.concat([u32(0x06064b50),u64(44),u16(45),u16(45),u32(0),u32(0),u64(count),u64(count),u64(centralSize),u64(centralStart),u32(0x07064b50),u32(0),u64(zip64Offset),u32(1),u32(0x06054b50),u16(0),u16(0),u16(0xffff),u16(0xffff),u32(0xffffffff),u32(0xffffffff),u16(0)]));
 }finally{await archive.close()}
}
export async function buildProjectBundle(p,folder,output){const entries=[],missing=[];
 const text=(name,value,bom=false)=>entries.push({name,bytes:Buffer.from((bom?'\ufeff':'')+value)});
 const addFile=async(name,record)=>{if(!record){missing.push(name);return}let filename=record.file;try{if(!filename){const parts=new URL(record.url,'http://localhost').pathname.split('/');if(parts[1]!=='media'||parts[2]!==p.id||parts.length!==4)throw new Error('无效文件地址');filename=decodeURIComponent(parts[3])}if(!filename||path.basename(filename)!==filename||filename.includes('..'))throw new Error('无效文件名');const handle=await fs.open(path.join(folder,filename),'r');entries.push({name,handle})}catch(e){if(e.code==='ENOENT'){missing.push(name+'（文件已删除）');return}throw e}};
 try{await addFile('最终视频.mp4',p.output);
  if(p.subtitles?.length)text('最终字幕.srt',toSrt(p.subtitles),true);else missing.push('最终字幕.srt');
  if(p.chapters?.length)text('章节.json',JSON.stringify({chapters:p.chapters},null,2));
  if(p.copy?.platforms?.length){text('平台标题和简介.txt',p.copy.platforms.map(x=>`${x.platform}\n标题：${x.title}\n简介：${x.description}\n${(x.tags||[]).join(' ')}\n`).join('\n────────────\n\n'),true);text('平台文案.json',JSON.stringify({platforms:p.copy.platforms},null,2))}else missing.push('平台标题和简介');
  await addFile('横版封面.png',p.cover?.horizontal|| (p.cover?.horizontalUrl?{url:p.cover.horizontalUrl}:null));await addFile('竖版封面.png',p.cover?.vertical|| (p.cover?.verticalUrl?{url:p.cover.verticalUrl}:null));
  if(p.cover?.url&&!p.cover.horizontal&&!p.cover.horizontalUrl&&!p.cover.vertical&&!p.cover.verticalUrl)await addFile('封面组合图.png',{url:p.cover.url});
  if(!entries.length)throw new Error('当前项目还没有可导出的结果，请先完成处理。');const files=entries.map(x=>x.name);
  text('导出清单.txt',`项目：${p.name}\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n已包含：\n${files.map(x=>'· '+x).join('\n')}\n\n${missing.length?'尚未生成或不可用：\n'+missing.map(x=>'· '+x).join('\n'):'全部结果已包含。'}\n`,true);
  await writeZip(output,entries);return {files,missing};
 }catch(e){await fs.rm(output,{force:true});throw e}finally{await Promise.all(entries.filter(x=>x.handle).map(x=>x.handle.close()))}
}
