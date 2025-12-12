import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video } from '@/lib/firebase';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Subtitles,
  Languages,
  FileText,
  MessageSquare,
  ChevronDown,
  Download,
  Search,
} from 'lucide-react';

interface Subtitle {
  start: number;
  end: number;
  text: string;
}

interface Question {
  id: string;
  text: string;
  year: number;
  timestamp: number;
}

interface VideoPlayerProps {
  video?: Video;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [audioTrack, setAudioTrack] = useState<'original' | 'english'>('original');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'subtitles' | 'notes' | 'questions'>('subtitles');
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Mock questions - in real app, fetch from Firebase
  const questions: Question[] = [
    { id: '1', text: 'Explain the main concept with examples', year: 2023, timestamp: 120 },
    { id: '2', text: 'Calculate the values in the given problem', year: 2022, timestamp: 300 },
    { id: '3', text: 'Derive the formula from first principles', year: 2023, timestamp: 450 },
  ];

  useEffect(() => {
    // Load subtitles if available
    if (video?.subtitle_url) {
      loadSubtitles(video.subtitle_url);
    } else {
      // Mock subtitles for demo
      setSubtitles([
        { start: 0, end: 5, text: 'Welcome to today\'s lecture.' },
        { start: 5, end: 10, text: 'Today we will cover important concepts.' },
        { start: 10, end: 15, text: 'Let\'s start with the fundamentals.' },
        { start: 15, end: 20, text: 'This is key to understanding the topic.' },
        { start: 20, end: 25, text: 'Now let\'s look at some examples.' },
        { start: 25, end: 30, text: 'Here is the first example.' },
        { start: 30, end: 35, text: 'Notice how we apply the formula.' },
        { start: 35, end: 40, text: 'The result demonstrates the principle.' },
        { start: 40, end: 45, text: 'Let\'s try another example.' },
      ]);
    }

    // Load notes if available
    if (video?.notes_url) {
      loadNotes(video.notes_url);
    } else {
      // Mock notes
      setNotes([
        '## Key Concepts',
        '- Main principle explained',
        '- Formula: A = B × C',
        '- Important variables:',
        '  - A = Output value',
        '  - B = Input factor',
        '  - C = Constant coefficient',
        '',
        '## Examples',
        '- Example 1: Basic calculation',
        '- Example 2: Advanced application',
        '',
        '## Summary',
        '- Key takeaways from the lecture',
        '- Review the formulas',
      ]);
    }

    // Set initial duration
    setDuration((video as any)?.duration || 2700);
  }, [video]);

  const loadSubtitles = async (url: string) => {
    try {
      const response = await fetch(url);
      const text = await response.text();
      // Parse SRT format
      const parsed = parseSRT(text);
      setSubtitles(parsed);
    } catch (error) {
      console.error('Error loading subtitles:', error);
    }
  };

  const loadNotes = async (url: string) => {
    try {
      const response = await fetch(url);
      const text = await response.text();
      setNotes(text.split('\n'));
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const parseSRT = (srt: string): Subtitle[] => {
    const lines = srt.trim().split('\n');
    const subtitles: Subtitle[] = [];
    let i = 0;
    
    while (i < lines.length) {
      // Skip subtitle number
      i++;
      
      // Parse timestamp
      const timeLine = lines[i];
      if (!timeLine) break;
      
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (!timeMatch) {
        i++;
        continue;
      }
      
      const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
      const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
      
      i++;
      
      // Collect text lines until empty line
      let text = '';
      while (i < lines.length && lines[i].trim() !== '') {
        text += (text ? ' ' : '') + lines[i];
        i++;
      }
      
      if (text) {
        subtitles.push({ start, end, text });
      }
      
      i++;
    }
    
    return subtitles;
  };

  const currentSubtitle = subtitles.find(
    (sub) => currentTime >= sub.start && currentTime < sub.end
  );

  const filteredSubtitles = searchQuery
    ? subtitles.filter(s => s.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : subtitles;

  const formatTime = (time: number) => {
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    } else {
      // Demo mode - toggle state
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const jumpToTime = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.parentElement?.requestFullscreen();
      }
    }
  };

  // Simulate playback in demo mode
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && !videoRef.current?.src) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const videoSrc = audioTrack === 'english' && video?.dub_url 
    ? video.dub_url 
    : video?.original_video_url;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Video Section */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="overflow-hidden">
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full"
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Video overlay for demo/loading state */}
            {!videoSrc && (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-background/50 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div 
                    className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center mx-auto cursor-pointer hover:scale-110 transition-transform"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8 text-primary-foreground" />
                    ) : (
                      <Play className="w-8 h-8 text-primary-foreground ml-1" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{video?.subject || 'Lecture'}</h3>
                    <p className="text-muted-foreground font-body">
                      {(video as any)?.class_name || video?.class_id} • {(video as any)?.teacher_name || 'Teacher'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Subtitles overlay */}
            {showSubtitles && currentSubtitle && (
              <div className="absolute bottom-20 left-0 right-0 px-4">
                <div className="max-w-2xl mx-auto bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg text-center">
                  <p className="font-body">{currentSubtitle.text}</p>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-4">
              {/* Progress bar */}
              <div className="relative group">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-secondary rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                />
                {/* Subtitle markers */}
                <div className="absolute top-0 left-0 right-0 h-1 pointer-events-none">
                  {subtitles.map((sub, i) => (
                    <div
                      key={i}
                      className="absolute h-full bg-primary/30"
                      style={{
                        left: `${(sub.start / duration) * 100}%`,
                        width: `${((sub.end - sub.start) / duration) * 100}%`
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skip(-10)}>
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={togglePlay}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skip(10)}>
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground font-body font-mono ml-2">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={showSubtitles ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowSubtitles(!showSubtitles)}
                  >
                    <Subtitles className="w-4 h-4" />
                  </Button>

                  {/* Audio track selector */}
                  {video?.dub_url && (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => setShowSettings(!showSettings)}
                      >
                        <Languages className="w-4 h-4" />
                        <span className="text-xs font-body">{audioTrack === 'original' ? 'ML' : 'EN'}</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      {showSettings && (
                        <div className="absolute bottom-full mb-2 right-0 w-44 bg-popover border border-border rounded-lg shadow-card p-2 animate-fade-in">
                          <p className="text-xs text-muted-foreground px-2 pb-2 font-body">Audio Track</p>
                          <button
                            className={`w-full text-left px-2 py-1.5 rounded text-sm ${audioTrack === 'original' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                            onClick={() => { setAudioTrack('original'); setShowSettings(false); }}
                          >
                            Malayalam (Original)
                          </button>
                          <button
                            className={`w-full text-left px-2 py-1.5 rounded text-sm ${audioTrack === 'english' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                            onClick={() => { setAudioTrack('english'); setShowSettings(false); }}
                          >
                            English (AI Dubbed)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                    <Maximize className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Video Info */}
        <Card>
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold">{video?.subject || 'Lecture'}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground font-body">
              <span>{(video as any)?.class_name || video?.class_id}</span>
              <span>•</span>
              <span>{(video as any)?.teacher_name || 'Teacher'}</span>
              <span>•</span>
              <span>{video?.date ? new Date(video.date).toLocaleDateString() : 'Today'}</span>
              <span>•</span>
              <span>{formatTime(duration)}</span>
            </div>
            
            {/* AI-detected topics */}
            {(video as any)?.topics?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="text-xs text-muted-foreground">Topics:</span>
                {(video as any).topics.map((topic: string, i: number) => (
                  <span key={i} className="text-xs bg-secondary px-2 py-1 rounded-full">
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Side Panel */}
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex rounded-lg bg-secondary p-1">
          {[
            { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
            { id: 'notes', label: 'Notes', icon: FileText },
            { id: 'questions', label: 'Q&A', icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Card className="h-[500px] overflow-hidden flex flex-col">
          {/* Search bar for subtitles */}
          {activeTab === 'subtitles' && (
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search in subtitles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none font-body"
                />
              </div>
            </div>
          )}
          
          <CardContent className="p-4 flex-1 overflow-y-auto">
            {activeTab === 'subtitles' && (
              <div className="space-y-2">
                {filteredSubtitles.map((sub, index) => (
                  <div
                    key={index}
                    onClick={() => jumpToTime(sub.start)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      currentSubtitle === sub ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-primary font-medium font-body font-mono">
                        {formatTime(sub.start)}
                      </span>
                    </div>
                    <p className="text-sm font-body">{sub.text}</p>
                  </div>
                ))}
                {filteredSubtitles.length === 0 && searchQuery && (
                  <p className="text-center text-muted-foreground py-8">No matches found</p>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-2">
                {notes.map((line, index) => (
                  <p 
                    key={index} 
                    className={`font-body ${
                      line.startsWith('## ') 
                        ? 'font-semibold text-lg mt-4 text-foreground' 
                        : line.startsWith('- ') 
                          ? 'text-muted-foreground pl-4'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {line.replace(/^## /, '').replace(/^- /, '• ')}
                  </p>
                ))}
                
                {video?.notes_url && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 w-full"
                    onClick={() => window.open(`${API_URL}/video/${video.id}/notes/pdf`, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                )}
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="space-y-3">
                {questions.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => jumpToTime(q.timestamp)}
                    className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                  >
                    <p className="text-sm font-body">{q.text}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-body">
                      <span>Year: {q.year}</span>
                      <span>•</span>
                      <span className="text-primary font-mono">Jump to {formatTime(q.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoPlayer;
