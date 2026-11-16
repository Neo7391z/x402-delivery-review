"""Tightly edit the actual browser-triggered deployment/review recording; waits are explicitly cut."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess,json
R=Path(__file__).resolve().parents[1];W,H=1280,1050
font=lambda n:ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',n)
def card(name,title,lines):
 im=Image.open(R/'video/ai-background.png').convert('RGB').resize((W,H));im=Image.blend(im,Image.new('RGB',(W,H),'#101b29'),.65);d=ImageDraw.Draw(im);x=65
 for brand in ['internet-court','genlayer','x402']:
  logo=Image.open(R/f'video/{brand}.png').convert('RGBA');logo.thumbnail((180,50))
  if brand!='internet-court':
   alpha=logo.getchannel('A');logo=Image.new('RGBA',logo.size,'white');logo.putalpha(alpha)
  im.paste(logo,(x,60),logo);x+=logo.width+35
 d.text((65,220),'DELIVERY REVIEW / LIVE UI',font=font(25),fill='#83d8c4');d.text((65,300),title,font=font(52),fill='white')
 for i,line in enumerate(lines):d.text((65,430+i*62),line,font=font(27),fill='#c7d7e3')
 d.text((65,930),'Neo7391z / Max Mara  •  GenLayer Projects',font=font(22),fill='#83d8c4');im.save(R/f'video/v6-{name}.png')
card('intro','From browser to judgment.',['Explicit opt-in. New contract. Fresh signed delivery.','GenLayer decides whether the agent continues.','Actual browser recording; waiting periods edited.'])
card('outro','Finalized. Then enforced.',['REWORK → PAUSE. Provider requests: 2 → 2.','Duplicate click and page reload kept the same job.','Custom non-monetary x402; zero-fee Studionet.','Trusted local backend. No real payment or Court jury.'])
def run(a):subprocess.run(['ffmpeg','-v','error','-y']+a,check=True,cwd=R)
common=['-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24']
parts=[]
run(['-loop','1','-i','video/v6-intro.png','-t','3','-vf','scale=1306:1072,crop=1280:1050:x=13+4*sin(t):y=11']+common+['video/v6-edit-0.mp4']);parts.append('v6-edit-0.mp4')
segments=[(0,8,8,'01 / EXPLICIT OPT-IN + SAME-JOB RELOAD'),(12,17,5,'02 / NEW CONTRACT DEPLOYMENT — WAIT CUT'),(56,65,7,'03 / FRESH SIGNED DELIVERY + REVIEW SUBMISSION'),(70,75,4,'04 / REVIEW PENDING — WAIT CUT'),(117,122,4,'05 / VERIFYING FINALITY AND EXACT EVIDENCE'),(139,145,6,'06 / FINALIZED REWORK → PAUSE — NEXT FETCH BLOCKED')]
for i,(start,end,duration,caption) in enumerate(segments,1):
 vf=f"setpts={duration/(end-start)}*(PTS-STARTPTS),fps=24,scale=1280:1050,drawbox=x=0:y=1000:w=1280:h=50:color=0x101b29:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{caption}':fontcolor=0x83d8c4:fontsize=21:x=30:y=1015"
 out=f'v6-edit-{i}.mp4';run(['-ss',str(start),'-t',str(end-start),'-i','video/v6-browser-lifecycle.webm','-vf',vf,'-t',str(duration)]+common+['video/'+out]);parts.append(out)
run(['-loop','1','-i','video/v6-outro.png','-t','3']+common+['video/v6-edit-7.mp4']);parts.append('v6-edit-7.mp4')
(R/'video/v6-edit-list.txt').write_text('\n'.join("file '"+x+"'" for x in parts));run(['-f','concat','-safe','0','-i','video/v6-edit-list.txt','-c','copy','-movflags','+faststart','video/delivery-review-demo.mp4']);run(['-i','video/delivery-review-demo.mp4','-f','null','-'])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate,nb_frames','-of','json',str(R/'video/delivery-review-demo.mp4')]))
assert float(probe['format']['duration'])<=45
(R/'evidence/video-ui-v6-qa.json').write_text(json.dumps({**probe,'decodePassed':True,'source':'Actual browser fresh lifecycle ui-da3e83f0-8aba-4e8f-858e-3ee4c50f13a9','editing':'Waiting periods cut; some clips retimed; no synthetic UI/result','AIProcessing':'AI-generated title/end background, motion, compositing and captions'},indent=2))
run(['-i','video/delivery-review-demo.mp4','-vf','fps=1/5,scale=384:-1,tile=4x2','-frames:v','1','video/v6-edited-contact-sheet.png'])
