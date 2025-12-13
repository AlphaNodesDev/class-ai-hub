#!/usr/bin/env python3
"""
Extract Board/Screen Notes using EasyOCR (AI-based)
=====================================================
Extracts text from whiteboard/blackboard/screen in video frames.
Uses EasyOCR which is a deep learning based OCR - much better than Tesseract.

Usage:
    python extract_board_notes.py input.mp4 --output notes.md

Requirements:
    pip install easyocr opencv-python pillow numpy torch
"""

import argparse
import cv2
from pathlib import Path
import sys
import numpy as np
from PIL import Image
import re

# Global reader to avoid reloading model
_reader = None

def get_reader(languages):
    """Get or create EasyOCR reader"""
    global _reader
    if _reader is None:
        import easyocr
        # Parse languages - EasyOCR uses different codes
        lang_map = {
            'eng': 'en',
            'mal': 'en',  # Malayalam - use English as fallback, EasyOCR has limited Malayalam
            'hin': 'hi',
            'tam': 'ta',
            'tel': 'te',
            'en': 'en',
            'ml': 'en',
            'hi': 'hi',
            'ta': 'ta',
            'te': 'te'
        }
        
        lang_list = []
        for lang in languages.split('+'):
            mapped = lang_map.get(lang.strip(), 'en')
            if mapped not in lang_list:
                lang_list.append(mapped)
        
        # Always include English
        if 'en' not in lang_list:
            lang_list.insert(0, 'en')
        
        print(f"   Loading EasyOCR with languages: {lang_list}")
        _reader = easyocr.Reader(lang_list, gpu=True, verbose=False)
    return _reader

def preprocess_frame(frame):
    """Preprocess frame for better OCR results"""
    # Resize if too large (helps with speed and memory)
    max_dim = 1920
    h, w = frame.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        frame = cv2.resize(frame, None, fx=scale, fy=scale)
    
    # Convert to RGB (EasyOCR expects RGB)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Optional: enhance contrast
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
                
                # Only include text with reasonable confidence
                if confidence > 0.3 and len(text.strip()) > 2:
                    texts.append(text.strip())
        
        return '\n'.join(texts)
    except Exception as e:
        print(f"   OCR Error: {e}")
        return ""

def is_significant_change(prev_text, curr_text, threshold=0.3):
    """Check if there's significant new content"""
    if not prev_text:
        return bool(curr_text)
    
    prev_words = set(prev_text.lower().split())
    curr_words = set(curr_text.lower().split())
    
    if not curr_words:
        return False
    
    new_words = curr_words - prev_words
    return len(new_words) / max(len(curr_words), 1) > threshold

def clean_text(text):
    """Clean OCR text output"""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    
    # Remove common OCR artifacts
    text = re.sub(r'[|]', '', text)
    
    # Remove very short lines (likely noise)
    lines = text.split('\n')
    lines = [line for line in lines if len(line.strip()) > 2]
    
    return '\n'.join(lines).strip()

def main():
    parser = argparse.ArgumentParser(description='Extract board notes from video using AI OCR')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--output', default=None, help='Output markdown file path')
    parser.add_argument('--interval', type=int, default=30, help='Frame interval in seconds (default: 30)')
    parser.add_argument('--languages', default='en', help='Languages (e.g., en, en+hi)')
    parser.add_argument('--save_frames', action='store_true', help='Save extracted frames as images')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix('.md')
    
    frames_dir = output_path.parent / f"{output_path.stem}_frames"
    if args.save_frames:
        frames_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Class360 AI Board Notes Extraction (EasyOCR)")
    print("=" * 60)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Frame interval: {args.interval}s")
    print(f"Languages: {args.languages}")
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
                if len(cleaned) > 10:  # Minimum text length
                    extracted_notes.append({
                        'timestamp': time_str,
                        'seconds': timestamp,
                        'text': cleaned
                    })
                    prev_text = text
                    print(f" [OK] Found {len(cleaned)} chars")
                    
                    if args.save_frames:
                        frame_path = frames_dir / f"frame_{time_str.replace(':', '-')}.jpg"
                        cv2.imwrite(str(frame_path), frame)
                else:
                    print(" (too short)")
            else:
                print(" (no new content)")
            
            processed_count += 1
        
        frame_count += 1
    
    cap.release()
    
    # Generate markdown output
    print(f"\n[WRITE] Generating notes document...")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# Board Notes: {input_path.stem}\n\n")
        f.write(f"*Auto-extracted using Class360 AI OCR (EasyOCR)*\n\n")
        f.write(f"**Video Duration:** {duration/60:.1f} minutes\n\n")
        f.write("---\n\n")
        
        if extracted_notes:
            for i, note in enumerate(extracted_notes, 1):
                f.write(f"## Section {i} [{note['timestamp']}]\n\n")
                f.write(f"{note['text']}\n\n")
                f.write("---\n\n")
            
            # Add combined summary at the end
            f.write("## All Extracted Content\n\n")
            all_text = '\n\n'.join([note['text'] for note in extracted_notes])
            f.write(all_text)
        else:
            f.write("*No significant board/screen content detected.*\n")
            f.write("\n*Tip: Make sure the video has visible text on screen or whiteboard.*\n")
    
    print(f"\n" + "=" * 60)
    print(f"[DONE] Extraction Complete!")
    print(f"   Processed: {processed_count} frames")
    print(f"   Extracted: {len(extracted_notes)} note sections")
    print(f"   Output: {output_path}")
    print("=" * 60)

if __name__ == '__main__':
    main()
