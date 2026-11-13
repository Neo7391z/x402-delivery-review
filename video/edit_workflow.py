"""Edit actual browser captures with AI-generated title/end cards; no synthetic UI."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess,json
R=Path(__file__).resolve().parents[1];W,H=1280,1000
font=lambda n:ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',n)
def card(name,title,lines):
 im=Image.open(R/'video/ai-background.png').convert('RGB').resize((W,H));im=Image.blend(im,Image.new('RGB',(W,H),'#101b29'),.65);d=ImageDraw.Draw(im);x=65
 for brand in ['internet-court','genlayer','x402']:
  logo=Image.open(R/f'video/{brand}.png').convert('RGBA');logo.thumbnail((180,50))
  if brand!='internet-court':
   a=logo.getchannel('A');logo=Image.new('RGBA',logo.size,'white');logo.putalpha(a)
  im.paste(logo,(x,60),logo);x+=logo.width+35
 d.text((65,220),'DELIVERY REVIEW',font=font(25),fill='#83d8c4');d.text((65,300),title,font=font(55),fill='white')
 for i,line in enumerate(lines):d.text((65,420+i*60),line,font=font(28),fill='#c7d7e3')
 d.text((65,890),'Neo7391z / Max Mara  •  Internet Court Partner Demo Lab',font=font(22),fill='#83d8c4');im.save(R/f'video/{name}.png')
card('workflow-intro','An answer is not enough.',['Real HTTP 402 → signed delivery → GenLayer review','Then the client allows or blocks the next request.','Custom x402 sandbox. No money transferred.'])
card('workflow-outro','Verified. Then enforced.',['REWORK → PAUSE: next fetch blocked.','ACCEPT → ALLOW: next delivery completed.','Validator dissent → HOLD.','Hosted Studionet. Local controller, not wallet revocation.'])
def run(args):subprocess.run(['ffmpeg','-v','error','-y']+args,check=True,cwd=R)
common=['-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24']
for name in ['intro','outro']:run(['-loop','1','-i',f'video/workflow-{name}.png','-t','4','-vf','scale=1306:1020,crop=1280:1000:x=13+5*sin(t):y=10']+common+[f'video/edit-{name}.mp4'])
for mode,caption in [('sandbox','FRESH LOCAL HTTP / custom authorization / no payment'),('recorded','RECORDED SIGNED DELIVERY / fresh RPC check / real client gate')]:
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(R/f'video/{mode}-workflow.webm')]))
 vf=f"setpts={16/duration}*(PTS-STARTPTS),fps=24,scale=1280:1000,drawbox=x=0:y=950:w=1280:h=50:color=0x101b29:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{caption}':fontcolor=0x83d8c4:fontsize=21:x=40:y=966"
 run(['-i',f'video/{mode}-workflow.webm','-t','16','-vf',vf]+common+[f'video/edit-{mode}.mp4'])
(R/'video/edit-list.txt').write_text("\n".join("file 'edit-"+x+".mp4'" for x in ['intro','sandbox','recorded','outro']))
run(['-f','concat','-safe','0','-i','video/edit-list.txt','-c','copy','-movflags','+faststart','video/delivery-review-demo.mp4'])
run(['-i','video/delivery-review-demo.mp4','-f','null','-'])
run(['-i','video/delivery-review-demo.mp4','-vf','fps=1/5,scale=384:-1,tile=4x2','-frames:v','1','video/workflow-contact-sheet.png'])
