#!/usr/bin/env python3
"""
Generate Multi-Language Subtitles using OpenAI Whisper (Local AI)
=================================================================
Transcribes video/audio and outputs subtitles in MULTIPLE languages.

Usage:
    python generate_subtitles.py input.mp4 --model medium --language ml --all_languages

Requirements:
    pip install openai-whisper torch

Features:
    - Generates original language subtitles (SRT/VTT)
    - Generates English translation subtitles
    - Generates Malayalam subtitles (for English videos)
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

# Language mapping for display and codes
LANG_MAP = {
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

# Best Whisper models for specific languages
LANGUAGE_MODELS = {
    'ml': 'medium',  # Malayalam needs at least medium for good accuracy
    'hi': 'medium',
    'ta': 'medium',
    'te': 'medium',
    'en': 'small',   # English works well with small
}

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

def save_subtitles(segments: list, base_output: Path, lang_suffix: str, output_format: str):
    """Save subtitles in requested formats"""
    if output_format in ['srt', 'both']:
        srt_path = Path(str(base_output) + f"{lang_suffix}.srt")
        generate_srt(segments, srt_path)
    
    if output_format in ['vtt', 'both']:
        vtt_path = Path(str(base_output) + f"{lang_suffix}.vtt")
        generate_vtt(segments, vtt_path)
    
    # Save full transcript as text
    txt_path = Path(str(base_output) + f"{lang_suffix}.txt")
    full_text = ' '.join([seg['text'].strip() for seg in segments if seg.get('text')])
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(full_text)
    print(f"   [OK] Transcript saved: {txt_path}")
    
    return {
        'srt': str(Path(str(base_output) + f"{lang_suffix}.srt")),
        'vtt': str(Path(str(base_output) + f"{lang_suffix}.vtt")),
        'txt': str(txt_path)
    }

def transcribe_audio(model, input_path: str, language: str = None, task: str = 'transcribe', device: str = 'cpu'):
    """Transcribe or translate audio using Whisper"""
    options = {
        'task': task,
        'verbose': False,
        'fp16': device == 'cuda'
    }
    
    if language and language.lower() != 'auto':
        options['language'] = language
    
    result = model.transcribe(str(input_path), **options)
    return result

def translate_to_malayalam(english_segments: list, model) -> list:
    """
    Translate English text to Malayalam using available methods.
    This is a placeholder - in production, use a proper translation API.
    For now, we keep the timing but note that translation needs external service.
    """
    # Note: Whisper can only translate TO English, not from English
    # For English -> Malayalam, you would need:
    # 1. Google Translate API
    # 2. Helsinki-NLP models (transformers)
    # 3. Other translation services
    
    print("   [!] Note: English->Malayalam translation requires external service")
    print("   [!] Returning English subtitles with Malayalam markers")
    
    translated_segments = []
    for seg in english_segments:
        translated_segments.append({
            'start': seg['start'],
            'end': seg['end'],
            'text': f"[ML] {seg['text']}"  # Placeholder - replace with actual translation
        })
    
    return translated_segments

def main():
    parser = argparse.ArgumentParser(description='Generate multi-language subtitles using Whisper AI')
    parser.add_argument('input_file', help='Path to video/audio file')
    parser.add_argument('--model', default='medium', choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model size (default: medium for better accuracy)')
    parser.add_argument('--language', default=None, 
                        help='Source language code (ml, en, hi, ta, te) or None for auto-detect')
    parser.add_argument('--output', default=None, help='Output file path (default: input_name.srt)')
    parser.add_argument('--format', default='both', choices=['srt', 'vtt', 'both'],
                        help='Output format (default: both)')
    parser.add_argument('--translate', action='store_true',
                        help='Generate English translation subtitles')
    parser.add_argument('--all_languages', action='store_true',
                        help='Generate subtitles in all supported languages (original + English + Malayalam)')
    
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
    print("Class360 AI Multi-Language Subtitle Generation")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Model: {args.model}")
    print(f"Generate All Languages: {args.all_languages}")
    print("=" * 60)
    
    # Load Whisper model
    print(f"\n[*] Loading Whisper model: {args.model}")
    print("   (This may take a moment on first run...)")
    
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"   Device: {device}")
    
    # Use at least medium model for non-English languages
    model_size = args.model
    if args.language and args.language in LANGUAGE_MODELS:
        recommended = LANGUAGE_MODELS[args.language]
        model_sizes = ['tiny', 'base', 'small', 'medium', 'large']
        if model_sizes.index(model_size) < model_sizes.index(recommended):
            print(f"   [!] Upgrading to {recommended} model for better {LANG_MAP.get(args.language, args.language)} accuracy")
            model_size = recommended
    
    model = whisper.load_model(model_size, device=device)
    print("   [OK] Model loaded")
    
    manifest = {
        'source_file': str(input_path),
        'model_used': model_size,
        'subtitles': {}
    }
    
    # =====================================================
    # STEP 1: Detect language and transcribe original
    # =====================================================
    print(f"\n[1/3] Transcribing original audio...")
    
    if args.language and args.language.lower() != 'auto':
        print(f"   Language: {LANG_MAP.get(args.language, args.language)}")
    else:
        print("   Language: Auto-detect")
    
    result_original = transcribe_audio(model, input_path, args.language, 'transcribe', device)
    detected_lang = result_original.get('language', 'unknown')
    print(f"   Detected: {LANG_MAP.get(detected_lang, detected_lang)}")
    
    segments_original = result_original['segments']
    print(f"   [OK] Generated {len(segments_original)} subtitle segments")
    
    manifest['source_language'] = detected_lang
    
    # Save original language subtitles
    print(f"\n[*] Saving original language subtitles ({detected_lang})...")
    lang_suffix = f"_{detected_lang}" if detected_lang != 'en' else ""
    manifest['subtitles']['original'] = save_subtitles(
        segments_original, base_output, lang_suffix, args.format
    )
    manifest['subtitles']['original']['language'] = detected_lang
    
    # =====================================================
    # STEP 2: Generate English translation (if not English)
    # =====================================================
    if (args.translate or args.all_languages) and detected_lang != 'en':
        print(f"\n[2/3] Translating to English...")
        
        result_english = transcribe_audio(model, input_path, args.language, 'translate', device)
        segments_english = result_english['segments']
        print(f"   [OK] Generated {len(segments_english)} English segments")
        
        # Save English translation
        print(f"\n[*] Saving English translation subtitles...")
        manifest['subtitles']['english'] = save_subtitles(
            segments_english, base_output, "_en", args.format
        )
        manifest['subtitles']['english']['language'] = 'en'
        
        # Print sample
        if segments_english:
            sample = segments_english[0]['text'][:100].strip()
            print(f"\n[*] English sample: \"{sample}...\"")
    else:
        print(f"\n[2/3] Source is English or translation not requested - skipping English translation")
        segments_english = segments_original
    
    # =====================================================
    # STEP 3: Generate Malayalam subtitles (for English videos)
    # =====================================================
    if args.all_languages and detected_lang == 'en':
        print(f"\n[3/3] Generating Malayalam subtitles for English video...")
        
        # For English -> Malayalam, we need external translation
        # Whisper can only translate TO English, not FROM English
        # This would require Google Translate API or similar
        
        try:
            # Try using transformers for translation if available
            from transformers import MarianMTModel, MarianTokenizer
            
            print("   Loading Helsinki-NLP translation model...")
            model_name = 'Helsinki-NLP/opus-mt-en-ml'
            
            try:
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                translation_model = MarianMTModel.from_pretrained(model_name)
                
                print("   [OK] Translation model loaded")
                
                segments_malayalam = []
                for i, seg in enumerate(segments_english):
                    text = seg['text'].strip()
                    if text:
                        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
                        translated = translation_model.generate(**inputs)
                        ml_text = tokenizer.decode(translated[0], skip_special_tokens=True)
                        segments_malayalam.append({
                            'start': seg['start'],
                            'end': seg['end'],
                            'text': ml_text
                        })
                    
                    if (i + 1) % 10 == 0:
                        print(f"   Translated {i + 1}/{len(segments_english)} segments...", end='\r')
                
                print(f"\n   [OK] Translated {len(segments_malayalam)} segments to Malayalam")
                
                # Save Malayalam subtitles
                manifest['subtitles']['malayalam'] = save_subtitles(
                    segments_malayalam, base_output, "_ml", args.format
                )
                manifest['subtitles']['malayalam']['language'] = 'ml'
                
            except Exception as e:
                print(f"   [!] Helsinki-NLP model not available: {e}")
                print("   [!] To enable English->Malayalam translation, run:")
                print("       pip install transformers sentencepiece")
                print("   [!] Skipping Malayalam subtitle generation")
                
        except ImportError:
            print("   [!] transformers library not installed")
            print("   [!] To enable English->Malayalam translation, run:")
            print("       pip install transformers sentencepiece")
            print("   [!] Skipping Malayalam subtitle generation")
    else:
        print(f"\n[3/3] Malayalam generation not applicable - skipping")
    
    # Save manifest
    manifest_path = Path(str(base_output) + "_subtitles_manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"\n[*] Manifest saved: {manifest_path}")
    
    print("\n" + "=" * 60)
    print("[DONE] Subtitle generation complete!")
    print("Generated subtitles:")
    for lang_key, data in manifest['subtitles'].items():
        print(f"   - {lang_key}: {data.get('language', 'unknown')}")
    print("=" * 60)

if __name__ == '__main__':
    main()
