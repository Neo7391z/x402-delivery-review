"""Reproducible animated evidence walkthrough of an actual hosted Studio result; not a screen recording."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import cairosvg, subprocess, json, math
ROOT=Path(__file__).resolve().parents[1]
W,H,FPS,SECONDS=1280,720,24,40
fontdir=Path('/usr/share/fonts/truetype/dejavu')
def font(size,bold=False): return ImageFont.truetype(str(fontdir/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),size)
for brand in ['internet-court','genlayer','x402']:
 cairosvg.svg2png(url=str(ROOT/f'public/assets/{brand}.svg'),write_to=str(ROOT/f'video/{brand}.png'),output_width=260)
base=Image.open(ROOT/'video/ai-background.png').convert('RGB').resize((W,H))
shade=Image.new('RGB',(W,H),'#101b29');base=Image.blend(base,shade,.60)
scenes=[
 ('01 / THE DELIVERY GAP','Payment proves transfer.','Who checks delivery?', 'x402 APIs can return HTTP 200 and still miss the brief.', 'A quality gate for repeat agent purchases.'),
 ('02 / THE AGREEMENT','One promise.','One exact answer.', 'Terms: independent validators, escalation, uncertainty.', 'Delivered: “Always correct. Challenges are unnecessary.”'),
 ('03 / THE EVIDENCE','Bind the evidence.','Keep the receipt.', 'Official @x402/core parses the v2 payment offer.', 'SHA-256 binds the offer and delivered response.'),
 ('04 / THE REVIEW','GenLayer judges','semantic fulfillment.', 'Independent validator judgment → ACCEPT / REWORK / ESCALATE', 'Fixture outcome: REWORK. Unsupported certainty; missing challenge path.'),
 ('05 / THE CONSEQUENCE','Pause repeat purchases.','Request better delivery.', 'Local policy: REWORK → PAUSE. Missing finality → HOLD.', 'Next: approved deployment + finalized GenLayer execution.')]
live=json.loads((ROOT/'evidence/studio-live-verification.json').read_text())
assert live['verified'] is True and live['chainId']==61999
scenes=[
 ('01 / THE DELIVERY GAP','An API can respond.','And still miss the brief.', 'x402 offer parsed by the official SDK. Payment disabled.', 'Synthetic evidence. Real execution on hosted Studionet.'),
 ('02 / THE AGREEMENT','Lock the promise.','Bind the response.', 'Terms: independent validators, escalation, uncertainty.', 'Delivered: “Always correct. Challenges are unnecessary.”'),
 ('03 / THE EXECUTION','Submitted to GenLayer.','Finalized on Studionet.', 'Contract '+live['contractAddress'], 'Review tx '+live['transactionHash']),
 ('04 / THE RESULT','Verdict: '+live['decision']+'.','Repeat purchases paused.', 'Observed decision → local policy: '+live['effect'], 'Guaranteed correctness claimed; independent validation and challenge path missing.'),
 ('05 / THE PROOF','Check the evidence.','Keep control.', 'Verified: exact source, owner, calldata, final state and 3/5 agreeing votes.', 'No real payment. Hosted Studio simulator; no mainnet or refund claim.')]
frames=[]
for idx,s in enumerate(scenes):
 im=base.copy();d=ImageDraw.Draw(im)
 x=58
 for brand in ['internet-court','genlayer','x402']:
  logo=Image.open(ROOT/f'video/{brand}.png').convert('RGBA');logo.thumbnail((155,42))
  if brand!='internet-court':
   a=logo.getchannel('A');logo=Image.new('RGBA',logo.size,'#f2f5ed');logo.putalpha(a)
  im.paste(logo,(x,34+(42-logo.height)//2),logo);x+=logo.width+28
 d.rounded_rectangle((864,31,1220,77),radius=23,outline='#bc9b67',width=1)
 d.text((886,46),'LIVE STUDIO / SYNTHETIC CASE',font=font(15,True),fill='#f4c781')
 d.line((58,100,1220,100),fill='#405363',width=1)
 d.text((60,140),s[0],font=font(18),fill='#88dfca')
 d.text((58,188),s[1],font=font(54,True),fill='#f5f3ed')
 d.text((58,258),s[2],font=font(54,True),fill='#88dfca')
 d.rounded_rectangle((58,366,1220,540),radius=18,fill='#1d2e40',outline='#486174',width=1)
 d.text((85,400),s[3],font=font(23),fill='#eff3f5')
 # Wrap second line to avoid clipping.
 words=s[4].split();line='';yy=452
 for word in words:
  trial=(line+' '+word).strip()
  if d.textlength(trial,font=font(22))>1080:d.text((85,yy),line,font=font(22),fill='#c1cdd7');yy+=29;line=word
  else:line=trial
 d.text((85,yy),line,font=font(22),fill='#c1cdd7')
 d.text((60,577),'Recorded hosted Studio result • synthetic evidence • no real payment',font=font(17),fill='#b0c0ce')
 d.text((60,652),'DELIVERY REVIEW  /  Neo7391z · Max Mara',font=font(16),fill='#b0c0ce')
 d.text((990,652),'PARTNER DEMO LAB',font=font(16),fill='#b0c0ce')
 im.save(ROOT/f'video/frames/scene-{idx+1}.png');frames.append(im)
cmd=['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/'video/delivery-review-demo.mp4')]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=open(ROOT/'evidence/video-render.log','w'))
for i in range(FPS*SECONDS):
 t=i/FPS;idx=min(int(t/8),4);phase=t%8
 im=frames[idx].copy()
 if idx and phase<.5: im=Image.blend(frames[idx-1],im,phase/.5)
 d=ImageDraw.Draw(im);d.rounded_rectangle((60,616,1220,622),radius=3,fill='#334b5d');d.rounded_rectangle((60,616,60+int(1160*t/SECONDS),622),radius=3,fill='#88dfca')
 # Visible moving evidence token along the progress bar.
 x=60+int(1160*t/SECONDS);d.ellipse((x-5,614,x+5,624),fill='#edf9f4')
 p.stdin.write(im.tobytes())
p.stdin.close();assert p.wait()==0
print('Rendered 40.0s, 1280x720, 24fps, silent with embedded explanatory text')
