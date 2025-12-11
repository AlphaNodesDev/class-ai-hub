#!/usr/bin/env python3
"""
Trim Video - Remove Non-Teaching Sections
==========================================
Trims start/end of video and optionally removes silent sections.

Usage:
    python trim_video.py input.mp4 --start_trim 180 --end_trim 180

Requirements:
    pip install ffmpeg-python
"""

import argparse
import subprocess
from pathlib import Path
import sys
import json

def get_video_duration(input_path):
    """Get video duration in seconds"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        str(input_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    return float(data['format']['duration'])

def trim_video(input_path, output_path, start_trim=180, end_trim=180):
    """Trim video by removing start and end sections"""
    duration = get_video_duration(input_path)
    
    new_start = start_trim
    new_duration = duration - start_trim - end_trim
    
    if new_duration <= 0:
        print(f"Warning: Video too short to trim. Duration: {duration}s")
        # Just copy the file
        subprocess.run(['cp', str(input_path), str(output_path)])
        return
    
    print(f"Original duration: {duration:.1f}s")
    print(f"Trimming: {start_trim}s from start, {end_trim}s from end")
    print(f"New duration: {new_duration:.1f}s")
    
    cmd = [
        'ffmpeg', '-y',
        '-ss', str(new_start),
        '-i', str(input_path),
        '-t', str(new_duration),
        '-c', 'copy',
        '-loglevel', 'warning',
        str(output_path)
    ]
    
    subprocess.run(cmd, check=True)
    print(f"Trimmed video saved: {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Trim video start and end')
    parser.add_argument('input_file', help='Path to input video')
    parser.add_argument('--start_trim', type=int, default=180, help='Seconds to trim from start')
    parser.add_argument('--end_trim', type=int, default=180, help='Seconds to trim from end')
    parser.add_argument('--output', default=None, help='Output file path')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(f"{input_path.stem}_trimmed")
    
    trim_video(input_path, output_path, args.start_trim, args.end_trim)

if __name__ == '__main__':
    main()
