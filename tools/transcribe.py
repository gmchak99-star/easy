#!/usr/bin/env python3
"""음성(mp3) -> 문장 구간 + 텍스트 JSON  (sherpa-onnx + Whisper small, 무음 구간으로 문장 나눔)
사용:  python3 tools/transcribe.py audio/01_1.mp3 [...]      -> transcripts/01_1.json
       python3 tools/transcribe.py --all                      -> audio/ 안의 전부 (이미 있는 건 건너뜀)
모델 폴더:  STT_DIR 환경변수 (기본 /home/claude/stt)  안에 sherpa-onnx-whisper-small/ 와 silero_vad.onnx
"""
import os, sys, json, glob, subprocess, wave
import numpy as np, sherpa_onnx

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STT = os.environ.get('STT_DIR', '/home/claude/stt')
M = os.path.join(STT, 'sherpa-onnx-whisper-small')
LANG = os.environ.get('STT_LANG', '')      # 비우면 구간마다 자동 판별(한국어+영어 섞임), 'ko' 로 고정도 가능

rec = sherpa_onnx.OfflineRecognizer.from_whisper(
    encoder=M + '/small-encoder.int8.onnx', decoder=M + '/small-decoder.int8.onnx',
    tokens=M + '/small-tokens.txt', language=LANG, task='transcribe', num_threads=2)

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def segments(x):
    cfg = sherpa_onnx.VadModelConfig()
    cfg.silero_vad.model = os.path.join(STT, 'silero_vad.onnx')
    cfg.silero_vad.min_silence_duration = float(os.environ.get('VAD_SIL', '0.45'))
    cfg.silero_vad.min_speech_duration = 0.25
    cfg.silero_vad.max_speech_duration = 25
    cfg.sample_rate = 16000
    vad = sherpa_onnx.VoiceActivityDetector(cfg, buffer_size_in_seconds=60)
    w = 512; out = []
    def drain():
        while not vad.empty():
            s = vad.front; out.append((s.start / 16000, len(s.samples) / 16000, np.array(s.samples))); vad.pop()
    for i in range(0, len(x), w):
        vad.accept_waveform(x[i:i + w]); drain()
    vad.flush(); drain()
    return out

def run(path):
    name = os.path.splitext(os.path.basename(path))[0]
    dst = os.path.join(root, 'transcripts', name + '.json')
    x = load(path); res = []
    for start, dur, smp in segments(x):
        # 앞뒤로 0.15초 여유를 줘서 첫/끝 소리가 잘리지 않게
        st = rec.create_stream(); st.accept_waveform(16000, smp); rec.decode_stream(st)
        t = st.result.text.strip()
        if t: res.append({'s': max(0, round(start - 0.15, 2)), 'e': round(start + dur + 0.2, 2), 't': t})
    for a, b in zip(res, res[1:]):          # 겹침 방지
        if a['e'] > b['s']: a['e'] = b['s']
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    json.dump(res, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(name, len(res), 'segments')

args = sys.argv[1:]
if args == ['--all']:
    args = [p for p in sorted(glob.glob(os.path.join(root, 'audio', '*.mp3'))) if not os.path.exists(os.path.join(root, 'transcripts', os.path.basename(p)[:-4] + '.json'))]
for p in args: run(p)
