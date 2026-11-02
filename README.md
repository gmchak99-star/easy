# 영어 원리

영어의 6가지 원리(30개 주제)를 **① 우리말 비교 → ② 리뷰 → ③ Practice** 세 단계 음성과 텍스트로 공부하는 사이트예요.
기존 「영어 그림 풀이」 사이트와 같은 플레이어(반복·속도·전체 화면·타이머·백그라운드 재생·오프라인 저장)를 써요.

## 파일 규칙
`audio/01_1.mp3`(우리말 비교) · `01_2.mp3`(리뷰) · `01_3.mp3`(Practice) … `30_3.mp3` — 총 90개.
텍스트는 `transcripts/01_1.json` 처럼 같은 번호로 대응돼요.

## 음성을 넣고 텍스트까지 만드는 순서
```bash
python3 tools/rename_audio.py 올린폴더     # 이름을 01_1.mp3 형태로 정리해 audio/ 로 복사
python3 tools/transcribe.py --all          # 음성 → 텍스트(문장별 시간 포함) → transcripts/
python3 tools/build_data.py                # data.js 갱신
```
텍스트를 손으로 고치고 싶으면 `transcripts/*.json` 의 `t` 값을 수정하고 `build_data.py` 만 다시 실행하세요.

## 올리는 방법
GitHub Pages — 기존 사이트와 같은 방식(저장소 `main` / `(root)`). 새 저장소를 따로 만드는 걸 권해요.
