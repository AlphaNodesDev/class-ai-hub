#!/usr/bin/env python3
"""
Dub Video to English using Whisper + Coqui TTS (Local AI)
===========================================================
Transcribes audio, translates to English, and generates natural TTS dubbing.
Uses Coqui TTS for high-quality neural text-to-speech.

Usage:
    python dub_to_english.py input.mp4 --model small --src_lang ml

Requirements:
    pip install openai-whisper TTS torch torchaudio

Process:
    1. Extract audio from video
    2. Transcribe and translate using Whisper
    3. Generate English TTS using Coqui TTS (neural voice)
    4. Merge TTS audio with original video
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

# Suppress some warnings
warnings.filterwarnings('ignore', category=UserWarning)

def get_video_duration(video_path):
    """Get video duration in seconds"""
    cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{video_path}"'
    try:
        result = subprocess.check_output(cmd, shell=True).decode().strip()
        return float(result)
    except:
        return 0

def extract_audio(video_path, audio_path):
    """Extract audio from video"""
    cmd = f'ffmpeg -y -i "{video_path}" -vn -acodec pcm_s16le -ar 22050 -ac 1 "{audio_path}" -loglevel warning'
    os.system(cmd)
    return Path(audio_path).exists()

def generate_tts_coqui(text, output_path, tts_model=None):
    """Generate TTS using Coqui TTS"""
    try:
        from TTS.api import TTS
        
        if tts_model is None:
            # Use a fast, good quality model
            # Options: tts_models/en/ljspeech/tacotron2-DDC (fast)
            #          tts_models/en/vctk/vits (multi-speaker)
            #          tts_models/multilingual/multi-dataset/xtts_v2 (best quality, slower)
            tts_model = TTS("tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)
        
        tts_model.tts_to_file(text=text, file_path=str(output_path))
        return True
    except Exception as e:
        print(f"   TTS Error: {e}")
        return False

def generate_tts_fallback(text, output_path):
    """Fallback TTS using gTTS if Coqui fails"""
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(str(output_path))
        return True
    except Exception as e:
        print(f"   Fallback TTS Error: {e}")
        return False

def merge_audio_segments(segments, output_path, total_duration):
    """Merge TTS segments with proper timing"""
    # Create a concat file for ffmpeg
    concat_file = output_path.parent / "concat_list.txt"
    
    with open(concat_file, 'w') as f:
        for seg in segments:
            if Path(seg['tts_file']).exists():
                f.write(f"file '{seg['tts_file']}'\n")
    
    # Concatenate all TTS files
    temp_concat = output_path.parent / "temp_concat.wav"
    cmd = f'ffmpeg -y -f concat -safe 0 -i "{concat_file}" -c copy "{temp_concat}" -loglevel warning'
    os.system(cmd)
    
    # Pad or trim to match video duration
    if temp_concat.exists():
        cmd = f'ffmpeg -y -i "{temp_concat}" -af "apad=pad_dur={total_duration}" -t {total_duration} -ar 44100 -ac 2 "{output_path}" -loglevel warning'
        os.system(cmd)
    
    # Cleanup
    if concat_file.exists():
        concat_file.unlink()
    if temp_concat.exists():
        temp_concat.unlink()
    
    return output_path.exists()

def main():
    parser = argparse.ArgumentParser(description='Generate English dub using AI TTS')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size')
    parser.add_argument('--src_lang', default='auto', help='Source language (ml, en, auto)')
    parser.add_argument('--output', default=None, help='Output video path')
    parser.add_argument('--keep_temp', action='store_true', help='Keep temporary files')
    parser.add_argument('--tts_model', default='tacotron2', choices=['tacotron2', 'vits', 'xtts'],
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
    print("Class360 AI English Dubbing Pipeline")
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
    
    # Initialize TTS model once
    tts_model = None
    try:
        from TTS.api import TTS
        print("\n📦 Loading TTS model...")
        
        model_map = {
            'tacotron2': 'tts_models/en/ljspeech/tacotron2-DDC',
            'vits': 'tts_models/en/vctk/vits',
            'xtts': 'tts_models/multilingual/multi-dataset/xtts_v2'
        }
        
        tts_model_name = model_map.get(args.tts_model, model_map['tacotron2'])
        tts_model = TTS(tts_model_name, progress_bar=False, gpu=True)
        print(f"   ✓ Loaded: {tts_model_name}")
    except Exception as e:
        print(f"   ⚠️ Could not load Coqui TTS: {e}")
        print("   Will use fallback TTS (gTTS)")
    
    try:
        # Step 1: Extract audio
        print("\n[1/5] Extracting audio...")
        audio_path = temp_dir / "audio.wav"
        if not extract_audio(input_path, audio_path):
            print("Error: Failed to extract audio")
            sys.exit(1)
        print(f"   ✓ Audio extracted")
        
        # Get video duration
        video_duration = get_video_duration(input_path)
        print(f"   Video duration: {video_duration:.1f}s")
        
        # Step 2: Transcribe and translate
        print("\n[2/5] Transcribing and translating to English...")
        print(f"   Loading Whisper model: {args.model}")
        model = whisper.load_model(args.model)
        
        transcribe_options = {
            'task': 'translate',  # Translates to English
            'verbose': False
        }
        
        if args.src_lang and args.src_lang != 'auto':
            transcribe_options['language'] = args.src_lang
        
        result = model.transcribe(str(audio_path), **transcribe_options)
        segments = result['segments']
        
        detected_lang = result.get('language', 'unknown')
        print(f"   Detected language: {detected_lang}")
        print(f"   ✓ Translated {len(segments)} segments to English")
        
        # Save transcript
        transcript_path = temp_dir / "transcript_en.json"
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(segments, f, indent=2, ensure_ascii=False)
        
        # Also save as text file
        full_text = result.get('text', '')
        txt_path = input_path.with_suffix('.txt')
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(full_text)
        print(f"   ✓ Transcript saved: {txt_path}")
        
        # Step 3: Generate TTS for each segment
        print("\n[3/5] Generating English TTS audio...")
        
        tts_segments = []
        for i, seg in enumerate(segments):
            text = seg['text'].strip()
            if not text or len(text) < 2:
                continue
            
            tts_path = temp_dir / f"tts_{i:04d}.wav"
            
            # Try Coqui TTS first
            success = False
            if tts_model:
                try:
                    tts_model.tts_to_file(text=text, file_path=str(tts_path))
                    success = True
                except Exception as e:
                    print(f"\n   ⚠️ TTS failed for segment {i}: {e}")
            
            # Fallback to gTTS
            if not success:
                tts_path = tts_path.with_suffix('.mp3')
                success = generate_tts_fallback(text, tts_path)
            
            if success and tts_path.exists():
                tts_segments.append({
                    'index': i,
                    'start': seg['start'],
                    'end': seg['end'],
                    'text': text,
                    'tts_file': str(tts_path)
                })
            
            # Progress indicator
            if (i + 1) % 5 == 0 or i == len(segments) - 1:
                print(f"   Generated {i + 1}/{len(segments)} TTS clips...", end='\r')
        
        print(f"\n   ✓ Generated {len(tts_segments)} TTS audio clips")
        
        # Step 4: Create merged audio track
        print("\n[4/5] Merging TTS audio track...")
        
        merged_audio = temp_dir / "merged_tts.wav"
        
        if tts_segments:
            merge_audio_segments(tts_segments, merged_audio, video_duration)
            print(f"   ✓ Merged audio track created")
        else:
            # Create silent audio if no TTS generated
            os.system(f'ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t {video_duration} "{merged_audio}" -loglevel warning')
            print(f"   ⚠️ No TTS generated, using silent track")
        
        # Step 5: Merge with video
        print("\n[5/5] Creating final dubbed video...")
        
        if merged_audio.exists():
            # Option 1: Dual audio track (original + dub)
            cmd = f'''ffmpeg -y -i "{input_path}" -i "{merged_audio}" \
                -map 0:v -map 0:a -map 1:a \
                -c:v copy -c:a aac -b:a 192k \
                -metadata:s:a:0 title="Original" \
                -metadata:s:a:1 title="English Dub" \
                "{output_path}" -loglevel warning'''
            
            result = os.system(cmd)
            
            if result != 0 or not output_path.exists():
                # Fallback: Replace audio
                print("   Trying single audio track...")
                cmd = f'''ffmpeg -y -i "{input_path}" -i "{merged_audio}" \
                    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
                    "{output_path}" -loglevel warning'''
                os.system(cmd)
        
        if output_path.exists():
            print(f"   ✓ Dubbed video saved: {output_path}")
        else:
            print("   ❌ Failed to create dubbed video")
            sys.exit(1)
        
    finally:
        if not args.keep_temp:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"\n   Cleaned up temp files")
    
    print("\n" + "=" * 60)
    print("✅ Dubbing Complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
