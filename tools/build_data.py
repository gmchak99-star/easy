#!/usr/bin/env python3
"""toc.json + transcripts/NN_S.json + audio/NN_S.mp3  ->  data.js
사용: python3 tools/build_data.py   (사이트 폴더 안에서)
 - audio/ 에 01_1.mp3 처럼 있으면 음성 있음으로 표시
 - transcripts/01_1.json 이 있으면 [{"s":0.0,"e":3.2,"t":"문장"}, ...] 로 문장 목록을 붙임
"""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
toc = json.load(open(os.path.join(root, 'tools', 'toc.json'), encoding='utf-8'))
pages = []
for i, (part, title) in enumerate(toc['pages'], 1):
    nn = '%02d' % i
    stages = []
    for s in (1, 2, 3):
        name = '%s_%d' % (nn, s)
        has_audio = os.path.exists(os.path.join(root, 'audio', name + '.mp3'))
        tp = os.path.join(root, 'transcripts', name + '.json')
        segs = []
        if os.path.exists(tp):
            segs = [[round(x['s'], 2), round(x['e'], 2), x['t'].strip()] for x in json.load(open(tp, encoding='utf-8')) if x['t'].strip()]
        stages.append({'a': has_audio, 't': segs})
    pages.append({'key': 'r' + nn, 'part': part, 'num': nn, 'title': title, 'stages': stages})
out = 'window.SITE = ' + json.dumps({'parts': toc['parts'], 'pages': pages}, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(root, 'data.js'), 'w', encoding='utf-8').write(out)
na = sum(st['a'] for p in pages for st in p['stages']); nt = sum(bool(st['t']) for p in pages for st in p['stages'])
print('pages=%d  audio=%d/90  transcripts=%d/90' % (len(pages), na, nt))
