/* Snapshot road overlays explicitly: WebGL buffers are not reliably cloned by html2canvas. */
(function(root) {
  'use strict';
  function project(map, paths, markers) {
    const point = coordinate => {
      const pixel = map.lngLatToContainer(coordinate);
      const x = Number(pixel.getX()), y = Number(pixel.getY());
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('地图坐标尚未就绪，请重试地图快照。');
      return [x, y];
    };
    return { paths: paths.map(path => path.map(point)), markers: markers.map(m => ({number:m.number,point:point(m.coordinate)})) };
  }
  function draw(canvas, overlay, width, height) {
    const ctx = canvas.getContext('2d');
    if (!ctx || width <= 0 || height <= 0) throw new Error('地图快照尺寸无效。');
    ctx.save(); ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.lineWidth = 5; ctx.strokeStyle = '#315efb'; ctx.lineJoin = ctx.lineCap = 'round';
    for (const path of overlay.paths) {
      if (path.length < 2) continue;
      ctx.beginPath(); path.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
    }
    // Redraw markers after roads, so a restored road never runs over a station number.
    ctx.font = '600 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const {number,point:[x,y]} of overlay.markers) {
      ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle='#20293a'; ctx.stroke(); ctx.fillStyle='#20293a'; ctx.fillText(number,x,y);
    }
    ctx.restore();
  }
  function layout(paths, markers) {
    const mercator = ([lng,lat]) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat)>85 || Math.abs(lng)>180) throw new Error('道路坐标无效，请刷新路线预览。');
      return [(lng+180)/360, (1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2];
    };
    const lines=paths.map(p=>p.map(mercator)), stops=markers.map(m=>({...m,point:mercator(m.coordinate)}));
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of [...lines,stops.map(m=>m.point)]) for(const [x,y] of p){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    if(!lines.some(p=>p.length>=2)||!Number.isFinite(minX))throw new Error('道路轨迹尚未加载。');
    const x=(minX+maxX)/2,y=(minY+maxY)/2;
    const zoom=Math.min(17,Math.floor(Math.log2(Math.min(900/Math.max(maxX-minX,1e-9),340/Math.max(maxY-minY,1e-9))/256)));
    if(zoom<3)throw new Error('路线范围过大，暂不支持地图导出。');
    const center=[Number((x*360-180).toFixed(6)),Number((Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI).toFixed(6))];
    const [cx,cy]=mercator(center), world=256*2**zoom;
    const pixel=([px,py])=>[500+(px-cx)*world,220+(py-cy)*world];
    return {center,zoom,paths:lines.map(p=>p.map(pixel)),markers:stops.map(m=>({number:m.number,point:pixel(m.point)}))};
  }
  const backgrounds=new Map();
  async function render(paths,markers,apiBase) {
    const overlay=layout(paths,markers), canvas=document.createElement('canvas');
    canvas.width=2000;canvas.height=880;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f7fb';ctx.fillRect(0,0,2000,880);
    let fallback=true;
    const key=JSON.stringify({center:overlay.center,zoom:overlay.zoom,path:[markers[0].coordinate,markers[markers.length-1].coordinate]});
    try {
      if(!apiBase)throw new Error('底图服务未配置');
      let blob=backgrounds.get(key);
      if(!blob){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
        try {const response=await fetch(`${apiBase}/api/static-map?data=${encodeURIComponent(key)}`,{signal:controller.signal});
          if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('底图不可用');
          blob=await response.blob();
        } finally {clearTimeout(timer);}
      }
      const url=URL.createObjectURL(blob);
      try {
        const img=new Image();img.src=url;await img.decode();
        // Reject unexpected aspect ratios instead of silently misaligning roads.
        if(Math.abs(img.naturalWidth/img.naturalHeight-1000/440)>.02)throw new Error('底图尺寸不匹配');
        ctx.drawImage(img,0,0,2000,880);fallback=false;
        backgrounds.set(key,blob);if(backgrounds.size>4)backgrounds.delete(backgrounds.keys().next().value);
      }finally{URL.revokeObjectURL(url);}
    } catch { /* Road geometry remains usable even when the basemap is unavailable. */ }
    draw(canvas,overlay,1000,440);
    const caption=fallback?'路线示意图（底图暂不可用） · 高德导航道路轨迹':'完整路线概览 · 高德地图';
    if(fallback){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#526174';ctx.font='24px sans-serif';ctx.fillText('路线示意图 · 高德导航道路轨迹',24,852);}
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('地图图片生成失败')),'image/png'));
    return {blob,caption,fallback};
  }
  root.RoadbookMapExport = {project,draw,layout,render};
  if (typeof module !== 'undefined') module.exports = {project,draw,layout,render};
})(typeof globalThis === 'undefined' ? window : globalThis);
