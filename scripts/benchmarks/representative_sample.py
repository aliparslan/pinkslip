"""Build a reproducible, deduplicated offline sample of public job text.

Snapshots and raw descriptions stay outside Git. Sampling is stratified for
coverage; its metrics must not be presented as population-weighted accuracy.
"""
import argparse, collections, hashlib, html, json, re
from pathlib import Path

def clean(value):
    value = html.unescape(value or "")
    value = re.sub(r'</?(?:p|div|li|h[1-6]|ul|ol)\b[^>]*>|<br\s*/?>', '\n', value, flags=re.I)
    return re.sub('<[^>]*>', ' ', value).strip()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root', type=Path, required=True);parser.add_argument('--corpus', type=Path, required=True);parser.add_argument('--previous', type=Path, required=True)
    args=parser.parse_args();root=args.root;root.mkdir(mode=0o700,exist_ok=True)
    previous=json.loads((args.previous/'dataset.json').read_text());known={j['url'] for j in previous if j.get('url')};pool={}
    for line in args.corpus.open():
        j=json.loads(line)
        if not j.get('description') or not j.get('url') or j['url'] in known:continue
        j={k:j.get(k) for k in ['externalId','title','url','location','department','description','salary','company_id','company_name','source_type']}
        j['id']=str(j['company_id'])+':'+str(j['externalId']);j['description_text']=clean(j['description']);j['kind']='real';pool[j['url']]=j
    chosen={};companies=collections.Counter();seed='pinkslip-representative-v2-five-years';ordered=sorted(pool.values(),key=lambda j:hashlib.sha256((seed+j['id']).encode()).hexdigest())
    def add(j,stratum):
        if j['url'] in chosen:return False
        chosen[j['url']]={**j,'kind':'real','sampling_stratum':stratum,'description_text':j.get('description_text') or clean(j.get('description'))};companies[j.get('company_id')]+=1;return True
    for name in ['reports','reviews']:
        snapshot=json.loads((root/(name+'.json')).read_text());snapshot=sorted(snapshot,key=lambda j:hashlib.sha256((seed+j['job_id']).encode()).hexdigest());n=0
        for j in snapshot:
            if not j.get('description'):continue
            n+=add({**j,'id':j['job_id']},'live_'+name)
            if n>= (12 if name=='reports' else 16):break
    foreign=re.compile(r'Canada|Toronto|Vancouver|London|United Kingdom|\bUK\b|Germany|Berlin|France|Paris|India|Bangalore|Bengaluru|Singapore|Australia|Sydney|Japan|Tokyo|Brazil|Mexico|Poland|Warsaw|Netherlands|Ireland|Dublin|Vietnam|Spain|Madrid|Sweden|Stockholm',re.I)
    strata=[('foreign',14,lambda j:bool(foreign.search(j['location'] or ''))),('remote',10,lambda j:bool(re.search('remote|global|worldwide|unspecified',j['location'] or '',re.I))),('doctoral',12,lambda j:bool(re.search(r'ph\.?\s*d|doctoral|doctorate',j['description_text'][:10000],re.I))),('intern_grad',10,lambda j:bool(re.search(r'intern|graduate|entry.level|junior',j['title'],re.I))),('senior',10,lambda j:bool(re.search(r'senior|staff|principal|manager',j['title'],re.I))),('family_control',14,lambda j:bool(re.search(r'hardware|clinical|sales|product manager|UX|support|recruit',j['title'],re.I))),('random_control',10,lambda j:True)]
    for name,count,predicate in strata:
        n=0
        for j in ordered:
            if companies[j['company_id']]>=2 or not predicate(j):continue
            n+=add(j,'heldout_'+name)
            if n>=count:break
        if n<count:raise ValueError((name,n,count))
    # Reuse independently annotated reference records, preserving provenance.
    labels=json.loads((args.previous/'real-labels.json').read_text());byid={j['id']:j for j in previous}
    for label in labels:add(byid[label['id']],'previous_provisional_reference')
    # Hydrated public texts cover adapters absent from the full-description corpus.
    n=0
    for j in previous:
        if j.get('kind')!='real' or j.get('source_type') not in ['apple','workday','rippling','eightfold','bloomberg']:continue
        if companies[j.get('company_id')]>=4:continue
        n+=add(j,'adapter_reference')
        if n>=16:break
    rows=list(chosen.values());(root/'real-sample.json').write_text(json.dumps(rows,indent=2));(root/'previous-labels.json').write_text(json.dumps(labels,indent=2))
    summary={'seed':seed,'heldout_pool':len(pool),'real_cases':len(rows),'companies':len({j['company_id'] for j in rows}),'sources':dict(collections.Counter(j['source_type'] for j in rows)),'strata':dict(collections.Counter(j['sampling_stratum'] for j in rows)),'sampling_note':'Deliberately stratified; no population-wide error estimate.'};(root/'sampling.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if __name__=='__main__':main()
