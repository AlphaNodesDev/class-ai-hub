# Class360 Backend

Node.js backend for video processing, camera management, and timetable-based video splitting.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Server runs on `http://localhost:3001`

## Requirements

- Node.js 18+
- Python 3.8+ (for video processing)
- FFmpeg, Tesseract OCR

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/video/upload` | Upload video (with optional timetable split) |
| POST | `/api/video/:id/process` | Trigger processing pipeline |
| GET | `/api/video/:id/status` | Get video status |
| POST | `/api/classes` | Create classroom |
| PUT | `/api/classes/:id/timetable` | Update timetable |
| PUT | `/api/classes/:id/camera` | Update camera settings |
| GET | `/api/jobs` | View processing queue |

## Upload Full Day Video & Split by Timetable

```bash
curl -X POST http://localhost:3001/api/video/upload \
  -F "video=@full_day.mp4" \
  -F "classId=class_123" \
  -F "date=2025-12-11" \
  -F "splitByTimetable=true"
```

This splits the video into periods based on timetable and queues each for processing.
