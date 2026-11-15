export function videoRateArgs(kbps){
 const bits=Math.round(Number(kbps)*1000);
 if(!Number.isFinite(bits)||bits<1)throw new Error('码率必须是有效的正数，单位为 kbps');
 // Equal VBV target/maximum plus filler keeps even simple footage near target.
 // VBR HRD signaling is MP4-compatible; CBR HRD signaling is not used in MP4.
 return ['-b:v',String(bits),'-minrate',String(bits),'-maxrate',String(bits),'-bufsize',String(bits*2),'-x264-params','nal-hrd=vbr:filler=1:vbv-init=1'];
}
export function measuredRates(meta){
 const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
 return {videoBitrateBps:positive(meta.streams?.find(s=>s.codec_type==='video')?.bit_rate),totalBitrateBps:positive(meta.format?.bit_rate)};
}
