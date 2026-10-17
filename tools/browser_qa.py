#!/usr/bin/env python3
"""Render the self-contained TORSH preview and check layout and interactions.

Optional QA dependency: Playwright with a Chromium executable.
Run from any directory: python tools/browser_qa.py
Set CHROMIUM_BINARY to an installed Chromium when necessary.
The normal website has no runtime dependency on this script.
"""
from pathlib import Path
import json, os, shutil, sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from export_preview import export
PREVIEW=ROOT.parent/'TORSH-Website-Content-Refresh-Preview.html'
PREVIEWS=ROOT.parent/'previews'
WIDTHS=[320,390,620,768,1024,1440,1920]
FILES=sorted([p.relative_to(ROOT).as_posix() for p in ROOT.glob('*.html')]+[p.relative_to(ROOT).as_posix() for p in (ROOT/'products').glob('*.html')])

def main():
 export(PREVIEW); PREVIEWS.mkdir(exist_ok=True)
 report={'method':'Chromium, self-contained static-site preview rendered with set_content; no hosted deployment tested.','widths':WIDTHS,'pages':FILES,'layouts':[],'interactions':{},'issues':[]}
 with sync_playwright() as pw:
  exe=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium')
  kwargs={'headless':True,'args':['--no-sandbox']}
  if exe:kwargs['executable_path']=exe
  browser=pw.chromium.launch(**kwargs)
  print('Browser launched',flush=True)
  page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_default_timeout(8000)
  page.set_content(PREVIEW.read_text(),wait_until='load')
  print('Preview loaded',flush=True)
  for width in WIDTHS:
   print('Checking width',width,flush=True)
   page.set_viewport_size({'width':width,'height':900})
   for f in FILES:
    page.evaluate('(f)=>{location.hash="/"+f}',f)
    page.wait_for_timeout(35)
    metrics=page.evaluate('''() => ({width:innerWidth, scroll:document.documentElement.scrollWidth,
      h1:document.querySelectorAll('main h1').length,
      missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,
      missingIconNames:[...document.querySelectorAll('svg[data-torsh-icon]')].filter(i=>!i.children.length).length,
      overflow:[...document.querySelectorAll('main *,.header-inner,.site-footer *')].filter(e=>{
       if(e.closest('svg,dialog,[hidden]'))return false;
       const cs=getComputedStyle(e), r=e.getBoundingClientRect();
       return cs.display!=='none' && r.width>0 && (r.right>innerWidth+1||r.left < -1);
      }).slice(0,6).map(e=>e.tagName+'.'+e.className)
    })''')
    report['layouts'].append({'page':f,'viewport':width,**metrics})
    if metrics['scroll']>width+1 or metrics['h1']!=1 or metrics['missingImages'] or metrics['missingIconNames'] or metrics['overflow']:
     report['issues'].append({'page':f,'width':width,'metrics':metrics})
  # Icon bounds are checked at the definition level via the rendered gallery.
  page.set_viewport_size({'width':1440,'height':1000})
  page.evaluate('location.hash="/style-guide.html"');page.wait_for_timeout(80)
  bounds=page.evaluate('''() => [...document.querySelectorAll('.icon-library .icon-tile > svg')].map(s=>{
   const b=s.getBBox(), v=s.viewBox.baseVal, sw=Number(s.getAttribute('stroke-width'))/2;
   return {id:s.dataset.torshIcon,x:b.x,y:b.y,width:b.width,height:b.height,withinCanvas:b.x-sw>=0&&b.y-sw>=0&&b.x+b.width+sw<=v.width&&b.y+b.height+sw<=v.height};
  })''')
  report['icon_bounds']=bounds
  if any(not b['withinCanvas'] for b in bounds):report['issues'].append({'icon_bounds':[b for b in bounds if not b['withinCanvas']]})
  print('Icon bounds checked',flush=True)
  # Search, dismissal and a real routed result link.
  page.evaluate('location.hash="/index.html"');page.wait_for_timeout(60)
  page.locator('[data-search-open]').click()
  page.locator('#site-search-input').fill('hydrogel')
  assert page.locator('.search-results a[href="#/products/biomaterial-innovation.html"]').is_visible()
  page.locator('#site-search-input').fill('no_such_page_123')
  assert page.locator('[data-search-empty]').is_visible()
  page.keyboard.press('Escape')
  assert not page.locator('#site-search').is_visible()
  assert page.locator('[data-search-open]').evaluate('(e)=>e===document.activeElement')
  page.keyboard.press('/')
  page.locator('#site-search-input').fill('stents')
  page.locator('.search-results a[href="#/products/ureteral-stents.html"]').click()
  page.wait_for_timeout(80)
  assert page.locator('h1').inner_text()=='Ureteral stents'
  report['interactions']['search_filter_empty_state_escape_focus_and_navigation']='pass'
  print('Search checked',flush=True)
  # Mobile menu and Escape.
  page.set_viewport_size({'width':390,'height':844})
  page.locator('[data-menu-toggle]').click()
  assert page.locator('#primary-navigation').is_visible()
  page.locator('#primary-navigation a[href="#/about.html"]').click()
  page.wait_for_timeout(80)
  assert 'Clinical insight' in page.locator('h1').inner_text()
  assert page.locator('[data-menu-toggle]').get_attribute('aria-expanded')=='false'
  page.locator('[data-menu-toggle]').click();page.keyboard.press('Escape')
  assert page.locator('[data-menu-toggle]').get_attribute('aria-expanded')=='false'
  report['interactions']['mobile_menu_navigation_escape']='pass'
  print('Mobile menu checked',flush=True)
  # Contact remains genuinely pending; configured mailto is tested without sending.
  page.evaluate('location.hash="/contact.html"');page.wait_for_timeout(80)
  assert page.locator('[data-contact-pending]').is_visible()
  assert not page.locator('[data-contact-ready]').is_visible()
  page.evaluate('window.TORSH_CONFIG={...window.TORSH_CONFIG,contactEmail:"qa@example.invalid"};window.TorshSite.refresh()')
  assert page.locator('[data-contact-ready]').is_visible()
  assert page.locator('[data-contact-link]').get_attribute('href').startswith('mailto:qa@example.invalid?subject=')
  page.evaluate('window.TORSH_CONFIG={...window.TORSH_CONFIG,contactEmail:""};window.TorshSite.refresh()')
  assert page.locator('[data-contact-pending]').is_visible()
  report['interactions']['pending_and_configured_email_without_sending']='pass'
  page.evaluate('location.hash="/products/index.html"');page.wait_for_timeout(80)
  faq=page.locator('.faq-list details').first
  faq.locator('summary').click();assert faq.get_attribute('open') is not None
  report['interactions']['native_faq_expansion']='pass'
  print('Contact and FAQ checked',flush=True)
  # Responsive and per-section screenshots from actual HTML, not a mockup image.
  page.set_viewport_size({'width':1440,'height':1000})
  for f,name in [('index.html','homepage-desktop.png'),('products/biomaterial-innovation.html','research-desktop.png'),('products/endoscopy.html','endoscopy-desktop.png'),('about.html','about-desktop.png'),('products/index.html','portfolio-desktop.png'),('contact.html','contact-desktop.png'),('style-guide.html','style-guide-desktop.png')]:
   print('Screenshot',name,flush=True)
   page.evaluate('(f)=>{location.hash="/"+f}',f);page.wait_for_timeout(90)
   page.screenshot(path=str(PREVIEWS/name),full_page=True)
   if f=='index.html':page.screenshot(path=str(PREVIEWS/'homepage-first-fold.png'),full_page=False)
   if f=='style-guide.html':
    page.locator('#brand-icons').screenshot(path=str(PREVIEWS/'icon-library.png'))
    page.locator('.icon-size-check').screenshot(path=str(PREVIEWS/'icons-size-check.png'))
    page.locator('.icon-dark-demo').screenshot(path=str(PREVIEWS/'icons-dark-surface.png'))
  page.set_viewport_size({'width':390,'height':844})
  for f,name in [('index.html','homepage-mobile.png'),('products/biomaterial-innovation.html','research-mobile.png'),('products/endoscopy.html','endoscopy-mobile.png')]:
   print('Screenshot',name,flush=True)
   page.evaluate('(f)=>{location.hash="/"+f}',f);page.wait_for_timeout(90)
   page.screenshot(path=str(PREVIEWS/name),full_page=True)
  report['runtime_errors']=errors
  if errors:report['issues'].append({'runtime_errors':errors})
  browser.close()
 report['layout_count']=len(report['layouts'])
 report['result']='PASS' if not report['issues'] else 'NEEDS FIXES'
 (ROOT/'docs/qa-results.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:report[k] for k in ['result','layout_count','interactions','issues']},indent=2))
 return 0 if not report['issues'] else 1

if __name__=='__main__':raise SystemExit(main())
