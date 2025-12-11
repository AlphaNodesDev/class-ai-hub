import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import VideoPlayer from '@/components/video/VideoPlayer';
import {
  BookOpen,
  Play,
  FileText,
  Clock,
  Search,
  Filter,
  ChevronRight,
} from 'lucide-react';

interface Subject {
  id: string;
  name: string;
  teacher: string;
  videoCount: number;
  recentVideo?: string;
  color: string;
}

const StudentDashboard: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const subjects: Subject[] = [
    { id: '1', name: 'Circuits', teacher: 'Raj Kumar', videoCount: 12, recentVideo: 'Ohm\'s Law', color: 'from-blue-500 to-cyan-500' },
    { id: '2', name: 'Signals & Systems', teacher: 'Raj Kumar', videoCount: 8, recentVideo: 'Fourier Transform', color: 'from-green-500 to-emerald-500' },
    { id: '3', name: 'Electromagnetics', teacher: 'Priya S', videoCount: 15, recentVideo: 'Maxwell\'s Equations', color: 'from-purple-500 to-violet-500' },
    { id: '4', name: 'Control Systems', teacher: 'Kumar R', videoCount: 10, recentVideo: 'PID Controllers', color: 'from-orange-500 to-amber-500' },
  ];

  const recentVideos = [
    { id: '1', title: 'Introduction to Ohm\'s Law', subject: 'Circuits', duration: '45:30', date: '2025-12-10' },
    { id: '2', title: 'Kirchhoff\'s Laws', subject: 'Circuits', duration: '38:15', date: '2025-12-09' },
    { id: '3', title: 'Fourier Transform Basics', subject: 'Signals', duration: '52:00', date: '2025-12-08' },
  ];

  if (selectedVideo) {
    return (
      <DashboardLayout title="Video Player" subtitle="Circuits - Ohm's Law">
        <div className="space-y-4 animate-slide-up">
          <Button variant="ghost" onClick={() => setSelectedVideo(null)}>
            ← Back to Dashboard
          </Button>
          <VideoPlayer />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Student Dashboard" subtitle="Welcome back! Continue learning">
      <div className="space-y-6 animate-slide-up">
        {/* Continue Watching */}
        <Card variant="gradient" className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              <div 
                className="relative w-full md:w-80 h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center cursor-pointer group"
                onClick={() => setSelectedVideo('1')}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="w-6 h-6 text-primary-foreground ml-1" />
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <span className="text-xs bg-background/80 px-2 py-1 rounded font-body">23:45 remaining</span>
                </div>
              </div>
              <div className="flex-1 p-6">
                <span className="text-xs text-primary font-medium uppercase tracking-wide">Continue Watching</span>
                <h3 className="text-xl font-semibold mt-2">Introduction to Ohm's Law</h3>
                <p className="text-muted-foreground font-body mt-1">Circuits • Raj Kumar</p>
                <div className="mt-4">
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-gradient-primary rounded-full" />
                  </div>
                  <p className="text-xs text-muted-foreground font-body mt-2">65% complete</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subjects Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Subjects</h2>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {subjects.map((subject) => (
              <Card key={subject.id} variant="interactive">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${subject.color} flex items-center justify-center mb-4`}>
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold">{subject.name}</h3>
                  <p className="text-sm text-muted-foreground font-body">{subject.teacher}</p>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-sm text-muted-foreground font-body">{subject.videoCount} videos</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Videos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Videos</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search videos..."
                  className="w-40 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none font-body"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentVideos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => setSelectedVideo(video.id)}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Play className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{video.title}</h4>
                      <p className="text-xs text-muted-foreground font-body">{video.subject}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 font-body">
                      <Clock className="w-4 h-4" />
                      {video.duration}
                    </div>
                    <span className="font-body">{video.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Notes */}
        <Card>
          <CardHeader>
            <CardTitle>AI-Generated Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: 'Ohm\'s Law Explained', pages: 5, subject: 'Circuits' },
                { title: 'Kirchhoff\'s Laws Summary', pages: 3, subject: 'Circuits' },
                { title: 'Fourier Transform Formulas', pages: 8, subject: 'Signals' },
              ].map((note, index) => (
                <Card key={index} variant="interactive">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{note.title}</h4>
                      <p className="text-xs text-muted-foreground font-body">
                        {note.pages} pages • {note.subject}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default StudentDashboard;
