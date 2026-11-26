# 修正 Z-Anatomy 源数据中的已知命名错误
import json
p='app/data/index.json'; idx=json.load(open(p))
SWAP={"Ascending part of trapezius muscle":"Descending part of trapezius muscle","Descending part of trapezius muscle":"Ascending part of trapezius muscle"}
n=0
for k in idx:
    for name,v in idx[k].items():
        if v[0] in SWAP and not v[-1:]==["fixed"]:
            v[0]=SWAP[v[0]]; n+=1
json.dump(idx,open(p,'w'),ensure_ascii=False,separators=(',',':'))
print("swapped",n)
