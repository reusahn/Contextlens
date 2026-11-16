function paint(ctx,t,i){
  const w=320,h=384;
  if(i<8){
    // Eight DIFFERENT locally generated clips of the SAME precise viral movement.
    // Different backgrounds, camera offsets, character designs and timing.
    const hue=20+i*35,offset=(i-4)*5;
    ctx.fillStyle=`hsl(${hue} 26% 14%)`;ctx.fillRect(0,0,w,h);
    for(let k=0;k<6;k++){
      ctx.fillStyle=`hsla(${hue+k*15} 45% ${24+(k%3)*6}% / .7)`;
      ctx.fillRect(k*67-18+Math.sin(t*.33+i)*12,0,20,384);
    }
    ctx.save();ctx.translate(w/2+offset+Math.sin(t*2+i*.6)*34,196);
    ctx.scale(i%2?-.9:1.0,1);ctx.rotate(Math.sin(t*.7+i)*.08);
    const shoeMotion=Math.sin(t*6+i*.45)*17;
    ctx.fillStyle=`hsl(${(hue+210)%360} 55% 64%)`;
    ctx.beginPath();ctx.ellipse(0,-76,21,23,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=`hsl(${(hue+190)%360} 75% 78%)`;ctx.lineWidth=18;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,-49);ctx.lineTo(0,40);ctx.stroke();
    ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-4,-21);ctx.lineTo(-45,22);ctx.moveTo(5,-21);ctx.lineTo(43,10);ctx.stroke();
    ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(-2,37);ctx.lineTo(-33+shoeMotion,122);ctx.moveTo(5,40);ctx.lineTo(34-shoeMotion,120);ctx.stroke();
    ctx.strokeStyle='#e7f1f5';ctx.lineWidth=19;ctx.beginPath();ctx.moveTo(-36+shoeMotion,124);ctx.lineTo(-8+shoeMotion,124);ctx.moveTo(31-shoeMotion,120);ctx.lineTo(58-shoeMotion,120);ctx.stroke();ctx.restore();
    ctx.fillStyle='#b7f18a';ctx.fillRect(25,340,270,3);
    ctx.font='bold 16px system-ui';ctx.fillText(`GLIDE STUDY  #${i+1}`,24,32);
    return;
  }
  ctx.fillStyle=`hsl(${(i*44+t*8)%360} 35% 15%)`;ctx.fillRect(0,0,w,h);
  for(let j=0;j<11;j++){
    const k=i*2+j*13, x=20+(Math.sin(t*(.35+j*.03)+k)*.5+.5)*260,y=24+(Math.cos(t*(.37+j*.02)+k)*.5+.5)*322;
    ctx.fillStyle=`hsl(${(i*55+j*32)%360} 70% ${35+(j%3)*11}%)`;
    ctx.beginPath();ctx.roundRect(x-20,y-20,38+j*2,28+j*2,7);ctx.fill();
  }
  ctx.fillStyle='#eaf0e9';ctx.font='bold 34px system-ui';ctx.fillText(['M','F','S','F','S','T','T','E'][i%8],30,56);
  ctx.save();ctx.translate(w/2+Math.sin(t)*25,h/2+Math.cos(t*.7)*30);ctx.rotate(t*.45);
  ctx.strokeStyle='#e7f1ed';ctx.lineWidth=9;ctx.strokeRect(-49,-49,98,98);ctx.restore();
}
async function createVideo(i){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=384;
  const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(12);
  const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
  const rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:190000});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(resolve=>{rec.onstop=()=>resolve(URL.createObjectURL(new Blob(chunks,{type:'video/webm'})));});
  rec.start();const start=performance.now();
  await new Promise(resolve=>{const fn=now=>{paint(ctx,(now-start)/1000,i);if(now-start<2400)requestAnimationFrame(fn);else resolve();};requestAnimationFrame(fn);});
  rec.stop();stream.getTracks().forEach(x=>x.stop());return done;
}
