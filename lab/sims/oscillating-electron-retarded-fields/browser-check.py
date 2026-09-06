"""Real Chromium interaction, screenshot and timing evidence. See README.md.
Test tooling lives outside the repo; serve the checkout on port 8765.
"""
import json
import math
import os
import platform
import statistics
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ASSETS = Path(__file__).resolve().parent / 'assets'
BASE = os.environ.get('ORRERY_URL', 'http://localhost:8765')
URL = BASE + '/lab/sims/oscillating-electron-retarded-fields/'

def summary(values):
    v = sorted(values)
    return {'samples': len(v), 'median': statistics.median(v), 'p95': v[math.ceil(.95*len(v))-1], 'max': max(v)}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    errors, warnings, responses = [], [], []
    page = browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: (errors if message.type=='error' else warnings).append(message.text) if message.type in ['error','warning'] else None)
    page.on('response', lambda response: responses.append({'url':response.url,'status':response.status}) if response.status>=400 else None)
    page.on('requestfailed', lambda request: errors.append(request.url+': '+str(request.failure)))
    page.goto(URL); page.wait_for_function('window.orrery !== undefined')
    def snapshot(): return page.evaluate('window.orrery.snapshot()')
    def slider(id,value):
        page.locator('#'+id).evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}',str(value))
    page.locator('#during').click()
    slider('phase',1.57);frozen=snapshot()
    assert abs(frozen['time']-1.57)<1e-12
    page.wait_for_timeout(150)
    assert snapshot()['time']==frozen['time'] and not snapshot()['playing']
    for density,count in [('sparse',16),('dense',32),('standard',24)]:
        page.select_option('#density',density)
        assert snapshot()['streamlines']==count
        assert snapshot()['probe']==frozen['probe']
    slider('gain',4);assert snapshot()['probe']==frozen['probe'];slider('gain',1)
    box=page.locator('#scene').bounding_box()
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down();page.mouse.move(box['x']+box['width']/2+100,box['y']+box['height']/2+30,steps=8);page.mouse.up()
    assert snapshot()['camera']!=frozen['camera']
    camera=snapshot()['camera'];page.mouse.wheel(0,150);page.wait_for_timeout(100)
    assert snapshot()['camera'][2]!=camera[2]
    page.locator('#scene').focus();page.keyboard.press('ArrowLeft');page.keyboard.press('+')
    assert snapshot()['probe']==frozen['probe']
    page.locator('#home-camera').click();assert snapshot()['camera']==frozen['camera']
    for component in ['near','rad','total']:
        page.select_option('#component',component)
        assert snapshot()['component']==component and snapshot()['probe']==frozen['probe']
    for id in ['magnetic','electric','poynting','power']:
        page.locator('#'+id).set_checked(True);page.locator('#'+id).set_checked(False)
    page.locator('#magnetic').check()
    for preset in ['radiation','near','power','stationary','overview']:
        page.select_option('#preset',preset)
        if preset=='stationary':
            assert snapshot()['beta']==0 and math.hypot(*snapshot()['probe']['B'])<1e-14
        if preset=='power':
            assert page.locator('#power-panel').is_visible()
            assert 'Full-sphere' in page.locator('#power-value').inner_text()
    page.select_option('#motion','linear')
    assert snapshot()['motion']=='linear' and snapshot()['beta']==.15
    page.select_option('#preset','power');slider('phase',1.57)
    assert 'Peak' in page.locator('#power-value').inner_text()
    page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(ASSETS/'desktop-power.png'),full_page=True)
    slider('beta',.8);slider('phase',1.57);slider('probe-radius',.8);slider('probe-angle',0)
    assert snapshot()['probe']['masked'] and 'EXCLUDED' in page.locator('#probe-readout').inner_text()
    page.select_option('#motion','turn');page.select_option('#preset','overview')
    slider('probe-radius',5);slider('probe-angle',65)
    # Actual sequence at identical camera, parameters and fixed observation times.
    sequence=[]
    for viewport,prefix in [({'width':1440,'height':1000},'desktop'),({'width':390,'height':844},'narrow')]:
        page.set_viewport_size(viewport);page.locator('#home-camera').click()
        for moment,time in [('before',-4),('during',0),('delay',2),('after',5.5)]:
            page.locator('#'+moment).click();s=snapshot();assert s['time']==time
            assert s['vertices']>1000
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no overflow'
            intro=page.locator('.intro').bounding_box();badges=page.locator('.scene-top').bounding_box()
            assert intro['y']+intro['height']<badges['y'],f'title/badge separation {viewport} {intro} {badges}'
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(ASSETS/(prefix+'-'+moment+'.png')),full_page=True)
            sequence.append({'viewport':viewport,'moment':moment,'time':time,'electron':s['electron'],
                'witnesses':[{'tr':f['tr'],'By':f['B'][1]} for f in s['witnesses']]})
            if moment=='delay':
                assert s['witnesses'][0]['B'][1]>0>s['witnesses'][1]['B'][1], 'near changes before far'
    # Touch orbit and pinch on narrow viewport.
    cdp=page.context.new_cdp_session(page);camera=snapshot()['camera'];before=snapshot()['probe']
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':180,'y':440}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':210,'y':460}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert snapshot()['camera']!=camera
    distance=snapshot()['camera'][2]
    for kind,x1,x2 in [('touchStart',120,240),('touchMove',110,250),('touchMove',90,270)]:
        cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x1,'y':450,'id':1},{'x':x2,'y':450,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert snapshot()['camera'][2]!=distance
    page.locator('#beta').focus();page.keyboard.press('ArrowRight');assert snapshot()['beta']==.73
    slider('beta',.72);page.set_viewport_size({'width':1440,'height':1000})
    assert snapshot()['probe']==before
    page.locator('#reset').click();assert snapshot()['time']==-4 and not snapshot()['playing']
    page.locator('#play').click();page.wait_for_timeout(400);assert snapshot()['time']>-4;page.locator('#play').click()
    slider('phase',9.9);page.locator('#play').click();page.wait_for_timeout(300)
    assert snapshot()['time']==10 and not snapshot()['playing'], 'end pauses instead of a causal jump'
    # Inject one slow frame. Wall-clock playback must advance by elapsed time,
    # irrespective of number of frames or the shared scheduler's .1s clamp.
    page.locator('#reset').click();page.locator('#play').click()
    drift=page.evaluate('''async()=>{const start=performance.now(),t=window.orrery.snapshot().time;
      while(performance.now()-start<240){};
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return {dt:window.orrery.snapshot().time-t,wall:(performance.now()-start)*.00125};}''')
    assert abs(drift['dt']-drift['wall'])<.1,drift
    page.locator('#play').click()
    gl=page.evaluate('''()=>{const gl=document.querySelector('#scene canvas').getContext('webgl2')||document.querySelector('#scene canvas').getContext('webgl');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR)};}''')
    hardware=next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')),platform.processor())
    metrics=[]
    for viewport,density in [({'width':1440,'height':1000},'standard'),({'width':1440,'height':1000},'dense'),({'width':390,'height':844},'standard')]:
        page.set_viewport_size(viewport);page.select_option('#density',density);page.locator('#home-camera').click()
        page.locator('#before').click();page.locator('#play').click();page.evaluate('window.scrollTo(0,0)')
        page.wait_for_timeout(1000);page.evaluate('window.orrery.clearMetrics()');page.wait_for_timeout(5000)
        m=page.evaluate('window.orrery.metrics()');page.locator('#play').click()
        metrics.append({'viewport':viewport,'density':density,'motion':'turn','beta':.72,'gain':1,
            'warmupSeconds':1,'measurementSeconds':5,'frameIntervalMs':summary(m['frameIntervalsMs']),
            'cpuUpdateAndRenderSubmitMs':summary(m['cpuRenderMs']),'drawCalls':m['drawCalls'],
            'triangles':m['triangles'],'pixelRatio':m['pixelRatio']})
    page.goto(BASE+'/lab/gallery/');page.get_by_role('heading',name='Turning electron — retarded fields',exact=True).wait_for()
    page.goto(BASE+'/lab/sims/swirl-ball-far-field/')
    page.get_by_role('link',name='Open the retarded-field simulation →').click();page.wait_for_function('window.orrery !== undefined')
    assert not errors,errors
    assert not responses,responses
    report={'status':'pass','recordedAt':datetime.now(timezone.utc).isoformat(),'browser':browser.version,
        'os':platform.platform(),'cpu':hardware,'logicalCpus':os.cpu_count(),'webgl':gl,
        'launchArgs':['--no-sandbox','--enable-unsafe-swiftshader'],
        'checks':['four desktop and narrow moments','pause/scrub/reset/end/play','all presets and motion comparison',
          'all contributions and field toggles','symmetry-restricted power','retarded probe and exclusion',
          'density/gain/camera/viewport field invariance','mouse/keyboard/touch/pinch camera controls',
          'near/far delayed By reversal','slow-frame wall-clock invariance','gallery and historical navigation','no browser errors'],
        'slowFrameClock':drift,'sequence':sequence,'warnings':sorted(set(warnings)),'errors':errors,
        'failedResponses':responses,'measurements':metrics}
    (ASSETS/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='sequence'},indent=2));browser.close()
