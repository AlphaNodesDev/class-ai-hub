import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import VideoPlayer from '@/components/video/VideoPlayer';
import { dbGet, dbListen, Video, ClassInfo, User } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  BookOpen,
  Play,
  FileText,
  Clock,
  Search,
  Filter,
  ChevronRight,
  Download,
  Loader2,
  GraduationCap,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface SubjectGroup {
  subject: string;
  videos: Video[];
  teacher: string;
  color: string;
}

const SUBJECT_COLORS = [
  'from-blue-500 to-cyan-500',
  'from-green-500 to-emerald-500',
  'from-purple-500 to-violet-500',
  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
  'from-teal-500 to-cyan-500',
];

const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    
    // Listen for new videos
    const unsub = dbListen('videos', (data) => {
      if (data) {
        const videoList = Object.values(data as Record<string, Video>);
        // Filter by enrolled classes and completed processing
        const studentVideos = videoList.filter(v => 
          (!user?.enrolled_classes || user.enrolled_classes.length === 0 || user.enrolled_classes.includes(v.class_id)) &&
          v.status.subtitles
        );
        setVideos(studentVideos.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ));
      }
    });
    
    return () => unsub();
  }, [user]);

  const loadData = async () => {
    try {
      const [videosData, classesData] = await Promise.all([
        dbGet('videos'),
        dbGet('classes'),
      ]);
      
      if (videosData) {
        const videoList = Object.values(videosData as Record<string, Video>);
        // Filter to enrolled classes and completed videos
        const studentVideos = videoList.filter(v => 
          (!user?.enrolled_classes || user.enrolled_classes.length === 0 || user.enrolled_classes.includes(v.class_id)) &&
          v.status.subtitles
        );
        setVideos(studentVideos.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ));
      }
      
      if (classesData) {
        const classList = Object.values(classesData as Record<string, ClassInfo>);
        setClasses(classList);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load videos');
    } finally {
      setIsLoading(false);
    }
  };

  // Group videos by subject
  const subjectGroups: SubjectGroup[] = React.useMemo(() => {
    const groups: Record<string, SubjectGroup> = {};
    
    videos.forEach((video, index) => {
      const subject = video.subject || 'Unknown';
      if (!groups[subject]) {
        groups[subject] = {
          subject,
          videos: [],
          teacher: (video as any).teacher_name || 'Unknown',
          color: SUBJECT_COLORS[Object.keys(groups).length % SUBJECT_COLORS.length],
        };
      }
      groups[subject].videos.push(video);
    });
    
    return Object.values(groups);
  }, [videos]);

  // Filter videos by search and selected subject
  const filteredVideos = React.useMemo(() => {
    let filtered = [...videos];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        v.subject?.toLowerCase().includes(query) ||
        (v as any).teacher_name?.toLowerCase().includes(query) ||
        (v as any).topics?.some((t: string) => t.toLowerCase().includes(query))
      );
    }
    
    if (selectedSubject) {
      filtered = filtered.filter(v => v.subject === selectedSubject);
    }
    
    return filtered;
  }, [videos, searchQuery, selectedSubject]);

  // Get last watched video (mock - would normally come from user data)
  const continueWatching = videos[0];

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '45:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (selectedVideo) {
    return (
      <DashboardLayout title="Video Player" subtitle={`${selectedVideo.subject} - ${new Date(selectedVideo.date).toLocaleDateString()}`}>
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
    <DashboardLayout title="Student Dashboard" subtitle={`Welcome back, ${user?.name || 'Student'}!`}>
      <div className="space-y-6 animate-slide-up">
        {/* Continue Watching */}
        {continueWatching && (
          <Card variant="gradient" className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                <div 
                  className="relative w-full md:w-80 h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center cursor-pointer group"
                  onClick={() => setSelectedVideo(continueWatching)}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-primary-foreground ml-1" />
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <span className="text-xs bg-background/80 px-2 py-1 rounded font-body">
                      {formatDuration((continueWatching as any).duration)}
                    </span>
                  </div>
                </div>
                <div className="flex-1 p-6">
                  <span className="text-xs text-primary font-medium uppercase tracking-wide">Continue Watching</span>
                  <h3 className="text-xl font-semibold mt-2">{continueWatching.subject}</h3>
                  <p className="text-muted-foreground font-body mt-1">
                    {(continueWatching as any).class_name || continueWatching.class_id} • {(continueWatching as any).teacher_name || 'Teacher'}
                  </p>
                  <p className="text-sm text-muted-foreground font-body mt-2">
                    {new Date(continueWatching.date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                  
                  {/* AI Topics */}
                  {(continueWatching as any).topics?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {(continueWatching as any).topics.slice(0, 4).map((topic: string, i: number) => (
                        <span key={i} className="text-xs bg-secondary px-2 py-1 rounded-full">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subjects Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Subjects</h2>
            {selectedSubject && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedSubject(null)}>
                Clear filter
              </Button>
            )}
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : subjectGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No Videos Available Yet</h3>
                <p className="text-muted-foreground text-sm">
                  Your teachers will upload class recordings soon.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {subjectGroups.map((group) => (
                <Card 
                  key={group.subject} 
                  variant="interactive"
                  onClick={() => setSelectedSubject(selectedSubject === group.subject ? null : group.subject)}
                  className={selectedSubject === group.subject ? 'ring-2 ring-primary' : ''}
                >
                  <CardContent className="p-5">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${group.color} flex items-center justify-center mb-4`}>
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-semibold">{group.subject}</h3>
                    <p className="text-sm text-muted-foreground font-body">{group.teacher}</p>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <span className="text-sm text-muted-foreground font-body">{group.videos.length} videos</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Search & Video List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selectedSubject || 'All Videos'}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none font-body"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredVideos.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No videos found</p>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div 
                      className="flex items-center gap-4 cursor-pointer flex-1"
                      onClick={() => setSelectedVideo(video)}
                    >
                      <div className="w-20 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
                        <Play className="w-5 h-5 text-primary" />
                        {video.status.dubbed && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-primary text-primary-foreground px-1 rounded">
                            EN
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium">{video.subject}</h4>
                        <p className="text-sm text-muted-foreground font-body">
                          {(video as any).teacher_name || 'Teacher'} • {new Date(video.date).toLocaleDateString()}
                        </p>
                        {(video as any).topics?.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {(video as any).topics.slice(0, 3).map((topic: string, i: number) => (
                              <span key={i} className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground font-body">
                        <Clock className="w-4 h-4" />
                        {formatDuration((video as any).duration)}
                      </div>
                      
                      <div className="flex gap-2">
                        {video.status.subtitles && (
                          <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded">
                            Subtitles
                          </span>
                        )}
                        {video.status.dubbed && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded">
                            Dubbed
                          </span>
                        )}
                      </div>
                      
                      {video.status.ocr_notes && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`${API_URL}/video/${video.id}/notes/pdf`, '_blank');
                          }}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Notes
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI-Generated Notes Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              AI-Generated Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {videos.filter(v => v.status.ocr_notes).length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                Notes will appear here once videos are processed
              </p>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {videos.filter(v => v.status.ocr_notes).slice(0, 6).map((video) => (
                  <Card 
                    key={video.id} 
                    variant="interactive"
                    onClick={() => window.open(`${API_URL}/video/${video.id}/notes/pdf`, '_blank')}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm truncate">{video.subject} Notes</h4>
                        <p className="text-xs text-muted-foreground font-body">
                          {new Date(video.date).toLocaleDateString()} • PDF
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default StudentDashboard;
