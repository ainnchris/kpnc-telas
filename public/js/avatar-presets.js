window.MeetPresets={avatar(index){
 const c=document.createElement('canvas');c.width=c.height=384;const x=c.getContext('2d'),hue=(index*37+195)%360;x.scale(4,4);
 x.fillStyle=`hsl(${hue} 62% 38%)`;x.fillRect(0,0,96,96);x.fillStyle=`hsl(${hue} 80% 72%)`;x.beginPath();x.roundRect(17,22,62,55,15);x.fill();
 x.strokeStyle=`hsl(${hue} 80% 72%)`;x.lineWidth=5;x.beginPath();x.moveTo(48,22);x.lineTo(48,12);x.stroke();x.fillStyle='#fff';x.beginPath();x.arc(48,10,4,0,Math.PI*2);x.fill();
 x.fillStyle='#10263e';x.beginPath();x.roundRect(25,35,46,21,9);x.fill();x.fillStyle='#fff';
 for(const ex of [36,60]){x.beginPath();if(index%3===0)x.roundRect(ex-4,41,8,5,2);else x.arc(ex,45,4,0,Math.PI*2);x.fill();}
 x.strokeStyle='#10263e';x.lineWidth=3;x.beginPath();x.moveTo(37,65);x.quadraticCurveTo(48,index%2?75:65,59,65);x.stroke();
 x.fillStyle=`hsl(${(hue+90)%360} 90% 65%)`;x.beginPath();x.arc(21,58,5,0,Math.PI*2);x.arc(75,58,5,0,Math.PI*2);x.fill();return c.toDataURL('image/png');
}};
