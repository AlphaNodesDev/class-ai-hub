#!/usr/bin/env python3
"""
Extract Board Notes using OCR
==============================
Extracts text from whiteboard/blackboard in video frames.

Usage:
    python extract_board_notes.py input.mp4 --output notes.md

Requirements:
    pip install opencv-python pytesseract pillow numpy

Note: Requires Tesseract OCR installed on system:
    - macOS: brew install tesseract tesseract-lang
    - Ubuntu: sudo apt install tesseract-ocr tesseract-ocr-mal tesseract-ocr-eng
    - Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki
"""

import argparse
import cv2
import pytesseract
from pathlib import Path
import sys
import numpy as np
from PIL import Image
import re

def preprocess_frame(frame):
    """Preprocess frame for better OCR results"""
    # Convert to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Apply adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
    
    return denoised

def extract_text_from_frame(frame, languages='eng+mal'):
    """Extract text from a single frame using Tesseract"""
    processed = preprocess_frame(frame)
    pil_image = Image.fromarray(processed)
    
    # OCR configuration
    custom_config = r'--oem 3 --psm 6'
    
    try:
        text = pytesseract.image_to_string(pil_image, lang=languages, config=custom_config)
        return text.strip()
    except Exception as e:
        print(f"OCR Error: {e}")
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
    return len(new_words) / len(curr_words) > threshold

def clean_text(text):
    """Clean OCR text output"""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    
    # Remove common OCR artifacts
    text = re.sub(r'[|]', '', text)
    
    return text.strip()

def main():
    parser = argparse.ArgumentParser(description='Extract board notes from video using OCR')
    parser.add_argument('input_file', help='Path to video file')
    parser.add_argument('--output', default=None, help='Output markdown file path')
    parser.add_argument('--interval', type=int, default=30, help='Frame interval in seconds (default: 30)')
    parser.add_argument('--languages', default='eng', help='Tesseract languages (e.g., eng+mal)')
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
    
    print("=" * 50)
    print("Class360 Board Notes Extraction (OCR)")
    print("=" * 50)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Frame interval: {args.interval}s")
    print(f"Languages: {args.languages}")
    print("=" * 50)
    
    # Open video
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        print("Error: Could not open video")
        sys.exit(1)
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    frame_interval = int(fps * args.interval)
    
    print(f"Video FPS: {fps:.2f}")
    print(f"Duration: {duration:.1f}s ({duration/60:.1f} min)")
    print(f"Processing every {args.interval}s...")
    
    extracted_notes = []
    prev_text = ""
    frame_count = 0
    processed_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % frame_interval == 0:
            timestamp = frame_count / fps
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_str = f"{minutes:02d}:{seconds:02d}"
            
            print(f"   Processing frame at {time_str}...", end='')
            
            text = extract_text_from_frame(frame, args.languages)
            
            if text and is_significant_change(prev_text, text):
                cleaned = clean_text(text)
                if len(cleaned) > 20:  # Minimum text length
                    extracted_notes.append({
                        'timestamp': time_str,
                        'seconds': timestamp,
                        'text': cleaned
                    })
                    prev_text = text
                    print(f" ✓ Found {len(cleaned)} chars")
                    
                    if args.save_frames:
                        frame_path = frames_dir / f"frame_{time_str.replace(':', '-')}.jpg"
                        cv2.imwrite(str(frame_path), frame)
                else:
                    print(" (too short)")
            else:
                print(" (no change)")
            
            processed_count += 1
        
        frame_count += 1
    
    cap.release()
    
    # Generate markdown output
    print(f"\n   Generating notes document...")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# Board Notes: {input_path.stem}\n\n")
        f.write(f"*Auto-extracted using Class360 OCR*\n\n")
        f.write(f"**Video Duration:** {duration/60:.1f} minutes\n\n")
        f.write("---\n\n")
        
        if extracted_notes:
            for note in extracted_notes:
                f.write(f"## [{note['timestamp']}]\n\n")
                f.write(f"{note['text']}\n\n")
                f.write("---\n\n")
        else:
            f.write("*No significant board content detected.*\n")
    
    print(f"\n" + "=" * 50)
    print(f"Extraction Complete!")
    print(f"Processed {processed_count} frames")
    print(f"Extracted {len(extracted_notes)} note sections")
    print(f"Output saved: {output_path}")
    print("=" * 50)

if __name__ == '__main__':
    main()
