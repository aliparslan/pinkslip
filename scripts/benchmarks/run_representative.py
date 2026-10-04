"""Run a bounded, cached offline benchmark; never mutate production job data."""
import argparse, concurrent.futures, hashlib, json, os, time, urllib.request, urllib.error
from pathlib import Path
from representative_contract import questions
RATES={'jev':.042,'clef':.24,'clef-flash':.09}
MODELS={'jev':'typesafe/jev-1.13','clef':'@cf/cloudflare/clef','clef-flash':'@cf/cloudflare/clef-flash'}
ACCOUNT='2ccea50bf7117629e17438c808dfd907'

def main():
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--schema',type=Path);p.add_argument('--provider',choices=list(RATES),required=True);p.add_argument('--dry-run',action='store_true');p.add_argument('--budget',type=float,default=.5);args=p.parse_args()
 if not 0 < args.budget <= 1:raise SystemExit('Budget must be between zero and one dollar per provider.')
 jobs=json.loads((args.root/'dataset.json').read_text());contract=questions(args.schema)
 if not 1<=len(jobs)<=250:raise SystemExit('Offline benchmark is limited to 250 postings per provider.')
 def body(j):return {'model':args.provider if args.provider!='jev' else MODELS['jev'],'state':{'title':j['title'],'location':j.get('location'),'department':j.get('department'),'description':j['description_text']},'questions':contract}
 # Complete text is required. Do not silently truncate a labelled posting.
 if any(len(j['description_text'])>65000 for j in jobs):raise SystemExit('Oversized input requires separate review, not truncation.')
 encoded=[json.dumps(body(j),ensure_ascii=False).encode() for j in jobs];estimate=sum(len(x) for x in encoded)/4*RATES[args.provider]/1e6
 dry={'provider':args.provider,'cases':len(jobs),'questions':len(contract),'estimated_gross_cost_usd':estimate,'max_input_chars':max(len(j['description_text']) for j in jobs),'no_retries':True}
 if args.dry_run:print(json.dumps(dry));return
 if estimate > args.budget/2:raise SystemExit('Estimated cost exceeds half the per-provider budget; reduce sample first.')
 key=os.environ.get('OPENROUTER_API_KEY' if args.provider=='jev' else 'CLOUDFLARE_API_TOKEN')
 if not key:raise SystemExit('Authorized provider credential is missing.')
 cache=args.root/'cache';cache.mkdir(mode=0o700,exist_ok=True)
 def call(pair):
  j,data=pair;hash=hashlib.sha256(args.provider.encode()+data).hexdigest();file=cache/(hash+'.json')
  if file.exists():return {**json.loads(file.read_text()),'cached':True}
  url='https://openrouter.ai/api/v1/systemone' if args.provider=='jev' else f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{MODELS[args.provider]}'
  req=urllib.request.Request(url,data=data,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','User-Agent':'Pinkslip-offline-benchmark'},method='POST');start=time.monotonic()
  row={'id':j['id'],'provider':args.provider,'requested_model':MODELS[args.provider],'cached':False,'input_sha256':hash}
  try:
   with urllib.request.urlopen(req,timeout=45) as r:payload=json.load(r)
   if args.provider!='jev':
    if payload.get('success') is not True:raise ValueError('Unsuccessful provider response')
    result=payload['result']
   else:result=payload
   answers=result.get('answers',{});choices={k:(answers.get(k) or {}).get('choice') for k in contract}
   invalid=[k for k,q in contract.items() if choices[k] not in q['criteria']]
   usage=result.get('usage') or {};input_tokens=usage.get('input_tokens',usage.get('prompt_tokens'));cost=usage.get('cost')
   if cost is None and isinstance(input_tokens,(float,int)):cost=input_tokens*RATES[args.provider]/1e6
   row.update({'choices':choices,'invalid_fields':invalid,'usage':usage,'gross_cost_usd':cost,'cost_basis':'provider_reported' if usage.get('cost') is not None else 'published_input_rate' if cost is not None else 'unknown','resolved_model':result.get('model'),'raw_result':result})
  except urllib.error.HTTPError as e:row['error']='HTTP '+str(e.code)
  except Exception as e:row['error']=type(e).__name__
  row['latency_seconds']=time.monotonic()-start;file.write_text(json.dumps(row,indent=2));file.chmod(0o600);return row
 rows=[];pairs=list(zip(jobs,encoded));stop=False
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  # A single pilot validates authentication, contract and usage before bulk calls.
  for start in range(0,len(pairs),2):
   batch=[pairs[0]] if start==0 else pairs[max(1,start-1):start+1]
   if not batch:continue
   result=list(pool.map(call,batch));rows.extend(result)
   (args.root/(args.provider+'-results.json')).write_text(json.dumps(rows,indent=2))
   new_cost=sum(r.get('gross_cost_usd') or 0 for r in rows if not r['cached'])
   next_estimate=sum(len(b) for _,b in pairs[start+1:start+3])/4*RATES[args.provider]/1e6
   if any(r.get('error') in ['HTTP 401','HTTP 402','HTTP 403','HTTP 429'] for r in result) or start==0 and any(r.get('error') or r.get('invalid_fields') or r.get('gross_cost_usd') is None for r in result) or new_cost+next_estimate*2>=args.budget:
    stop=True;break
   if len(rows)%20<=1:print(json.dumps({'provider':args.provider,'completed':len(rows),'total':len(jobs),'new_gross_cost_usd':new_cost}),flush=True)
  # Even-sized datasets need the final row after the initial single-row pilot.
  if not stop and len(rows)<len(pairs):rows.append(call(pairs[-1]));(args.root/(args.provider+'-results.json')).write_text(json.dumps(rows,indent=2))
 summary={**dry,'completed':len(rows),'errors':sum(bool(r.get('error')) for r in rows),'invalid_outputs':sum(bool(r.get('invalid_fields')) for r in rows),'unknown_cost_calls':sum(r.get('gross_cost_usd') is None for r in rows),'reported_gross_cost_usd':sum(r.get('gross_cost_usd') or 0 for r in rows),'new_reported_gross_cost_usd':sum(r.get('gross_cost_usd') or 0 for r in rows if not r['cached']),'stopped_early':stop};(args.root/(args.provider+'-run.json')).write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
