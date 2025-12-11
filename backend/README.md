# Class360 Backend Processing Pipeline

This directory contains Python scripts for processing classroom videos.

## Requirements

### System Dependencies
```bash
# macOS
brew install ffmpeg tesseract tesseract-lang

# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg tesseract-ocr tesseract-ocr-eng tesseract-ocr-mal

# Windows
# Download FFmpeg: https://ffmpeg.org/download.html
# Download Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
```

### Python Dependencies
```bash
pip install -r requirements.txt
```

## Scripts

### 1. Main Pipeline (`process_video.py`)
Complete video processing pipeline that runs all steps.

```bash
python process_video.py lecture.mp4 \
    --model small \
    --src_lang ml \
    --generate_srt true \
    --generate_dub true \
    --generate_ocr true \
    --start_trim 180 \
    --end_trim 180 \
    --output_dir ./output
```

### 2. Generate Subtitles (`generate_subtitles.py`)
Transcribes video using OpenAI Whisper.

```bash
# Malayalam video
python generate_subtitles.py lecture.mp4 --model small --language ml

# Auto-detect language
python generate_subtitles.py lecture.mp4 --model medium

# Translate to English
python generate_subtitles.py lecture.mp4 --task translate
```

**Output:** `.srt`, `.vtt`, and `.txt` files

### 3. English Dubbing (`dub_to_english.py`)
Translates and generates English TTS dubbing.

```bash
python dub_to_english.py lecture.mp4 \
    --model small \
    --src_lang ml \
    --output lecture_dubbed.mp4
```

**Output:** Video with English dubbed audio track

### 4. Board Notes OCR (`extract_board_notes.py`)
Extracts whiteboard/blackboard text from video frames.

```bash
python extract_board_notes.py lecture.mp4 \
    --interval 30 \
    --languages eng+mal \
    --output notes.md \
    --save_frames
```

**Output:** Markdown file with timestamped notes

### 5. Video Trimming (`trim_video.py`)
Removes non-teaching start/end sections.

```bash
python trim_video.py lecture.mp4 \
    --start_trim 180 \
    --end_trim 180 \
    --output lecture_trimmed.mp4
```

## Whisper Models

| Model  | Speed | Quality | VRAM  | Best For |
|--------|-------|---------|-------|----------|
| tiny   | Fast  | Low     | ~1GB  | Testing  |
| base   | Fast  | Medium  | ~1GB  | Quick drafts |
| small  | Med   | Good    | ~2GB  | **Recommended** |
| medium | Slow  | Great   | ~5GB  | Accuracy |
| large  | Slow  | Best    | ~10GB | Final output |

## Language Codes

- `ml` - Malayalam
- `en` - English
- `hi` - Hindi
- `ta` - Tamil
- `te` - Telugu
- `auto` - Auto-detect

## Integration with Class360

The scripts output files that can be uploaded to Firebase Storage and linked in the database:

```json
{
  "video_id": {
    "status": {
      "uploaded": true,
      "trimmed": true,
      "subtitles": true,
      "dubbed": true,
      "ocr_notes": true
    },
    "subtitle_url": "gs://bucket/video_id.srt",
    "dub_url": "gs://bucket/video_id_dub_en.mp4",
    "notes_url": "gs://bucket/video_id_notes.md"
  }
}
```

## Example Workflow

```bash
# 1. Process a Malayalam lecture video
cd backend

# 2. Run full pipeline
python process_video.py /path/to/lecture.mp4 \
    --model small \
    --src_lang ml \
    --output_dir ./processed

# 3. Check outputs
ls ./processed/
# lecture_trimmed.mp4
# lecture.srt
# lecture.vtt
# lecture_dub_en.mp4
# lecture_notes.md
# lecture_manifest.json
```

## Troubleshooting

### Whisper not finding GPU
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Tesseract not found
Ensure Tesseract is in your PATH or set:
```python
pytesseract.pytesseract.tesseract_cmd = '/usr/local/bin/tesseract'
```

### FFmpeg errors
Ensure ffmpeg is installed and in PATH:
```bash
ffmpeg -version
```
