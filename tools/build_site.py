#!/usr/bin/env python3
"""Build all TORSH pages from content/site-content.json and the icon manifest.

Standard library only. Run: python tools/build_site.py
The generated HTML is static, editable and deployable without a framework.
Use the content file for changes that should survive a subsequent rebuild.
"""
from __future__ import annotations
import html
import json
import posixpath
import sys
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
C = json.loads((ROOT / 'content/site-content.json').read_text(encoding='utf-8'))
ENTRIES = json.loads((ROOT / 'assets/icons/manifest.json').read_text(encoding='utf-8'))
ICONS = {x['id']: x for x in ENTRIES}
SEGMENTS = {x['slug']: x for x in C['segments']}
FAMILIES = {x['slug']: x for x in C['families']}
SOLUTIONS = {x['slug']: x for x in C['solutions']}
ARTICLES = {x['slug']: x for x in C['insights']['articles']}
BUILT: dict[str, tuple[str, str]] = {}


def e(value: str) -> str:
    return html.escape(str(value), quote=True)


def lines(value: str) -> str:
    return e(value).replace('\n', '<br>')


def rel(destination: str, page: str) -> str:
    return posixpath.relpath(destination, posixpath.dirname(page) or '.')


def internal_path(destination: str) -> str:
    """Translate the brief's extensionless routes to static HTML paths."""
    base, marker, query = destination.partition('?')
    route = base.strip('/')
    if not route:
        target = 'index.html'
    elif route == 'products':
        target = 'products/index.html'
    elif route == 'insights':
        target = 'insights/index.html'
    elif route == 'contact':
        target = 'contact.html'
    elif route == 'about':
        target = 'about.html'
    else:
        target = route + '.html'
    return target + (('?' + query) if marker else '')


def icon(name: str, css: str = '') -> str:
    item = ICONS[name]
    utility = ' torsh-icon--utility' if item['category'] == 'utility' else ''
    return (f'<svg class="torsh-icon{utility} {e(css)}" data-torsh-icon="{e(name)}" '
            f'viewBox="{item["viewBox"]}" fill="none" stroke="currentColor" stroke-width="{item["strokeWidth"]}" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
            + item['paths'] + '</svg>')


def textlink(text: str, destination: str, page: str, arrow: str = 'arrow-right', css: str = '') -> str:
    return f'<a class="text-link {css}" href="{e(rel(destination,page))}">{e(text)}{icon(arrow)}</a>'


def button(text: str, destination: str, page: str, style: str = 'primary') -> str:
    return f'<a class="btn btn--{style}" href="{e(rel(destination,page))}">{e(text)}{icon("arrow-right")}</a>'


def eyebrow(text: str) -> str:
    return f'<span class="eyebrow eyebrow--blue">{e(text)}</span>'


def status(research: bool = False) -> str:
    return f'<span class="status">{icon("research" if research else "product-segments")}{e(C["status"]["research" if research else "portfolio"])}</span>'


def paragraphs(texts: list[str]) -> str:
    return ''.join(f'<p>{e(p)}</p>' for p in texts)


def logo(page: str) -> str:
    return (f'<a class="brand" href="{rel("index.html",page)}" aria-label="TORSH Medical Technologies — home">'
            f'<img src="{rel("assets/images/torsh-wordmark.svg",page)}" width="448" height="91" alt="TORSH">'
            '<span class="brand__descriptor">Medical Technologies</span></a>')


def active_nav(path: str, page: str) -> bool:
    if page == path:
        return True
    if path == 'products/index.html' and (page.startswith('products/') or page.startswith('solutions/')):
        return True
    return path == 'insights/index.html' and page.startswith('insights/')


def header(page: str) -> str:
    nav = []
    for n in C['nav']:
        active = active_nav(n['path'],page)
        current = ' aria-current="page"' if n['path'] == page else (' aria-current="location"' if active else '')
        nav.append(f'<a class="nav-link{" is-active" if active else ""}" href="{rel(n["path"],page)}"{current}>{e(n["label"])}</a>')
    return ('<a class="skip-link" href="#main">Skip to content</a>\n<header class="site-header"><div class="container header-inner">'
            + logo(page) + '<nav class="primary-nav" id="primary-navigation" aria-label="Main navigation">' + ''.join(nav) + '</nav>'
            + '<div class="header-actions"><p class="header-tagline">' + '<br>'.join(e(t) for t in C['company']['header_note']) + '</p>'
            + f'<button class="icon-button search-toggle" type="button" data-search-open aria-label="Search the TORSH website" aria-haspopup="dialog">{icon("search")}</button>'
            + '<button class="icon-button menu-toggle" type="button" data-menu-toggle aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false">'
            + icon('menu','menu-icon') + icon('close','close-icon') + '</button></div></div></header>')


def footer(page: str) -> str:
    nav=''.join(f'<a href="{rel(n["path"],page)}">{e(n["label"])}</a>' for n in C['nav'])
    return ('<footer class="site-footer"><div class="container"><div class="footer-top">' + logo(page)
            + '<nav class="footer-nav" aria-label="Footer navigation">' + nav + '</nav>'
            + f'<a class="footer-contact" href="{rel("contact.html",page)}">{icon("contact")}Contact TORSH{icon("arrow-up-right")}</a></div>'
            + '<div class="footer-vision"><span></span><p>' + e(C['company']['descriptor']) + '</p><span></span></div>'
            + '<div class="footer-bottom"><p>© <span data-year>2026</span> ' + e(C['company']['legal_name']) + '.</p><div>'
            + f'<a href="{rel("privacy.html",page)}">Privacy &amp; website information</a><a class="back-to-top" href="#main">Back to top{icon("arrow-up")}</a></div></div>'
            + '<p class="footer-disclosure">' + e(C['status']['footer']) + '</p></div></footer>')


def search(page: str) -> str:
    items = [
        ('Home','index.html','home',C['home']['lead'],'company urology biomaterials'),
        ('About TORSH','about.html','purpose',C['about']['lead'],'company clinical engineering manufacturing'),
        ('Urology Products','products/index.html','product-segments',C['portfolio']['group_text'],'devices urology consumables RIRS URS PCNL'),
        ('Insights','insights/index.html','research',C['insights']['lead'],'articles blog guides education')]
    for s in C['families']:
        items.append((s['name'],'products/'+s['slug']+'.html',s['icon'],s['hero'],s['eyebrow']+' '+s['overview']))
    for s in C['solutions']:
        items.append((s['h1'],'solutions/'+s['slug']+'.html',s['icon'],s['metaDescription'],'procedure workflow solution'))
    for a in C['insights']['articles']:
        items.append((a['title'],'insights/'+a['slug']+'.html',a['icon'],a['excerpt'],a['category']))
    items += [('Contact & collaboration','contact.html','contact','Clinical input, research expertise and practical partnerships.','email contact OEM ODM distribution manufacturing'),
              ('Privacy & website information','privacy.html','info','Search, contact and website information.','privacy cookies tracking hosting')]
    links=[]
    for title,dest,ico,summary,keywords in items:
        terms=e(' '.join((title,summary,keywords)))
        links.append(f'<li data-search-item data-search-terms="{terms}"><a href="{rel(dest,page)}">{icon(ico)}<span><strong>{e(title)}</strong><small>{e(summary)}</small></span>{icon("arrow-right")}</a></li>')
    return ('<dialog class="site-search" id="site-search" aria-labelledby="search-title"><div class="search-header"><div>'
            + eyebrow('Find a page') + '<h2 id="search-title">Search TORSH</h2></div>'
            + f'<button class="icon-button" type="button" data-search-close aria-label="Close search">{icon("close")}</button></div>'
            + '<label for="site-search-input" class="visually-hidden">Search the website</label><div class="search-input-wrap">'
            + icon('search') + '<input type="search" id="site-search-input" placeholder="Try ureteroscope, access sheath or guidewire" autocomplete="off" spellcheck="false"></div>'
            + '<p class="search-count" data-search-count role="status" aria-live="polite"></p><ul class="search-results">' + ''.join(links) + '</ul>'
            + '<p class="search-empty" data-search-empty hidden>No matching pages. Try “ureteroscope”, “stent” or “contact”.</p>'
            + '<p class="search-hint">Search stays in your browser. Press Esc to close.</p></dialog>')


def breadcrumbs(page: str, title: str, product: bool = False) -> str:
    contents=f'<a href="{rel("index.html",page)}">{icon("home")}Home</a>{icon("chevron-right")}'
    if product:
        contents += f'<a href="{rel("products/index.html",page)}">Our portfolio</a>{icon("chevron-right")}'
    return '<nav class="breadcrumbs" aria-label="Breadcrumb">'+contents+f'<span aria-current="page">{e(title)}</span></nav>'


def intro(page: str, data: dict, ico: str) -> str:
    return ('<div class="container">'+breadcrumbs(page,{'about.html':'About TORSH','products/index.html':'Our portfolio','contact.html':'Contact','privacy.html':'Privacy & website information'}.get(page,'Style guide'))
            + '<section class="page-intro"><div class="intro-grid"><div>' + eyebrow(data['eyebrow'])
            + f'<h1>{lines(data["heading"])}</h1><p class="lead">{e(data["lead"])}</p></div>'
            + f'<div class="intro-emblem" aria-hidden="true">{icon(ico)}</div></div></section></div>')


def render(page: str, title: str, description: str, body: str, internal: bool = False) -> None:
    noindex = '<meta name="robots" content="noindex, nofollow">' if internal or page=='404.html' else ''
    source=(f'<!doctype html>\n<html lang="en" class="no-js">\n<head>\n<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{e(title)}</title><meta name="description" content="{e(description)}">\n<meta name="theme-color" content="#252B35">\n{noindex}'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="TORSH Medical Technologies"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}">\n'
            f'<link rel="icon" href="{rel("assets/images/favicon.svg",page)}" type="image/svg+xml">\n<link rel="stylesheet" href="{rel("assets/css/master.css",page)}">\n'
            f'<script src="{rel("assets/js/site-config.js",page)}" defer></script><script src="{rel("assets/js/main.js",page)}" defer></script>\n</head><body>\n'
            + header(page) + '\n<main id="main" tabindex="-1">\n'+body+'\n</main>\n'+footer(page)+'\n'+search(page)+'\n</body></html>\n')
    target=ROOT/page
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(source,encoding='utf-8')
    BUILT[page]=(title,body)


def card(s: dict, page: str, large: bool = False) -> str:
    research=s.get('research',False)
    badge='Investigational research' if research else 'Planned portfolio'
    return (f'<a class="product-card{" product-card--research" if research else ""}" href="{rel("products/"+s["slug"]+".html",page)}">'
            f'<div class="product-card__head">{icon(s["icon"],"product-card__icon")}<span class="card-number">{s["num"]}</span></div>'
            f'<h3>{e(s["name"])}</h3><p>{e(s["brief"])}</p><div class="product-card__end"><span>{badge}</span>{icon("arrow-right")}</div></a>')


def family_card(s: dict, page: str, large: bool = False) -> str:
    return (f'<a class="product-card family-card" href="{rel("products/"+s["slug"]+".html",page)}">'
            f'<div class="product-card__head">{icon(s["icon"],"product-card__icon")}<span class="card-number">{e(s["num"])}</span></div>'
            f'<p class="card-kicker">{e(s["category"])}</p><h3>{e(s["name"])}</h3><p>{e(s["hero"])}</p>'
            f'<div class="product-card__end"><span>Category overview</span>{icon("arrow-right")}</div></a>')


def article_card(a: dict, page: str, featured: bool = False) -> str:
    return (f'<article class="insight-card{" insight-card--featured" if featured else ""}"><a href="{rel("insights/"+a["slug"]+".html",page)}">'
            f'<div class="insight-card__art" aria-hidden="true">{icon(a["icon"])}<span></span></div>'
            f'<div class="insight-card__body"><p class="card-kicker">{e(a["category"])}</p><h3>{e(a["title"])}</h3>'
            f'<p>{e(a["excerpt"])}</p><div class="insight-card__meta"><span>{e(a["readingTime"])}</span><span>Editorial review</span></div>'
            f'<span class="text-link">Read insight{icon("arrow-right")}</span></div></a></article>')


def home() -> None:
    p='index.html'; d=C['home']; w=d['work']; f=d['focus']; a=d['purpose']; ins=d['insights']; con=d['connect']
    hero = ('<section class="teaser-hero" aria-labelledby="hero-title"><div class="teaser-hero__visual" aria-hidden="true">'
            '<img src="assets/images/hero-endoscopy-concept.webp" alt="" width="560" height="283" fetchpriority="high">'
            '<div class="hero-visual-note"><span></span>'+'<br>'.join(e(x) for x in d['visual_note'])+'</div></div>'
            '<div class="container teaser-hero__inner"><div class="teaser-hero__copy">'+eyebrow(d['eyebrow'])
            +f'<h1 id="hero-title">{e(d["headline"][0])} <span>{e(d["headline"][1])}</span></h1><span class="accent-rule" aria-hidden="true"></span>'
            +f'<p class="hero-lead">{e(d["lead"])}</p><div class="button-row">'+button('Explore Urology Products','products/index.html',p)+button('Connect with TORSH','contact.html',p,'outline')+'</div>'
            +f'<p class="hero-stage">{e(d["stage"])}</p></div><p class="hero-art-disclosure">Illustrative concept · Not a released product</p></div></section>')
    values='<section class="value-strip" aria-label="Our approach"><div class="container value-grid">'+''.join('<div class="value-item">'+icon(x['icon'])+'<div><h2>'+e(x['title'])+'</h2><p>'+e(x['text'])+'</p></div></div>' for x in d['principles'])+'</div></section>'
    focus=('<section class="home-focus dark-surface"><div class="container home-focus__inner"><div>'+eyebrow(f['eyebrow'])+'<h2>'+e(f['heading'])+'</h2></div><p>'+e(f['text'])+'</p></div></section>')
    work=('<section class="home-products" id="our-work"><div class="container"><div class="section-heading"><div>'+eyebrow(w['eyebrow'])+'<h2>'+e(w['heading'])+'</h2></div>'
          +textlink('Explore all families','products/index.html',p)+'</div><p class="section-intro">'+e(w['text'])+'</p><div class="product-grid product-grid--families">'+''.join(family_card(s,p) for s in C['families'])+'</div></div></section>')
    latest=('<section class="home-insights section--soft"><div class="container"><div class="section-heading"><div>'+eyebrow(ins['eyebrow'])+'<h2>'+e(ins['heading'])+'</h2></div>'+textlink('Browse Insights','insights/index.html',p)+'</div><p class="section-intro">'+e(ins['text'])+'</p><div class="insight-grid">'+''.join(article_card(x,p,i==0) for i,x in enumerate(C['insights']['articles'][:3]))+'</div></div></section>')
    purpose=('<section class="purpose-band"><div class="container purpose-band__inner"><div>'+eyebrow(a['eyebrow'])+'<h2>'+lines(a['heading'])+'</h2></div><div class="purpose-band__copy"><p>'+e(a['text'])+'</p>'+textlink(a['link'],'about.html',p)+'</div><div class="purpose-principles">'
             +''.join('<div>'+icon(x['icon'])+'<span>'+e(x['label'])+'</span></div>' for x in a['principles'])+'</div></div></section>')
    connect='<section class="collaboration-band"><div class="container collaboration-band__inner"><div><h2>'+e(con['heading'])+'</h2><p>'+e(con['text'])+'</p></div>'+textlink(con['link'],'contact.html',p)+'</div></section>'
    render(p,d['title'],d['meta'],hero+values+focus+work+latest+purpose+connect)


def about() -> None:
    p='about.html'; d=C['about']; a=d['intro']; b=d['approach']; m=d['model']; st=d['stage']
    body=intro(p,d,'clinician')
    body+='<section class="section section--soft"><div class="container statement-grid"><div>'+eyebrow(a['eyebrow'])+'<h2>'+lines(a['heading'])+'</h2></div><div class="editorial-copy">'+paragraphs(a['paragraphs'])+'</div></div></section>'
    body+='<section class="section"><div class="container">'+eyebrow(b['eyebrow'])+'<h2>'+lines(b['heading'])+'</h2><div class="approach-grid">'+''.join('<article class="approach-card">'+icon(s['icon'])+'<span class="step-number">0'+str(i+1)+'</span><h3>'+e(s['title'])+'</h3><p>'+e(s['text'])+'</p></article>' for i,s in enumerate(b['steps']))+'</div></div></section>'
    body+='<section class="section section--soft"><div class="container statement-grid"><div>'+eyebrow(m['eyebrow'])+'<h2>'+lines(m['heading'])+'</h2></div><div class="editorial-copy">'+paragraphs(m['paragraphs'])+textlink('Explore our portfolio','products/index.html',p)+'</div></div></section>'
    body+='<section class="section"><div class="container stage-panel">'+icon('purpose')+'<div><h2>'+e(st['heading'])+'</h2><p>'+e(st['text'])+'</p>'+textlink('Explore our focus areas','products/index.html',p)+'</div></div></section>'
    render(p,d['title'],d['meta'],body)


def portfolio() -> None:
    p='products/index.html'; d=C['portfolio']
    body=intro(p,d,'product-segments')
    body+='<section class="portfolio-section"><div class="container"><div class="section-heading"><div>'+eyebrow('01 / Product families')+'<h2>'+e(d['group_heading'])+'</h2></div></div><p class="section-intro">'+e(d['group_text'])+'</p><div class="product-grid product-grid--large product-grid--catalogue">'+''.join(family_card(s,p,True) for s in C['families'])+'</div></div></section>'
    body+='<section class="section section--soft"><div class="container"><div class="section-heading"><div>'+eyebrow('02 / Procedure-led view')+'<h2>Explore the workflow around the device.</h2></div></div><p class="section-intro">These educational pages connect product families to the wider procedural setup without claiming that TORSH supplies every device used in a procedure.</p><div class="solution-grid">'+''.join('<a class="solution-card" href="'+rel('solutions/'+s['slug']+'.html',p)+'">'+icon(s['icon'])+'<span class="card-number">0'+str(i+1)+'</span><h3>'+e(s['h1'])+'</h3><p>'+e(s['metaDescription'])+'</p>'+icon('arrow-right')+'</a>' for i,s in enumerate(C['solutions']))+'</div></div></section>'
    body+='<section class="section"><div class="container faq-layout"><h2>'+e(d['faq_heading'])+'</h2><div class="faq-list">'+''.join('<details><summary>'+e(f['question'])+'</summary><p>'+e(f['answer'])+'</p></details>' for f in d['faqs'])+'</div></div></section>'
    render(p,d['title'],d['meta'],body)


def family(f: dict) -> None:
    p='products/'+f['slug']+'.html'
    body=('<div class="container">'+breadcrumbs(p,f['name'],True)+'<section class="segment-hero family-hero"><div class="segment-copy">'
          +eyebrow(f['eyebrow'])+'<h1>'+e(f['name'])+'</h1><p class="segment-subtitle">'+e(f['hero'])+'</p><p class="lead">'+e(f['overview'])+'</p>'+status(False)+'</div>'
          +'<div class="segment-visual" aria-hidden="true"><div class="segment-orbit"></div>'+icon(f['icon'])+'<div class="segment-visual__label"><span>'+e(f['category'])+'</span><span>TORSH / '+e(f['num'])+'</span></div></div></section></div>')
    body+='<section class="section section--soft"><div class="container statement-grid"><div>'+eyebrow('Why the details matter')+'<h2>Evaluate the device as part of the system.</h2></div><div class="editorial-copy"><p>'+e(f['why'])+'</p><h3>Typical clinical context</h3><p>'+e(f['intendedContext'])+'</p></div></div></section>'
    body+='<section class="section"><div class="container specification-layout"><div>'+eyebrow('Selection questions')+'<h2>What to confirm before a procurement decision.</h2><p class="section-intro">Request model-specific answers and supporting documentation for each point.</p></div><ol class="specification-list">'+''.join('<li><span>0'+str(i+1)+'</span><p>'+e(x)+'</p></li>' for i,x in enumerate(f['selectionChecks']))+'</ol></div></section>'
    body+='<section class="section section--soft"><div class="container faq-layout"><div><h2>Frequently asked questions</h2><p class="section-intro">Category guidance—not a substitute for the selected model’s instructions for use.</p></div><div class="faq-list">'+''.join('<details><summary>'+e(x['question'])+'</summary><p>'+e(x['answer'])+'</p></details>' for x in f['faqs'])+'</div></div></section>'
    body+='<section class="family-cta"><div class="container family-cta__inner"><div>'+eyebrow('Professional enquiry')+'<h2>'+e(f['cta']['label'])+'</h2><p>Share the intended procedure, required configuration and questions your team needs to resolve.</p></div>'+button('Discuss your requirements',internal_path(f['cta']['path']),p)+'</div></section>'
    body+='<section class="section related-section"><div class="container"><div class="section-heading"><h2>Related content</h2>'+textlink('Browse Insights','insights/index.html',p)+'</div><p class="section-intro">'+e(f['relatedText'])+'</p></div></section>'
    render(p,f['seoTitle'],f['metaDescription'],body)


def solution(s: dict) -> None:
    p='solutions/'+s['slug']+'.html'
    body=('<div class="container">'+breadcrumbs(p,s['h1'])+'<section class="page-intro solution-intro"><div class="intro-grid"><div>'+eyebrow('Procedure-led perspective')+'<h1>'+e(s['h1'])+'</h1><p class="lead">'+e(s['metaDescription'])+'</p></div><div class="intro-emblem" aria-hidden="true">'+icon(s['icon'])+'</div></div></section></div>')
    body+='<section class="reading-section"><div class="container reading-width">'+''.join('<p class="article-lead">'+e(x)+'</p>' for x in s['body'])+'<section><h2>Relevant product families</h2><p>'+e(s['relatedText'])+'</p></section><div class="notice">'+icon('info')+'<p>Educational workflow overview only. It does not claim that TORSH supplies every device used in the procedure and does not provide treatment instructions.</p></div>'+button(s['cta']['label'],internal_path(s['cta']['path']),p)+'</div></section>'
    render(p,s['seoTitle'],s['metaDescription'],body)


def insights() -> None:
    p='insights/index.html'; d=C['insights']
    body=('<div class="container">'+breadcrumbs(p,'Insights')+'<section class="page-intro insight-intro"><div class="intro-grid"><div>'+eyebrow(d['eyebrow'])+'<h1>'+e(d['heading'])+'</h1><p class="lead">'+e(d['lead'])+'</p></div><div class="intro-emblem" aria-hidden="true">'+icon('research')+'</div></div></section></div>')
    cats=[]
    for a in d['articles']:
        if a['category'] not in cats: cats.append(a['category'])
    body+='<section class="insights-library"><div class="container"><div class="insight-filters" aria-label="Insight categories"><button type="button" class="is-active" data-insight-filter="all">All insights</button>'+''.join('<button type="button" data-insight-filter="'+e(x)+'">'+e(x)+'</button>' for x in cats)+'</div><div class="insight-grid insight-grid--library">'+''.join('<div data-insight-card data-category="'+e(a['category'])+'">'+article_card(a,p,i==0)+'</div>' for i,a in enumerate(d['articles']))+'</div><div class="notice">'+icon('info')+'<p>'+e(d['disclaimer'])+'</p></div></div></section>'
    render(p,d['title'],d['meta'],body)


def article(a: dict) -> None:
    p='insights/'+a['slug']+'.html'
    body=('<div class="container">'+breadcrumbs(p,a['title'])+'<header class="article-hero"><div>'+eyebrow(a['category'])+'<h1>'+e(a['title'])+'</h1><p class="lead">'+e(a['excerpt'])+'</p><div class="article-meta"><span>'+e(a['readingTime'])+'</span><span>Editorial review required</span></div></div><div class="article-hero__art" aria-hidden="true">'+icon(a['icon'])+'<span></span></div></header></div>')
    body+='<article class="reading-section article-page"><div class="container reading-width"><p class="article-disclaimer">Educational content only. This article is not medical advice or an instruction for clinical use.</p>'+''.join('<section><h2>'+e(s['heading'])+'</h2>'+paragraphs(s['paragraphs'])+'</section>' for s in a['sections'])+'<section class="article-reference"><h2>Editorial reference</h2><p>'+e(a['editorialReferences'])+'</p><p><a href="https://uroweb.org/guidelines/urolithiasis/chapter/guidelines" target="_blank" rel="noopener">EAU Guidelines on Urolithiasis '+icon('arrow-up-right')+'</a></p></section><div class="article-next">'+button(a['cta']['label'],internal_path(a['cta']['path']),p)+textlink('All Insights','insights/index.html',p,'arrow-left')+'</div></div></article>'
    render(p,a['seoTitle'],a['metaDescription'],body)


def segment_hero(s: dict, p: str) -> str:
    research=s.get('research',False)
    return ('<div class="container">'+breadcrumbs(p,s['name'],True)+'<section class="segment-hero"><div class="segment-copy">'
            +eyebrow('Investigational programme' if research else 'Planned portfolio / '+s['num'])
            +'<h1>'+e(s['name'])+'</h1><p class="segment-subtitle">'+e(s['subtitle'])+'</p><p class="lead">'+e(s['lead'])+'</p>'+status(research)+'</div>'
            +'<div class="segment-visual'+(' segment-visual--research' if research else '')+'" aria-hidden="true"><div class="segment-orbit"></div>'+icon(s['icon'])
            +'<div class="segment-visual__label"><span>'+e(s['name'])+'</span><span>TORSH / '+('R&amp;D' if research else s['num'])+'</span></div></div></section></div>')


def related(s: dict, p: str) -> str:
    links=[]
    for slug in s['related']:
        x=SEGMENTS[slug]
        links.append('<a class="related-link" href="'+rel('products/'+slug+'.html',p)+'">'+icon(x['icon'])+'<span><small>'+('Investigational research' if x.get('research') else 'Planned portfolio')+'</small><strong>'+e(x['name'])+'</strong></span>'+icon('arrow-right')+'</a>')
    return '<section class="section related-section"><div class="container"><div class="section-heading"><h2>Related areas of work</h2>'+textlink('All areas','products/index.html',p)+'</div><div class="related-grid">'+''.join(links)+'</div></div></section>'


def product(s: dict) -> None:
    p='products/'+s['slug']+'.html'
    body=segment_hero(s,p)
    body+='<section class="segment-section"><div class="container segment-detail"><div>'+eyebrow('The intended scope')+'<h2>'+e(s['scope_heading'])+'</h2><div class="scope-entries">'+''.join('<article class="scope-entry"><span class="scope-number">0'+str(i+1)+'</span><div><h3>'+e(x['title'])+'</h3><p>'+e(x['text'])+'</p></div></article>' for i,x in enumerate(s['scope']))+'</div></div>'
    body+='<aside class="release-panel">'+icon('catalogue','panel-icon')+'<h2>In future product listings</h2><p class="release-intro">The information we intend to make clear for each model.</p><ul class="detail-list">'+''.join('<li>'+e(x)+'</li>' for x in s['details'])+'</ul></aside></div></section>'
    body+='<section class="section"><div class="container">'+eyebrow('Our product focus')+'<h2>'+e(s['focus_heading'])+'</h2><p class="section-intro">'+e(s['focus_intro'])+'</p><div class="focus-grid">'+''.join('<article><span class="step-number">0'+str(i+1)+'</span><h3>'+e(x['title'])+'</h3><p>'+e(x['text'])+'</p></article>' for i,x in enumerate(s['considerations']))+'</div>'
    body+='<div class="notice">'+icon('info')+'<p>'+e(C['status']['portfolio_notice'])+'</p></div></div></section>'+related(s,p)
    render(p,s['name']+' | Planned endourology portfolio | TORSH',s['meta'],body)


def research() -> None:
    s=SEGMENTS['biomaterial-innovation']; p='products/biomaterial-innovation.html'; q=s['question']
    body=segment_hero(s,p)
    body+='<section class="section section--soft"><div class="container statement-grid"><div>'+eyebrow(q['eyebrow'])+'<h2>'+lines(q['heading'])+'</h2></div><div class="editorial-copy">'+paragraphs(q['paragraphs'])+'</div></div></section>'
    body+='<section class="section"><div class="container">'+eyebrow('Intended mechanism')+'<h2>'+e(s['workflow_heading'])+'</h2><p class="section-intro">'+e(s['workflow_intro'])+'</p><ol class="workflow-grid">'+''.join('<li>'+icon(x['icon'])+'<span class="step-number">0'+str(i+1)+'</span><h3>'+e(x['title'])+'</h3><p>'+e(x['text'])+'</p></li>' for i,x in enumerate(s['workflow']))+'</ol></div></section>'
    body+='<section class="section section--soft"><div class="container">'+eyebrow('Development priorities')+'<h2>'+e(s['questions_heading'])+'</h2><p class="section-intro">'+e(s['questions_intro'])+'</p><div class="question-grid">'+''.join('<article>'+icon(x['icon'])+'<div><h3>'+e(x['title'])+'</h3><p>'+e(x['text'])+'</p></div></article>' for x in s['questions'])+'</div></div></section>'
    body+='<section class="section"><div class="container"><div class="stage-panel">'+icon('evidence')+'<div><h2>'+e(s['stage_heading'])+'</h2><p>'+e(s['stage_text'])+'</p></div></div>'
    body+='<div class="research-collaboration"><h2>'+e(s['collaboration_heading'])+'</h2><p>'+e(s['collaboration_text'])+'</p>'+textlink('Research collaboration enquiries','contact.html',p)+'</div></div></section>'+related(s,p)
    render(p,'Biomaterial research | Hydrogel-assisted stone-fragment retrieval | TORSH',s['meta'],body)


def contact() -> None:
    p='contact.html'; d=C['contact']; pending=d['pending']; ready=d['ready']
    body=intro(p,d,'contact')
    body+='<section class="contact-section"><div class="container contact-grid"><div><h2>'+e(d['topics_heading'])+'</h2><div class="contact-topics">'+''.join('<article>'+icon(t['icon'])+'<div><h3>'+e(t['title'])+'</h3><p>'+e(t['text'])+'</p></div></article>' for t in d['topics'])+'</div></div>'
    body+='<aside class="contact-panel">'+icon('contact','panel-icon')+'<div data-contact-pending>'+eyebrow(pending['eyebrow'])+'<h2>'+lines(pending['heading'])+'</h2><p>'+e(pending['text'])+'</p></div>'
    body+='<div data-contact-ready hidden>'+eyebrow(ready['eyebrow'])+'<h2>'+e(ready['heading'])+'</h2><p>'+e(ready['text'])+'</p><a class="contact-email" data-contact-email></a><a class="btn btn--primary" data-contact-link>'+e(ready['button'])+icon('arrow-up-right')+'</a><p class="contact-note">This opens your email application. The website does not send or store your message.</p></div>'
    body+='<div class="contact-prepare"><h3>'+e(d['prepare']['heading'])+'</h3><p>'+e(d['prepare']['text'])+'</p></div><p class="contact-safety">'+e(d['safety'])+'</p></aside></div></section>'
    render(p,d['title'],d['meta'],body)


def privacy() -> None:
    p='privacy.html'; d=C['privacy']
    body=intro(p,d,'info')+'<section class="reading-section"><div class="container reading-width">'+''.join('<section><h2>'+e(x['heading'])+'</h2>'+paragraphs(x['paragraphs'])+'</section>' for x in d['sections'])+textlink('Return to TORSH','index.html',p)+'</div></section>'
    render(p,d['title'],d['meta'],body)


def styleguide() -> None:
    p='style-guide.html'
    body='<div class="container"><section class="page-intro">'+eyebrow('Internal reference · v'+C['version'])+'<h1>One identity. One content source.</h1><p class="lead">The shared palette, typography, editorial rules and icon geometry for TORSH. This page is not linked in public navigation.</p></section></div>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('01 / Identity')+'<h2>Graphite + Electric Blue</h2><div class="swatch-grid">'+''.join('<div class="swatch"><span class="swatch-color swatch-color--'+k+'"></span><strong>'+label+'</strong><code>'+val+'</code></div>' for k,label,val in [('graphite','Graphite','#252B35'),('electric','Electric Blue','#0077CC'),('steel','Steel','#8B98A5'),('ice','Ice','#EDF2F6'),('white','White','#FFFFFF')])+'</div><p class="guide-note">Steel is a secondary graphic colour, not a body-text colour. Graphite and muted text use stronger contrast. Light-blue accents are used on dark backgrounds.</p></div></section>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('02 / Editorial system')+'<h2>Specific work. Clearly stated status.</h2><div class="focus-grid">'
    for title,text in [('Positioning','TORSH is a clinician-led company building a focused endourology portfolio. Lead with the procedure, the system and specific selection questions—not broad superiority claims.'),('Product status','Seven category pages explain device families. They do not assert current inventory, manufacturing role, approval status or model-level availability.'),('Evidence and naming','Use one consistent term for each category. Publish specifications, approvals, dates and performance claims only when they are verified for the exact model or article.')]:
        body+='<article><h3>'+e(title)+'</h3><p>'+e(text)+'</p></article>'
    body+='</div><div class="guide-note">Content: <code>content/site-content.json</code>. Rebuild every page and search entry with <code>python tools/build_site.py</code>. Typography, colour and sizing: <code>assets/css/master.css</code>.</div></div></section>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('03 / Brand icon system')+f'<h2>{sum(x["category"]=="brand" for x in ENTRIES)} coordinated brand icons</h2><p class="section-intro">A shared 64-unit grid, rounded strokes and restrained blue accents. Device icons are simplified category illustrations, not technical drawings.</p><div class="icon-library" id="brand-icons">'
    for x in ENTRIES:
        if x['category']!='brand': continue
        body+='<div class="icon-tile">'+icon(x['id'])+'<strong>'+e(x['label'])+'</strong><code>'+x['id']+'</code></div>'
    body+='</div><p class="guide-note">The quality-review, distribution and progress assets must not be used to imply certification, existing global operations or measured clinical outcomes. Decorative icons have hidden accessibility semantics when the adjacent text already supplies the meaning.</p>'
    body+='<h3 class="guide-subheading">Small-size check · 24 / 32 / 48 / 64 px</h3><div class="icon-size-check">'
    for k in ['endoscopy','access-and-suction','stone-retrieval','guidewires','ureteral-stents','biomaterial-innovation','evidence']:
        body+='<div><strong>'+e(ICONS[k]['label'])+'</strong><span>'+''.join('<span class="size-'+str(size)+'">'+icon(k)+'</span>' for size in [24,32,48,64])+'</span></div>'
    body+='</div><h3 class="guide-subheading">Dark-surface check</h3><div class="icon-dark-demo dark-surface">'+''.join(icon(k) for k in ['biomaterial-innovation','delivery','gel-capture','stone-retrieval','evidence','distribution'])+'</div></div></section>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('04 / Interface controls')+'<h2>10 interface icons</h2><div class="icon-library icon-library--utility">'+''.join('<div class="icon-tile icon-tile--small">'+icon(x['id'])+'<strong>'+e(x['label'])+'</strong><code>'+x['id']+'</code></div>' for x in ENTRIES if x['category']=='utility')+'</div></div></section>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('05 / Components')+'<h2>Actions and status</h2><div class="component-demo"><div class="button-row">'+button('Explore Urology Products','products/index.html',p)+button('Browse Insights','insights/index.html',p,'outline')+'</div>'+status()+'<div class="notice">'+icon('info')+'<p>'+e(C['status']['portfolio_notice'])+'</p></div></div><p class="guide-note">The preserved TORSH wordmark is outlined SVG; interface text uses a local system sans-serif stack. All palette, typography, spacing and component styling remains centralized in <code>assets/css/master.css</code>.</p></div></section>'
    body+='<section class="guide-section"><div class="container">'+eyebrow('06 / Supplied brand references')+'<h2>Original iteration boards</h2><p class="section-intro">These boards informed the selected Graphite + Electric Blue direction and typographic tone. They are internal design references, not public product imagery.</p><div class="brand-reference-grid"><figure><img src="assets/images/brand-colour-palettes.jpg" alt="TORSH colour palette iteration board"><figcaption>Colour palette exploration</figcaption></figure><figure><img src="assets/images/brand-fonts.jpg" alt="TORSH wordmark font exploration"><figcaption>Wordmark typography exploration</figcaption></figure><figure><img src="assets/images/brand-wordmark-iterations.jpg" alt="TORSH wordmark and colour iterations"><figcaption>Wordmark iteration system</figcaption></figure></div></div></section>'
    render(p,'TORSH | Master style & content guide','Internal TORSH style, content and icon reference.',body,True)


def not_found() -> None:
    p='404.html'
    body='<section class="not-found container">'+eyebrow('404 / Page not found')+icon('product-segments','not-found__icon')+'<h1>This page is not here.</h1><p>The link may have changed. Return to the homepage or explore TORSH’s product families and Insights.</p><div class="button-row">'+button('Return home','index.html',p)+button('Explore Urology Products','products/index.html',p,'outline')+'</div></section>'
    render(p,'Page not found | TORSH Medical Technologies','Return to TORSH Medical Technologies.',body,True)


class CopyText(HTMLParser):
    """Export visible-default copy; honour hidden regions and HTML void tags."""
    VOID = {'img','br','hr','input','meta','link','source','wbr','area','base','embed','param','track','col'}
    def __init__(self):
        super().__init__(); self.lines=[]; self.hidden=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        hide=bool(self.hidden and self.hidden[-1]) or tag=='svg' or 'hidden' in a or a.get('aria-hidden')=='true'
        if tag not in self.VOID: self.hidden.append(hide)
        if hide:return
        if tag=='br': self.lines.append(' ')
        elif tag in {'h1','h2','h3','p','li','summary'}: self.lines.append('\n')
        if tag in {'h1','h2','h3'}: self.lines.append('#'*int(tag[1])+' ')
    def handle_endtag(self,tag):
        hide=self.hidden.pop() if self.hidden and tag not in self.VOID else False
        if not hide and tag in {'h1','h2','h3','p','li','summary','section','article'}:self.lines.append('\n\n')
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.VOID:self.handle_endtag(tag)
    def handle_data(self,data):
        if not any(self.hidden) and data.strip():self.lines.append(data.strip()+' ')


def export_docs() -> None:
    out=['# TORSH — Website copy v'+C['version'],'\nEditable source: `content/site-content.json`. Product status and search summaries are built from the same source.\n']
    for page,(title,body) in BUILT.items():
        if page in {'404.html','style-guide.html'}: continue
        parser=CopyText(); parser.feed(body)
        text=''.join(parser.lines)
        import re
        text=re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+','\n\n',text)
        out+=['\n---\n',f'# {page}\n',text.strip()+'\n']
    (ROOT/'docs/WEBSITE-COPY.md').write_text('\n'.join(out),encoding='utf-8')
    (ROOT/'docs/product-segments.json').write_text(json.dumps(C['segments'],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'docs/CONTENT-MAP.md').write_text('# Content map\n\nAll public copy is maintained in `content/site-content.json`; generated pages are listed below.\n\n'+'\n'.join(f'- `{page}` — {title}' for page,(title,_) in BUILT.items())+'\n',encoding='utf-8')


def main() -> int:
    try:
        if len(ICONS)!=len(ENTRIES): raise ValueError('Duplicate icon IDs.')
        if len(FAMILIES)!=7: raise ValueError('Exactly seven product families are expected.')
        if len(SOLUTIONS)!=3: raise ValueError('Exactly three solution pages are expected.')
        if len(ARTICLES)!=6: raise ValueError('Exactly six insight articles are expected.')
        home(); about(); portfolio()
        for f in C['families']: family(f)
        for s in C['solutions']: solution(s)
        insights()
        for a in C['insights']['articles']: article(a)
        contact(); privacy(); not_found(); styleguide(); export_docs()
        print(f'Built {len(BUILT)} pages from one content file; {len(ICONS)} shared SVG definitions.')
        return 0
    except (OSError,ValueError,KeyError,TypeError) as error:
        print(f'Build failed: {error}',file=sys.stderr); return 1

if __name__=='__main__':
    raise SystemExit(main())
