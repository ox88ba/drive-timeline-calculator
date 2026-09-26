// Isolated UI checks: no production data, navigation or AI requests.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,serviceWorkers:'block'});
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.hostname!=='local.test')return r.abort();
   if(u.pathname==='/config.js')return r.fulfill({contentType:'application/javascript',body:'globalThis.DRIVE_AI_ENABLED=false;'});
   if(u.pathname.startsWith('/api/'))return r.fulfill({json:{}});
   const file=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));
   if(!file.startsWith(root)||!fs.existsSync(file))return r.abort();
   return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://local.test/');
  await page.evaluate(()=>{const original=window.DriveAddMorph;window.morphCalls=0;window.DriveAddMorph=(...args)=>{window.morphCalls++;original(...args);};});
  await page.locator('#addDestination').click();
  assert.equal(await page.evaluate(()=>window.morphCalls),1,'pointer add uses capsule morph');
  assert.equal(await page.locator('.destination-card').count(),1);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.add-destination-morph').count(),0,'morph cleans up');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#addDestination').click();
  assert.equal(await page.locator('.destination-card').count(),2);
  assert.equal(await page.locator('.add-destination-morph').count(),0,'reduced motion has no overlay');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#addDestination').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.destination-card').count(),3);
  assert.equal(await page.evaluate(()=>window.morphCalls),2,'keyboard add skips morph');
  assert.equal(await page.locator('.tf-preroll,.tf-enter,.tf-pop,.tf-skyfade').count(),0,'functional content never hidden for motion');
  assert.equal(await page.locator('#tkTemplatesBtn').evaluate(el=>getComputedStyle(el).touchAction),'manipulation');
  await page.locator('#tkTemplatesBtn').hover();
  assert.equal(await page.locator('#tkTemplatesBtn').evaluate(el=>getComputedStyle(el).transform),'none','touch hover does not lift button');
  await page.locator('#tkTemplatesBtn').click();
  assert.ok(await page.locator('.tk-close').evaluate(el=>el.getBoundingClientRect().width)>=44);
  assert.equal(await page.locator('.tk-body').evaluate(el=>getComputedStyle(el).overscrollBehaviorY),'contain');
  await page.screenshot({path:'/tmp/roadbook-emil-templates.png'});
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#tkTemplatesBtn').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.emulateMedia({contrast:'more'});
  assert.equal(await page.locator('.trip-dock').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  await page.clock.install();
  await page.evaluate(()=>{window.undoCount=0;window.DriveUndoSnackbar('测试撤销',()=>window.undoCount++);document.querySelector('.undo-snackbar-action').focus();});
  await page.clock.runFor(8000);
  assert.equal(await page.locator('#undoSnackbar').isVisible(),true,'focus pauses expiration');
  await page.locator('.undo-snackbar-action').click();
  assert.equal(await page.evaluate(()=>window.undoCount),1);
  // Playwright click uses a mouse even in a touch-capable context. Move it
  // away: otherwise the next toast correctly pauses for pointer hover.
  await page.mouse.move(0,0);
  await page.evaluate(()=>{window.DriveUndoSnackbar('测试重入',()=>{});document.querySelector('.undo-snackbar-action').focus();document.querySelector('#openShare').focus();});
  await page.clock.runFor(6100);
  assert.equal(await page.locator('#undoSnackbar').isVisible(),false,'focus-out resumes expiration');
  await page.evaluate(()=>{window.DriveUndoSnackbar('旧提示',()=>{},()=>window.oldDismissed=true);window.DriveUndoSnackbar('新提示',()=>{});});
  await page.clock.runFor(6100);
  assert.equal(await page.evaluate(()=>window.oldDismissed),undefined,'replacement cleans old timer');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS Emil polish: touch hover, motion, contrast, modal scroll, undo focus and replacement');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
