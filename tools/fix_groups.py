# 清理分组名中的导出残留（__src、.l/.r）
import json, re
p='app/data/index.json'; idx=json.load(open(p))
def clean(g): return re.sub(r'\.(l|r|g|j|t)$','', re.sub(r'__src$','',g))
n=0
for k in idx:
    for name,v in idx[k].items():
        ng=[clean(g) for g in v[2]]
        if ng!=v[2]: v[2]=ng; n+=1
json.dump(idx,open(p,'w'),ensure_ascii=False,separators=(',',':'))
print('cleaned',n)
