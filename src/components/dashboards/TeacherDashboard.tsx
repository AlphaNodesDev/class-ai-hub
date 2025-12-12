import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dbGet, dbListen, Video, ClassInfo } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import VideoPlayer from '@/components/video/VideoPlayer';
import {
  Video as VideoIcon,
  FileText,
  Mic,
  Camera,
  Upload,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Calendar,
  BookOpen,
  StopCircle,
  Download,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  
  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadOptions, setUploadOptions] = useState({
    classId: '',
    subject: '',
    date: new Date().toISOString().split('T')[0],
    splitByTimetable: false,
    language: 'ml',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
    
    // Listen for real-time video updates
    const unsub = dbListen('videos', (data) => {
      if (data) {
        const videoList = Object.values(data as Record<string, Video>);
        // Filter by teacher's assigned classes
        const teacherVideos = videoList.filter(v => 
          !user?.assigned_classes || user.assigned_classes.includes(v.class_id)
        );
        setVideos(teacherVideos.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ));
      }
    });
    
    return () => {
      unsub();
      if (recordingInterval.current) clearInterval(recordingInterval.current);
    };
  }, [user]);

  const loadData = async () => {
    try {
      const [videosData, classesData] = await Promise.all([
        dbGet('videos'),
        dbGet('classes'),
      ]);
      
      if (videosData) {
        const videoList = Object.values(videosData as Record<string, Video>);
        const teacherVideos = videoList.filter(v => 
          !user?.assigned_classes || user.assigned_classes.includes(v.class_id)
        );
        setVideos(teacherVideos.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ));
      }
      
      if (classesData) {
        const classList = Object.values(classesData as Record<string, ClassInfo>);
        // Filter to teacher's assigned classes
        const teacherClasses = user?.assigned_classes 
          ? classList.filter(c => user.assigned_classes?.includes(c.id))
          : classList;
        setClasses(teacherClasses);
        if (teacherClasses.length > 0 && !uploadOptions.classId) {
          setUploadOptions(prev => ({ ...prev, classId: teacherClasses[0].id }));
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    if (!uploadOptions.classId) {
      toast.error('Please select a class first');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/camera/${uploadOptions.classId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsRecording(true);
        setRecordingTime(0);
        recordingInterval.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
        toast.success('Recording started');
      } else {
        toast.error(data.error || 'Failed to start recording');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Could not connect to backend. Make sure the server is running.');
    }
  };

  const stopRecording = async () => {
    if (!uploadOptions.classId) return;
    
    try {
      const response = await fetch(`${API_URL}/camera/${uploadOptions.classId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsRecording(false);
        if (recordingInterval.current) {
          clearInterval(recordingInterval.current);
        }
        toast.success('Recording saved and processing started');
      } else {
        toast.error(data.error || 'Failed to stop recording');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Could not connect to backend');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setShowUpload(true);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('video', uploadFile);
      formData.append('classId', uploadOptions.classId);
      formData.append('subject', uploadOptions.subject);
      formData.append('date', uploadOptions.date);
      formData.append('teacherId', user?.id || '');
      formData.append('language', uploadOptions.language);
      if (uploadOptions.splitByTimetable) {
        formData.append('splitByTimetable', 'true');
      }
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            toast.success(response.message || 'Video uploaded and processing started');
            setShowUpload(false);
            setUploadFile(null);
            setUploadProgress(0);
          } else {
            toast.error(response.error || 'Upload failed');
          }
        } else {
          toast.error('Upload failed');
        }
        setIsUploading(false);
      });
      
      xhr.addEventListener('error', () => {
        toast.error('Upload failed. Make sure the backend is running.');
        setIsUploading(false);
      });
      
      xhr.open('POST', `${API_URL}/video/upload`);
      xhr.send(formData);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload video');
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: Video['status']) => {
    if (status.ocr_notes && status.dubbed && status.subtitles) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
    if (status.uploaded) {
      return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    }
    return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusText = (status: Video['status']) => {
    if (status.ocr_notes && status.dubbed && status.subtitles) return 'Complete';
    if (status.dubbed) return 'Extracting notes...';
    if (status.subtitles) return 'Generating dub...';
    if (status.trimmed) return 'Generating subtitles...';
    if (status.uploaded) return 'Processing...';
    return 'Pending';
  };

  const getProgress = (status: Video['status']) => {
    let progress = 0;
    if (status.uploaded) progress += 20;
    if (status.trimmed) progress += 20;
    if (status.subtitles) progress += 20;
    if (status.dubbed) progress += 20;
    if (status.ocr_notes) progress += 20;
    return progress;
  };

  if (selectedVideo) {
    return (
      <DashboardLayout title="Video Player" subtitle={`${selectedVideo.subject} - ${selectedVideo.date}`}>
        <div className="space-y-4 animate-slide-up">
          <Button variant="ghost" onClick={() => setSelectedVideo(null)}>
            ← Back to Dashboard
          </Button>
          <VideoPlayer video={selectedVideo} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Teacher Dashboard" subtitle={`Welcome, ${user?.name || 'Teacher'}`}>
      <div className="space-y-6 animate-slide-up">
        {/* Recording Status */}
        {isRecording && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium">Recording in progress...</span>
                <span className="text-muted-foreground font-body font-mono">{formatTime(recordingTime)}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={stopRecording}>
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Recording
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card variant="interactive" onClick={isRecording ? stopRecording : startRecording}>
            <CardContent className="p-6 text-center">
              <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${isRecording ? 'from-red-600 to-rose-600' : 'from-red-500 to-rose-500'} flex items-center justify-center mb-3`}>
                {isRecording ? <StopCircle className="w-6 h-6 text-white" /> : <Camera className="w-6 h-6 text-white" />}
              </div>
              <h3 className="font-medium text-sm">{isRecording ? 'Stop Recording' : 'Start Recording'}</h3>
            </CardContent>
          </Card>

          <Card variant="interactive" onClick={() => fileInputRef.current?.click()}>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-medium text-sm">Upload Video</h3>
            </CardContent>
          </Card>

          <Card variant="interactive">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-3">
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-medium text-sm">Generate Subtitles</h3>
            </CardContent>
          </Card>

          <Card variant="interactive">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-medium text-sm">Extract Notes</h3>
            </CardContent>
          </Card>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Class Selection for Recording */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Recording Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Select Class</label>
                <select
                  value={uploadOptions.classId}
                  onChange={(e) => setUploadOptions({ ...uploadOptions, classId: e.target.value })}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a class...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Subject</label>
                <Input
                  placeholder="e.g., Circuits, Signals"
                  value={uploadOptions.subject}
                  onChange={(e) => setUploadOptions({ ...uploadOptions, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Language</label>
                <select
                  value={uploadOptions.language}
                  onChange={(e) => setUploadOptions({ ...uploadOptions, language: e.target.value })}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="ml">Malayalam</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Recordings</CardTitle>
            <span className="text-sm text-muted-foreground">{videos.length} videos</span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-8">
                <VideoIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-body">No recordings yet</p>
                <p className="text-sm text-muted-foreground font-body">Start recording or upload a video</p>
              </div>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div 
                      className="flex items-center gap-4 cursor-pointer flex-1"
                      onClick={() => setSelectedVideo(video)}
                    >
                      <div className="w-20 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <Play className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{video.subject}</h4>
                        <p className="text-sm text-muted-foreground font-body">
                          {video.class_id} • {new Date(video.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Progress bar for processing */}
                      {getProgress(video.status) < 100 && (
                        <div className="w-24">
                          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-primary rounded-full transition-all" 
                              style={{ width: `${getProgress(video.status)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        {getStatusIcon(video.status)}
                        <span className="text-sm text-muted-foreground font-body min-w-[100px]">
                          {getStatusText(video.status)}
                        </span>
                      </div>
                      
                      {video.status.ocr_notes && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(`${API_URL}/video/${video.id}/notes/pdf`, '_blank')}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Modal */}
        {showUpload && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg animate-slide-up">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Upload Video</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowUpload(false); setUploadFile(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="font-medium text-sm">{uploadFile?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {((uploadFile?.size || 0) / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Class</label>
                    <select
                      value={uploadOptions.classId}
                      onChange={(e) => setUploadOptions({ ...uploadOptions, classId: e.target.value })}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Select class...</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Date</label>
                    <Input
                      type="date"
                      value={uploadOptions.date}
                      onChange={(e) => setUploadOptions({ ...uploadOptions, date: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Subject</label>
                    <Input
                      placeholder="e.g., Circuits"
                      value={uploadOptions.subject}
                      onChange={(e) => setUploadOptions({ ...uploadOptions, subject: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Language</label>
                    <select
                      value={uploadOptions.language}
                      onChange={(e) => setUploadOptions({ ...uploadOptions, language: e.target.value })}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="ml">Malayalam</option>
                      <option value="en">English</option>
                      <option value="hi">Hindi</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                  <input
                    type="checkbox"
                    id="splitByTimetable"
                    checked={uploadOptions.splitByTimetable}
                    onChange={(e) => setUploadOptions({ ...uploadOptions, splitByTimetable: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="splitByTimetable" className="text-sm">
                    <span className="font-medium">Split by timetable</span>
                    <p className="text-xs text-muted-foreground">Auto-split full day video into class periods</p>
                  </label>
                </div>
                
                {isUploading && (
                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-primary rounded-full transition-all" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-center text-muted-foreground">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}
                
                <Button 
                  className="w-full" 
                  onClick={handleUpload} 
                  disabled={isUploading || !uploadOptions.classId}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload & Process
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TeacherDashboard;
