"""Independent, assistant-authored controls. These are not real vacancies."""
import json
from pathlib import Path

def cases():
 rows=[]
 def add(name,title,body,expected,location='San Francisco, CA, USA'):
  rows.append({'id':'control:'+name,'kind':'synthetic','sampling_stratum':'qualification_control','title':title,'location':location,'department':None,'description_text':body,'url':None,'expected':expected,'annotation_source':'assistant_authored_control'})
 def years(b,m,d,p):return dict(zip(['years_bachelor','years_master','years_doctorate','years_phd_student'],[b,m,d,p]))
 for n in [0,1,2,3,4,5,6,7,10]:
  add('numeric-'+str(n),'Software Engineer',f'Requirements: At least {n} years of professional software engineering experience. Build backend services.',{'us_eligibility':'yes','job_family':'software',**years(*([str(n)]*4))})
 add('linked','Software Engineer',"Requirements: Bachelor's degree plus 5 years OR master's degree plus 3 years OR a completed PhD plus 1 year. Build backend services.",{'doctorate_status':'none',**years('5','3','1','3')})
 add('independent','Software Engineer',"Requirements: Bachelor's + 5 years OR master's + 2 years. Also required: 3 years of experience writing production Python.",years('5','3','3','3'))
 add('degree_or_practice','Software Engineer',"Requirements: Bachelor's degree or equivalent practical experience, with 5 years of professional experience.",years('5','5','5','5'))
 add('phd_only','Research Engineer','Requirements: A completed PhD in computer science is mandatory. Build software models.',{'doctorate_status':'completed',**years('no_route','no_route','unspecified','no_route')})
 add('phd_enrolled','Software Engineering Intern','Requirements: Currently pursuing a PhD in computer science. Build software.',{'doctorate_status':'enrolled','phd_internship_eligibility':'yes',**years('no_route','no_route','no_route','0')})
 add('mixed_cohort','Software Engineering Intern','Requirements: Currently enrolled in a BS, MS or PhD program in computer science. Build software.',{'doctorate_status':'none','phd_internship_eligibility':'yes','years_phd_student':'0'})
 add('graduate_program','Software Engineering Intern','Requirements: Currently enrolled in a graduate degree program in computer science. Build software.',{'phd_internship_eligibility':'yes','years_phd_student':'0'})
 add('any_program','Software Engineering Intern','Requirements: Currently pursuing any accredited university degree program in computer science. Build software.',{'phd_internship_eligibility':'yes','years_phd_student':'0'})
 add('undergraduate_only','Software Engineering Intern',"Requirements: Currently enrolled in a bachelor's program. This internship is restricted to undergraduate students; PhD students are not eligible.",{'phd_internship_eligibility':'no','years_phd_student':'no_route'})
 add('masters_only','Software Engineering Intern',"Requirements: Currently pursuing a master's degree. Only master's students may apply; doctoral students are excluded.",{'phd_internship_eligibility':'no','years_phd_student':'no_route'})
 add('unspecified_intern','Software Engineering Intern','Build software with the engineering team. No student-cohort eligibility is given.',{'phd_internship_eligibility':'unknown','years_phd_student':'unclear'})
 add('preferred_phd','Software Engineering Intern','Requirements: Currently enrolled in a BS/MS program. Preferred qualifications: PhD research experience is a bonus.',{'doctorate_status':'none','phd_internship_eligibility':'no','years_phd_student':'no_route'})
 add('completed_at_join','Software Engineering Intern, PhD','Requirements: Currently pursuing a PhD. The PhD degree must be completed before joining.',{'doctorate_status':'completed','phd_internship_eligibility':'no','years_phd_student':'no_route'})
 add('phd_negation','Software Engineer','A PhD is not optional. Requirements: A completed PhD in computer science.',{'doctorate_status':'completed',**years('no_route','no_route','unspecified','no_route')})
 add('preferred_degree','Software Engineer',"Requirements: Bachelor's degree and 2 years of experience. Preferred qualifications: PhD and 7 years of experience.",{'doctorate_status':'none',**years('2','2','2','2')})
 add('mentor','Software Engineer','Requirements: 2 years of experience mentoring PhD students. Build software. No degree requirement.',{'doctorate_status':'none',**years('2','2','2','2')})
 add('phd_or_master','Software Engineer',"Requirements: Master's degree + 3 years OR a completed PhD with no professional experience required.",{'doctorate_status':'none',**years('no_route','3','0','3')})
 for name,loc,body,answer in [('uk','London, United Kingdom','Build software.','no'),('toronto','Toronto, Canada','Build software.','no'),('remote_unknown','Remote','Build software.','unclear'),('remote_uk','Remote - United States','This position is only open to residents working in the United Kingdom. US applicants are not eligible.','no'),('worldwide','Remote worldwide','We hire in any country, including the United States, without residency restrictions.','yes'),('america_timezone','Remote','Must work US Eastern hours. The job is restricted to applicants based in Brazil.','no')]:
  add(name,'Software Engineer',body,{'us_eligibility':answer},loc)
 for name,title,body,family in [('hardware','Electrical Engineer','Design circuit boards and power electronics. No software development duties.','hardware'),('clinical','Clinical Research Scientist','Conduct clinical trials and wet-lab assays.','life_science'),('recruiter','Technical Recruiter','Source candidates and conduct recruitment interviews.','business'),('ux','UX Researcher','Conduct user interviews and usability research.','design'),('ml','Machine Learning Engineer','Build and deploy predictive models and software ML pipelines.','data_ai'),('recruiting_data','Recruiting Analytics Data Engineer','Build SQL data pipelines and production Python ETL services for recruiting analytics. No recruiting duties.','data_ai')]:
  add(name,title,body,{'job_family':family})
 add('skills','Software Engineer','Required: C++ programming. Python OR Java accepted for a second language. Preferred: SQL. We go fast; our CSS is modern. No JavaScript skill is required or used.',{'skill_cpp':'required','skill_python':'alternative','skill_java':'alternative','skill_sql':'preferred','skill_go':'absent','skill_c':'absent','skill_javascript':'absent'})
 for name,body,expected in [
  ('web_languages','Requirements: JavaScript and TypeScript proficiency are mandatory.',{'skill_javascript':'required','skill_typescript':'required','skill_java':'absent'}),
  ('systems_languages','Requirements: Go or Rust proficiency is mandatory; either language qualifies.',{'skill_go':'alternative','skill_rust':'alternative'}),
  ('c_languages','Requirements: C and C# proficiency. C++ is preferred.',{'skill_c':'required','skill_csharp':'required','skill_cpp':'preferred'}),
  ('mobile_languages','Requirements: Swift OR Kotlin programming. Either language qualifies.',{'skill_swift':'alternative','skill_kotlin':'alternative'}),
  ('data_languages','Requirements: Python and SQL programming. Preferred: Java.',{'skill_python':'required','skill_sql':'required','skill_java':'preferred'}),
  ('negative_languages','We go beyond expectations and use NoSQL. JavaScript is preferred. No Java or SQL experience is required or used.',{'skill_go':'absent','skill_sql':'absent','skill_java':'absent','skill_javascript':'preferred'}),
 ]: add(name,'Software Engineer',body,expected)
 add('clearance','Software Engineer' ,'Requirements: Active Secret security clearance. Build software.',{'clearance_gate':'required'})
 add('publictrust','Software Engineer','Requirements: Public Trust background screening. No security clearance is required.',{'clearance_gate':'not_required'})
 add('footer','Graduate Software Engineer','Requirements: Bachelor degree; no experience required. This is full-time graduate employment. Our global application re-apply policy applies to candidates who previously applied for a graduate or internship role.',{'seniority':'new_grad','phd_internship_eligibility':'not_internship'})
 return rows
if __name__=='__main__':
 import sys
 Path(sys.argv[1]).write_text(json.dumps(cases(),indent=2));print(len(cases()))
