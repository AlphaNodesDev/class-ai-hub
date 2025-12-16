#!/usr/bin/env python3
"""
AI-Powered Board Notes Extraction with Intelligent Processing
=============================================================
Extracts text from video frames using OCR and processes with AI
for continuous, clean notes without repetition.

Features:
    - EasyOCR for handwriting and printed text recognition
    - AI-powered text processing for continuous notes (optional)
    - Removes duplicates and maintains context
    - Supports multiple languages (Malayalam, English, Hindi, etc.)
    - Smart change detection to avoid repetition

Usage:
    python extract_board_notes.py input.mp4 --languages en,ml --interval 10
    python extract_board_notes.py input.mp4 --use_ai --ai_model llama3.2:1b

Requirements:
    pip install easyocr opencv-python numpy torch
    Optional: pip install ollama (for AI processing)
"""

import argparse
import cv2
import numpy as np
from pathlib import Path
import sys
import re
import json
from datetime import datetime
from difflib import SequenceMatcher

# Global OCR reader instance
_reader = None

def get_reader(languages):
    """Get or create EasyOCR reader"""
    global _reader
    if _reader is None:
        import easyocr
        
        # Parse languages
        if isinstance(languages, str):
            lang_list = [l.strip() for l in languages.replace('+', ',').split(',')]
        else:
            lang_list = list(languages)
        
        # Map language codes
        lang_map = {
            'eng': 'en', 'mal': 'en', 'hin': 'hi', 'tam': 'ta', 'tel': 'te',
            'en': 'en', 'ml': 'en', 'hi': 'hi', 'ta': 'ta', 'te': 'te',
            'malayalam': 'en', 'hindi': 'hi', 'tamil': 'ta', 'telugu': 'te'
        }
        
        parsed = []
        for lang in lang_list:
            mapped = lang_map.get(lang.lower().strip(), lang)
            if mapped not in parsed:
                parsed.append(mapped)
        
        # Always include English
        if 'en' not in parsed:
            parsed.insert(0, 'en')
        
        print(f"   Loading EasyOCR with languages: {parsed}")
        _reader = easyocr.Reader(parsed, gpu=True, verbose=False)
    return _reader

def preprocess_frame(frame):
    """Preprocess frame for better OCR results"""
    # Resize if too large
    max_dim = 1920
    h, w = frame.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        frame = cv2.resize(frame, None, fx=scale, fy=scale)
    
    # Convert to RGB (EasyOCR expects RGB)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Enhance contrast using CLAHE
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge([l, a, b])
    enhanced_rgb = cv2.cvtColor(enhanced, cv2.COLOR_LAB2RGB)
    
    return enhanced_rgb

def extract_text_from_frame(frame, languages='en'):
    """Extract text from a single frame using EasyOCR"""
    reader = get_reader(languages)
    processed = preprocess_frame(frame)
    
    try:
        # EasyOCR returns list of (bbox, text, confidence)
        results = reader.readtext(processed, detail=1, paragraph=True)
        
        # Filter by confidence and combine
        texts = []
        for detection in results:
            if len(detection) >= 2:
                text = detection[1] if isinstance(detection[1], str) else str(detection[1])
                confidence = detection[2] if len(detection) > 2 else 0.5
                
                if confidence > 0.3 and len(text.strip()) > 2:
                    texts.append(text.strip())
        
        return '\n'.join(texts)
    except Exception as e:
        print(f"   OCR Error: {e}")
        return ""

def similarity_ratio(text1, text2):
    """Calculate similarity between two texts"""
    if not text1 or not text2:
        return 0.0
    return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()

def is_significant_change(prev_text, curr_text, threshold=0.3):
    """Check if there's significant new content"""
    if not prev_text:
        return bool(curr_text)
    
    # Word-based comparison
    prev_words = set(prev_text.lower().split())
    curr_words = set(curr_text.lower().split())
    
    if not curr_words:
        return False
    
    new_words = curr_words - prev_words
    return len(new_words) / max(len(curr_words), 1) > threshold

def is_new_content(new_text, existing_texts, threshold=0.6):
    """Check if text contains new content not already captured"""
    if not new_text or len(new_text.strip()) < 10:
        return False
    
    for existing in existing_texts:
        if similarity_ratio(new_text, existing) > threshold:
            return False
    
    return True

def clean_text(text):
    """Clean OCR text output"""
    if not text:
        return ""
    
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    
    # Remove common OCR artifacts
    text = re.sub(r'[|]', '', text)
    text = text.replace(' ,', ',').replace(' .', '.')
    text = text.replace('( ', '(').replace(' )', ')')
    
    # Remove very short lines (likely noise)
    lines = text.split('\n')
    lines = [line.strip() for line in lines if len(line.strip()) > 2]
    
    return '\n'.join(lines).strip()

def process_with_ai(texts, model_name='llama3.2:1b'):
    """Use local AI to create clean, continuous notes"""
    try:
        import ollama
        
        combined = '\n\n---\n\n'.join(texts)
        
        prompt = f"""You are an intelligent note-taking assistant. Given the following OCR-extracted text from a classroom board/screen, create clean, continuous notes.

IMPORTANT Rules:
1. Remove ALL duplicate content
2. Fix spelling and grammar errors
3. Maintain proper formatting (headings, bullet points, equations)
4. Create a logical flow from one topic to another
5. Preserve mathematical equations and formulas exactly
6. Remove noise and irrelevant OCR artifacts
7. DO NOT add any information not present in the original
8. Keep handwritten notes content intact but clean up formatting

OCR Extracted Text:
{combined}

Create clean, organized, continuous notes (no repetition):"""

        response = ollama.generate(model=model_name, prompt=prompt)
        return response.get('response', '')
    except ImportError:
        print("   [!] Ollama not installed. Run: pip install ollama")
        return None
    except Exception as e:
        print(f"   [!] AI processing error: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='AI-Powered Board Notes Extraction')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--output', '-o', default=None, help='Output markdown file path')
    parser.add_argument('--interval', '-i', type=int, default=10, 
                        help='Frame interval in seconds (default: 10)')
    parser.add_argument('--languages', '-l', default='en', 
                        help='Languages (comma-separated: en,ml,hi,ta,te)')
    parser.add_argument('--save_frames', action='store_true', 
                        help='Save extracted frames as images')
    parser.add_argument('--use_ai', action='store_true',
                        help='Use AI to clean and organize notes (requires Ollama)')
    parser.add_argument('--ai_model', default='llama3.2:1b',
                        help='AI model for note processing (default: llama3.2:1b)')
    parser.add_argument('--min_length', type=int, default=10,
                        help='Minimum text length to keep (default: 10)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix('.md')
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    frames_dir = output_path.parent / f"{output_path.stem}_frames"
    if args.save_frames:
        frames_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Class360 AI Board Notes Extraction")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Frame interval: {args.interval}s")
    print(f"Languages: {args.languages}")
    print(f"AI Processing: {args.use_ai}")
    print("=" * 60)
    
    # Pre-load the OCR model
    print("\n[*] Loading AI OCR model...")
    get_reader(args.languages)
    print("   [OK] Model loaded")
    
    # Open video
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        print("Error: Could not open video")
        sys.exit(1)
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    frame_interval = int(fps * args.interval)
    
    print(f"\n[VIDEO] Info:")
    print(f"   FPS: {fps:.2f}")
    print(f"   Duration: {duration:.1f}s ({duration/60:.1f} min)")
    print(f"   Processing every {args.interval}s...")
    
    extracted_notes = []
    all_texts = []
    prev_text = ""
    frame_count = 0
    processed_count = 0
    
    print("\n[SCAN] Extracting text from frames...")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % frame_interval == 0:
            timestamp = frame_count / fps
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_str = f"{minutes:02d}:{seconds:02d}"
            
            print(f"   [{time_str}] Processing...", end='', flush=True)
            
            text = extract_text_from_frame(frame, args.languages)
            
            if text and is_significant_change(prev_text, text):
                cleaned = clean_text(text)
                
                if len(cleaned) >= args.min_length:
                    # Check for duplicate content
                    if is_new_content(cleaned, all_texts, threshold=0.5):
                        all_texts.append(cleaned)
                        extracted_notes.append({
                            'timestamp': time_str,
                            'seconds': timestamp,
                            'text': cleaned
                        })
                        prev_text = text
                        print(f" [OK] New content: {len(cleaned)} chars")
                        
                        if args.save_frames:
                            frame_path = frames_dir / f"frame_{time_str.replace(':', '-')}.jpg"
                            cv2.imwrite(str(frame_path), frame)
                    else:
                        print(" [--] Duplicate, skipped")
                else:
                    print(" [--] Too short")
            else:
                print(" [--] No new content")
            
            processed_count += 1
        
        frame_count += 1
    
    cap.release()
    
    print(f"\n   Processed: {processed_count} frames")
    print(f"   Unique sections: {len(extracted_notes)}")
    
    # AI Processing (if enabled)
    ai_notes = None
    if args.use_ai and all_texts:
        print(f"\n[AI] Processing notes with {args.ai_model}...")
        ai_notes = process_with_ai(all_texts, args.ai_model)
        if ai_notes:
            print("   [OK] AI processing complete")
        else:
            print("   [!] AI processing failed, using raw OCR")
    
    # Generate markdown output
    print(f"\n[WRITE] Generating notes document...")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# Board Notes: {input_path.stem}\n\n")
        f.write(f"*Auto-extracted using Class360 AI OCR*\n\n")
        f.write(f"**Video Duration:** {duration/60:.1f} minutes\n")
        f.write(f"**Extracted:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        f.write("---\n\n")
        
        # AI-organized notes first
        if ai_notes:
            f.write("## AI-Organized Notes\n\n")
            f.write(ai_notes)
            f.write("\n\n---\n\n")
            f.write("## Raw OCR Sections (by timestamp)\n\n")
        
        if extracted_notes:
            for i, note in enumerate(extracted_notes, 1):
                f.write(f"### Section {i} [{note['timestamp']}]\n\n")
                f.write(f"```\n{note['text']}\n```\n\n")
            
            f.write("---\n\n")
            f.write("## Combined Text\n\n")
            all_text = '\n\n'.join([note['text'] for note in extracted_notes])
            f.write(all_text)
        else:
            f.write("*No significant board/screen content detected.*\n\n")
            f.write("*Tips:*\n")
            f.write("- Try a shorter interval (--interval 5)\n")
            f.write("- Add relevant languages (--languages en,ml)\n")
            f.write("- Ensure video has visible text\n")
    
    # Save JSON metadata
    json_path = output_path.with_suffix('.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            'video': str(input_path),
            'duration_seconds': duration,
            'frame_interval': args.interval,
            'languages': args.languages,
            'ai_processed': ai_notes is not None,
            'sections_count': len(extracted_notes),
            'notes': extracted_notes
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n" + "=" * 60)
    print(f"[DONE] Extraction Complete!")
    print(f"   Processed: {processed_count} frames")
    print(f"   Extracted: {len(extracted_notes)} note sections")
    print(f"   Output: {output_path}")
    if ai_notes:
        print("   AI-processed notes included")
    print("=" * 60)

if __name__ == '__main__':
    main()
