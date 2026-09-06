"""Rendered interaction checks and measured frame timings; requires Python Playwright.
Serve the repo with lab/tools/serve.sh 8765, then run this script (README.md).
Screenshots and metrics are intentional review artifacts, overwritten on rerun.
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
    return {'samples': len(v), 'median': statistics.median(v), 'p95': v[math.ceil(.95 * len(v))-1], 'max': max(v)}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    errors, warnings, responses = [], [], []
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: (errors if message.type == 'error' else warnings).append(message.text) if message.type in ['error', 'warning'] else None)
    page.on('response', lambda response: responses.append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
    page.on('requestfailed', lambda request: errors.append(request.url + ': ' + str(request.failure)))
    page.goto(URL)
    page.wait_for_function('window.orrery !== undefined')
    page.locator('#play').click()
    def snapshot(): return page.evaluate('window.orrery.snapshot()')
    def slider(id, value):
        page.locator('#'+id).evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}', str(value))
    slider('phase', 1.571)
    frozen = snapshot()
    assert abs(frozen['time']-1.571)<1e-12, 'scrub selects the requested phase'
    page.wait_for_timeout(250)
    assert snapshot()['time'] == frozen['time'], 'pause must freeze physical time'
    assert not frozen['playing']
    for density, count in [('sparse',35),('dense',99),('standard',63)]:
        page.select_option('#density', density)
        assert snapshot()['rings'] == count
        assert snapshot()['probe'] == frozen['probe'], 'density must not alter fields'
    slider('gain',4)
    assert snapshot()['probe'] == frozen['probe'], 'gain must not alter fields'
    slider('gain',1)
    box=page.locator('#scene').bounding_box()
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down(); page.mouse.move(box['x']+box['width']/2+100,box['y']+box['height']/2+30,steps=8); page.mouse.up()
    assert snapshot()['camera'] != frozen['camera']
    camera=snapshot()['camera']
    page.mouse.wheel(0,150); page.wait_for_timeout(100)
    assert snapshot()['camera'][2] != camera[2]
    assert snapshot()['probe'] == frozen['probe'], 'orbit/zoom must not alter fields'
    page.locator('#scene').focus();page.keyboard.press('ArrowLeft');page.keyboard.press('+')
    assert snapshot()['probe'] == frozen['probe']
    for component in ['near','rad','total']:
        page.select_option('#component',component)
        assert snapshot()['component']==component
        assert snapshot()['probe']==frozen['probe'], 'probe retains all contributions'
    for id in ['magnetic','electric','poynting','power']:
        page.locator('#'+id).set_checked(True)
        page.locator('#'+id).set_checked(False)
    page.locator('#magnetic').check()
    for preset in ['radiation','near','power','stationary','overview']:
        page.select_option('#preset',preset)
        if preset=='stationary':
            assert snapshot()['beta']==0
            assert math.hypot(*snapshot()['probe']['B'])<1e-14
        if preset=='power':
            assert page.locator('#power-panel').is_visible()
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(ASSETS/'desktop-power.png'),full_page=True)
    slider('beta',.8);assert snapshot()['beta']==.8
    slider('phase',1.571);slider('probe-radius',.8);slider('probe-angle',0)
    assert snapshot()['probe']['masked']
    assert 'EXCLUDED' in page.locator('#probe-readout').inner_text()
    slider('beta',.15);slider('probe-radius',5);slider('probe-angle',65)
    page.select_option('#preset','overview');slider('phase',1.571)
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(ASSETS/'desktop-atlas.png'),full_page=True)
    page.select_option('#preset','near')
    page.screenshot(path=str(ASSETS/'desktop-near.png'),full_page=True)
    page.select_option('#preset','overview')
    page.locator('#reset').click()
    assert snapshot()['time']==0 and not snapshot()['playing']
    page.locator('#play').click();page.wait_for_timeout(400)
    assert snapshot()['time']>0
    page.locator('#play').click()
    gl=page.evaluate('''()=>{const gl=document.querySelector('#scene canvas').getContext('webgl2')||document.querySelector('#scene canvas').getContext('webgl');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR)};}''')
    hardware = next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')), platform.processor())
    metrics=[]
    # Timings exclude screenshot capture and interaction. Fixed beta, camera and gain.
    for viewport,density,preset in [({'width':1440,'height':1000},'standard','overview'),({'width':1440,'height':1000},'dense','radiation'),({'width':390,'height':844},'standard','overview')]:
        page.set_viewport_size(viewport);page.select_option('#preset',preset);page.select_option('#density',density)
        slider('phase',0);page.locator('#play').click();page.evaluate('window.scrollTo(0,0)')
        page.wait_for_timeout(1000)
        page.evaluate('window.orrery.clearMetrics()')
        page.wait_for_timeout(5000)
        m=page.evaluate('window.orrery.metrics()')
        page.locator('#play').click()
        metrics.append({'viewport':viewport,'preset':preset,'density':density,'beta':.15,'gain':1,'warmupSeconds':1,'measurementSeconds':5,'frameIntervalMs':summary(m['frameIntervalsMs']),'cpuUpdateAndRenderSubmitMs':summary(m['cpuRenderMs']),'drawCalls':m['drawCalls'],'triangles':m['triangles'],'pixelRatio':m['pixelRatio']})
    page.select_option('#preset','overview');slider('phase',1.571)
    before=snapshot()['probe']
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no narrow overflow'
    assert page.locator('.intro').bounding_box()['y']+page.locator('.intro').bounding_box()['height'] < page.locator('.scene-top').bounding_box()['y'], 'narrow title and field badges must not overlap'
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(ASSETS/'narrow-atlas.png'),full_page=True)
    # Touch-style pointer orbit, plus keyboard range interaction at narrow width.
    cdp=page.context.new_cdp_session(page)
    camera=snapshot()['camera']
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':180,'y':320}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':210,'y':340}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert snapshot()['camera']!=camera
    distance=snapshot()['camera'][2]
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':120,'y':350,'id':1},{'x':240,'y':350,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':110,'y':350,'id':1},{'x':250,'y':350,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':90,'y':350,'id':1},{'x':270,'y':350,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert snapshot()['camera'][2]!=distance, 'pinch changes zoom'
    page.locator('#beta').focus();page.keyboard.press('ArrowRight');assert snapshot()['beta']==.16
    slider('beta',.15)
    page.set_viewport_size({'width':1440,'height':1000})
    assert snapshot()['probe']==before, 'viewport must not alter fields'
    # Navigate both catalog entries and historical successor.
    page.goto(BASE+'/lab/gallery/');page.get_by_role('heading',name='Oscillating electron — retarded fields',exact=True).wait_for()
    page.goto(BASE+'/lab/sims/swirl-ball-far-field/')
    page.get_by_role('link',name='Open the retarded-field simulation →').click()
    page.wait_for_function('window.orrery !== undefined')
    assert not errors, errors
    assert not responses, responses
    report={'status':'pass','recordedAt':datetime.now(timezone.utc).isoformat(),'browser':browser.version,'os':platform.platform(),'cpu':hardware,'logicalCpus':os.cpu_count(),'webgl':gl,'launchArgs':['--no-sandbox','--enable-unsafe-swiftshader'],'checks':['pause/scrub/reset/play','all presets','all field toggles and contributions','probe position and singular exclusion','density/gain/camera/viewport invariance','mouse orbit/wheel zoom and keyboard orbit/zoom','narrow pointer and keyboard controls, no horizontal overflow','gallery and historical successor navigation','no console/page/load errors'],'warnings':sorted(set(warnings)),'errors':errors,'failedResponses':responses,'measurements':metrics}
    (ASSETS/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    browser.close()
