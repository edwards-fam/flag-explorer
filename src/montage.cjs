const sharp=require('sharp');
(async()=>{
 const [out,w,...names]=process.argv.slice(2);
 const imgs=await Promise.all(names.map(n=>sharp(n+'.png').resize({width:+w}).toBuffer({resolveWithObject:true})));
 let x=0,h=0; const comp=imgs.map(i=>{const c={input:i.data,left:x,top:0}; x+=i.info.width+14; h=Math.max(h,i.info.height); return c;});
 await sharp({create:{width:x,height:h,channels:3,background:'#555'}}).composite(comp).png().toFile(out); console.log(out,x,h);
})();
