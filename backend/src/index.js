require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Firebase Admin initialization with REST API fallback
const FIREBASE_DB_URL = 'https://electrex-default-rtdb.asia-southeast1.firebasedatabase.app';
let db = null;
let useRestApi = true;

// Try to initialize Firebase Admin SDK
try {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getDatabase } = require('firebase-admin/database');
  
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: FIREBASE_DB_URL
    });
    db = getDatabase();
    useRestApi = false;
    console.log('✅ Firebase Admin SDK initialized');
  }
} catch (error) {
  console.log('⚠️ Firebase Admin SDK not available, using REST API');
}

// REST API helper for Firebase
const firebaseRest = {
  async get(path) {
    try {
      const response = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
      return await response.json();
    } catch (error) {
      console.error('Firebase REST GET error:', error);
      return null;
    }
  },
  async set(path, data) {
    try {
      await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return true;
    } catch (error) {
      console.error('Firebase REST SET error:', error);
      return false;
    }
  },
  async update(path, data) {
    try {
      await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return true;
    } catch (error) {
      console.error('Firebase REST UPDATE error:', error);
      return false;
    }
  }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Storage configuration
const UPLOAD_DIR = path.join(__dirname, '../uploads');
const PROCESSED_DIR = path.join(__dirname, '../processed');
const RECORDINGS_DIR = path.join(__dirname, '../recordings');
const NOTES_DIR = path.join(__dirname, '../notes');

// Create directories if they don't exist
[UPLOAD_DIR, PROCESSED_DIR, RECORDINGS_DIR, NOTES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB limit

// Job queue for processing with priority and concurrency control
const jobQueue = {
  high: [],    // High priority - user-triggered actions
  normal: [],  // Normal priority - auto-processing
  low: []      // Low priority - background tasks
};
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 1; // Process one at a time to avoid resource conflicts
let isProcessing = false;

// Active camera recordings
const activeRecordings = new Map();

// Processing progress tracking
const processingProgress = new Map(); // videoId -> ProcessingStatus
const progressListeners = new Map(); // videoId -> Set<response>

// Initialize processing status
const initProcessingStatus = (videoId, videoName) => {
  const status = {
    videoId,
    videoName,
    overallProgress: 0,
    currentStep: 'initializing',
    steps: [
      { id: 'trim', name: 'Trimming Video', status: 'pending', progress: 0 },
      { id: 'subtitles', name: 'Generating Subtitles', status: 'pending', progress: 0 },
      { id: 'dub', name: 'Creating Audio Dubs', status: 'pending', progress: 0 },
      { id: 'ocr', name: 'Extracting Board Notes', status: 'pending', progress: 0 },
      { id: 'analyze', name: 'AI Analysis', status: 'pending', progress: 0 },
    ],
    startedAt: new Date().toISOString(),
    estimatedTimeRemaining: null,
  };
  processingProgress.set(videoId, status);
  return status;
};

// Update processing step
const updateProcessingStep = (videoId, stepId, updates) => {
  const status = processingProgress.get(videoId);
  if (!status) return;

  const stepIndex = status.steps.findIndex(s => s.id === stepId);
  if (stepIndex >= 0) {
    status.steps[stepIndex] = { ...status.steps[stepIndex], ...updates };
  }

  // Calculate overall progress
  const completedSteps = status.steps.filter(s => s.status === 'completed').length;
  const processingStep = status.steps.find(s => s.status === 'processing');
  const stepProgress = processingStep?.progress || 0;
  
  status.overallProgress = ((completedSteps + stepProgress / 100) / status.steps.length) * 100;
  status.currentStep = processingStep?.name || 'Processing';

  // Broadcast update to all listeners
  broadcastProgress(videoId, status);
};

// Broadcast progress to SSE clients
const broadcastProgress = (videoId, status) => {
  const listeners = progressListeners.get(videoId);
  if (listeners) {
    const data = JSON.stringify(status);
    listeners.forEach(res => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch (err) {
        // Client disconnected
      }
    });
  }
};

// ============= HELPER FUNCTIONS =============

const dbGet = async (path) => {
  if (!useRestApi && db) {
    const snapshot = await db.ref(path).once('value');
    return snapshot.val();
  }
  return await firebaseRest.get(path);
};

const dbSet = async (path, data) => {
  if (!useRestApi && db) {
    await db.ref(path).set(data);
    return true;
  }
  return await firebaseRest.set(path, data);
};

const dbUpdate = async (path, data) => {
  if (!useRestApi && db) {
    await db.ref(path).update(data);
    return true;
  }
  return await firebaseRest.update(path, data);
};

const runPythonScript = (scriptName, args) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', scriptName);
    
    console.log(`🐍 Running: ${pythonPath} ${scriptPath} ${args.join(' ')}`);
    
    const proc = spawn(pythonPath, [scriptPath, ...args]);
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`📝 ${scriptName}: ${data.toString().trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`⚠️ ${scriptName}: ${data.toString().trim()}`);
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Script exited with code ${code}: ${errorOutput}`));
      }
    });
  });
};

const runFFmpeg = (args) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    let errorOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
    });
  });
};

const updateVideoStatus = async (videoId, statusUpdate) => {
  try {
    await dbUpdate(`videos/${videoId}/status`, statusUpdate);
    console.log(`✅ Updated video ${videoId} status:`, statusUpdate);
  } catch (error) {
    console.error('Error updating video status:', error);
  }
};

const addVideoToDb = async (videoData) => {
  try {
    await dbSet(`videos/${videoData.id}`, videoData);
    console.log(`✅ Added video ${videoData.id} to database`);
    return videoData.id;
  } catch (error) {
    console.error('Error adding video to database:', error);
    return videoData.id;
  }
};

const timeToSeconds = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 3600 + minutes * 60;
};

const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hrs > 0 ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` 
    : `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============= AI TOPIC RECOGNITION =============

const analyzeVideoContent = async (videoPath, transcriptPath) => {
  // This would use AI to analyze the transcript and extract topics
  // For now, we'll extract from subtitle file if exists
  try {
    const subtitlePath = videoPath.replace(path.extname(videoPath), '.srt');
    if (fs.existsSync(subtitlePath)) {
      const content = fs.readFileSync(subtitlePath, 'utf-8');
      // Simple keyword extraction (in production, use NLP/AI)
      const topics = extractTopicsFromText(content);
      return { topics, summary: 'Auto-generated summary from AI analysis' };
    }
    return { topics: [], summary: '' };
  } catch (error) {
    console.error('Error analyzing video content:', error);
    return { topics: [], summary: '' };
  }
};

const extractTopicsFromText = (text) => {
  // Simple keyword extraction - in production use proper NLP
  const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'whose']);
  
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordCount = {};
  
  words.forEach(word => {
    if (!commonWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
};

// ============= PDF NOTES GENERATION =============

const generatePdfNotes = async (notesPath, outputPath) => {
  // Convert markdown notes to PDF
  // In production, use a proper PDF library like PDFKit or puppeteer
  try {
    if (fs.existsSync(notesPath)) {
      const content = fs.readFileSync(notesPath, 'utf-8');
      
      // Simple HTML to PDF conversion placeholder
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #3b82f6; margin-top: 30px; }
    ul { line-height: 1.8; }
    .timestamp { color: #6b7280; font-size: 0.9em; }
    .generated { color: #9ca3af; font-size: 0.8em; margin-top: 50px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>📚 Class Notes</h1>
  ${content.split('\n').map(line => {
    if (line.startsWith('## ')) return `<h2>${line.substring(3)}</h2>`;
    if (line.startsWith('- ')) return `<li>${line.substring(2)}</li>`;
    if (line.startsWith('[')) return `<p class="timestamp">${line}</p>`;
    return `<p>${line}</p>`;
  }).join('\n')}
  <p class="generated">Generated by Class360 AI • ${new Date().toLocaleDateString()}</p>
</body>
</html>`;
      
      const htmlPath = outputPath.replace('.pdf', '.html');
      fs.writeFileSync(htmlPath, htmlContent);
      
      // For actual PDF, you'd use puppeteer or similar
      // For now, we'll just save the HTML and note the PDF path
      console.log(`📄 Notes HTML saved to ${htmlPath}`);
      return htmlPath;
    }
  } catch (error) {
    console.error('Error generating PDF notes:', error);
  }
  return null;
};

// ============= PROCESSING PIPELINE =============

const processJob = async (job) => {
  console.log(`\n🎬 Processing job: ${job.type} for video ${job.videoId}`);
  
  try {
    switch (job.type) {
      case 'trim':
        await updateVideoStatus(job.videoId, { trimming: true });
        await runPythonScript('trim_video.py', [
          job.inputPath,
          '--start_trim', String(job.startTrim || 180),
          '--end_trim', String(job.endTrim || 180),
          '--output', job.outputPath || job.inputPath.replace('.mp4', '_trimmed.mp4')
        ]);
        await updateVideoStatus(job.videoId, { trimming: false, trimmed: true });
        break;
        
      case 'subtitles':
        await updateVideoStatus(job.videoId, { generating_subtitles: true });
        await runPythonScript('generate_subtitles.py', [
          job.inputPath,
          '--model', job.model || 'small',
          '--language', job.language || 'ml'
        ]);
        await updateVideoStatus(job.videoId, { generating_subtitles: false, subtitles: true });
        
        // Update video with subtitle URL
        const srtPath = job.inputPath.replace(path.extname(job.inputPath), '.srt');
        await dbUpdate(`videos/${job.videoId}`, { subtitle_url: srtPath });
        break;
        
      case 'dub':
        await updateVideoStatus(job.videoId, { generating_dub: true });
        await runPythonScript('dub_to_english.py', [
          job.inputPath,
          '--model', job.model || 'small',
          '--src_lang', job.srcLang || 'ml'
        ]);
        await updateVideoStatus(job.videoId, { generating_dub: false, dubbed: true });
        
        // Update video with dub URL
        const dubPath = job.inputPath.replace('.mp4', '_english_dub.mp4');
        await dbUpdate(`videos/${job.videoId}`, { dub_url: dubPath });
        break;
        
      case 'ocr':
        await updateVideoStatus(job.videoId, { extracting_notes: true });
        const notesOutputPath = path.join(NOTES_DIR, `${job.videoId}_notes.md`);
        await runPythonScript('extract_board_notes.py', [
          job.inputPath,
          '--output', notesOutputPath,
          '--interval', String(job.interval || 30)
        ]);
        await updateVideoStatus(job.videoId, { extracting_notes: false, ocr_notes: true });
        
        // Generate PDF from notes
        const pdfPath = await generatePdfNotes(notesOutputPath, notesOutputPath.replace('.md', '.pdf'));
        await dbUpdate(`videos/${job.videoId}`, { notes_url: notesOutputPath, notes_pdf_url: pdfPath });
        break;
        
      case 'analyze':
        // AI topic recognition
        const analysis = await analyzeVideoContent(job.inputPath);
        await dbUpdate(`videos/${job.videoId}`, { 
          topics: analysis.topics,
          ai_summary: analysis.summary 
        });
        break;
        
      case 'full_pipeline':
        // Initialize progress tracking
        const videoName = path.basename(job.inputPath);
        initProcessingStatus(job.videoId, videoName);
        
        // Run complete pipeline
        const baseName = path.basename(job.inputPath, path.extname(job.inputPath));
        const trimmedPath = path.join(PROCESSED_DIR, `${baseName}_trimmed.mp4`);
        
        // Step 1: Trim
        updateProcessingStep(job.videoId, 'trim', { status: 'processing', progress: 0, message: 'Starting video trimming...' });
        try {
          if (job.startTrim || job.endTrim) {
            updateProcessingStep(job.videoId, 'trim', { progress: 30, message: 'Trimming start and end...' });
            await runPythonScript('trim_video.py', [
              job.inputPath,
              '--start_trim', String(job.startTrim || 0),
              '--end_trim', String(job.endTrim || 0),
              '--output', trimmedPath
            ]);
            await updateVideoStatus(job.videoId, { trimmed: true });
          } else {
            updateProcessingStep(job.videoId, 'trim', { progress: 50, message: 'Copying video...' });
            fs.copyFileSync(job.inputPath, trimmedPath);
          }
          updateProcessingStep(job.videoId, 'trim', { status: 'completed', progress: 100 });
        } catch (err) {
          updateProcessingStep(job.videoId, 'trim', { status: 'failed', message: err.message });
          throw err;
        }
        
        // Step 2: Subtitles
        updateProcessingStep(job.videoId, 'subtitles', { status: 'processing', progress: 0, message: 'Loading Whisper model...' });
        try {
          updateProcessingStep(job.videoId, 'subtitles', { progress: 20, message: 'Transcribing audio...' });
          await runPythonScript('generate_subtitles.py', [
            trimmedPath,
            '--model', 'medium',
            '--language', job.language || 'ml',
            '--all_languages'
          ]);
          updateProcessingStep(job.videoId, 'subtitles', { progress: 80, message: 'Translating subtitles...' });
          await updateVideoStatus(job.videoId, { subtitles: true });
          
          const lang = job.language || 'ml';
          const originalSrtPath = lang === 'en' 
            ? trimmedPath.replace('.mp4', '.srt')
            : trimmedPath.replace('.mp4', `_${lang}.srt`);
          const englishSrtPath = trimmedPath.replace('.mp4', '_en.srt');
          const malayalamSrtPath = trimmedPath.replace('.mp4', '_ml.srt');
          
          await dbUpdate(`videos/${job.videoId}`, { 
            subtitle_url: `/processed/${path.basename(originalSrtPath)}`,
            subtitle_en_url: `/processed/${path.basename(englishSrtPath)}`,
            subtitle_ml_url: `/processed/${path.basename(malayalamSrtPath)}`,
            processed_video_url: `/processed/${path.basename(trimmedPath)}`
          });
          updateProcessingStep(job.videoId, 'subtitles', { status: 'completed', progress: 100 });
        } catch (err) {
          updateProcessingStep(job.videoId, 'subtitles', { status: 'failed', message: err.message });
          throw err;
        }
        
        // Step 3: Dubbing
        updateProcessingStep(job.videoId, 'dub', { status: 'processing', progress: 0, message: 'Loading TTS models...' });
        try {
          updateProcessingStep(job.videoId, 'dub', { progress: 20, message: 'Generating English dub...' });
          const dubOutputPath = trimmedPath.replace('.mp4', '_dubbed.mp4');
          await runPythonScript('dub_video.py', [
            trimmedPath,
            '--model', 'medium',
            '--src_lang', job.language || 'ml',
            '--all_dubs',
            '--embed_tracks',
            '--output', dubOutputPath
          ]);
          updateProcessingStep(job.videoId, 'dub', { progress: 80, message: 'Embedding audio tracks...' });
          await updateVideoStatus(job.videoId, { dubbed: true });
          await dbUpdate(`videos/${job.videoId}`, { 
            dub_url: `/processed/${path.basename(dubOutputPath)}`
          });
          updateProcessingStep(job.videoId, 'dub', { status: 'completed', progress: 100 });
        } catch (err) {
          updateProcessingStep(job.videoId, 'dub', { status: 'failed', message: err.message });
          // Continue with OCR even if dubbing fails
          console.error('Dubbing failed, continuing with OCR:', err.message);
        }
        
        // Step 4: OCR
        updateProcessingStep(job.videoId, 'ocr', { status: 'processing', progress: 0, message: 'Extracting frames...' });
        try {
          updateProcessingStep(job.videoId, 'ocr', { progress: 30, message: 'Running OCR on frames...' });
          const notesPath = path.join(NOTES_DIR, `${job.videoId}_notes.md`);
          await runPythonScript('extract_board_notes.py', [
            trimmedPath,
            '--output', notesPath,
            '--interval', '30'
          ]);
          updateProcessingStep(job.videoId, 'ocr', { progress: 70, message: 'Generating PDF notes...' });
          await updateVideoStatus(job.videoId, { ocr_notes: true });
          
          const pdfNotesPath = await generatePdfNotes(notesPath, notesPath.replace('.md', '.pdf'));
          await dbUpdate(`videos/${job.videoId}`, { 
            notes_url: `/notes/${path.basename(notesPath)}`,
            notes_pdf_url: pdfNotesPath ? `/notes/${path.basename(pdfNotesPath)}` : null
          });
          updateProcessingStep(job.videoId, 'ocr', { status: 'completed', progress: 100 });
        } catch (err) {
          updateProcessingStep(job.videoId, 'ocr', { status: 'failed', message: err.message });
        }
        
        // Step 5: AI Analysis
        updateProcessingStep(job.videoId, 'analyze', { status: 'processing', progress: 0, message: 'Analyzing content...' });
        try {
          updateProcessingStep(job.videoId, 'analyze', { progress: 30, message: 'Extracting topics...' });
          const transcriptPath = trimmedPath.replace('.mp4', '.txt');
          const questionsPath = path.join(NOTES_DIR, `${job.videoId}_questions.json`);
          if (fs.existsSync(transcriptPath)) {
            updateProcessingStep(job.videoId, 'analyze', { progress: 50, message: 'Generating quiz questions...' });
            await runPythonScript('generate_questions.py', [
              transcriptPath,
              '--output', questionsPath,
              '--num_questions', '10'
            ]);
            await dbUpdate(`videos/${job.videoId}`, { 
              questions_url: `/notes/${path.basename(questionsPath)}`
            });
          }
          
          updateProcessingStep(job.videoId, 'analyze', { progress: 80, message: 'Running AI analysis...' });
          const videoAnalysis = await analyzeVideoContent(trimmedPath);
          await dbUpdate(`videos/${job.videoId}`, { 
            topics: videoAnalysis.topics,
            ai_summary: videoAnalysis.summary 
          });
          updateProcessingStep(job.videoId, 'analyze', { status: 'completed', progress: 100 });
        } catch (err) {
          updateProcessingStep(job.videoId, 'analyze', { status: 'failed', message: err.message });
        }
        
        // Mark overall as complete
        const finalStatus = processingProgress.get(job.videoId);
        if (finalStatus) {
          finalStatus.overallProgress = 100;
          finalStatus.currentStep = 'Complete';
          broadcastProgress(job.videoId, finalStatus);
        }
        break;
    }
    
    console.log(`✅ Job ${job.type} completed for video ${job.videoId}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Job ${job.type} failed:`, error.message);
    await dbUpdate(`videos/${job.videoId}/processing_jobs/${job.id}`, {
      status: 'failed',
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

// Get next job from queue based on priority
const getNextJob = () => {
  if (jobQueue.high.length > 0) return jobQueue.high.shift();
  if (jobQueue.normal.length > 0) return jobQueue.normal.shift();
  if (jobQueue.low.length > 0) return jobQueue.low.shift();
  return null;
};

// Get total queue length
const getQueueLength = () => {
  return jobQueue.high.length + jobQueue.normal.length + jobQueue.low.length;
};

// Get queue status
const getQueueStatus = () => {
  return {
    high: jobQueue.high.length,
    normal: jobQueue.normal.length,
    low: jobQueue.low.length,
    total: getQueueLength(),
    activeJobs,
    isProcessing
  };
};

const processQueue = async () => {
  if (isProcessing || activeJobs >= MAX_CONCURRENT_JOBS) return;
  
  const job = getNextJob();
  if (!job) return;
  
  isProcessing = true;
  activeJobs++;
  
  console.log(`📋 Queue status: ${getQueueLength()} jobs waiting, ${activeJobs} active`);
  
  try {
    await processJob(job);
  } catch (error) {
    console.error(`❌ Job failed:`, error.message);
  }
  
  activeJobs--;
  isProcessing = false;
  
  // Process next job if queue not empty
  if (getQueueLength() > 0) {
    setImmediate(processQueue); // Use setImmediate to avoid stack overflow
  }
};

const addToQueue = (job, priority = 'normal') => {
  job.id = uuidv4();
  job.createdAt = new Date().toISOString();
  job.status = 'queued';
  job.priority = priority;
  
  // Add to appropriate queue
  if (priority === 'high') {
    jobQueue.high.push(job);
  } else if (priority === 'low') {
    jobQueue.low.push(job);
  } else {
    jobQueue.normal.push(job);
  }
  
  console.log(`📋 Added job to queue: ${job.type} (${job.id}) [${priority}] - Queue: ${getQueueLength()}`);
  processQueue();
  return job.id;
};

// ============= CAMERA RECORDING SYSTEM =============

const startCameraRecording = async (classId, cameraSource) => {
  if (activeRecordings.has(classId)) {
    console.log(`⚠️ Recording already active for class ${classId}`);
    return { success: false, error: 'Recording already active' };
  }
  
  const recordingId = `rec_${Date.now()}`;
  const outputPath = path.join(RECORDINGS_DIR, `${classId}_${recordingId}.mp4`);
  
  // FFmpeg command to record from camera
  // For USB webcam: -f v4l2 -i /dev/video0
  // For IP camera: -i rtsp://camera_ip/stream
  // For Windows webcam: -f dshow -i video="Camera Name"
  
  const ffmpegArgs = [
    '-y',
    '-f', process.platform === 'win32' ? 'dshow' : 'v4l2',
    '-i', cameraSource || (process.platform === 'win32' ? 'video=Integrated Webcam' : '/dev/video0'),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-r', '30',
    outputPath
  ];
  
  try {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    activeRecordings.set(classId, {
      id: recordingId,
      process: ffmpeg,
      outputPath,
      startTime: new Date(),
      classId
    });
    
    ffmpeg.on('close', (code) => {
      console.log(`📹 Recording for class ${classId} stopped (code: ${code})`);
      activeRecordings.delete(classId);
    });
    
    console.log(`📹 Started recording for class ${classId}`);
    return { success: true, recordingId, outputPath };
  } catch (error) {
    console.error('Error starting camera recording:', error);
    return { success: false, error: error.message };
  }
};

const stopCameraRecording = async (classId) => {
  const recording = activeRecordings.get(classId);
  if (!recording) {
    return { success: false, error: 'No active recording for this class' };
  }
  
  // Send SIGINT to gracefully stop FFmpeg
  recording.process.kill('SIGINT');
  
  // Wait a moment for file to finalize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  activeRecordings.delete(classId);
  
  return { 
    success: true, 
    outputPath: recording.outputPath,
    duration: (new Date() - recording.startTime) / 1000
  };
};

// ============= TIMETABLE-BASED VIDEO SPLITTING =============

const splitVideoByTimetable = async (videoPath, classId, date) => {
  try {
    // Get class timetable
    const classData = await dbGet(`classes/${classId}`);
    
    if (!classData || !classData.timetable) {
      console.log('⚠️ No timetable found for class:', classId);
      return [];
    }
    
    // Get day of week
    const dateObj = new Date(date);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[dateObj.getDay()];
    const periods = classData.timetable[dayOfWeek] || [];
    
    if (periods.length === 0) {
      console.log('⚠️ No periods scheduled for:', dayOfWeek);
      return [];
    }
    
    console.log(`📅 Found ${periods.length} periods for ${dayOfWeek}`);
    
    const videos = [];
    
    // Get video duration using ffprobe
    const getVideoDuration = () => {
      return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`, 
          (error, stdout) => {
            resolve(parseFloat(stdout) || 0);
          });
      });
    };
    
    const videoDuration = await getVideoDuration();
    console.log(`📹 Video duration: ${formatDuration(videoDuration)}`);
    
    // Calculate first period start time as reference
    const firstPeriodStart = timeToSeconds(periods[0].start);
    
    for (const period of periods) {
      const videoId = `video_${date.replace(/-/g, '')}_${classId}_h${period.hour}`;
      const outputPath = path.join(PROCESSED_DIR, `${videoId}.mp4`);
      
      // Calculate start and end times relative to video start
      const periodStartSeconds = timeToSeconds(period.start) - firstPeriodStart;
      const periodEndSeconds = timeToSeconds(period.end) - firstPeriodStart;
      const duration = periodEndSeconds - periodStartSeconds;
      
      // Skip if period is beyond video duration
      if (periodStartSeconds >= videoDuration) {
        console.log(`⚠️ Skipping period ${period.hour} - beyond video duration`);
        continue;
      }
      
      // Adjust duration if period extends beyond video
      const actualDuration = Math.min(duration, videoDuration - periodStartSeconds);
      
      console.log(`✂️ Extracting period ${period.hour}: ${period.subject} (${formatDuration(periodStartSeconds)} - ${formatDuration(periodStartSeconds + actualDuration)})`);
      
      // Use ffmpeg to extract segment
      await runFFmpeg([
        '-i', videoPath,
        '-ss', String(periodStartSeconds),
        '-t', String(actualDuration),
        '-c', 'copy',
        '-y',
        outputPath
      ]);
      
      // Get teacher info
      const teacherData = await dbGet(`users/${period.teacher}`);
      
      // Create video entry
      const videoData = {
        id: videoId,
        class_id: classId,
        class_name: classData.name,
        subject: period.subject,
        teacher_id: period.teacher,
        teacher_name: teacherData?.name || 'Unknown',
        date,
        hour: period.hour,
        start_time: period.start,
        end_time: period.end,
        duration: actualDuration,
        original_video_url: outputPath,
        status: {
          uploaded: true,
          trimmed: false,
          subtitles: false,
          dubbed: false,
          ocr_notes: false
        },
        processing_jobs: {},
        created_at: new Date().toISOString()
      };
      
      await addVideoToDb(videoData);
      videos.push(videoData);
      
      // Add to processing queue
      addToQueue({
        type: 'full_pipeline',
        videoId,
        inputPath: outputPath,
        language: 'ml',
        startTrim: 0,
        endTrim: 0
      });
    }
    
    return videos;
  } catch (error) {
    console.error('Error splitting video by timetable:', error);
    return [];
  }
};

// ============= SCHEDULED RECORDING BY TIMETABLE =============

const checkAndStartScheduledRecordings = async () => {
  try {
    const classes = await dbGet('classes');
    if (!classes) return;
    
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[now.getDay()];
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    for (const [classId, classData] of Object.entries(classes)) {
      // Skip if camera is not enabled
      if (!classData.camera?.enabled || classData.camera.camera_type !== 'live') continue;
      
      const todayPeriods = classData.timetable?.[dayOfWeek] || [];
      
      for (const period of todayPeriods) {
        // Check if current time matches period start
        if (period.start === currentTime && !activeRecordings.has(classId)) {
          console.log(`⏰ Auto-starting recording for ${classData.name} - ${period.subject}`);
          await startCameraRecording(classId, classData.camera.camera_id);
        }
        
        // Check if current time matches period end
        if (period.end === currentTime && activeRecordings.has(classId)) {
          console.log(`⏰ Auto-stopping recording for ${classData.name} - ${period.subject}`);
          const result = await stopCameraRecording(classId);
          
          if (result.success) {
            // Create video entry and queue for processing
            const date = now.toISOString().split('T')[0];
            const videoId = `video_${date.replace(/-/g, '')}_${classId}_h${period.hour}`;
            
            const teacherData = await dbGet(`users/${period.teacher}`);
            
            const videoData = {
              id: videoId,
              class_id: classId,
              class_name: classData.name,
              subject: period.subject,
              teacher_id: period.teacher,
              teacher_name: teacherData?.name || 'Unknown',
              date,
              hour: period.hour,
              start_time: period.start,
              end_time: period.end,
              duration: result.duration,
              original_video_url: result.outputPath,
              status: {
                uploaded: true,
                trimmed: false,
                subtitles: false,
                dubbed: false,
                ocr_notes: false
              },
              processing_jobs: {},
              created_at: new Date().toISOString()
            };
            
            await addVideoToDb(videoData);
            
            addToQueue({
              type: 'full_pipeline',
              videoId,
              inputPath: result.outputPath,
              language: 'ml'
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in scheduled recording check:', error);
  }
};

// Check every minute for scheduled recordings
cron.schedule('* * * * *', checkAndStartScheduledRecordings);

// ============= API ROUTES =============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    firebase: useRestApi ? 'rest-api' : 'admin-sdk',
    queue: getQueueStatus(),
    processing: isProcessing,
    activeRecordings: Array.from(activeRecordings.keys())
  });
});

// Queue status endpoint
app.get('/api/queue/status', (req, res) => {
  const status = getQueueStatus();
  
  // Get details of pending jobs
  const pendingJobs = [
    ...jobQueue.high.map(j => ({ ...j, priority: 'high' })),
    ...jobQueue.normal.map(j => ({ ...j, priority: 'normal' })),
    ...jobQueue.low.map(j => ({ ...j, priority: 'low' }))
  ].map(j => ({
    id: j.id,
    type: j.type,
    videoId: j.videoId,
    priority: j.priority,
    createdAt: j.createdAt,
    status: j.status
  }));
  
  res.json({
    ...status,
    pendingJobs
  });
});

// Clear queue (admin only)
app.delete('/api/queue/clear', (req, res) => {
  const cleared = getQueueLength();
  jobQueue.high = [];
  jobQueue.normal = [];
  jobQueue.low = [];
  console.log(`🗑️ Queue cleared: ${cleared} jobs removed`);
  res.json({ success: true, cleared });
});

// Upload video
app.post('/api/video/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    
    const { classId, subject, date, teacherId, splitByTimetable } = req.body;
    const videoPath = req.file.path;
    
    console.log(`📤 Video uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (splitByTimetable === 'true' && classId && date) {
      // Split the full day video by timetable
      console.log(`✂️ Splitting video by timetable for class ${classId} on ${date}`);
      const videos = await splitVideoByTimetable(videoPath, classId, date);
      return res.json({ 
        success: true, 
        message: `Video split into ${videos.length} periods`,
        videos 
      });
    }
    
    // Single video upload
    const videoId = `video_${Date.now()}`;
    
    // Get class and teacher info
    const classData = classId ? await dbGet(`classes/${classId}`) : null;
    const teacherData = teacherId ? await dbGet(`users/${teacherId}`) : null;
    
    const videoData = {
      id: videoId,
      class_id: classId || 'unknown',
      class_name: classData?.name || 'Unknown',
      subject: subject || 'Unknown',
      teacher_id: teacherId || 'unknown',
      teacher_name: teacherData?.name || 'Unknown',
      date: date || new Date().toISOString().split('T')[0],
      original_video_url: videoPath,
      status: {
        uploaded: true,
        trimmed: false,
        subtitles: false,
        dubbed: false,
        ocr_notes: false
      },
      processing_jobs: {},
      created_at: new Date().toISOString()
    };
    
    await addVideoToDb(videoData);
    
    // Automatically start processing
    addToQueue({
      type: 'full_pipeline',
      videoId,
      inputPath: videoPath,
      language: req.body.language || 'ml'
    });
    
    res.json({ success: true, videoId, videoData });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger processing
app.post('/api/video/:id/process', async (req, res) => {
  const { id } = req.params;
  const { type, options = {} } = req.body;
  
  // Get video from DB
  let inputPath = options.inputPath;
  
  if (!inputPath) {
    const video = await dbGet(`videos/${id}`);
    if (video) {
      inputPath = video.processed_video_url || video.original_video_url;
    }
  }
  
  if (!inputPath) {
    return res.status(400).json({ error: 'Video path not found' });
  }
  
  const jobId = addToQueue({
    type: type || 'full_pipeline',
    videoId: id,
    inputPath,
    ...options
  });
  
  res.json({ success: true, jobId, message: `Processing job ${type} queued` });
});

// Get video status
app.get('/api/video/:id/status', async (req, res) => {
  const { id } = req.params;
  
  try {
    const video = await dbGet(`videos/${id}`);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete video
app.delete('/api/video/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const video = await dbGet(`videos/${id}`);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Delete video files from disk
    const filesToDelete = [
      video.original_video_url,
      video.processed_video_url,
      video.dub_url,
      video.subtitle_url,
      video.notes_url,
      video.notes_pdf_url,
      video.questions_url
    ].filter(Boolean);
    
    for (const filePath of filesToDelete) {
      try {
        // Extract filename and try to delete from various folders
        const filename = path.basename(filePath.replace(/\\/g, '/'));
        const possiblePaths = [
          path.join(UPLOAD_DIR, filename),
          path.join(PROCESSED_DIR, filename),
          path.join(NOTES_DIR, filename),
          path.join(RECORDINGS_DIR, filename)
        ];
        
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            console.log(`🗑️ Deleted file: ${p}`);
          }
        }
      } catch (err) {
        console.error(`Failed to delete file: ${filePath}`, err.message);
      }
    }
    
    // Delete from Firebase
    await dbSet(`videos/${id}`, null);
    
    console.log(`✅ Video ${id} deleted`);
    res.json({ success: true, message: 'Video deleted' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all videos
app.get('/api/videos', async (req, res) => {
  const { classId, teacherId } = req.query;
  
  try {
    const videosData = await dbGet('videos');
    let videos = videosData ? Object.values(videosData) : [];
    
    if (classId) {
      videos = videos.filter(v => v.class_id === classId);
    }
    if (teacherId) {
      videos = videos.filter(v => v.teacher_id === teacherId);
    }
    
    // Sort by date descending
    videos.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download notes as PDF
app.get('/api/video/:id/notes/pdf', async (req, res) => {
  const { id } = req.params;
  
  try {
    const video = await dbGet(`videos/${id}`);
    
    if (!video || !video.notes_pdf_url) {
      return res.status(404).json({ error: 'Notes not found' });
    }
    
    // For now, serve the HTML version
    if (fs.existsSync(video.notes_pdf_url)) {
      res.sendFile(video.notes_pdf_url);
    } else {
      res.status(404).json({ error: 'Notes file not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job queue status
app.get('/api/jobs', (req, res) => {
  res.json({
    queue: jobQueue,
    isProcessing,
    queueLength: jobQueue.length,
    activeRecordings: Array.from(activeRecordings.entries()).map(([classId, rec]) => ({
      classId,
      recordingId: rec.id,
      startTime: rec.startTime,
      duration: (new Date() - rec.startTime) / 1000
    }))
  });
});

// ============= CAMERA MANAGEMENT =============

// Start camera recording
app.post('/api/camera/:classId/start', async (req, res) => {
  const { classId } = req.params;
  const { cameraSource } = req.body;
  
  const result = await startCameraRecording(classId, cameraSource);
  res.json(result);
});

// Stop camera recording
app.post('/api/camera/:classId/stop', async (req, res) => {
  const { classId } = req.params;
  
  const result = await stopCameraRecording(classId);
  
  if (result.success) {
    // Create video entry
    const classData = await dbGet(`classes/${classId}`);
    const date = new Date().toISOString().split('T')[0];
    const videoId = `video_${Date.now()}`;
    
    const videoData = {
      id: videoId,
      class_id: classId,
      class_name: classData?.name || 'Unknown',
      subject: 'Manual Recording',
      date,
      duration: result.duration,
      original_video_url: result.outputPath,
      status: {
        uploaded: true,
        trimmed: false,
        subtitles: false,
        dubbed: false,
        ocr_notes: false
      },
      processing_jobs: {},
      created_at: new Date().toISOString()
    };
    
    await addVideoToDb(videoData);
    
    result.videoId = videoId;
    result.videoData = videoData;
  }
  
  res.json(result);
});

// Get camera status
app.get('/api/camera/:classId/status', (req, res) => {
  const { classId } = req.params;
  const recording = activeRecordings.get(classId);
  
  if (recording) {
    res.json({
      isRecording: true,
      recordingId: recording.id,
      startTime: recording.startTime,
      duration: (new Date() - recording.startTime) / 1000
    });
  } else {
    res.json({ isRecording: false });
  }
});

// ============= CLASS MANAGEMENT =============

// Create class
app.post('/api/classes', async (req, res) => {
  const { name, institutionId, cameraEnabled, cameraId, cameraType } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Class name is required' });
  }
  
  const classId = `class_${Date.now()}`;
  const classData = {
    id: classId,
    name,
    institution_id: institutionId || 'default',
    timetable: {},
    camera: {
      enabled: cameraEnabled || false,
      camera_id: cameraId || null,
      camera_type: cameraType || 'upload'
    },
    created_at: new Date().toISOString()
  };
  
  await dbSet(`classes/${classId}`, classData);
  
  res.json({ success: true, classId, classData });
});

// Update class timetable
app.put('/api/classes/:id/timetable', async (req, res) => {
  const { id } = req.params;
  const { timetable } = req.body;
  
  try {
    await dbSet(`classes/${id}/timetable`, timetable);
    res.json({ success: true, message: 'Timetable updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update camera settings
app.put('/api/classes/:id/camera', async (req, res) => {
  const { id } = req.params;
  const { enabled, cameraId, cameraType } = req.body;
  
  try {
    await dbUpdate(`classes/${id}/camera`, {
      enabled,
      camera_id: cameraId,
      camera_type: cameraType
    });
    res.json({ success: true, message: 'Camera settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all classes
app.get('/api/classes', async (req, res) => {
  try {
    const classesData = await dbGet('classes');
    const classes = classesData ? Object.values(classesData) : [];
    res.json({ classes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= USER MANAGEMENT =============

// Get users
app.get('/api/users', async (req, res) => {
  const { role } = req.query;
  
  try {
    const usersData = await dbGet('users');
    let users = usersData ? Object.values(usersData) : [];
    
    if (role) {
      users = users.filter(u => u.role === role);
    }
    
    // Remove passwords from response
    users = users.map(({ password, ...user }) => user);
    
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign student to class
app.post('/api/users/:userId/enroll', async (req, res) => {
  const { userId } = req.params;
  const { classId } = req.body;
  
  try {
    const user = await dbGet(`users/${userId}`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const enrolledClasses = user.enrolled_classes || [];
    if (!enrolledClasses.includes(classId)) {
      enrolledClasses.push(classId);
      await dbUpdate(`users/${userId}`, { enrolled_classes: enrolledClasses });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign teacher to class
app.post('/api/users/:userId/assign', async (req, res) => {
  const { userId } = req.params;
  const { classId } = req.body;
  
  try {
    const user = await dbGet(`users/${userId}`);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const assignedClasses = user.assigned_classes || [];
    if (!assignedClasses.includes(classId)) {
      assignedClasses.push(classId);
      await dbUpdate(`users/${userId}`, { assigned_classes: assignedClasses });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= PROCESSING PROGRESS ENDPOINTS =============

// SSE endpoint for real-time progress updates
app.get('/api/processing/progress/:videoId', (req, res) => {
  const { videoId } = req.params;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add this response to listeners
  if (!progressListeners.has(videoId)) {
    progressListeners.set(videoId, new Set());
  }
  progressListeners.get(videoId).add(res);

  // Send current status immediately if exists
  const currentStatus = processingProgress.get(videoId);
  if (currentStatus) {
    res.write(`data: ${JSON.stringify(currentStatus)}\n\n`);
  }

  // Remove listener on disconnect
  req.on('close', () => {
    const listeners = progressListeners.get(videoId);
    if (listeners) {
      listeners.delete(res);
      if (listeners.size === 0) {
        progressListeners.delete(videoId);
      }
    }
  });
});

// Get current processing status
app.get('/api/processing/status/:videoId', (req, res) => {
  const { videoId } = req.params;
  const status = processingProgress.get(videoId);
  
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'No processing status found' });
  }
});

// Get all active processing jobs
app.get('/api/processing/active', (req, res) => {
  const activeJobs = Array.from(processingProgress.values()).filter(
    status => status.overallProgress < 100
  );
  res.json(activeJobs);
});

// Serve processed files
app.use('/processed', express.static(PROCESSED_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/notes', express.static(NOTES_DIR));
app.use('/recordings', express.static(RECORDINGS_DIR));

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   🎓 Class360 Backend Server                                          ║
║   Running on http://localhost:${PORT}                                   ║
║   Firebase: ${useRestApi ? 'REST API' : 'Admin SDK'}                                              ║
║                                                                       ║
║   VIDEO ENDPOINTS:                                                    ║
║   • POST /api/video/upload          - Upload & process video          ║
║   • POST /api/video/:id/process     - Trigger specific processing     ║
║   • GET  /api/video/:id/status      - Get video status                ║
║   • GET  /api/videos                - List all videos                 ║
║   • GET  /api/video/:id/notes/pdf   - Download notes as PDF           ║
║                                                                       ║
║   PROCESSING PROGRESS ENDPOINTS:                                      ║
║   • GET  /api/processing/progress/:id - SSE progress stream           ║
║   • GET  /api/processing/status/:id   - Current status                ║
║   • GET  /api/processing/active       - All active jobs               ║
║                                                                       ║
║   CAMERA ENDPOINTS:                                                   ║
║   • POST /api/camera/:classId/start - Start camera recording          ║
║   • POST /api/camera/:classId/stop  - Stop recording & save           ║
║   • GET  /api/camera/:classId/status - Get recording status           ║
║                                                                       ║
║   CLASS ENDPOINTS:                                                    ║
║   • POST /api/classes               - Create class                    ║
║   • PUT  /api/classes/:id/timetable - Update timetable                ║
║   • PUT  /api/classes/:id/camera    - Update camera settings          ║
║   • GET  /api/classes               - List all classes                ║
║                                                                       ║
║   USER ENDPOINTS:                                                     ║
║   • GET  /api/users                 - List users                      ║
║   • POST /api/users/:id/enroll      - Enroll student in class         ║
║   • POST /api/users/:id/assign      - Assign teacher to class         ║
║                                                                       ║
║   OTHER ENDPOINTS:                                                    ║
║   • GET  /api/jobs                  - View job queue                  ║
║   • GET  /api/health                - Health check                    ║
║                                                                       ║
║   📹 Auto-recording enabled for scheduled classes                     ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);
});
