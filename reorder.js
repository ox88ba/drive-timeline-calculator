(() => {
  const host = document.querySelector('.hero');
  if (!host || !globalThis.DriveOrder) return;
  document.documentElement.classList.add('order-dialog-enabled');
  const open = document.createElement('button'); open.type='button'; open.className='order-open'; open.textContent='展开'; open.setAttribute('aria-haspopup','dialog');
  const mount=()=>{const route=host.querySelector('.vg-route');if(route && open.parentNode!==route)route.append(open);};
  new MutationObserver(mount).observe(host,{childList:true,subtree:true}); mount();
  const dialog=document.createElement('dialog'); dialog.className='order-dialog'; dialog.setAttribute('aria-labelledby','orderTitle');
  dialog.innerHTML='<header><h2 id="orderTitle">行程排序</h2><button type="button" data-close aria-label="关闭行程排序">关闭</button></header><p>拖动左侧手柄或使用上下按钮。起点及返回起点固定。</p><div class="order-list"></div><p class="order-status" role="status"></p><footer><button type="button" data-close>取消</button><button type="button" data-save>保存排序</button></footer>';
  document.body.append(dialog);
  let draft=[], original=[], start='', drag=null;
  const list=dialog.querySelector('.order-list'), save=dialog.querySelector('[data-save]');
  function move(from,to) {
    if (globalThis.DriveSharedPreview || from<0 || to<0 || to>=draft.length || draft[from].fixed || draft[to].fixed) return;
    draft.splice(to,0,draft.splice(from,1)[0]); render();
  }
  function render() {
    list.replaceChildren();
    const origin=document.createElement('div'); origin.className='order-row order-fixed'; origin.textContent=`01 ${start} · 起点固定`; list.append(origin);
    draft.forEach((stop,i)=>{
      const row=document.createElement('div'); row.className='order-row'; row.dataset.index=i;
      const grip=document.createElement('button'); grip.type='button'; grip.className='order-grip'; grip.textContent='⠿'; grip.setAttribute('aria-label',`拖动 ${stop.name}`); grip.disabled=stop.fixed || !!globalThis.DriveSharedPreview;
      const name=document.createElement('span'); name.textContent=`${String(i+2).padStart(2,'0')} ${stop.name}${stop.fixed?' · 返回起点固定':''}`;
      row.append(grip,name);
      [-1,1].forEach(delta=>{const b=document.createElement('button'); b.type='button'; b.textContent=delta<0?'↑':'↓'; b.setAttribute('aria-label',`${delta<0?'上移':'下移'} ${stop.name}`); b.disabled=grip.disabled || !draft[i+delta] || draft[i+delta].fixed; b.onclick=()=>{move(i,i+delta); list.querySelector(`[data-index="${i+delta}"] button:not(:disabled)`)?.focus();};row.append(b);});
      grip.onpointerdown=e=>{if(grip.disabled)return;drag={from:i,to:i,pointer:e.pointerId};grip.setPointerCapture(e.pointerId);row.classList.add('order-dragging');};
      grip.onpointermove=e=>{if(!drag)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.order-row[data-index]');if(target && !draft[Number(target.dataset.index)].fixed){drag.to=Number(target.dataset.index);list.querySelectorAll('.order-target').forEach(n=>n.classList.remove('order-target'));target.classList.add('order-target');}};
      grip.onpointerup=()=>{if(!drag)return;const d=drag;drag=null;move(d.from,d.to);};
      grip.onpointercancel=()=>{drag=null;render();}; list.append(row);
    });
  }
  open.onclick=()=>{const data=DriveOrder.read();start=data.start;draft=data.stops;original=draft.map(d=>d.id);render();save.disabled=!!globalThis.DriveSharedPreview;dialog.querySelector('.order-status').textContent=globalThis.DriveSharedPreview?'分享预览不可修改排序。':'';dialog.showModal();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.addEventListener('close',()=>{drag=null;open.focus({preventScroll:true});});
  save.onclick=()=>{if(DriveOrder.apply(draft.map(d=>d.id),original))dialog.close();else dialog.querySelector('.order-status').textContent='行程已发生变化，请关闭后重新打开排序。';};
})();
