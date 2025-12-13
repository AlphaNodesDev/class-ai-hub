#!/usr/bin/env python3
"""
Generate Subtitles using OpenAI Whisper (Local AI)
===================================================
Transcribes video/audio and outputs SRT/VTT subtitle files.
Whisper is a powerful local AI model that works with many languages.

Usage:
    python generate_subtitles.py input.mp4 --model small --language ml

Requirements:
    pip install openai-whisper torch

Supported Languages:
    - ml: Malayalam
    - en: English
    - hi: Hindi
    - ta: Tamil
    - te: Telugu
    - auto: Auto-detect

Models (trade-off between speed and accuracy):
    - tiny: Fastest, least accurate
    - base: Fast, basic accuracy
    - small: Good balance (recommended for most cases)
    - medium: Better accuracy, slower
    - large: Best accuracy, slowest (requires more VRAM)
"""

import argparse
import whisper
from pathlib import Path
import sys
import warnings

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
    print(f"   ✓ SRT saved: {output_path}")

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
    print(f"   ✓ VTT saved: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Generate subtitles using Whisper AI')
    parser.add_argument('input_file', help='Path to video/audio file')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size (default: small)')
    parser.add_argument('--language', default=None, 
                        help='Source language code (ml, en, hi, ta, te) or None for auto-detect')
    parser.add_argument('--output', default=None, help='Output file path (default: input_name.srt)')
    parser.add_argument('--format', default='both', choices=['srt', 'vtt', 'both'],
                        help='Output format (default: both)')
    parser.add_argument('--task', default='transcribe', choices=['transcribe', 'translate'],
                        help='Task: transcribe (keep original) or translate (to English)')
    
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
    print("Class360 AI Subtitle Generation (Whisper)")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Model: {args.model}")
    print(f"Task: {args.task}")
    print("=" * 60)
    
    print(f"\n📦 Loading Whisper model: {args.model}")
    print("   (This may take a moment on first run...)")
    
    # Load model with FP16 if CUDA available
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"   Device: {device}")
    
    model = whisper.load_model(args.model, device=device)
    print("   ✓ Model loaded")
    
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
    
    print(f"\n🎙️ Transcribing: {input_path.name}")
    
    transcribe_options = {
        'task': args.task,
        'verbose': False,
        'fp16': device == 'cuda'
    }
    
    if args.language and args.language.lower() != 'auto':
        transcribe_options['language'] = args.language
        print(f"   Language: {lang_map.get(args.language, args.language)}")
    else:
        print("   Language: Auto-detect")
    
    # Transcribe
    result = model.transcribe(str(input_path), **transcribe_options)
    
    detected_lang = result.get('language', 'unknown')
    print(f"   Detected: {lang_map.get(detected_lang, detected_lang)}")
    
    segments = result['segments']
    print(f"   ✓ Generated {len(segments)} subtitle segments")
    
    # Generate output files
    print(f"\n💾 Saving files...")
    
    if args.format in ['srt', 'both']:
        srt_path = base_output.with_suffix('.srt')
        generate_srt(segments, srt_path)
    
    if args.format in ['vtt', 'both']:
        vtt_path = base_output.with_suffix('.vtt')
        generate_vtt(segments, vtt_path)
    
    # Also save full transcript as text
    txt_path = base_output.with_suffix('.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(result['text'])
    print(f"   ✓ Transcript saved: {txt_path}")
    
    # Print sample of detected text
    print(f"\n📝 Sample (first 200 chars):")
    sample = result['text'][:200].strip()
    print(f"   \"{sample}...\"")
    
    print("\n" + "=" * 60)
    print("✅ Subtitle generation complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
