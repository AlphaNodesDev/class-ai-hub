#!/usr/bin/env python3
"""
Generate Multi-Language Subtitles using OpenAI Whisper (Local AI)
=================================================================
Auto-detects video language and generates subtitles in ALL languages.

Features:
    - AUTO language detection (no need to specify)
    - Generates subtitles in ALL supported languages automatically
    - Original language + English + Malayalam + Hindi + Tamil
    - Supports mixed-language videos
    - Outputs SRT, VTT, and TXT formats

Usage:
    python generate_subtitles.py input.mp4 --model medium --all_languages

Requirements:
    pip install openai-whisper torch transformers sentencepiece
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

# Supported languages
SUPPORTED_LANGUAGES = ['en', 'ml', 'hi', 'ta']
LANGUAGE_NAMES = {
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

# Translation models cache
_translation_models = {}

# Best Whisper models for specific languages
LANGUAGE_MODELS = {
    'ml': 'medium',
    'hi': 'medium',
    'ta': 'medium',
    'te': 'medium',
    'en': 'small',
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
    srt_path = Path(str(base_output) + f"{lang_suffix}.srt")
    vtt_path = Path(str(base_output) + f"{lang_suffix}.vtt")
    txt_path = Path(str(base_output) + f"{lang_suffix}.txt")
    
    if output_format in ['srt', 'both']:
        generate_srt(segments, srt_path)
    
    if output_format in ['vtt', 'both']:
        generate_vtt(segments, vtt_path)
    
    # Save full transcript as text
    full_text = ' '.join([seg['text'].strip() for seg in segments if seg.get('text')])
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(full_text)
    print(f"   [OK] Transcript saved: {txt_path}")
    
    # Return relative web paths (for frontend access)
    return {
        'srt': f"/processed/{srt_path.name}",
        'vtt': f"/processed/{vtt_path.name}",
        'txt': f"/processed/{txt_path.name}"
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

def get_translation_model(src_lang, tgt_lang):
    """Get or create translation model for language pair"""
    global _translation_models
    
    key = f"{src_lang}_to_{tgt_lang}"
    if key not in _translation_models:
        try:
            from transformers import MarianMTModel, MarianTokenizer
            
            # Map language codes to Helsinki-NLP model names
            # Use specific models for each language for better accuracy
            lang_map = {
                ('en', 'ml'): [
                    'Helsinki-NLP/opus-mt-en-ml',  # Direct English to Malayalam
                    'Helsinki-NLP/opus-mt-en-dra',  # Fallback: Dravidian family
                ],
                ('en', 'hi'): [
                    'Helsinki-NLP/opus-mt-en-hi',  # Direct English to Hindi
                ], 
                ('en', 'ta'): [
                    'Helsinki-NLP/opus-mt-en-ta',  # Direct English to Tamil
                    'Helsinki-NLP/opus-mt-en-mul',  # Fallback: Multilingual
                ],
            }
            
            model_names = lang_map.get((src_lang, tgt_lang), [])
            model_loaded = False
            
            for model_name in model_names:
                try:
                    print(f"   Loading translation: {src_lang} -> {tgt_lang} ({model_name})...")
                    tokenizer = MarianTokenizer.from_pretrained(model_name)
                    model = MarianMTModel.from_pretrained(model_name)
                    _translation_models[key] = {'tokenizer': tokenizer, 'model': model, 'target_lang': tgt_lang}
                    print(f"   [OK] Translation model loaded: {model_name}")
                    model_loaded = True
                    break
                except Exception as e:
                    print(f"   [!] Model {model_name} failed: {e}, trying next...")
                    continue
            
            if not model_loaded:
                print(f"   [!] No translation model available for {src_lang} -> {tgt_lang}")
                _translation_models[key] = None
                
        except Exception as e:
            print(f"   [!] Translation model error: {e}")
            _translation_models[key] = None
    
    return _translation_models.get(key)

def translate_segments_to_language(segments, src_lang, tgt_lang):
    """Translate subtitle segments to target language"""
    
    trans_model = get_translation_model(src_lang, tgt_lang)
    if not trans_model:
        print(f"   [!] No translation model for {src_lang} -> {tgt_lang}")
        return None
    
    translated = []
    total = len(segments)
    
    for i, seg in enumerate(segments):
        text = seg.get('text', '').strip()
        if text:
            try:
                inputs = trans_model['tokenizer'](text, return_tensors="pt", padding=True, truncation=True, max_length=512)
                output = trans_model['model'].generate(**inputs)
                translated_text = trans_model['tokenizer'].decode(output[0], skip_special_tokens=True)
                translated.append({
                    'start': seg['start'],
                    'end': seg['end'],
                    'text': translated_text
                })
            except Exception as e:
                translated.append(seg)
        else:
            translated.append(seg)
        
        if (i + 1) % 20 == 0 or i == total - 1:
            print(f"   Translated {i + 1}/{total} segments...", end='\r')
    
    print(f"\n   [OK] Translated {len(translated)} segments to {LANGUAGE_NAMES.get(tgt_lang, tgt_lang)}")
    return translated

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
    print(f"\n[1/3] Transcribing & detecting language...")
    
    result_original = transcribe_audio(model, input_path, args.language, 'transcribe', device)
    detected_lang = result_original.get('language', 'en')
    segments_original = result_original['segments']
    
    print(f"   Detected: {LANGUAGE_NAMES.get(detected_lang, detected_lang)}")
    print(f"   [OK] Generated {len(segments_original)} subtitle segments")
    
    manifest['source_language'] = detected_lang
    
    # Save original language subtitles
    print(f"\n[*] Saving original language subtitles ({detected_lang})...")
    lang_suffix = "" if detected_lang == 'en' else f"_{detected_lang}"
    manifest['subtitles']['original'] = save_subtitles(
        segments_original, base_output, lang_suffix, args.format
    )
    manifest['subtitles']['original']['language'] = detected_lang
    
    # Determine which languages to generate
    if args.all_languages:
        target_languages = [lang for lang in SUPPORTED_LANGUAGES if lang != detected_lang]
    else:
        target_languages = []
        if args.translate and detected_lang != 'en':
            target_languages.append('en')
    
    print(f"\n   Will generate subtitles for: {', '.join([LANGUAGE_NAMES.get(l, l) for l in target_languages])}")
    
    # =====================================================
    # STEP 2: Get English translation if source is not English
    # =====================================================
    segments_english = None
    if detected_lang != 'en' and ('en' in target_languages or args.all_languages):
        print(f"\n[2/3] Translating to English...")
        
        result_english = transcribe_audio(model, input_path, args.language, 'translate', device)
        segments_english = result_english['segments']
        print(f"   [OK] Generated {len(segments_english)} English segments")
        
        # Save English translation
        print(f"\n[*] Saving English subtitles...")
        manifest['subtitles']['english'] = save_subtitles(
            segments_english, base_output, "_en", args.format
        )
        manifest['subtitles']['english']['language'] = 'en'
    elif detected_lang == 'en':
        segments_english = segments_original
        print(f"\n[2/3] Source is English - using as base for translations")
    else:
        print(f"\n[2/3] English translation not requested - skipping")
    
    # =====================================================
    # STEP 3: Generate other language subtitles
    # =====================================================
    print(f"\n[3/3] Generating other language subtitles...")
    
    if args.all_languages and segments_english:
        # Generate subtitles for each target language
        for target_lang in target_languages:
            if target_lang == 'en':
                continue  # Already handled above
            
            lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
            print(f"\n[*] Generating {lang_name} subtitles...")
            
            # Translate from English to target language
            translated_segments = translate_segments_to_language(segments_english, 'en', target_lang)
            
            if translated_segments:
                manifest['subtitles'][target_lang] = save_subtitles(
                    translated_segments, base_output, f"_{target_lang}", args.format
                )
                manifest['subtitles'][target_lang]['language'] = target_lang
            else:
                print(f"   [!] Skipping {lang_name} - translation not available")
    else:
        print("   All-languages mode not enabled or no English base available")
    
    # Save manifest
    manifest_path = Path(str(base_output) + "_subtitles_manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"\n[*] Manifest saved: {manifest_path}")
    
    print("\n" + "=" * 60)
    print("[DONE] Multi-Language Subtitle Generation Complete!")
    print("Generated subtitles:")
    for lang_key, data in manifest['subtitles'].items():
        lang_code = data.get('language', 'unknown')
        lang_name = LANGUAGE_NAMES.get(lang_code, lang_code)
        print(f"   - {lang_name} ({lang_code})")
    print("=" * 60)

if __name__ == '__main__':
    main()
