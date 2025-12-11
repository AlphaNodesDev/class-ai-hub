#!/usr/bin/env python3
"""
Dub Video to English using Whisper + TTS
=========================================
Transcribes audio, translates to English, and generates TTS dubbing.

Usage:
    python dub_to_english.py input.mp4 --model small --src_lang ml

Requirements:
    pip install openai-whisper gtts ffmpeg-python pydub

Process:
    1. Extract audio from video
    2. Transcribe and translate using Whisper
    3. Generate English TTS for each segment
    4. Merge TTS audio with original video
"""

import argparse
import whisper
from pathlib import Path
import sys
import os
import tempfile
import json

def main():
    parser = argparse.ArgumentParser(description='Generate English dub from video')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size')
    parser.add_argument('--src_lang', default='auto', help='Source language (ml, en, auto)')
    parser.add_argument('--output', default=None, help='Output video path')
    parser.add_argument('--keep_temp', action='store_true', help='Keep temporary files')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(f"{input_path.stem}_dub_en")
    
    print("=" * 50)
    print("Class360 English Dubbing Pipeline")
    print("=" * 50)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Model: {args.model}")
    print(f"Source Language: {args.src_lang}")
    print("=" * 50)
    
    # Create temp directory
    temp_dir = Path(tempfile.mkdtemp(prefix='class360_dub_'))
    print(f"Temp directory: {temp_dir}")
    
    try:
        # Step 1: Extract audio
        print("\n[1/5] Extracting audio...")
        audio_path = temp_dir / "audio.wav"
        os.system(f'ffmpeg -y -i "{input_path}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "{audio_path}" -loglevel warning')
        
        if not audio_path.exists():
            print("Error: Failed to extract audio")
            sys.exit(1)
        print(f"   ✓ Audio extracted: {audio_path}")
        
        # Step 2: Transcribe and translate
        print("\n[2/5] Transcribing and translating to English...")
        print(f"   Loading Whisper model: {args.model}")
        model = whisper.load_model(args.model)
        
        transcribe_options = {
            'task': 'translate',  # This translates to English
            'verbose': False
        }
        
        if args.src_lang and args.src_lang != 'auto':
            transcribe_options['language'] = args.src_lang
        
        result = model.transcribe(str(audio_path), **transcribe_options)
        segments = result['segments']
        
        detected_lang = result.get('language', 'unknown')
        print(f"   Detected language: {detected_lang}")
        print(f"   ✓ Translated {len(segments)} segments to English")
        
        # Save translated transcript
        transcript_path = temp_dir / "transcript_en.json"
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(segments, f, indent=2)
        
        # Step 3: Generate TTS for each segment
        print("\n[3/5] Generating English TTS audio...")
        from gtts import gTTS
        
        tts_segments = []
        for i, seg in enumerate(segments):
            text = seg['text'].strip()
            if not text:
                continue
            
            tts_path = temp_dir / f"tts_{i:04d}.mp3"
            tts = gTTS(text=text, lang='en', slow=False)
            tts.save(str(tts_path))
            
            tts_segments.append({
                'index': i,
                'start': seg['start'],
                'end': seg['end'],
                'text': text,
                'tts_file': str(tts_path)
            })
            
            if (i + 1) % 10 == 0:
                print(f"   Generated {i + 1}/{len(segments)} TTS clips...")
        
        print(f"   ✓ Generated {len(tts_segments)} TTS audio clips")
        
        # Step 4: Create merged audio track
        print("\n[4/5] Merging TTS audio track...")
        
        # Get video duration
        import subprocess
        duration_cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{input_path}"'
        duration = float(subprocess.check_output(duration_cmd, shell=True).decode().strip())
        
        # Create silent base audio
        merged_audio = temp_dir / "merged_tts.wav"
        os.system(f'ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t {duration} "{merged_audio}" -loglevel warning')
        
        # Overlay each TTS segment (simplified - in production use pydub or ffmpeg filters)
        # For now, we'll create a concat file approach
        filter_complex = []
        inputs = [f'-i "{merged_audio}"']
        
        for seg in tts_segments:
            inputs.append(f'-i "{seg["tts_file"]}"')
        
        # Build ffmpeg command for overlaying
        # This is a simplified version - production would need proper timing
        final_audio = temp_dir / "final_tts.wav"
        
        # For demo, just concatenate (proper implementation would overlay at timestamps)
        concat_list = temp_dir / "concat.txt"
        with open(concat_list, 'w') as f:
            for seg in tts_segments:
                f.write(f"file '{seg['tts_file']}'\n")
        
        os.system(f'ffmpeg -y -f concat -safe 0 -i "{concat_list}" -c copy "{final_audio}" -loglevel warning')
        print(f"   ✓ Merged audio track created")
        
        # Step 5: Merge with video
        print("\n[5/5] Creating final dubbed video...")
        
        # Add dubbed audio as second track, keep original
        os.system(f'''ffmpeg -y -i "{input_path}" -i "{final_audio}" \
            -map 0:v -map 0:a -map 1:a \
            -c:v copy -c:a aac \
            -metadata:s:a:0 title="Original" \
            -metadata:s:a:1 title="English Dub" \
            "{output_path}" -loglevel warning''')
        
        if output_path.exists():
            print(f"   ✓ Dubbed video saved: {output_path}")
        else:
            # Fallback: simple audio replacement
            os.system(f'''ffmpeg -y -i "{input_path}" -i "{final_audio}" \
                -map 0:v -map 1:a -c:v copy -c:a aac \
                "{output_path}" -loglevel warning''')
            print(f"   ✓ Dubbed video saved (single track): {output_path}")
        
    finally:
        if not args.keep_temp:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"\n   Cleaned up temp files")
    
    print("\n" + "=" * 50)
    print("Dubbing Complete!")
    print("=" * 50)

if __name__ == '__main__':
    main()
