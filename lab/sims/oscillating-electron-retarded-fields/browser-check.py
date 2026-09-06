"""Chromium playback/interaction evidence; serve repository on port 8765.
External tooling/setup and comparison conventions are documented in README.md.
"""
import json, math, os, platform, statistics
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
ASSETS=Path(__file__).resolve().parent/'assets'
BASE=os.environ.get('ORRERY_URL','http://localhost:8765')
URL=BASE+'/lab/sims/oscillating-electron-retarded-fields/'
ORIGINAL=BASE+'/lab/sims/swirl-ball-far-field/'
def summary(v):
 v=sorted(v)
 return {'samples':len(v),'median':statistics.median(v),'p95':v[math.ceil(.95*len(v))-1],'max':max(v)}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
 errors=[];failed=[];sequence=[];measurements=[];original_sequence=[]
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('requestfailed',lambda r:failed.append(r.url+': '+str(r.failure)))
 page.on('response',lambda r:failed.append(r.url+': '+str(r.status)) if r.status>=400 else None)
 page.goto(URL);page.wait_for_function('window.orrery !== undefined')
 def snap():return page.evaluate('window.orrery.snapshot()')
 def slider(id,value):page.locator('#'+id).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',str(value))
 page.locator('#delay').click();frozen=snap();assert frozen['time']==3 and not frozen['playing']
 page.wait_for_timeout(200);assert snap()['time']==3
 assert frozen['witnesses'][0]['B'][1]>0>frozen['witnesses'][1]['B'][1]
 page.locator('#settings summary').click()
 for density,count in [('light',4608),('dense',23040),('standard',8064)]:
  page.select_option('#density',density);assert snap()['samples']==count and snap()['probe']==frozen['probe']
 slider('gain',3);assert snap()['probe']==frozen['probe'];slider('gain',1)
 for component in ['near','rad','total']:
  page.select_option('#component',component);assert snap()['component']==component and snap()['probe']==frozen['probe']
 for vector in ['E','B']:
  page.select_option('#vector',vector);assert snap()['vector']==vector and snap()['probe']==frozen['probe']
 page.locator('#power').check();assert 'Full-sphere' in page.locator('#power-value').inner_text()
 page.select_option('#motion','linear');assert snap()['beta']==.15 and 'Axial symmetry' in page.locator('#power-value').inner_text()
 page.select_option('#motion','ellipse');assert 'Not axisymmetric' in page.locator('#power-value').inner_text()
 page.select_option('#motion','turn');slider('beta',0)
 assert snap()['electron']['velocity']==[0,0,0] and math.hypot(*snap()['probe']['B'])<1e-14 and snap()['visible']==0
 assert '0.000e+0' in page.locator('#power-value').inner_text()
 slider('beta',.45);page.locator('#guide').check();page.screenshot(path=str(ASSETS/'dense-desktop-guide.png'))
 page.locator('#guide').uncheck();page.locator('#power').uncheck();page.locator('#settings summary').click()
 # Camera controls cannot change physical coordinates or time.
 camera=snap()['camera'];page.mouse.move(650,550);page.mouse.down();page.mouse.move(740,550,steps=8);page.mouse.up()
 assert snap()['camera']!=camera and snap()['probe']==frozen['probe']
 page.mouse.wheel(0,120);page.locator('#scene').focus();page.keyboard.press('ArrowLeft');page.keyboard.press('+')
 assert snap()['probe']==frozen['probe']
 page.locator('#settings summary').click();page.locator('#home-camera').click();page.locator('#settings summary').click();assert snap()['camera']==camera
 for viewport,prefix in [({'width':1440,'height':1000},'desktop'),({'width':390,'height':844},'narrow')]:
  page.set_viewport_size(viewport)
  for moment,t in [('before',-3),('during',0),('delay',3),('after',6)]:
   page.locator('#'+moment).click();s=snap();assert s['time']==t and not s['playing'] and s['visible']>1500
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(ASSETS/f'dense-{prefix}-{moment}.png'))
   sequence.append({'viewport':viewport,'moment':moment,'time':t,'visible':s['visible'],'electron':s['electron'],'witnesses':[{'tr':f['tr'],'By':f['B'][1]} for f in s['witnesses']]})
  # Fresh default page: avoid carrying dense/alternate-motion JIT and GC state
  # into the default playback measurement. No screenshots during timing.
  page.goto(URL);page.wait_for_function('window.orrery !== undefined')
  page.locator('#reset').click();page.locator('#play').click();page.wait_for_timeout(1000);page.evaluate('window.orrery.clearMetrics()');start=snap()['time'];page.wait_for_timeout(5000);end=snap()['time'];metrics=page.evaluate('window.orrery.metrics()');page.locator('#play').click()
  assert end-start>8 and len(metrics['frameIntervalsMs'])>20
  measurements.append({'viewport':viewport,'density':'standard','samples':8064,'beta':.45,'startTime':start,'endTime':end,'warmupSeconds':1,'measurementSeconds':5,'frameIntervalMs':summary(metrics['frameIntervalsMs']),'cpuComputeAndCanvasSubmitMs':summary(metrics['cpuRenderMs']),'pixelRatio':metrics['pixelRatio']})
 # Narrow touch rotate/pinch and controls, then a frozen viewport resize.
 page.locator('#during').click();camera=snap()['camera'];frozen=snap()['probe'];cdp=page.context.new_cdp_session(page)
 for kind,points in [('touchStart',[{'x':150,'y':420}]),('touchMove',[{'x':210,'y':420}]),('touchEnd',[])]:cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
 assert snap()['camera']!=camera
 zoom=snap()['camera'][1]
 for kind,x1,x2 in [('touchStart',100,230),('touchMove',90,240),('touchMove',70,260)]:cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x1,'y':420,'id':1},{'x':x2,'y':420,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert snap()['camera'][1]!=zoom
 page.locator('#settings summary').click();page.locator('#home-camera').click();page.screenshot(path=str(ASSETS/'dense-narrow-controls.png'));page.locator('#settings summary').click()
 page.set_viewport_size({'width':1440,'height':1000});assert snap()['probe']==frozen
 slider('phase',1.23);page.wait_for_timeout(200);assert snap()['time']==1.23
 slider('phase',9.9);page.locator('#play').click();page.wait_for_timeout(200);assert snap()['time']==10 and not snap()['playing']
 page.locator('#reset').click();page.locator('#play').click()
 drift=page.evaluate('''async()=>{const start=performance.now(),t=window.orrery.snapshot().time;while(performance.now()-start<240){};await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {dt:window.orrery.snapshot().time-t,wall:(performance.now()-start)*.0018};}''')
 assert abs(drift['dt']-drift['wall'])<.15,drift
 page.locator('#play').click()
 # Reciprocal navigation. The illustration is preserved, without deprecation.
 page.get_by_role('link',name='Original illustration ↗').click();assert 'superseded' not in page.locator('body').inner_text()
 page.get_by_role('link',name='Compare computed retarded field →').click();page.wait_for_function('window.orrery !== undefined')
 # Baseline: execute original animation code, deterministic rAF/Math.random only
 # in harness. Warm through one period so lifetime history is populated. Match
 # desktop propagation distance: candidate dt * model-px-per-unit / original c.
 # Narrow retains those circuit phases so the sequence spans the full turn.
 for viewport,prefix in [({'width':1440,'height':1000},'desktop'),({'width':390,'height':844},'narrow')]:
  original=browser.new_page(viewport=viewport)
  original.add_init_script('let seed=0x12345678;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};')
  original.clock.install();original.goto(ORIGINAL)
  original.clock.run_for(32)
  g=original.evaluate('({g:geom(),v:Math.min(geom().path*P.freq,.995*P.c),c:P.c,R,T})')
  turn=(g['g']['L']+g['g']['cap']/2)/g['v']+g['g']['path']/g['v']
  # Same desktop orthographic x/y/z scale; narrow candidate deliberately zooms
  # 1.45x for touch readability (documented, no field rescaling).
  scale=g['R']*.83/6
  for moment,t in [('before',-3),('during',0),('delay',3),('after',6)]:
   comparison_scale=min(1440*.36,1000*.55)*.83/6
   target=turn+t*comparison_scale/g['c'];current=original.evaluate('T');original.evaluate('paused=false');original.clock.run_for(max(1,round((target-current)*1000)));original.evaluate('paused=true');original.clock.run_for(17)
   s=original.evaluate('({T,p:pathState(dist),rings:rings.length,dist})');s.update({'viewport':viewport,'moment':moment,'targetT':target,'turnT':turn,'candidateTime':t,'candidateModelPixelsPerUnit':scale,'comparisonTimeScalePixelsPerUnit':comparison_scale})
   original.screenshot(path=str(ASSETS/f'original-{prefix}-{moment}.png'));original_sequence.append(s)
  original.close()
 # Original actual unpaused wall-clock playback (separate from phase harness).
 page.goto(ORIGINAL);page.wait_for_timeout(1000);t0=page.evaluate('T');page.wait_for_timeout(1500);assert page.evaluate('T')>t0+1
 page.goto(BASE+'/lab/gallery/');page.get_by_role('heading',name='Turning electron — retarded fields',exact=True).wait_for()
 assert not errors,errors
 assert not failed,failed
 hardware=next((s.split(':',1)[1].strip() for s in Path('/proc/cpuinfo').read_text().splitlines() if s.startswith('model name')),platform.processor())
 report={'status':'pass','recordedAt':datetime.now(timezone.utc).isoformat(),'browser':browser.version,'os':platform.platform(),'cpu':hardware,'logicalCpus':os.cpu_count(),'renderer':'Chromium Canvas2D, headless; no physical GPU/mobile claims','launchArgs':['--no-sandbox'],'sequence':sequence,'originalSequence':original_sequence,'measurements':measurements,'slowFrameClock':drift,'errors':errors,'failedRequests':failed,'checks':['desktop/narrow full-window four-phase sequence','real playback across turn, timings exclude screenshots','pause/scrub/end/reset','mouse/keyboard/touch/pinch','density/gain/camera/viewport preserve probe','both vectors and all contributions','zero-speed zero-B control','trajectory and full-sphere power controls','optional guide explicitly labeled','reciprocal original navigation and gallery']}
 (ASSETS/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'status':'pass','measurements':measurements,'slowFrameClock':drift},indent=2));browser.close()
