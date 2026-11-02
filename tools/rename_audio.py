#!/usr/bin/env python3
"""'01_1 우리말 비교.mp3', '01_2 리뷰.mp3', '01_3 practice.mp3' 처럼 올린 파일을 audio/01_1.mp3 형태로 복사.
사용: python3 tools/rename_audio.py <올린_폴더>"""
import os, re, shutil, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1]; n = 0
os.makedirs(os.path.join(root, 'audio'), exist_ok=True)
for dp, _, fs in os.walk(src):
    for f in fs:
        m = re.match(r'^(?:[0-9a-f]{8}-)?(\d{1,2})\s*[_\-]\s*([123])(?!\d).*\.mp3$', f, re.I)
        if m:
            dst = '%02d_%s.mp3' % (int(m.group(1)), m.group(2))
            shutil.copy2(os.path.join(dp, f), os.path.join(root, 'audio', dst)); n += 1
        elif f.lower().endswith('.mp3'): print('건너뜀(이름 규칙 불일치):', f)
print(n, '개 복사됨')
