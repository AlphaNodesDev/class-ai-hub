#!/usr/bin/env python3
"""
AI Video Dubbing Pipeline - Auto Multi-Language with Consistent Voice
======================================================================
Auto-detects source language and generates dubs in ALL other languages.
Supports mixed-language videos (e.g., English + Malayalam mixed).

Features:
    - AUTO language detection (no need to specify source language)
    - Generates ALL target languages automatically
    - Mixed-language support (detects multiple languages)
    - Consistent voice per language using single TTS model
    - Uses Whisper for transcription, translation
    - Multiple TTS engines: Coqui TTS, MMS-TTS, gTTS
    - Separate video files for cross-browser audio switching

Usage:
    # Auto-detect and generate all language dubs
    python dub_video.py input.mp4 --model medium --all_dubs
    
    # Mixed language video (will detect both and convert all)
    python dub_video.py mixed_lecture.mp4 --model medium --all_dubs

Requirements:
    pip install openai-whisper TTS torch gtts pydub transformers scipy sentencepiece
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
import torch

warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

# Supported languages for dubbing
SUPPORTED_LANGUAGES = ['en', 'ml', 'hi', 'ta']
LANGUAGE_NAMES = {
    'en': 'English',
    'ml': 'Malayalam', 
    'hi': 'Hindi',
    'ta': 'Tamil'
}

# TTS Models cache - single instance per language for consistent voice
_tts_models = {}
_translation_models = {}

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
        cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
               '-of', 'default=noprint_wrappers=1:nokey=1', str(input_path)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        current_duration = float(result.stdout.strip())
        
        if current_duration <= 0 or target_duration <= 0:
            shutil.copy(input_path, output_path)
            return
        
        speed = current_duration / target_duration
        speed = max(0.5, min(2.5, speed))
        
        if speed > 2.0:
            filter_str = f'atempo={speed/2},atempo=2.0'
        else:
            filter_str = f'atempo={speed}'
        
        cmd = ['ffmpeg', '-y', '-i', str(input_path), '-filter:a', filter_str,
               '-vn', str(output_path)]
        subprocess.run(cmd, capture_output=True)
    except Exception as e:
        print(f"   [!] Speed adjust error: {e}")
        shutil.copy(input_path, output_path)

def get_tts_model_for_language(language):
    """Get or create a consistent TTS model for a language"""
    global _tts_models
    
    if language == 'en':
        if 'en_tts' not in _tts_models:
            # Try Coqui TTS for consistent English voice
            try:
                from TTS.api import TTS
                print("   Loading Coqui TTS for English (consistent voice)...")
                use_gpu = torch.cuda.is_available()
                # Use VITS model for consistent, natural voice
                _tts_models['en_tts'] = TTS('tts_models/en/ljspeech/vits', progress_bar=False, gpu=use_gpu)
                print("   [OK] Coqui VITS loaded for English")
            except Exception as e:
                print(f"   [!] Coqui TTS not available: {e}")
                _tts_models['en_tts'] = None
        return _tts_models.get('en_tts')
    
    elif language == 'ml':
        if 'ml_tts' not in _tts_models:
            try:
                from transformers import VitsModel, AutoTokenizer
                print("   Loading MMS-TTS Malayalam (consistent voice)...")
                model_name = "facebook/mms-tts-mal"
                _tts_models['ml_tokenizer'] = AutoTokenizer.from_pretrained(model_name)
                _tts_models['ml_tts'] = VitsModel.from_pretrained(model_name)
                print("   [OK] MMS-TTS Malayalam loaded")
            except Exception as e:
                print(f"   [!] MMS-TTS Malayalam error: {e}")
                _tts_models['ml_tts'] = None
        return _tts_models.get('ml_tts')
    
    elif language == 'hi':
        if 'hi_tts' not in _tts_models:
            try:
                from transformers import VitsModel, AutoTokenizer
                print("   Loading MMS-TTS Hindi (consistent voice)...")
                model_name = "facebook/mms-tts-hin"
                _tts_models['hi_tokenizer'] = AutoTokenizer.from_pretrained(model_name)
                _tts_models['hi_tts'] = VitsModel.from_pretrained(model_name)
                print("   [OK] MMS-TTS Hindi loaded")
            except Exception as e:
                print(f"   [!] MMS-TTS Hindi error: {e}")
                _tts_models['hi_tts'] = None
        return _tts_models.get('hi_tts')
    
    elif language == 'ta':
        if 'ta_tts' not in _tts_models:
            try:
                from transformers import VitsModel, AutoTokenizer
                print("   Loading MMS-TTS Tamil (consistent voice)...")
                model_name = "facebook/mms-tts-tam"
                _tts_models['ta_tokenizer'] = AutoTokenizer.from_pretrained(model_name)
                _tts_models['ta_tts'] = VitsModel.from_pretrained(model_name)
                print("   [OK] MMS-TTS Tamil loaded")
            except Exception as e:
                print(f"   [!] MMS-TTS Tamil error: {e}")
                _tts_models['ta_tts'] = None
        return _tts_models.get('ta_tts')
    
    return None

def generate_tts_with_model(text, output_path, language, model=None):
    """Generate TTS using the cached model for consistent voice"""
    global _tts_models
    
    if not text or len(text.strip()) < 2:
        return False
    
    try:
        if language == 'en':
            if model:
                model.tts_to_file(text=text, file_path=str(output_path))
                return True
            # Fallback to gTTS
            from gtts import gTTS
            tts = gTTS(text=text, lang='en', slow=False)
            tts.save(str(output_path))
            return True
        
        elif language in ['ml', 'hi', 'ta']:
            tokenizer_key = f'{language}_tokenizer'
            if model and tokenizer_key in _tts_models:
                tokenizer = _tts_models[tokenizer_key]
                inputs = tokenizer(text, return_tensors="pt")
                with torch.no_grad():
                    output = model(**inputs).waveform
                import scipy.io.wavfile as wavfile
                waveform = output.squeeze().cpu().numpy()
                wavfile.write(str(output_path), rate=model.config.sampling_rate, data=waveform)
                return True
            # Fallback to gTTS
            from gtts import gTTS
            lang_code = {'ml': 'ml', 'hi': 'hi', 'ta': 'ta'}[language]
            tts = gTTS(text=text, lang=lang_code, slow=False)
            tts.save(str(output_path))
            return True
        
        else:
            # Generic gTTS fallback
            from gtts import gTTS
            tts = gTTS(text=text, lang=language, slow=False)
            tts.save(str(output_path))
            return True
            
    except Exception as e:
        print(f"   [!] TTS error for {language}: {e}")
        return False

def get_translation_model(src_lang, tgt_lang):
    """Get or create translation model"""
    global _translation_models
    
    key = f"{src_lang}_to_{tgt_lang}"
    if key not in _translation_models:
        try:
            from transformers import MarianMTModel, MarianTokenizer
            
            # Map language codes to Helsinki-NLP model names
            lang_map = {
                ('en', 'ml'): 'Helsinki-NLP/opus-mt-en-ml',
                ('en', 'hi'): 'Helsinki-NLP/opus-mt-en-hi',
                ('en', 'ta'): 'Helsinki-NLP/opus-mt-en-ta',
                ('ml', 'en'): None,  # Use Whisper translate
                ('hi', 'en'): None,  # Use Whisper translate
                ('ta', 'en'): None,  # Use Whisper translate
            }
            
            model_name = lang_map.get((src_lang, tgt_lang))
            if model_name:
                print(f"   Loading translation model: {src_lang} -> {tgt_lang}...")
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                model = MarianMTModel.from_pretrained(model_name)
                _translation_models[key] = {'tokenizer': tokenizer, 'model': model}
                print(f"   [OK] Translation model loaded")
            else:
                _translation_models[key] = None
                
        except Exception as e:
            print(f"   [!] Translation model error: {e}")
            _translation_models[key] = None
    
    return _translation_models.get(key)

def translate_segments(segments, src_lang, tgt_lang, whisper_model=None, audio_path=None):
    """Translate segments from source to target language"""
    
    # For X -> English, use Whisper's translate feature
    if tgt_lang == 'en' and src_lang != 'en':
        if whisper_model and audio_path:
            print(f"   Using Whisper to translate {src_lang} -> en...")
            result = whisper_model.transcribe(str(audio_path), task='translate', verbose=False)
            return result['segments']
        return segments
    
    # For English -> X, use translation models
    if src_lang == 'en' and tgt_lang != 'en':
        trans_model = get_translation_model('en', tgt_lang)
        if trans_model:
            translated = []
            for seg in segments:
                text = seg['text'].strip()
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
                    except:
                        translated.append(seg)
                else:
                    translated.append(seg)
            return translated
    
    return segments

def merge_with_timing(segments, output_path, total_duration, temp_dir):
    """Merge TTS segments with proper timing using pydub"""
    try:
        from pydub import AudioSegment
        
        base = AudioSegment.silent(duration=int(total_duration * 1000))
        
        for seg in segments:
            if not Path(seg['tts_file']).exists():
                continue
            
            try:
                audio = AudioSegment.from_file(seg['tts_file'])
                start_ms = int(seg['start'] * 1000)
                base = base.overlay(audio, position=start_ms)
            except Exception as e:
                continue
        
        base.export(str(output_path), format='wav')
        return True
    except ImportError:
        print("   [!] pydub not available, using ffmpeg fallback")
        return merge_with_ffmpeg(segments, output_path, total_duration, temp_dir)
    except Exception as e:
        print(f"   [!] Merge error: {e}")
        return False

def merge_with_ffmpeg(segments, output_path, total_duration, temp_dir):
    """Fallback merge using ffmpeg"""
    try:
        concat_file = temp_dir / "concat.txt"
        with open(concat_file, 'w') as f:
            for seg in segments:
                if Path(seg['tts_file']).exists():
                    f.write(f"file '{seg['tts_file']}'\n")
        
        temp_concat = temp_dir / "concat.wav"
        cmd = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat_file),
               '-c', 'copy', str(temp_concat)]
        subprocess.run(cmd, capture_output=True)
        
        if temp_concat.exists():
            cmd = ['ffmpeg', '-y', '-i', str(temp_concat),
                   '-af', f'apad=pad_dur={total_duration}', '-t', str(total_duration),
                   '-ar', '44100', '-ac', '2', str(output_path)]
            subprocess.run(cmd, capture_output=True)
        
        return output_path.exists()
    except Exception as e:
        print(f"   [!] FFmpeg merge error: {e}")
        return False

def create_dub_track(segments, target_lang, temp_dir, total_duration):
    """Create a dubbed audio track for a target language using consistent voice"""
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang.upper())
    print(f"\n[*] Generating {lang_name} dubbed audio track...")
    
    # Get the consistent TTS model for this language
    tts_model = get_tts_model_for_language(target_lang)
    
    tts_segments = []
    for i, seg in enumerate(segments):
        text = seg.get('text', '')
        if not text or len(text.strip()) < 3:
            continue
        
        # Clean the text
        text = clean_translation_text(text)
        if not text:
            continue
        
        tts_raw = temp_dir / f"tts_{target_lang}_{i:04d}_raw.wav"
        tts_adj = temp_dir / f"tts_{target_lang}_{i:04d}.wav"
        
        success = generate_tts_with_model(text, tts_raw, target_lang, tts_model)
        
        if success and tts_raw.exists():
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
    
    print(f"\n   [OK] Generated {len(tts_segments)} TTS clips for {lang_name}")
    
    # Merge audio
    merged_audio = temp_dir / f"merged_{target_lang}.wav"
    if tts_segments:
        merge_with_timing(tts_segments, merged_audio, total_duration, temp_dir)
    else:
        # Create silent track
        cmd = ['ffmpeg', '-y', '-f', 'lavfi', '-i', 
               f'anullsrc=r=44100:cl=stereo', '-t', str(total_duration),
               str(merged_audio)]
        subprocess.run(cmd, capture_output=True)
    
    return merged_audio if merged_audio.exists() else None

def detect_mixed_languages(result):
    """Detect if video contains multiple languages (mixed content)"""
    segments = result.get('segments', [])
    detected_lang = result.get('language', 'en')
    
    # Whisper provides per-segment language detection in some modes
    # For now, we use the primary detected language
    # In production, you could analyze character sets or use language detection per segment
    
    languages = set()
    languages.add(detected_lang)
    
    # Simple heuristic: check for non-ASCII characters indicating Indian languages
    for seg in segments:
        text = seg.get('text', '')
        # Malayalam Unicode range: U+0D00 to U+0D7F
        if any('\u0D00' <= c <= '\u0D7F' for c in text):
            languages.add('ml')
        # Hindi/Devanagari Unicode range: U+0900 to U+097F
        if any('\u0900' <= c <= '\u097F' for c in text):
            languages.add('hi')
        # Tamil Unicode range: U+0B80 to U+0BFF
        if any('\u0B80' <= c <= '\u0BFF' for c in text):
            languages.add('ta')
    
    return list(languages)

def create_multi_audio_video(input_video, audio_tracks, output_path):
    """Create video with multiple embedded audio tracks"""
    print("\n[*] Creating multi-track video...")
    
    # Build ffmpeg command with multiple audio inputs
    cmd = ['ffmpeg', '-y', '-i', str(input_video)]
    
    # Add audio inputs
    for track in audio_tracks:
        cmd.extend(['-i', str(track['path'])])
    
    # Map video and all audio tracks
    cmd.extend(['-map', '0:v'])
    
    for i, track in enumerate(audio_tracks):
        cmd.extend(['-map', f'{i+1}:a'])
    
    # Set codecs
    cmd.extend(['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k'])
    
    # Add metadata for each audio track
    for i, track in enumerate(audio_tracks):
        cmd.extend([f'-metadata:s:a:{i}', f"title={track['name']}"])
        cmd.extend([f'-metadata:s:a:{i}', f"language={track['lang']}"])
    
    # Set first track as default
    cmd.extend(['-disposition:a:0', 'default'])
    
    cmd.append(str(output_path))
    
    result = subprocess.run(cmd, capture_output=True)
    
    if result.returncode == 0 and output_path.exists():
        print(f"   [OK] Multi-track video saved: {output_path}")
        return True
    else:
        print(f"   [!] Multi-track failed, error: {result.stderr.decode()[:200]}")
        return False

def main():
    parser = argparse.ArgumentParser(description='AI Video Dubbing - Auto Multi-Language')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--model', default='medium', 
                        choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model (medium/large recommended for accuracy)')
    parser.add_argument('--src_lang', default='auto', help='Source language (auto for auto-detect)')
    parser.add_argument('--target_langs', default='', help='Target languages comma-separated (empty = all)')
    parser.add_argument('--output', default=None, help='Output video path')
    parser.add_argument('--keep_temp', action='store_true', help='Keep temporary files')
    parser.add_argument('--all_dubs', action='store_true', help='Generate dubs for ALL supported languages')
    parser.add_argument('--embed_tracks', action='store_true', help='Embed all audio tracks in single video')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(f"{input_path.stem}_dubbed")
    
    print("=" * 60)
    print("Class360 AI Video Dubbing - Auto Multi-Language")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Whisper Model: {args.model}")
    print(f"Source Language: {args.src_lang} (will auto-detect)")
    print(f"All Languages Mode: {args.all_dubs}")
    print("=" * 60)
    
    temp_dir = Path(tempfile.mkdtemp(prefix='class360_dub_'))
    print(f"Temp directory: {temp_dir}")
    
    audio_tracks = []
    
    try:
        # Step 1: Extract audio
        print("\n[1/6] Extracting audio...")
        audio_path = temp_dir / "audio.wav"
        if not extract_audio(input_path, audio_path):
            print("Error: Failed to extract audio")
            sys.exit(1)
        print("   [OK] Audio extracted")
        
        video_duration = get_video_duration(input_path)
        print(f"   Video duration: {video_duration:.1f}s")
        
        # Step 2: Load Whisper model
        print("\n[2/6] Loading Whisper model...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"   Device: {device}")
        
        whisper_model = whisper.load_model(args.model, device=device)
        print("   [OK] Model loaded")
        
        # Step 3: Transcribe and AUTO-DETECT language
        print("\n[3/6] Transcribing & detecting language...")
        transcribe_options = {
            'task': 'transcribe',
            'verbose': False,
            'fp16': device == 'cuda'
        }
        
        # Only set language if explicitly provided (not auto)
        if args.src_lang and args.src_lang != 'auto':
            transcribe_options['language'] = args.src_lang
        
        result_original = whisper_model.transcribe(str(audio_path), **transcribe_options)
        detected_lang = result_original.get('language', 'en')
        segments_original = result_original['segments']
        
        # Check for mixed languages
        source_languages = detect_mixed_languages(result_original)
        
        print(f"   Primary language: {LANGUAGE_NAMES.get(detected_lang, detected_lang)}")
        if len(source_languages) > 1:
            print(f"   Mixed languages detected: {', '.join([LANGUAGE_NAMES.get(l, l) for l in source_languages])}")
        print(f"   [OK] Transcribed {len(segments_original)} segments")
        
        # Determine target languages - ALL except source language(s)
        if args.all_dubs or not args.target_langs:
            target_langs = [lang for lang in SUPPORTED_LANGUAGES if lang not in source_languages]
        else:
            target_langs = [l.strip() for l in args.target_langs.split(',') if l.strip()]
        
        print(f"\n   Target languages for dubbing: {', '.join([LANGUAGE_NAMES.get(l, l) for l in target_langs])}")
        
        # Original audio track
        original_audio = temp_dir / "original_audio.wav"
        shutil.copy(audio_path, original_audio)
        audio_tracks.append({
            'path': original_audio,
            'name': f'Original ({LANGUAGE_NAMES.get(detected_lang, detected_lang)})',
            'lang': detected_lang
        })
        
        # Step 4: Generate dubs for each target language
        print("\n[4/6] Generating multi-language dubs...")
        
        # First, get English translation if source is not English (needed for other translations)
        segments_english = None
        if detected_lang != 'en':
            print("\n[*] Getting English translation (base for other languages)...")
            result_english = whisper_model.transcribe(str(audio_path), task='translate', 
                                                      verbose=False, fp16=(device == 'cuda'))
            segments_english = result_english['segments']
            for seg in segments_english:
                seg['text'] = clean_translation_text(seg['text'])
            print(f"   [OK] Translated {len(segments_english)} segments to English")
        else:
            segments_english = segments_original
        
        # Generate English dub if needed
        if 'en' in target_langs:
            print("\n[*] Creating English dub...")
            en_audio = create_dub_track(segments_english, 'en', temp_dir, video_duration)
            if en_audio:
                audio_tracks.append({
                    'path': en_audio,
                    'name': 'English (AI Dubbed)',
                    'lang': 'en'
                })
        
        # Generate other language dubs (Malayalam, Hindi, Tamil)
        for target_lang in target_langs:
            if target_lang == 'en':
                continue  # Already handled above
            
            lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
            print(f"\n[*] Creating {lang_name} dub...")
            
            # Translate from English to target language
            if detected_lang == target_lang:
                # Source is same as target, skip
                continue
            
            # Use English as intermediate if source is not English
            base_segments = segments_english if detected_lang != 'en' else segments_original
            
            # Translate to target language
            translated_segments = translate_segments(
                base_segments, 'en', target_lang, whisper_model, audio_path
            )
            
            # Create dub track
            dub_audio = create_dub_track(translated_segments, target_lang, temp_dir, video_duration)
            if dub_audio:
                audio_tracks.append({
                    'path': dub_audio,
                    'name': f'{lang_name} (AI Dubbed)',
                    'lang': target_lang
                })
        
        # Step 5: Create separate video files for each language
        print("\n[5/6] Creating dubbed videos...")
        
        video_files = {}
        
        for i, track in enumerate(audio_tracks):
            lang_name = LANGUAGE_NAMES.get(track['lang'], track['lang'])
            
            if i == 0:
                # Original - just copy
                track_output = output_path.with_stem(f"{output_path.stem}_original")
                cmd = ['ffmpeg', '-y', '-i', str(input_path), '-c', 'copy', str(track_output)]
            else:
                # Dubbed tracks - merge video with new audio
                track_output = output_path.with_stem(f"{output_path.stem}_{track['lang']}")
                cmd = ['ffmpeg', '-y', '-i', str(input_path), '-i', str(track['path']),
                       '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac',
                       '-b:a', '192k', str(track_output)]
            
            result = subprocess.run(cmd, capture_output=True)
            
            if result.returncode == 0 and track_output.exists():
                print(f"   [OK] {lang_name}: {track_output.name}")
                video_files[track['lang']] = str(track_output)
            else:
                print(f"   [!] Failed: {lang_name}")
        
        # Create combined multi-track video (for advanced players)
        if args.embed_tracks and len(audio_tracks) > 1:
            create_multi_audio_video(input_path, audio_tracks, output_path)
        
        # Step 6: Save manifest
        print("\n[6/6] Saving manifest...")
        manifest = {
            'source_language': detected_lang,
            'source_languages': source_languages,
            'audio_tracks': [
                {'name': t['name'], 'language': t['lang']} for t in audio_tracks
            ],
            'video_files': video_files,
            'output_file': str(output_path)
        }
        
        manifest_path = output_path.with_suffix('.json')
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f"   [OK] Manifest saved: {manifest_path}")
        
    finally:
        if not args.keep_temp:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print("\n   Cleaned up temp files")
    
    print("\n" + "=" * 60)
    print("[DONE] Multi-Language Dubbing Complete!")
    print(f"Output: {output_path}")
    print("Generated audio tracks:")
    for track in audio_tracks:
        print(f"   - {track['name']}")
    print("=" * 60)

if __name__ == '__main__':
    main()
