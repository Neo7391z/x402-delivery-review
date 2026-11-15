from pathlib import Path
import json,hashlib,zipfile
root=Path(__file__).resolve().parent
out=root.parent/'delivery-review-review-package.zip'
exclude={'.git','.local','.venv','node_modules','dist','.pytest_cache','__pycache__','artifacts','captures'}
files=[p for p in root.rglob('*') if p.is_file() and not any(x in exclude for x in p.relative_to(root).parts) and p.name not in {'REVIEW_RU.md','SIGNING_HANDOFF.md','PUBLIC_UPDATE.md','SUBMISSION_DRAFT.md','authorization-status.json','court-brand-source.html','SHA256SUMS','edit-intro.mp4','edit-outro.mp4','edit-sandbox.mp4','edit-recorded.mp4','edit-list.txt'} and not p.name.endswith('.zip')]
secrets=[]
for p in (root/'.local').rglob('*.json'):
 try:
  obj=json.loads(p.read_text())
  for k in ['privateKey','signedRawTransaction']:
   if obj.get(k):secrets.extend([obj[k].encode(),json.dumps(obj[k])[1:-1].encode()])
 except (ValueError,UnicodeError):pass
for p in files:
 data=p.read_bytes()
 if any(secret in data for secret in secrets):raise RuntimeError('Private material detected in package file '+str(p.relative_to(root)))
privacy=root/'evidence/package-privacy-check.json';privacy.write_text(json.dumps({'passed':True,'excludedPrivateDirectory':'.local','checkedFiles':len(files),'checkedPrivateMaterial':True,'publicSignaturesIntentionallyIncluded':True},indent=2))
files=sorted(set(files+[privacy]));manifest=root/'SHA256SUMS';manifest.write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(root)) for p in files)+'\n')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[manifest]:z.write(p,'delivery-review/'+str(p.relative_to(root)))
print(json.dumps({'path':str(out),'files':len(files)+1,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
