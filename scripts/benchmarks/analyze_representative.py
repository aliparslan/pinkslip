"""Score frozen partial annotations separately from authored controls."""
import argparse, collections, hashlib, json, math, statistics
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--providers',nargs='+',choices=['baseline','jev','clef','clef-flash','decisions'],default=['baseline','jev']);a=p.parse_args();r=a.root
 jobs=json.loads((r/'dataset.json').read_text());by_id={j['id']:j for j in jobs}
 assert len(by_id)==len(jobs)==196, 'Dataset must retain the frozen 196 distinct cases.'
 frozen=json.loads((r/'labels-frozen.json').read_text())
 assert hashlib.sha256((r/'real-labels.json').read_bytes()).hexdigest()==frozen['sha256'], 'Real annotations changed after inference.'
 assert hashlib.sha256((r/'challenges.json').read_bytes()).hexdigest()==frozen['controlled_labels_sha256'], 'Control annotations changed after inference.'
 real=json.loads((r/'real-labels.json').read_text());controls=[j for j in jobs if j['kind']=='synthetic'];summary={};disagreements=[]
 supported=None
 outputs={}
 for provider in a.providers:
  rows=json.loads((r/(provider+'-results.json')).read_text());outputs[provider]={v['id']:v for v in rows}
  assert len(rows)==len(outputs[provider]) and set(outputs[provider])==set(by_id), 'Require a complete run with distinct cases.'
  assert all(not v.get('error') and not v.get('invalid_fields') for v in rows), 'Resolve failed or invalid runs before comparing accuracy.'
 supported=set.intersection(*(set(next(iter(rows.values()))['choices']) for rows in outputs.values()))
 def normalized(k,v):return v if k!='job_family' or v in ['software','data_ai','security','unknown'] else 'other'
 def score(provider,gs,common_only=False):
  stats=collections.defaultdict(lambda:{'correct':0,'total':0});case_pass=0;scored_cases=0
  for g in gs:
   all_correct=True;seen=False
   for k,e in g['expected'].items():
    got=outputs[provider][g['id']]['choices'].get(k)
    if got is None or common_only and k not in supported:continue
    seen=True;ok=normalized(k,got)==normalized(k,e);stats[k]['total']+=1;stats[k]['correct']+=ok;all_correct &= ok
    if not ok and not common_only:disagreements.append({'provider':provider,'id':g['id'],'kind':by_id[g['id']]['kind'],'title':by_id[g['id']]['title'],'field':k,'expected':e,'actual':got,'sampling_stratum':by_id[g['id']]['sampling_stratum']})
   case_pass+=seen and all_correct;scored_cases+=seen
  return {'correct':sum(x['correct'] for x in stats.values()),'total':sum(x['total'] for x in stats.values()),'cases_with_all_scored_fields_matching':case_pass,'annotated_cases':len(gs),'scored_cases':scored_cases,'fields':dict(stats)}
 for provider in outputs:
  latencies=sorted(v['latency_seconds'] for v in outputs[provider].values() if not v.get('cached'))
  percentile=lambda p:latencies[min(len(latencies)-1,math.ceil(len(latencies)*p)-1)]
  summary[provider]={'real_provisional':score(provider,real),'controlled':score(provider,controls),'shared_real_provisional':score(provider,real,True),'shared_controlled':score(provider,controls,True),'latency_seconds':{'median':statistics.median(latencies),'p95':percentile(.95),'max':max(latencies)} if latencies else None,'strata':{s:score(provider,[g for g in real if by_id[g['id']]['sampling_stratum']==s],True) for s in sorted({by_id[g['id']]['sampling_stratum'] for g in real})}}
  if provider!='baseline':
   summary[provider]['reported_cost_usd']=sum(v.get('gross_cost_usd') or 0 for v in outputs[provider].values())
   summary[provider]['unknown_cost_calls']=sum(v.get('gross_cost_usd') is None for v in outputs[provider].values())
   summary[provider]['resolved_models']=sorted({str(v.get('resolved_model')) for v in outputs[provider].values()})
 summary['shared_dimensions']=sorted(supported);summary['annotation_status']='Assistant provisional; not owner-reviewed; deliberately stratified, not population accuracy.'
 # Cross-field warnings are supplementary diagnostics, not additional gold labels.
 for provider in outputs:
  if provider=='baseline':continue
  warnings=[]
  for v in outputs[provider].values():
   c=v['choices'];j=by_id[v['id']]
   if c['phd_internship_eligibility']=='no' and c['years_phd_student'].isdigit():warnings.append({'id':v['id'],'title':j['title'],'issue':'PhD cohort rejected but student experience route accepted'})
   if c['phd_internship_eligibility']=='not_internship' and c['doctorate_status']=='none' and c['years_master'].isdigit() and c['years_phd_student'].isdigit() and int(c['years_phd_student'])<int(c['years_master']):warnings.append({'id':v['id'],'title':j['title'],'issue':'Enrolled PhD student gets lower minimum than completed master without a doctoral enrollment requirement'})
  summary[provider]['cross_field_warnings']=warnings
 if 'jev' in outputs and 'decisions' in outputs:
  paired={}
  for label,gs in [('real_provisional',real),('controlled',controls)]:
   tally=collections.Counter()
   for g in gs:
    for k,e in g['expected'].items():
     j=outputs['jev'][g['id']]['choices'];d=outputs['decisions'][g['id']]['choices']
     if k not in j or k not in d:continue
     jc=normalized(k,j[k])==normalized(k,e);dc=normalized(k,d[k])==normalized(k,e)
     tally['both_correct' if jc and dc else 'decisions_only_correct' if dc else 'jev_only_correct' if jc else 'both_wrong']+=1
   paired[label]=dict(tally)
  summary['jev_vs_decisions_paired_fields']=paired
 (r/'analysis.json').write_text(json.dumps(summary,indent=2));(r/'disagreements.json').write_text(json.dumps(disagreements,indent=2));print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
