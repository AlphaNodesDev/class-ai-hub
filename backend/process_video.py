#!/usr/bin/env python3
"""
Class360 Video Processing Pipeline
===================================
Main entry point for processing classroom videos.

Usage:
    python process_video.py input.mp4 [options]

Options:
    --model         Whisper model (tiny|base|small|medium|large) [default: small]
    --src_lang      Source language (ml|en|auto) [default: auto]
    --target_lang   Target language for dubbing [default: en]
    --generate_srt  Generate subtitles [default: true]
    --generate_dub  Generate English dub [default: true]
    --generate_ocr  Extract board notes [default: true]
    --start_trim    Seconds to trim from start [default: 180]
    --end_trim      Seconds to trim from end [default: 180]
    --output_dir    Output directory [default: ./output]

Requirements:
    pip install openai-whisper gtts opencv-python pytesseract pillow ffmpeg-python

Example:
    python process_video.py lecture.mp4 --model small --src_lang ml --generate_dub true
"""

import argparse
import os
import sys
import json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Class360 Video Processing Pipeline')
    parser.add_argument('input_video', help='Path to input video file')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size')
    parser.add_argument('--src_lang', default='auto', help='Source language (ml, en, or auto)')
    parser.add_argument('--target_lang', default='en', help='Target language for dubbing')
    parser.add_argument('--generate_srt', default='true', help='Generate subtitles')
    parser.add_argument('--generate_dub', default='true', help='Generate English dub')
    parser.add_argument('--generate_ocr', default='true', help='Extract board notes via OCR')
    parser.add_argument('--start_trim', type=int, default=180, help='Seconds to trim from start')
    parser.add_argument('--end_trim', type=int, default=180, help='Seconds to trim from end')
    parser.add_argument('--output_dir', default='./output', help='Output directory')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    input_path = Path(args.input_video)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input_video}")
        sys.exit(1)
    
    base_name = input_path.stem
    
    print("=" * 60)
    print("Class360 Video Processing Pipeline")
    print("=" * 60)
    print(f"Input: {args.input_video}")
    print(f"Model: {args.model}")
    print(f"Source Language: {args.src_lang}")
    print(f"Output Directory: {output_dir}")
    print("=" * 60)
    
    results = {
        'input': args.input_video,
        'outputs': {}
    }
    
    # Step 1: Trim video
    print("\n[1/4] Trimming video...")
    trimmed_path = output_dir / f"{base_name}_trimmed.mp4"
    # Run trim_video.py
    os.system(f'python trim_video.py "{args.input_video}" --start_trim {args.start_trim} --end_trim {args.end_trim} --output "{trimmed_path}"')
    if trimmed_path.exists():
        results['outputs']['trimmed_video'] = str(trimmed_path)
        print(f"   ✓ Trimmed video saved: {trimmed_path}")
    else:
        trimmed_path = input_path  # Use original if trimming failed
        print("   ⚠ Trimming skipped, using original")
    
    # Step 2: Generate subtitles
    if args.generate_srt.lower() == 'true':
        print("\n[2/4] Generating subtitles...")
        srt_path = output_dir / f"{base_name}.srt"
        lang_flag = f'--language {args.src_lang}' if args.src_lang != 'auto' else ''
        os.system(f'python generate_subtitles.py "{trimmed_path}" --model {args.model} {lang_flag} --output "{srt_path}"')
        if srt_path.exists():
            results['outputs']['subtitles'] = str(srt_path)
            print(f"   ✓ Subtitles saved: {srt_path}")
    else:
        print("\n[2/4] Skipping subtitle generation")
    
    # Step 3: Generate English dub
    if args.generate_dub.lower() == 'true':
        print("\n[3/4] Generating English dub...")
        dub_path = output_dir / f"{base_name}_dub_{args.target_lang}.mp4"
        os.system(f'python dub_to_english.py "{trimmed_path}" --model {args.model} --src_lang {args.src_lang} --output "{dub_path}"')
        if dub_path.exists():
            results['outputs']['dubbed_video'] = str(dub_path)
            print(f"   ✓ Dubbed video saved: {dub_path}")
    else:
        print("\n[3/4] Skipping dubbing")
    
    # Step 4: Extract OCR notes
    if args.generate_ocr.lower() == 'true':
        print("\n[4/4] Extracting board notes (OCR)...")
        notes_path = output_dir / f"{base_name}_notes.md"
        os.system(f'python extract_board_notes.py "{trimmed_path}" --output "{notes_path}"')
        if notes_path.exists():
            results['outputs']['notes'] = str(notes_path)
            print(f"   ✓ Notes saved: {notes_path}")
    else:
        print("\n[4/4] Skipping OCR extraction")
    
    # Save results manifest
    manifest_path = output_dir / f"{base_name}_manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print("\n" + "=" * 60)
    print("Processing Complete!")
    print(f"Manifest saved: {manifest_path}")
    print("=" * 60)

if __name__ == '__main__':
    main()
