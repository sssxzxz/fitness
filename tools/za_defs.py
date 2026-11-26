import bpy, sys, json, glob, os, csv, re
bpy.ops.wm.open_mainfile(filepath=sys.argv[-3])
raw, out = sys.argv[-2], sys.argv[-1]
bases=set()
for f in glob.glob(raw+"/*.json"):
    d=json.load(open(f))
    for k,v in d["objects"].items():
        bases.add(v["base"]); bases.update(v["groups"])
lat={}
with open(os.path.join(os.path.dirname(raw),"../dl/za/TA2.csv"),encoding="utf-8") as fh:
    for line in fh:
        p=line.strip().strip('"').split(';')
        if len(p)>2: lat[p[1].lower()]=p[2]
defs={}
for b in bases:
    t=bpy.data.texts.get(b)
    txt=t.as_string().strip() if t else ""
    txt=re.sub(r'\n{3,}','\n\n',txt)[:5000]
    defs[b]={"def":txt,"la":lat.get(b.lower(),"")}
json.dump(defs,open(out,"w"),ensure_ascii=False)
print("DEFS",len(defs),sum(1 for v in defs.values() if v["def"]),sum(1 for v in defs.values() if v["la"]), os.path.getsize(out)//1024)
