require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Firebase Admin initialization
let db;
try {
  // For local development, use service account if available
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: 'https://electrex-default-rtdb.asia-southeast1.firebasedatabase.app'
    });
  } else {
    // Use default credentials or environment variables
    initializeApp({
      databaseURL: 'https://electrex-default-rtdb.asia-southeast1.firebasedatabase.app'
    });
  }
  db = getDatabase();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('⚠️ Firebase initialization error:', error.message);
  console.log('Running in standalone mode without Firebase Admin');
}

// Middleware
app.use(cors());
app.use(express.json());

// Storage configuration
const UPLOAD_DIR = path.join(__dirname, '../uploads');
const PROCESSED_DIR = path.join(__dirname, '../processed');
const RECORDINGS_DIR = path.join(__dirname, '../recordings');

// Create directories if they don't exist
[UPLOAD_DIR, PROCESSED_DIR, RECORDINGS_DIR].forEach(dir => {
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

// Job queue for processing
const jobQueue = [];
let isProcessing = false;

// ============= HELPER FUNCTIONS =============

const runPythonScript = (scriptName, args) => {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', scriptName);
    
    console.log(`🐍 Running: ${pythonPath} ${scriptPath} ${args.join(' ')}`);
    
    const process = spawn(pythonPath, [scriptPath, ...args]);
    let output = '';
    let errorOutput = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`📝 ${scriptName}: ${data.toString().trim()}`);
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`⚠️ ${scriptName}: ${data.toString().trim()}`);
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Script exited with code ${code}: ${errorOutput}`));
      }
    });
  });
};

const updateVideoStatus = async (videoId, statusUpdate) => {
  if (!db) return;
  try {
    const videoRef = db.ref(`videos/${videoId}/status`);
    await videoRef.update(statusUpdate);
    console.log(`✅ Updated video ${videoId} status:`, statusUpdate);
  } catch (error) {
    console.error('Error updating video status:', error);
  }
};

const addVideoToDb = async (videoData) => {
  if (!db) return videoData.id;
  try {
    const videoRef = db.ref(`videos/${videoData.id}`);
    await videoRef.set(videoData);
    console.log(`✅ Added video ${videoData.id} to database`);
    return videoData.id;
  } catch (error) {
    console.error('Error adding video to database:', error);
    return videoData.id;
  }
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
          '--start_trim', job.startTrim || '180',
          '--end_trim', job.endTrim || '180',
          '--output', job.outputPath
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
        break;
        
      case 'dub':
        await updateVideoStatus(job.videoId, { generating_dub: true });
        await runPythonScript('dub_to_english.py', [
          job.inputPath,
          '--model', job.model || 'small',
          '--src_lang', job.srcLang || 'ml'
        ]);
        await updateVideoStatus(job.videoId, { generating_dub: false, dubbed: true });
        break;
        
      case 'ocr':
        await updateVideoStatus(job.videoId, { extracting_notes: true });
        await runPythonScript('extract_board_notes.py', [
          job.inputPath,
          '--interval', job.interval || '30'
        ]);
        await updateVideoStatus(job.videoId, { extracting_notes: false, ocr_notes: true });
        break;
        
      case 'full_pipeline':
        // Run complete pipeline
        const baseName = path.basename(job.inputPath, path.extname(job.inputPath));
        const trimmedPath = path.join(PROCESSED_DIR, `${baseName}_trimmed.mp4`);
        
        // Trim
        await runPythonScript('trim_video.py', [
          job.inputPath,
          '--start_trim', job.startTrim || '0',
          '--end_trim', job.endTrim || '0',
          '--output', trimmedPath
        ]);
        await updateVideoStatus(job.videoId, { trimmed: true });
        
        // Subtitles
        await runPythonScript('generate_subtitles.py', [
          trimmedPath,
          '--model', 'small',
          '--language', job.language || 'ml'
        ]);
        await updateVideoStatus(job.videoId, { subtitles: true });
        
        // Dub
        await runPythonScript('dub_to_english.py', [
          trimmedPath,
          '--model', 'small',
          '--src_lang', job.language || 'ml'
        ]);
        await updateVideoStatus(job.videoId, { dubbed: true });
        
        // OCR
        await runPythonScript('extract_board_notes.py', [trimmedPath]);
        await updateVideoStatus(job.videoId, { ocr_notes: true });
        break;
    }
    
    console.log(`✅ Job ${job.type} completed for video ${job.videoId}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Job ${job.type} failed:`, error.message);
    return { success: false, error: error.message };
  }
};

const processQueue = async () => {
  if (isProcessing || jobQueue.length === 0) return;
  
  isProcessing = true;
  const job = jobQueue.shift();
  
  await processJob(job);
  
  isProcessing = false;
  processQueue(); // Process next job
};

const addToQueue = (job) => {
  job.id = uuidv4();
  job.createdAt = new Date().toISOString();
  job.status = 'queued';
  jobQueue.push(job);
  console.log(`📋 Added job to queue: ${job.type} (${job.id})`);
  processQueue();
  return job.id;
};

// ============= TIMETABLE-BASED VIDEO SPLITTING =============

const splitVideoByTimetable = async (videoPath, classId, date) => {
  if (!db) {
    console.log('⚠️ Firebase not available, skipping timetable split');
    return [];
  }
  
  try {
    // Get class timetable
    const classRef = db.ref(`classes/${classId}`);
    const classSnapshot = await classRef.once('value');
    const classData = classSnapshot.val();
    
    if (!classData || !classData.timetable) {
      console.log('⚠️ No timetable found for class:', classId);
      return [];
    }
    
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'lowercase' });
    const periods = classData.timetable[dayOfWeek] || [];
    
    if (periods.length === 0) {
      console.log('⚠️ No periods scheduled for:', dayOfWeek);
      return [];
    }
    
    const videos = [];
    
    for (const period of periods) {
      const videoId = `video_${date.replace(/-/g, '')}_${classId}_h${period.hour}`;
      const outputPath = path.join(PROCESSED_DIR, `${videoId}.mp4`);
      
      // Calculate start and end times in seconds from video start
      // Assuming video starts at first period start time
      const firstPeriodStart = periods[0].start;
      const periodStartSeconds = timeToSeconds(period.start) - timeToSeconds(firstPeriodStart);
      const periodEndSeconds = timeToSeconds(period.end) - timeToSeconds(firstPeriodStart);
      const duration = periodEndSeconds - periodStartSeconds;
      
      // Use ffmpeg to extract segment
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoPath,
          '-ss', periodStartSeconds.toString(),
          '-t', duration.toString(),
          '-c', 'copy',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
      });
      
      // Create video entry
      const videoData = {
        id: videoId,
        class_id: classId,
        subject: period.subject,
        teacher: period.teacher,
        date,
        hour: period.hour,
        start_time: period.start,
        end_time: period.end,
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
        language: 'ml'
      });
    }
    
    return videos;
  } catch (error) {
    console.error('Error splitting video by timetable:', error);
    return [];
  }
};

const timeToSeconds = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 3600 + minutes * 60;
};

// ============= API ROUTES =============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    firebase: db ? 'connected' : 'standalone',
    queue: jobQueue.length,
    processing: isProcessing
  });
});

// Upload video
app.post('/api/video/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    
    const { classId, subject, date, splitByTimetable } = req.body;
    const videoPath = req.file.path;
    
    if (splitByTimetable === 'true' && classId && date) {
      // Split the full day video by timetable
      const videos = await splitVideoByTimetable(videoPath, classId, date);
      return res.json({ 
        success: true, 
        message: `Video split into ${videos.length} periods`,
        videos 
      });
    }
    
    // Single video upload
    const videoId = `video_${Date.now()}`;
    const videoData = {
      id: videoId,
      class_id: classId || 'unknown',
      subject: subject || 'Unknown',
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
  
  // Get video from DB or use provided path
  let inputPath = options.inputPath;
  
  if (!inputPath && db) {
    try {
      const videoRef = db.ref(`videos/${id}`);
      const snapshot = await videoRef.once('value');
      const video = snapshot.val();
      if (video) {
        inputPath = video.original_video_url;
      }
    } catch (error) {
      console.error('Error fetching video:', error);
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
  
  if (!db) {
    return res.json({ id, status: 'unknown', message: 'Firebase not connected' });
  }
  
  try {
    const videoRef = db.ref(`videos/${id}`);
    const snapshot = await videoRef.once('value');
    const video = snapshot.val();
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all videos
app.get('/api/videos', async (req, res) => {
  const { classId } = req.query;
  
  if (!db) {
    return res.json({ videos: [] });
  }
  
  try {
    const videosRef = db.ref('videos');
    const snapshot = await videosRef.once('value');
    let videos = [];
    
    snapshot.forEach((child) => {
      const video = child.val();
      if (!classId || video.class_id === classId) {
        videos.push(video);
      }
    });
    
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job queue status
app.get('/api/jobs', (req, res) => {
  res.json({
    queue: jobQueue,
    isProcessing,
    queueLength: jobQueue.length
  });
});

// ============= CLASS MANAGEMENT =============

// Create class
app.post('/api/classes', async (req, res) => {
  const { name, institutionId, cameraEnabled, cameraId } = req.body;
  
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
      camera_type: 'upload'
    },
    created_at: new Date().toISOString()
  };
  
  if (db) {
    try {
      await db.ref(`classes/${classId}`).set(classData);
    } catch (error) {
      console.error('Error creating class:', error);
    }
  }
  
  res.json({ success: true, classId, classData });
});

// Update class timetable
app.put('/api/classes/:id/timetable', async (req, res) => {
  const { id } = req.params;
  const { timetable } = req.body;
  
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  
  try {
    await db.ref(`classes/${id}/timetable`).set(timetable);
    res.json({ success: true, message: 'Timetable updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update camera settings
app.put('/api/classes/:id/camera', async (req, res) => {
  const { id } = req.params;
  const { enabled, cameraId, cameraType } = req.body;
  
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  
  try {
    await db.ref(`classes/${id}/camera`).update({
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
  if (!db) {
    return res.json({ classes: [] });
  }
  
  try {
    const snapshot = await db.ref('classes').once('value');
    const classes = [];
    snapshot.forEach((child) => {
      classes.push(child.val());
    });
    res.json({ classes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve processed files
app.use('/processed', express.static(PROCESSED_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎓 Class360 Backend Server                              ║
║   Running on http://localhost:${PORT}                       ║
║                                                           ║
║   Endpoints:                                              ║
║   • POST /api/video/upload     - Upload video             ║
║   • POST /api/video/:id/process - Trigger processing      ║
║   • GET  /api/video/:id/status - Get video status         ║
║   • GET  /api/videos           - List all videos          ║
║   • POST /api/classes          - Create class             ║
║   • PUT  /api/classes/:id/timetable - Update timetable    ║
║   • PUT  /api/classes/:id/camera - Update camera          ║
║   • GET  /api/classes          - List all classes         ║
║   • GET  /api/jobs             - View job queue           ║
║   • GET  /api/health           - Health check             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
