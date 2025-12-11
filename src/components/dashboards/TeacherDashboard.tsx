import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dbGet, Video } from '@/lib/firebase';
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
} from 'lucide-react';

const TeacherDashboard: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const data = await dbGet('videos') as Record<string, Video> | null;
      if (data) {
        setVideos(Object.values(data));
      }
    } catch (error) {
      console.error('Error loading videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: Video['status']) => {
    if (status.ocr_notes && status.dubbed && status.subtitles) {
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    }
    if (status.uploaded) {
      return <Clock className="w-4 h-4 text-warning" />;
    }
    return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusText = (status: Video['status']) => {
    if (status.ocr_notes && status.dubbed && status.subtitles) return 'Complete';
    if (status.dubbed) return 'Processing OCR';
    if (status.subtitles) return 'Generating dub';
    if (status.trimmed) return 'Generating subtitles';
    if (status.uploaded) return 'Trimming video';
    return 'Pending upload';
  };

  const quickActions = [
    { icon: Camera, label: 'Start Recording', color: 'from-red-500 to-rose-500', action: () => setIsRecording(!isRecording) },
    { icon: Upload, label: 'Upload Video', color: 'from-blue-500 to-cyan-500', action: () => {} },
    { icon: Mic, label: 'Generate Subtitles', color: 'from-green-500 to-emerald-500', action: () => {} },
    { icon: FileText, label: 'Extract Notes', color: 'from-purple-500 to-violet-500', action: () => {} },
  ];

  return (
    <DashboardLayout title="Teacher Dashboard" subtitle="Manage your classroom recordings">
      <div className="space-y-6 animate-slide-up">
        {/* Recording Status */}
        {isRecording && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="font-medium">Recording in progress...</span>
                <span className="text-muted-foreground font-body">00:15:32</span>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setIsRecording(false)}>
                Stop Recording
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card key={action.label} variant="interactive" onClick={action.action}>
                <CardContent className="p-6 text-center">
                  <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-medium text-sm">{action.label}</h3>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Recordings</CardTitle>
            <Button variant="outline" size="sm">
              View All
            </Button>
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
                {videos.slice(0, 5).map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <Play className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{video.subject}</h4>
                        <p className="text-xs text-muted-foreground font-body">
                          {new Date(video.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(video.status)}
                      <span className="text-sm text-muted-foreground font-body">
                        {getStatusText(video.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Processing Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Circuits Lecture - Part 1', step: 'Generating English dub', progress: 65 },
                { name: 'Signals & Systems', step: 'Extracting board notes', progress: 30 },
              ].map((job, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{job.name}</span>
                    <span className="text-muted-foreground font-body">{job.progress}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-body">{job.step}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeacherDashboard;
