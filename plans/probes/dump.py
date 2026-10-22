import re,html,sys,os
base=sys.argv[1]
def clean(s): return re.sub(r'\s+',' ',s)
for f in sys.argv[2:]:
    p=os.path.join(base,'pages',f)
    if not os.path.exists(p): print("MISSING",f); continue
    s=open(p,encoding='utf-8',errors='ignore').read()
    t=re.search(r'<title>([^<]*)',s)
    print(f"\n===== {f}  title={t.group(1).strip()[:30] if t else ''} len={len(s)}")
    # find the list container: first element whose class contains list/news and that contains a date
    dates=[m.start() for m in re.finditer(r'\d{4}-\d{2}-\d{2}|\d{4}\.\d{2}\.\d{2}|\d{4}/\d{2}/\d{2}',s)]
    if not dates: print("  no dates"); continue
    i=dates[0]
    # expand to enclosing <li> or <tr> or <div>
    start=max(s.rfind('<li',0,i),s.rfind('<tr',0,i),s.rfind('<dd',0,i))
    end=min([x for x in [s.find('</li>',i),s.find('</tr>',i),s.find('</dd>',i)] if x!=-1] or [i+400])
    print("  ITEM:",clean(s[start:end+5])[:600])
    print("  pages:",re.findall(r'all_pages">(\d+)',s)[:1],"count:",re.findall(r'all_count">(\d+)',s)[:1],"per_page:",re.findall(r'per_count">(\d+)',s)[:1], "next:",re.findall(r'href="([^"]*list\d+\.htm)"',s)[:2])
