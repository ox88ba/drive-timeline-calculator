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
    ctx.save(); ctx.scale(canvas.width / width, canvas.height / height);
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
  root.RoadbookMapExport = {project,draw};
  if (typeof module !== 'undefined') module.exports = {project,draw};
})(typeof globalThis === 'undefined' ? window : globalThis);
