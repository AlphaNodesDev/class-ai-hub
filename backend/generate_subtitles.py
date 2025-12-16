#!/usr/bin/env python3
"""
Generate Dual-Language Subtitles using OpenAI Whisper (Local AI)
================================================================
Transcribes video/audio and outputs BOTH original language AND translated subtitles.

Usage:
    python generate_subtitles.py input.mp4 --model small --language ml --translate

Requirements:
    pip install openai-whisper torch

Features:
    - Generates original language subtitles (SRT/VTT)
    - Optionally generates English translation subtitles
    - Auto-detects language if not specified
    - Supports Malayalam, Hindi, Tamil, Telugu, English and more
"""

import argparse
import whisper
from pathlib import Path
import sys
import warnings
import json

# Suppress some warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

def format_timestamp(seconds: float) -> str:
    """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def format_vtt_timestamp(seconds: float) -> str:
    """Convert seconds to VTT timestamp format (HH:MM:SS.mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def generate_srt(segments: list, output_path: Path):
    """Generate SRT subtitle file from Whisper segments"""
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start = format_timestamp(segment['start'])
            end = format_timestamp(segment['end'])
            text = segment['text'].strip()
            f.write(f"{i}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{text}\n\n")
    print(f"   [OK] SRT saved: {output_path}")

def generate_vtt(segments: list, output_path: Path):
    """Generate VTT subtitle file from Whisper segments"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("WEBVTT\n\n")
        for i, segment in enumerate(segments, 1):
            start = format_vtt_timestamp(segment['start'])
            end = format_vtt_timestamp(segment['end'])
            text = segment['text'].strip()
            f.write(f"{i}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{text}\n\n")
    print(f"   [OK] VTT saved: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Generate dual-language subtitles using Whisper AI')
    parser.add_argument('input_file', help='Path to video/audio file')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size (default: small)')
    parser.add_argument('--language', default=None, 
                        help='Source language code (ml, en, hi, ta, te) or None for auto-detect')
    parser.add_argument('--output', default=None, help='Output file path (default: input_name.srt)')
    parser.add_argument('--format', default='both', choices=['srt', 'vtt', 'both'],
                        help='Output format (default: both)')
    parser.add_argument('--translate', action='store_true',
                        help='Also generate English translation subtitles')
    parser.add_argument('--target_lang', default='en',
                        help='Target language for translation (default: en)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    # Determine output paths
    if args.output:
        base_output = Path(args.output).with_suffix('')
    else:
        base_output = input_path.with_suffix('')
    
    print("=" * 60)
    print("Class360 AI Dual-Language Subtitle Generation")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Model: {args.model}")
    print(f"Generate Translation: {args.translate}")
    print("=" * 60)
    
    print(f"\n[*] Loading Whisper model: {args.model}")
    print("   (This may take a moment on first run...)")
    
    # Load model with FP16 if CUDA available
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"   Device: {device}")
    
    model = whisper.load_model(args.model, device=device)
    print("   [OK] Model loaded")
    
    # Language mapping for display
    lang_map = {
        'ml': 'Malayalam',
        'en': 'English', 
        'hi': 'Hindi',
        'ta': 'Tamil',
        'te': 'Telugu',
        'malayalam': 'Malayalam',
        'english': 'English',
        'hindi': 'Hindi',
        'tamil': 'Tamil',
        'telugu': 'Telugu'
    }
    
    # =====================================================
    # STEP 1: Generate Original Language Subtitles
    # =====================================================
    print(f"\n[1/2] Transcribing original audio: {input_path.name}")
    
    transcribe_options = {
        'task': 'transcribe',
        'verbose': False,
        'fp16': device == 'cuda'
    }
    
    if args.language and args.language.lower() != 'auto':
        transcribe_options['language'] = args.language
        print(f"   Language: {lang_map.get(args.language, args.language)}")
    else:
        print("   Language: Auto-detect")
    
    # Transcribe in original language
    result_original = model.transcribe(str(input_path), **transcribe_options)
    
    detected_lang = result_original.get('language', 'unknown')
    print(f"   Detected: {lang_map.get(detected_lang, detected_lang)}")
    
    segments_original = result_original['segments']
    print(f"   [OK] Generated {len(segments_original)} subtitle segments")
    
    # Save original language subtitles
    print(f"\n[*] Saving original language subtitles...")
    
    # Determine suffix based on detected language
    lang_suffix = f"_{detected_lang}" if detected_lang != 'en' else ""
    
    if args.format in ['srt', 'both']:
        srt_path = Path(str(base_output) + f"{lang_suffix}.srt")
        generate_srt(segments_original, srt_path)
    
    if args.format in ['vtt', 'both']:
        vtt_path = Path(str(base_output) + f"{lang_suffix}.vtt")
        generate_vtt(segments_original, vtt_path)
    
    # Save full transcript
    txt_path = Path(str(base_output) + f"{lang_suffix}.txt")
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(result_original['text'])
    print(f"   [OK] Transcript saved: {txt_path}")
    
    # =====================================================
    # STEP 2: Generate Translated Subtitles (if requested)
    # =====================================================
    if args.translate and detected_lang != 'en':
        print(f"\n[2/2] Translating to English...")
        
        translate_options = {
            'task': 'translate',  # This translates to English
            'verbose': False,
            'fp16': device == 'cuda'
        }
        
        if args.language and args.language.lower() != 'auto':
            translate_options['language'] = args.language
        
        result_translated = model.transcribe(str(input_path), **translate_options)
        
        segments_translated = result_translated['segments']
        print(f"   [OK] Generated {len(segments_translated)} translated segments")
        
        # Save translated subtitles
        print(f"\n[*] Saving English translation subtitles...")
        
        if args.format in ['srt', 'both']:
            srt_en_path = Path(str(base_output) + "_en.srt")
            generate_srt(segments_translated, srt_en_path)
        
        if args.format in ['vtt', 'both']:
            vtt_en_path = Path(str(base_output) + "_en.vtt")
            generate_vtt(segments_translated, vtt_en_path)
        
        # Save translated transcript
        txt_en_path = Path(str(base_output) + "_en.txt")
        with open(txt_en_path, 'w', encoding='utf-8') as f:
            f.write(result_translated['text'])
        print(f"   [OK] English transcript saved: {txt_en_path}")
        
        # Print sample of translated text
        print(f"\n[*] Translation sample (first 200 chars):")
        sample = result_translated['text'][:200].strip()
        print(f'   "{sample}..."')
    elif detected_lang == 'en':
        print(f"\n[2/2] Source is English - skipping translation")
    else:
        print(f"\n[2/2] Translation not requested - skipping")
    
    # Create a manifest JSON with all generated files
    manifest = {
        'source_language': detected_lang,
        'original_subtitles': {
            'srt': str(Path(str(base_output) + f"{lang_suffix}.srt")),
            'vtt': str(Path(str(base_output) + f"{lang_suffix}.vtt")),
            'txt': str(txt_path)
        }
    }
    
    if args.translate and detected_lang != 'en':
        manifest['translated_subtitles'] = {
            'srt': str(Path(str(base_output) + "_en.srt")),
            'vtt': str(Path(str(base_output) + "_en.vtt")),
            'txt': str(Path(str(base_output) + "_en.txt"))
        }
    
    manifest_path = Path(str(base_output) + "_subtitles_manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    
    print("\n" + "=" * 60)
    print("[DONE] Subtitle generation complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
