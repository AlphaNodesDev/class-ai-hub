import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  Languages,
  FileText,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

interface Subtitle {
  start: number;
  end: number;
  text: string;
}

const VideoPlayer: React.FC = () => {
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

  // Mock subtitles
  const subtitles: Subtitle[] = [
    { start: 0, end: 5, text: 'Welcome to today\'s lecture on Ohm\'s Law.' },
    { start: 5, end: 10, text: 'Ohm\'s Law states that V = I × R' },
    { start: 10, end: 15, text: 'Where V is voltage, I is current, and R is resistance.' },
    { start: 15, end: 20, text: 'This is fundamental to understanding electrical circuits.' },
    { start: 20, end: 25, text: 'Let\'s look at some practical examples.' },
  ];

  const currentSubtitle = subtitles.find(
    (sub) => currentTime >= sub.start && currentTime < sub.end
  );

  const questions = [
    { id: '1', text: 'Explain Ohm\'s Law with examples', year: 2023, timestamp: 5 },
    { id: '2', text: 'Calculate resistance in a circuit', year: 2022, timestamp: 45 },
    { id: '3', text: 'Derive the power formula from Ohm\'s Law', year: 2023, timestamp: 120 },
  ];

  const notes = [
    '## Ohm\'s Law',
    '- **Formula**: V = I × R',
    '- V = Voltage (Volts)',
    '- I = Current (Amperes)',
    '- R = Resistance (Ohms)',
    '',
    '## Key Points',
    '- Ohm\'s Law is linear for ohmic materials',
    '- Power: P = V × I = I²R = V²/R',
  ];

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 2700); // Default 45 mins
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

  useEffect(() => {
    setDuration(2700); // 45 mins for demo
  }, []);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Video Section */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="overflow-hidden">
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
            >
              <source src="" type="video/mp4" />
            </video>

            {/* Video overlay for demo */}
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
                  <h3 className="text-xl font-semibold">Introduction to Ohm's Law</h3>
                  <p className="text-muted-foreground font-body">Circuits • Raj Kumar</p>
                </div>
              </div>
            </div>

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
              <input
                type="range"
                min={0}
                max={duration}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-secondary rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
              />

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={togglePlay}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground font-body ml-2">
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
                      <div className="absolute bottom-full mb-2 right-0 w-40 bg-popover border border-border rounded-lg shadow-card p-2 animate-fade-in">
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

                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>

                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
            <h2 className="text-xl font-semibold">Introduction to Ohm's Law</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground font-body">
              <span>Circuits</span>
              <span>•</span>
              <span>Raj Kumar</span>
              <span>•</span>
              <span>Dec 10, 2025</span>
              <span>•</span>
              <span>45 minutes</span>
            </div>
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
        <Card className="h-[500px] overflow-hidden">
          <CardContent className="p-4 h-full overflow-y-auto">
            {activeTab === 'subtitles' && (
              <div className="space-y-2">
                {subtitles.map((sub, index) => (
                  <div
                    key={index}
                    onClick={() => jumpToTime(sub.start)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      currentSubtitle === sub ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-primary font-medium font-body">
                        {formatTime(sub.start)} - {formatTime(sub.end)}
                      </span>
                    </div>
                    <p className="text-sm font-body">{sub.text}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="prose prose-sm prose-invert max-w-none">
                {notes.map((line, index) => (
                  <p key={index} className={`font-body ${line.startsWith('##') ? 'font-semibold text-lg mt-4' : 'text-muted-foreground'}`}>
                    {line.replace(/##\s*/, '').replace(/\*\*/g, '').replace(/-\s*/, '• ')}
                  </p>
                ))}
                <Button variant="outline" size="sm" className="mt-4">
                  <FileText className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
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
                      <span className="text-primary">Jump to {formatTime(q.timestamp)}</span>
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
