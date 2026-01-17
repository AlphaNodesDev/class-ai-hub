#!/usr/bin/env python3
"""
AI Video Dubbing Pipeline - Bidirectional Multi-Language
=========================================================
Translates video audio to multiple target languages with high quality.

Features:
    - Bidirectional dubbing (Malayalam <-> English)
    - Uses Whisper for accurate transcription and translation
    - Multiple TTS engines: Coqui TTS, MMS-TTS (Malayalam), gTTS
    - Multi-track audio embedding in single video
    - Speed adjustment to match original timing

Usage:
    # English to Malayalam dub
    python dub_video.py input.mp4 --model medium --src_lang en --target_langs ml,en
    
    # Malayalam to English dub
    python dub_video.py input.mp4 --model medium --src_lang ml --target_langs en,ml
    
    # Generate all dubs with embedded audio tracks
    python dub_video.py input.mp4 --model medium --all_dubs --embed_tracks

Requirements:
    pip install openai-whisper TTS torch gtts pydub transformers scipy
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

# TTS Models cache
_tts_models = {}

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

def generate_tts_english(text, output_path, tts_model=None):
    """Generate English TTS using Coqui TTS or gTTS fallback"""
    # Try Coqui TTS first
    if tts_model:
        try:
            tts_model.tts_to_file(text=text, file_path=str(output_path))
            return True
        except Exception as e:
            pass
    
    # Fallback to gTTS
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(str(output_path))
        return True
    except Exception as e:
        return False

def generate_tts_malayalam(text, output_path):
    """Generate Malayalam TTS using MMS-TTS or gTTS fallback"""
    global _tts_models
    
    # Try MMS-TTS (Meta's Massively Multilingual Speech)
    try:
        if 'mms_ml' not in _tts_models:
            from transformers import VitsModel, AutoTokenizer
            import torch
            
            print("   Loading MMS-TTS Malayalam model...")
            model_name = "facebook/mms-tts-mal"
            _tts_models['mms_ml_tokenizer'] = AutoTokenizer.from_pretrained(model_name)
            _tts_models['mms_ml'] = VitsModel.from_pretrained(model_name)
            print("   [OK] MMS-TTS Malayalam loaded")
        
        tokenizer = _tts_models['mms_ml_tokenizer']
        model = _tts_models['mms_ml']
        
        inputs = tokenizer(text, return_tensors="pt")
        
        with torch.no_grad():
            output = model(**inputs).waveform
        
        # Save as WAV
        import scipy.io.wavfile as wavfile
        waveform = output.squeeze().cpu().numpy()
        wavfile.write(str(output_path), rate=model.config.sampling_rate, data=waveform)
        
        return True
    except ImportError:
        print("   [!] MMS-TTS not available (install: pip install transformers scipy)")
    except Exception as e:
        print(f"   [!] MMS-TTS error: {e}")
    
    # Fallback to gTTS Malayalam
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='ml', slow=False)
        tts.save(str(output_path))
        return True
    except Exception as e:
        print(f"   [!] gTTS Malayalam error: {e}")
        return False

def generate_tts(text, output_path, language, tts_model=None):
    """Generate TTS for specified language"""
    if language == 'en':
        return generate_tts_english(text, output_path, tts_model)
    elif language == 'ml':
        return generate_tts_malayalam(text, output_path)
    else:
        # Try gTTS for other languages
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang=language, slow=False)
            tts.save(str(output_path))
            return True
        except:
            return False

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

def create_dub_track(segments, target_lang, temp_dir, total_duration, tts_model=None):
    """Create a dubbed audio track for a target language"""
    print(f"\n[*] Generating {target_lang.upper()} dubbed audio track...")
    
    tts_segments = []
    for i, seg in enumerate(segments):
        text = seg['text']
        if not text or len(text) < 3:
            continue
        
        tts_raw = temp_dir / f"tts_{target_lang}_{i:04d}_raw.wav"
        tts_adj = temp_dir / f"tts_{target_lang}_{i:04d}.wav"
        
        success = generate_tts(text, tts_raw, target_lang, tts_model)
        
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
    
    print(f"\n   [OK] Generated {len(tts_segments)} TTS clips for {target_lang.upper()}")
    
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

def translate_text_to_malayalam(english_segments):
    """Translate English segments to Malayalam"""
    try:
        from transformers import MarianMTModel, MarianTokenizer
        
        print("   Loading English->Malayalam translation model...")
        model_name = 'Helsinki-NLP/opus-mt-en-ml'
        tokenizer = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
        print("   [OK] Translation model loaded")
        
        translated = []
        for i, seg in enumerate(english_segments):
            text = seg['text'].strip()
            if text:
                try:
                    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
                    output = model.generate(**inputs)
                    ml_text = tokenizer.decode(output[0], skip_special_tokens=True)
                    translated.append({
                        'start': seg['start'],
                        'end': seg['end'],
                        'text': ml_text
                    })
                except:
                    translated.append(seg)
            
            if (i + 1) % 10 == 0:
                print(f"   Translated {i + 1}/{len(english_segments)} segments...", end='\r')
        
        print(f"\n   [OK] Translated {len(translated)} segments to Malayalam")
        return translated
    except ImportError:
        print("   [!] transformers not installed for translation")
        return english_segments
    except Exception as e:
        print(f"   [!] Translation error: {e}")
        return english_segments

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
    parser = argparse.ArgumentParser(description='AI Video Dubbing Pipeline - Bidirectional Multi-Language')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--model', default='medium', 
                        choices=['tiny', 'base', 'small', 'medium', 'large'],
                        help='Whisper model (medium/large recommended for accuracy)')
    parser.add_argument('--src_lang', default='auto', help='Source language (ml, en, hi, ta, te, auto)')
    parser.add_argument('--target_langs', default='en', help='Target languages comma-separated (en,ml)')
    parser.add_argument('--output', default=None, help='Output video path')
    parser.add_argument('--keep_temp', action='store_true', help='Keep temporary files')
    parser.add_argument('--all_dubs', action='store_true', help='Generate dubs for all supported languages')
    parser.add_argument('--embed_tracks', action='store_true', help='Embed all audio tracks in single video')
    parser.add_argument('--tts_model', default='tacotron2', 
                        choices=['tacotron2', 'vits', 'xtts'],
                        help='English TTS model to use')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(f"{input_path.stem}_dubbed")
    
    # Parse target languages
    target_langs = args.target_langs.split(',') if args.target_langs else ['en']
    if args.all_dubs:
        target_langs = ['en', 'ml']
    
    print("=" * 60)
    print("Class360 AI Video Dubbing Pipeline - Multi-Language")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Whisper Model: {args.model}")
    print(f"Source Language: {args.src_lang}")
    print(f"Target Languages: {', '.join(target_langs)}")
    print(f"Embed Tracks: {args.embed_tracks}")
    print("=" * 60)
    
    temp_dir = Path(tempfile.mkdtemp(prefix='class360_dub_'))
    print(f"Temp directory: {temp_dir}")
    
    # Initialize English TTS model
    tts_model = None
    try:
        from TTS.api import TTS
        import torch
        
        print("\n[*] Loading English TTS model...")
        
        model_map = {
            'tacotron2': 'tts_models/en/ljspeech/tacotron2-DDC',
            'vits': 'tts_models/en/vctk/vits',
            'xtts': 'tts_models/multilingual/multi-dataset/xtts_v2'
        }
        
        tts_model_name = model_map.get(args.tts_model, model_map['tacotron2'])
        use_gpu = torch.cuda.is_available()
        tts_model = TTS(tts_model_name, progress_bar=False, gpu=use_gpu)
        print(f"   [OK] Loaded: {tts_model_name}")
    except Exception as e:
        print(f"   [!] Coqui TTS not available: {e}")
        print("   Will use gTTS fallback for English")
    
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
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"   Device: {device}")
        
        model = whisper.load_model(args.model, device=device)
        print("   [OK] Model loaded")
        
        # Step 3: Transcribe in original language
        print("\n[3/6] Transcribing original audio...")
        transcribe_options = {
            'task': 'transcribe',
            'verbose': False,
            'fp16': device == 'cuda'
        }
        
        if args.src_lang and args.src_lang != 'auto':
            transcribe_options['language'] = args.src_lang
        
        result_original = model.transcribe(str(audio_path), **transcribe_options)
        detected_lang = result_original.get('language', 'unknown')
        segments_original = result_original['segments']
        
        print(f"   Detected language: {detected_lang}")
        print(f"   [OK] Transcribed {len(segments_original)} segments")
        
        # Step 4: Prepare translations and create dub tracks
        print("\n[4/6] Preparing translations...")
        
        audio_tracks = []
        
        # Original audio track
        original_audio = temp_dir / "original_audio.wav"
        shutil.copy(audio_path, original_audio)
        audio_tracks.append({
            'path': original_audio,
            'name': f'Original ({detected_lang.upper()})',
            'lang': detected_lang
        })
        
        # Generate English dub if source is not English
        if 'en' in target_langs and detected_lang != 'en':
            print("\n[*] Translating to English...")
            result_english = model.transcribe(str(audio_path), task='translate', 
                                             verbose=False, fp16=(device == 'cuda'))
            segments_english = result_english['segments']
            
            # Clean translation
            for seg in segments_english:
                seg['text'] = clean_translation_text(seg['text'])
            
            print(f"   [OK] Translated {len(segments_english)} segments to English")
            
            # Create English dub
            en_audio = create_dub_track(segments_english, 'en', temp_dir, video_duration, tts_model)
            if en_audio:
                audio_tracks.append({
                    'path': en_audio,
                    'name': 'English (AI Dubbed)',
                    'lang': 'en'
                })
        
        # Generate Malayalam dub if source is English
        if 'ml' in target_langs and detected_lang == 'en':
            print("\n[*] Translating to Malayalam...")
            segments_malayalam = translate_text_to_malayalam(segments_original)
            
            # Create Malayalam dub
            ml_audio = create_dub_track(segments_malayalam, 'ml', temp_dir, video_duration)
            if ml_audio:
                audio_tracks.append({
                    'path': ml_audio,
                    'name': 'Malayalam (AI Dubbed)',
                    'lang': 'ml'
                })
        
        # Step 5: Create output videos - ALWAYS create separate files for browser compatibility
        print("\n[5/6] Creating dubbed videos...")
        
        video_files = {}
        
        # Create separate video file for each audio track (cross-browser compatible)
        for i, track in enumerate(audio_tracks):
            if i == 0:
                # Original - just copy or reference original
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
                print(f"   [OK] {track['name']} saved: {track_output}")
                video_files[track['lang']] = str(track_output)
            else:
                print(f"   [!] Failed to create {track['name']}: {result.stderr.decode()[:100]}")
        
        # Also create combined multi-track video (for players that support it)
        if args.embed_tracks and len(audio_tracks) > 1:
            create_multi_audio_video(input_path, audio_tracks, output_path)
        
        # Step 6: Save manifest with separate video file paths
        print("\n[6/6] Saving manifest...")
        manifest = {
            'source_language': detected_lang,
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
    print("[DONE] Dubbing Complete!")
    print(f"Output: {output_path}")
    print("Audio tracks:")
    for track in audio_tracks:
        print(f"   - {track['name']}")
    print("=" * 60)

if __name__ == '__main__':
    main()
