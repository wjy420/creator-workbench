// Measure the actual libass glyph pixels, then composite one rounded plate
// behind the entire subtitle block. Both preview and export use this RGBA image.
export function addSubtitleBackground(pixels,w,h,c){
 if(!c.subtitleBackgroundEnabled||!c.subtitleBackgroundOpacity)return pixels;
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(right<left)return pixels; // Empty subtitle intervals must remain transparent.
 const pad=c.subtitleBackgroundPadding;
 left-=pad;top-=pad;right+=pad+1;bottom+=pad+1;
 const radius=Math.min(c.subtitleBackgroundRadius,(right-left)/2,(bottom-top)/2);
 const opacity=c.subtitleBackgroundOpacity/100;
 const rgb=[1,3,5].map(i=>parseInt(c.subtitleBackgroundColor.slice(i,i+2),16));
 for(let y=Math.max(0,Math.floor(top));y<Math.min(h,Math.ceil(bottom));y++)for(let x=Math.max(0,Math.floor(left));x<Math.min(w,Math.ceil(right));x++){
  // Signed distance to a rounded rectangle; one pixel antialiasing at its edge.
  const qx=Math.abs(x+.5-(left+right)/2)-(right-left)/2+radius;
  const qy=Math.abs(y+.5-(top+bottom)/2)-(bottom-top)/2+radius;
  const distance=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius;
  const ba=Math.max(0,Math.min(1,.5-distance))*opacity;
  if(!ba)continue;
  const i=(y*w+x)*4,ta=pixels[i+3]/255,a=ta+ba*(1-ta);
  for(let channel=0;channel<3;channel++)pixels[i+channel]=Math.round((pixels[i+channel]*ta+rgb[channel]*ba*(1-ta))/a);
  pixels[i+3]=Math.round(a*255);
 }
 return pixels;
}
