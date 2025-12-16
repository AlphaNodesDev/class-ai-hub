#!/usr/bin/env python3
"""
AI Video Dubbing Pipeline with Improved Translation
====================================================
Translates video audio to target language with better accuracy.

Features:
    - Uses Whisper for accurate transcription and translation
    - Cleans translation artifacts for better quality
    - Supports multiple TTS engines (Coqui TTS, gTTS)
    - Preserves timing and sync with video
    - Speed adjustment to match original timing

Usage:
    python dub_to_english.py input.mp4 --model medium --src_lang ml

Requirements:
    pip install openai-whisper TTS torch gtts pydub

Note: Use 'medium' or 'large' Whisper model for better translation accuracy
"""

import argparse
import whisper
from pathlib import Path
import sys
import os
import tempfile
import json
import subprocess
import warnings
import shutil
import re

warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

def get_video_duration(video_path):
    """Get video duration in seconds"""
    cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
           '-of', 'default=noprint_wrappers=1:nokey=1', str(video_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())
    except:
        return 0

def extract_audio(video_path, audio_path):
    """Extract audio from video"""
    cmd = ['ffmpeg', '-y', '-i', str(video_path), '-vn', '-acodec', 'pcm_s16le',
           '-ar', '16000', '-ac', '1', str(audio_path)]
    subprocess.run(cmd, capture_output=True)
    return Path(audio_path).exists()

def clean_translation_text(text):
    """Clean Whisper translation artifacts for better TTS"""
    if not text:
        return ""
    
    # Remove Whisper artifacts
    artifacts = [
        r'<\|[a-z]+\|>',  # <|en|>, <|ml|>, etc.
        r'\[.*?\]',        # [Music], [Applause], etc.
        r'\(.*?\)',        # (music), (applause), etc.
        r'♪.*?♪',          # Music notes
    ]
    
    for pattern in artifacts:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    
    # Fix common translation issues
    text = re.sub(r'\s+', ' ', text)  # Multiple spaces
    text = re.sub(r'^\s*[,.!?]+', '', text)  # Leading punctuation
    text = text.strip()
    
    # Ensure proper sentence structure
    if text and not text[0].isupper():
        text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
    
    return text

def adjust_audio_speed(input_path, output_path, target_duration):
    """Adjust TTS audio speed to match original segment timing"""
    try:
        # Get current duration
        cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
               '-of', 'default=noprint_wrappers=1:nokey=1', str(input_path)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        current_duration = float(result.stdout.strip())
        
        if current_duration <= 0 or target_duration <= 0:
            shutil.copy(input_path, output_path)
            return
        
        # Calculate and limit speed factor
        speed = current_duration / target_duration
        speed = max(0.5, min(2.5, speed))  # Allow 0.5x to 2.5x speed
        
        # Apply speed adjustment using atempo filter
        if speed > 2.0:
            # Chain atempo filters for >2x speed
            filter_str = f'atempo={speed/2},atempo=2.0'
        else:
            filter_str = f'atempo={speed}'
        
        cmd = ['ffmpeg', '-y', '-i', str(input_path), '-filter:a', filter_str,
               '-vn', str(output_path)]
        subprocess.run(cmd, capture_output=True)
    except Exception as e:
        print(f"   [!] Speed adjust error: {e}")
        shutil.copy(input_path, output_path)

def generate_tts_coqui(text, output_path, tts_model):
    """Generate TTS using Coqui TTS"""
    try:
        tts_model.tts_to_file(text=text, file_path=str(output_path))
        return True
    except Exception as e:
        return False

def generate_tts_gtts(text, output_path, lang='en'):
    """Fallback TTS using gTTS"""
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang=lang, slow=False)
        tts.save(str(output_path))
        return True
    except Exception as e:
        return False

def merge_with_timing(segments, output_path, total_duration, temp_dir):
    """Merge TTS segments with proper timing using pydub"""
    try:
        from pydub import AudioSegment
        
        # Create silent base track
        base = AudioSegment.silent(duration=int(total_duration * 1000))
        
        for seg in segments:
            if not Path(seg['tts_file']).exists():
                continue
            
            try:
                audio = AudioSegment.from_file(seg['tts_file'])
                start_ms = int(seg['start'] * 1000)
                
                # Overlay at correct position
                base = base.overlay(audio, position=start_ms)
            except Exception as e:
                continue
        
        # Export as WAV
        base.export(str(output_path), format='wav')
        return True
    except ImportError:
        print("   [!] pydub not available, using ffmpeg fallback")
        return merge_with_ffmpeg(segments, output_path, total_duration, temp_dir)
    except Exception as e:
        print(f"   [!] Merge error: {e}")
        return False

def merge_with_ffmpeg(segments, output_path, total_duration, temp_dir):
    """Fallback merge using ffmpeg concat"""
    try:
        # Create concat file
        concat_file = temp_dir / "concat.txt"
        with open(concat_file, 'w') as f:
            for seg in segments:
                if Path(seg['tts_file']).exists():
                    f.write(f"file '{seg['tts_file']}'\n")
        
        # Concatenate
        temp_concat = temp_dir / "concat.wav"
        cmd = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat_file),
               '-c', 'copy', str(temp_concat)]
        subprocess.run(cmd, capture_output=True)
        
        # Pad to video duration
        if temp_concat.exists():
            cmd = ['ffmpeg', '-y', '-i', str(temp_concat),
                   '-af', f'apad=pad_dur={total_duration}', '-t', str(total_duration),
                   '-ar', '44100', '-ac', '2', str(output_path)]
            subprocess.run(cmd, capture_output=True)
        
        return output_path.exists()
    except Exception as e:
        print(f"   [!] FFmpeg merge error: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='AI Video Dubbing Pipeline')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--model', default='small', 
                        choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model (medium/large recommended for better accuracy)')
    parser.add_argument('--src_lang', default='auto', help='Source language (ml, en, hi, ta, te, auto)')
    parser.add_argument('--output', default=None, help='Output video path')
    parser.add_argument('--keep_temp', action='store_true', help='Keep temporary files')
    parser.add_argument('--tts_model', default='tacotron2', 
                        choices=['tacotron2', 'vits', 'xtts'],
                        help='TTS model to use')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(f"{input_path.stem}_dub_en")
    
    print("=" * 60)
    print("Class360 AI Video Dubbing Pipeline")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Whisper Model: {args.model}")
    print(f"TTS Model: {args.tts_model}")
    print(f"Source Language: {args.src_lang}")
    print("=" * 60)
    
    # Create temp directory
    temp_dir = Path(tempfile.mkdtemp(prefix='class360_dub_'))
    print(f"Temp directory: {temp_dir}")
    
    # Initialize TTS model
    tts_model = None
    tts_type = 'gtts'
    
    try:
        from TTS.api import TTS
        import torch
        
        print("\n[*] Loading TTS model...")
        
        model_map = {
            'tacotron2': 'tts_models/en/ljspeech/tacotron2-DDC',
            'vits': 'tts_models/en/vctk/vits',
            'xtts': 'tts_models/multilingual/multi-dataset/xtts_v2'
        }
        
        tts_model_name = model_map.get(args.tts_model, model_map['tacotron2'])
        use_gpu = torch.cuda.is_available()
        tts_model = TTS(tts_model_name, progress_bar=False, gpu=use_gpu)
        tts_type = 'coqui'
        print(f"   [OK] Loaded: {tts_model_name} (GPU: {use_gpu})")
    except Exception as e:
        print(f"   [!] Could not load Coqui TTS: {e}")
        print("   Will use gTTS fallback")
    
    try:
        # Step 1: Extract audio
        print("\n[1/5] Extracting audio...")
        audio_path = temp_dir / "audio.wav"
        if not extract_audio(input_path, audio_path):
            print("Error: Failed to extract audio")
            sys.exit(1)
        print("   [OK] Audio extracted")
        
        video_duration = get_video_duration(input_path)
        print(f"   Video duration: {video_duration:.1f}s")
        
        # Step 2: Transcribe and translate
        print("\n[2/5] Transcribing and translating to English...")
        print(f"   Loading Whisper model: {args.model}")
        
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"   Device: {device}")
        
        model = whisper.load_model(args.model, device=device)
        
        transcribe_options = {
            'task': 'translate',
            'verbose': False,
            'fp16': device == 'cuda'
        }
        
        if args.src_lang and args.src_lang != 'auto':
            transcribe_options['language'] = args.src_lang
        
        result = model.transcribe(str(audio_path), **transcribe_options)
        segments = result['segments']
        
        detected_lang = result.get('language', 'unknown')
        print(f"   Detected: {detected_lang}")
        print(f"   [OK] Translated {len(segments)} segments")
        
        # Clean translations
        for seg in segments:
            seg['text'] = clean_translation_text(seg['text'])
        
        # Save transcript
        full_text = ' '.join([seg['text'] for seg in segments if seg['text']])
        txt_path = input_path.with_suffix('.txt')
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(full_text)
        print(f"   [OK] Transcript saved: {txt_path}")
        
        # Step 3: Generate TTS
        print("\n[3/5] Generating English TTS audio...")
        
        tts_segments = []
        for i, seg in enumerate(segments):
            text = seg['text']
            if not text or len(text) < 3:
                continue
            
            tts_raw = temp_dir / f"tts_{i:04d}_raw.wav"
            tts_adj = temp_dir / f"tts_{i:04d}.wav"
            
            # Generate TTS
            success = False
            if tts_type == 'coqui' and tts_model:
                success = generate_tts_coqui(text, tts_raw, tts_model)
            
            if not success:
                tts_raw = tts_raw.with_suffix('.mp3')
                tts_adj = tts_adj.with_suffix('.mp3')
                success = generate_tts_gtts(text, tts_raw, 'en')
            
            if success and tts_raw.exists():
                # Adjust speed to match segment duration
                segment_duration = seg['end'] - seg['start']
                adjust_audio_speed(tts_raw, tts_adj, segment_duration)
                
                tts_segments.append({
                    'index': i,
                    'start': seg['start'],
                    'end': seg['end'],
                    'text': text,
                    'tts_file': str(tts_adj) if tts_adj.exists() else str(tts_raw)
                })
            
            if (i + 1) % 5 == 0 or i == len(segments) - 1:
                print(f"   Generated {i + 1}/{len(segments)} TTS clips...", end='\r')
        
        print(f"\n   [OK] Generated {len(tts_segments)} TTS audio clips")
        
        # Step 4: Merge audio
        print("\n[4/5] Merging TTS audio track...")
        merged_audio = temp_dir / "merged_tts.wav"
        
        if tts_segments:
            if merge_with_timing(tts_segments, merged_audio, video_duration, temp_dir):
                print("   [OK] Merged audio track created")
            else:
                print("   [!] Merge failed, using concatenation")
                merge_with_ffmpeg(tts_segments, merged_audio, video_duration, temp_dir)
        else:
            # Create silent audio
            cmd = ['ffmpeg', '-y', '-f', 'lavfi', '-i', 
                   f'anullsrc=r=44100:cl=stereo', '-t', str(video_duration),
                   str(merged_audio)]
            subprocess.run(cmd, capture_output=True)
            print("   [!] No TTS generated, using silent track")
        
        # Step 5: Create final video
        print("\n[5/5] Creating dubbed video...")
        
        if merged_audio.exists():
            # Try dual audio track first
            cmd = ['ffmpeg', '-y', '-i', str(input_path), '-i', str(merged_audio),
                   '-map', '0:v', '-map', '0:a', '-map', '1:a',
                   '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                   '-metadata:s:a:0', 'title=Original',
                   '-metadata:s:a:1', 'title=English Dub',
                   str(output_path)]
            
            result = subprocess.run(cmd, capture_output=True)
            
            if result.returncode != 0 or not output_path.exists():
                # Fallback: Replace audio
                print("   Trying single audio track...")
                cmd = ['ffmpeg', '-y', '-i', str(input_path), '-i', str(merged_audio),
                       '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac',
                       '-b:a', '192k', str(output_path)]
                subprocess.run(cmd, capture_output=True)
        
        if output_path.exists():
            print(f"   [OK] Dubbed video saved: {output_path}")
        else:
            print("   [X] Failed to create dubbed video")
            sys.exit(1)
        
    finally:
        if not args.keep_temp:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print("\n   Cleaned up temp files")
    
    print("\n" + "=" * 60)
    print("[DONE] Dubbing Complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
