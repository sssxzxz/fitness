import bpy, sys, json, os, re
src, outdir, which = sys.argv[-3], sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
os.makedirs(outdir, exist_ok=True)
SYS = {
 "1: Skeletal system":"skeletal","2: Muscular insertions":"insertions","3: Joints":"joints",
 "4: Muscular system":"muscular","5: Cardiovascular system":"cardiovascular",
 "6: Lymphoid organs":"lymphoid","7: Nervous system & Sense organs":"nervous",
 "8: Visceral systems":"visceral"}
TARGET = {"muscular":0.35,"skeletal":0.45,"nervous":0.3,"cardiovascular":0.25,"visceral":0.5,"joints":0.5}
dg = bpy.context.evaluated_depsgraph_get()
def base(n): return re.sub(r'\.(l|r|g|j|t|\d+)$','',n)
def group_path(o):
    p=[]; q=o.parent
    while q: p.append(base(q.name)); q=q.parent
    return p[::-1]
manifest={}
for cname, key in SYS.items():
    if which!="all" and key!=which: continue
    col=bpy.data.collections[cname]
    sc=bpy.data.scenes.new("exp_"+key)
    nodes={}
    tot=0
    for o in col.all_objects:
        if o.type not in('MESH','CURVE') or o.name.endswith('.j'): continue
        try:
            me=bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
        except Exception as e: print("skip",o.name,e); continue
        if len(me.polygons)==0: continue
        me.transform(o.matrix_world)
        me.materials.clear()
        orig=o.name
        o.name=orig+"__src"
        no=bpy.data.objects.new(orig, me)
        if no.name!=orig: print("NAMECLASH",orig,no.name)
        sc.collection.objects.link(no)
        n=len(me.polygons)
        ratio=TARGET.get(key,0.6) if n>600 else 1.0
        if ratio<1:
            m=no.modifiers.new("d",'DECIMATE'); m.ratio=ratio
        nodes[no.name]={"base":base(orig),"side":(orig[-1] if re.search(r'\.(l|r)$',orig) else ""),
            "groups":group_path(o),"hidden":bool(o.hide_get() or o.hide_viewport)}
        tot+=n
    bpy.context.window.scene=sc
    fp=os.path.join(outdir,key+".glb")
    bpy.ops.export_scene.gltf(filepath=fp, export_format='GLB', use_active_scene=True,
        export_apply=True, export_normals=True, export_texcoords=False, export_materials='NONE',
        export_yup=True)
    manifest[key]={"objects":nodes,"srcPolys":tot}
    print("EXPORTED",key,len(nodes),tot,os.path.getsize(fp)//1024,"KB")
    json.dump(manifest[key],open(os.path.join(outdir,key+".json"),"w"),ensure_ascii=False)
