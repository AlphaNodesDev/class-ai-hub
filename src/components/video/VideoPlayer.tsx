import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video } from '@/lib/firebase';
import { useQuestionGenerator, GeneratedQuestion } from '@/hooks/useQuestionGenerator';
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
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface Subtitle {
  start: number;
  end: number;
  text: string;
}

interface VideoPlayerProps {
  video?: Video;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AudioTrackInfo {
  name: string;
  language: string;
  videoUrl?: string; // Separate video file URL for this track
}

interface SubtitleTrackInfo {
  name: string;
  language: string;
  srtUrl?: string;
  vttUrl?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  ta: 'Tamil',
  original: 'Original'
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitleLang, setShowSubtitleLang] = useState(false);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(0);
  const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<SubtitleTrackInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'subtitles' | 'notes' | 'questions'>('subtitles');
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [availableAudioTracks, setAvailableAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [audioTracksLoaded, setAudioTracksLoaded] = useState(false);
  const [currentVideoSrc, setCurrentVideoSrc] = useState<string | null>(null);
  
  const { questions, isGenerating, generateQuestions } = useQuestionGenerator();

  // Build the correct video URL from backend paths
  const getVideoUrl = (videoPath?: string) => {
    if (!videoPath) return null;
    
    // If already a full URL, return as-is
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      return videoPath;
    }
    
    // If path starts with /, it's already a relative URL from backend
    // e.g., /processed/video.mp4 or /uploads/video.mp4
    if (videoPath.startsWith('/')) {
      return `${API_URL}${videoPath}`;
    }
    
    // Extract just the filename and determine the folder
    const pathParts = videoPath.replace(/\\/g, '/').split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // Determine which folder based on path content or filename
    if (videoPath.includes('processed') || filename.includes('_trimmed') || filename.includes('_dub')) {
      return `${API_URL}/processed/${filename}`;
    }
    if (videoPath.includes('uploads')) {
      return `${API_URL}/uploads/${filename}`;
    }
    if (videoPath.includes('recordings')) {
      return `${API_URL}/recordings/${filename}`;
    }
    if (videoPath.includes('notes') || filename.endsWith('.md') || filename.endsWith('.json')) {
      return `${API_URL}/notes/${filename}`;
    }
    if (filename.endsWith('.srt') || filename.endsWith('.vtt')) {
      return `${API_URL}/processed/${filename}`;
    }
    
    // Default: try uploads first (original files go there)
    return `${API_URL}/uploads/${filename}`;
  };

  // Get the video source - now we use a single video with embedded audio tracks
  const getVideoSource = () => {
    // If dubbed video exists, use it (has multiple audio tracks embedded)
    if (video?.dub_url) {
      return getVideoUrl(video.dub_url);
    }
    // Fall back to processed or original video
    const path = (video as any)?.processed_video_url || video?.original_video_url;
    return getVideoUrl(path);
  };

  // Note: videoSrc is now managed via state (currentVideoSrc) 
  // to allow switching between different language video files

  useEffect(() => {
    // Load subtitle manifest
    const loadSubtitleManifest = async () => {
      if (!video?.subtitle_url) {
        setAvailableSubtitleTracks([]);
        setSubtitles([]);
        return;
      }
      
      try {
        // Try to load the subtitle manifest
        const subtitlePath = video.subtitle_url;
        const manifestPath = subtitlePath.replace('.srt', '_subtitles_manifest.json').replace('.vtt', '_subtitles_manifest.json');
        const manifestUrl = getVideoUrl(manifestPath);
        
        console.log('Loading subtitle manifest from:', manifestUrl);
        
        if (manifestUrl) {
          const response = await fetch(manifestUrl);
          if (response.ok) {
            const manifest = await response.json();
            console.log('Loaded subtitle manifest:', manifest);
            
            if (manifest.subtitles) {
              const tracks: SubtitleTrackInfo[] = [];
              
              // Add each available language
              for (const [key, data] of Object.entries(manifest.subtitles)) {
                const subData = data as any;
                const lang = subData.language || key;
                tracks.push({
                  name: LANGUAGE_NAMES[lang] || lang.toUpperCase(),
                  language: lang,
                  srtUrl: subData.srt ? getVideoUrl(subData.srt) || undefined : undefined,
                  vttUrl: subData.vtt ? getVideoUrl(subData.vtt) || undefined : undefined
                });
              }
              
              setAvailableSubtitleTracks(tracks);
              console.log('Available subtitle tracks:', tracks);
              
              // Load first track's subtitles
              if (tracks.length > 0) {
                const firstTrack = tracks[0];
                const url = firstTrack.srtUrl || firstTrack.vttUrl;
                if (url) {
                  loadSubtitles(url);
                }
              }
              return;
            }
          }
        }
      } catch (e) {
        console.log('Could not load subtitle manifest:', e);
      }
      
      // Fallback: load single subtitle file
      loadSubtitles(video.subtitle_url);
      setAvailableSubtitleTracks([{
        name: 'Original',
        language: 'original',
        srtUrl: getVideoUrl(video.subtitle_url) || undefined
      }]);
    };
    
    loadSubtitleManifest();

    // Load notes
    if (video?.notes_url) {
      loadNotes(video.notes_url);
    } else {
      setNotes([]);
    }

    // Set duration from video data
    if ((video as any)?.duration) {
      setDuration((video as any).duration);
    }

    // Generate questions from topics
    const topics = (video as any)?.topics || [];
    if (topics.length > 0) {
      generateQuestions('', topics);
    }
  }, [video, generateQuestions]);

  // Switch subtitle language
  const switchSubtitleTrack = (trackIndex: number) => {
    const track = availableSubtitleTracks[trackIndex];
    if (!track) return;
    
    console.log('Switching subtitles to:', track);
    setSelectedSubtitleIndex(trackIndex);
    
    const url = track.srtUrl || track.vttUrl;
    if (url) {
      loadSubtitles(url);
    }
  };

  const loadSubtitles = async (url: string) => {
    try {
      // Build correct URL for subtitle file
      const fullUrl = getVideoUrl(url) || url;
      console.log('Loading subtitles from:', fullUrl);
      const response = await fetch(fullUrl);
      if (response.ok) {
        const text = await response.text();
        const parsed = parseSRT(text);
        setSubtitles(parsed);
        console.log('Loaded', parsed.length, 'subtitle segments');
      } else {
        console.error('Failed to load subtitles:', response.status);
      }
    } catch (error) {
      console.error('Error loading subtitles:', error);
    }
  };

  const loadNotes = async (url: string) => {
    try {
      // Build correct URL for notes file
      const fullUrl = getVideoUrl(url) || url;
      console.log('Loading notes from:', fullUrl);
      const response = await fetch(fullUrl);
      if (response.ok) {
        const text = await response.text();
        setNotes(text.split('\n'));
        console.log('Loaded notes:', text.length, 'chars');
      } else {
        console.error('Failed to load notes:', response.status);
      }
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const parseSRT = (srt: string): Subtitle[] => {
    const lines = srt.trim().split('\n');
    const subtitles: Subtitle[] = [];
    let i = 0;
    
    while (i < lines.length) {
      i++; // Skip subtitle number
      
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
      setVideoError(null);
    }
  };

  const handleVideoError = () => {
    setVideoError('Video file not available. Make sure the backend is running.');
  };

  const togglePlay = () => {
    if (videoRef.current && currentVideoSrc) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {
          setVideoError('Cannot play video. Check if the file exists.');
        });
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

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement;
    if (container) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    }
  };

  // Load audio track manifest and set up video sources
  useEffect(() => {
    const loadAudioTracks = async () => {
      if (!video?.dub_url) {
        const defaultTrack: AudioTrackInfo = { name: 'Original', language: 'en' };
        setAvailableAudioTracks([defaultTrack]);
        setAudioTracksLoaded(true);
        return;
      }

      try {
        // Load the dubbed manifest JSON to get separate video file paths
        const dubPath = video.dub_url;
        const manifestPath = dubPath.replace('.mp4', '.json').replace('_dubbed', '_dubbed');
        const manifestUrl = getVideoUrl(manifestPath);
        
        console.log('Loading manifest from:', manifestUrl);
        
        if (manifestUrl) {
          const response = await fetch(manifestUrl);
          if (response.ok) {
            const manifest = await response.json();
            console.log('Loaded dub manifest:', manifest);
            console.log('Video files in manifest:', manifest.video_files);
            
            if (manifest.audio_tracks && manifest.video_files) {
              // Create tracks with their separate video file URLs
              const tracks: AudioTrackInfo[] = manifest.audio_tracks.map((track: any) => {
                const videoFile = manifest.video_files[track.language];
                // Video file paths from manifest are already relative (e.g., /processed/file.mp4)
                const videoUrl = videoFile ? `${API_URL}${videoFile.startsWith('/') ? '' : '/'}${videoFile}` : null;
                console.log(`Track ${track.language}: ${videoFile} -> ${videoUrl}`);
                return {
                  name: track.name,
                  language: track.language,
                  videoUrl
                };
              });
              setAvailableAudioTracks(tracks);
              
              // Set initial video to original track
              if (tracks.length > 0 && tracks[0].videoUrl) {
                setCurrentVideoSrc(tracks[0].videoUrl);
              }
              
              console.log('Loaded audio tracks with video files:', tracks);
            } else if (manifest.audio_tracks) {
              setAvailableAudioTracks(manifest.audio_tracks);
            }
          } else {
            console.log('Manifest fetch failed:', response.status);
          }
        }
      } catch (e) {
        console.log('Could not load audio manifest:', e);
        setAvailableAudioTracks([
          { name: 'Original (EN)', language: 'en' },
          { name: 'Malayalam (AI Dubbed)', language: 'ml' }
        ]);
      }
      setAudioTracksLoaded(true);
    };

    loadAudioTracks();
  }, [video?.dub_url]);

  // Set initial video source
  useEffect(() => {
    const initialSrc = getVideoSource();
    if (initialSrc) {
      setCurrentVideoSrc(initialSrc);
    }
  }, [video]);

  // Switch audio track by loading a different video file (cross-browser compatible!)
  const switchAudioTrack = (trackIndex: number) => {
    const track = availableAudioTracks[trackIndex];
    if (!track) {
      console.log('Track not found at index:', trackIndex);
      return;
    }

    const videoEl = videoRef.current;
    const wasPlaying = videoEl && !videoEl.paused;
    const savedTime = videoEl?.currentTime || 0;

    console.log('Switching to track:', track);
    console.log('Track videoUrl:', track.videoUrl);

    // Use the track's separate video file if available
    let newSrc: string | null = null;
    
    if (track.videoUrl) {
      newSrc = track.videoUrl;
    } else {
      // Fallback: try to construct the URL from the dub_url
      const basePath = video?.dub_url?.replace('_dubbed.mp4', '').replace('.mp4', '');
      if (basePath && track.language) {
        // Construct fallback path based on language
        const filename = basePath.replace(/\\/g, '/').split('/').pop();
        if (trackIndex === 0) {
          // Original track
          newSrc = `${API_URL}/processed/${filename}_original.mp4`;
        } else {
          // Other language - try _languagecode.mp4
          newSrc = `${API_URL}/processed/${filename}_${track.language}.mp4`;
        }
        console.log('Fallback URL constructed:', newSrc);
      }
    }

    if (newSrc && newSrc !== currentVideoSrc) {
      console.log(`Switching audio to ${track.name}: ${newSrc}`);
      setCurrentVideoSrc(newSrc);
      setSelectedTrackIndex(trackIndex);
      
      // Wait for video to load, then restore position and play state
      const restorePlayback = () => {
        if (videoRef.current) {
          videoRef.current.currentTime = savedTime;
          if (wasPlaying) {
            videoRef.current.play().catch(console.error);
          }
        }
      };
      
      // Use loadedmetadata event for more reliable timing
      if (videoEl) {
        videoEl.addEventListener('loadedmetadata', restorePlayback, { once: true });
        // Fallback timeout in case event doesn't fire
        setTimeout(restorePlayback, 500);
      }
    } else {
      setSelectedTrackIndex(trackIndex);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Video Section */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="overflow-hidden">
          <div className="relative bg-black aspect-video">
            {currentVideoSrc ? (
              <video
                ref={videoRef}
                className="w-full h-full"
                src={currentVideoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={handleVideoError}
                muted={isMuted}
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/20">
                <div className="text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No video file available</p>
                  <p className="text-xs text-muted-foreground">Upload a video to get started</p>
                </div>
              </div>
            )}

            {/* Error overlay */}
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="text-center space-y-2 p-4">
                  <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
                  <p className="text-sm text-muted-foreground">{videoError}</p>
                  <p className="text-xs text-muted-foreground">
                    Backend URL: {API_URL}
                  </p>
                </div>
              </div>
            )}

            {/* Subtitles overlay */}
            {showSubtitles && currentSubtitle && !videoError && (
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
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-secondary rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skip(-10)}>
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={togglePlay} disabled={!currentVideoSrc}>
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
                  {/* Subtitle Toggle & Language Selector */}
                  <div className="relative">
                    <Button
                      variant={showSubtitles ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => {
                        if (availableSubtitleTracks.length > 1) {
                          setShowSubtitleLang(!showSubtitleLang);
                        } else {
                          setShowSubtitles(!showSubtitles);
                        }
                      }}
                    >
                      <Subtitles className="w-4 h-4" />
                      {availableSubtitleTracks.length > 1 && (
                        <>
                          <span className="text-xs font-body">
                            {availableSubtitleTracks[selectedSubtitleIndex]?.language?.toUpperCase() || 'CC'}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                    {showSubtitleLang && availableSubtitleTracks.length > 1 && (
                      <div className="absolute bottom-full mb-2 right-0 w-48 bg-popover border border-border rounded-lg shadow-lg p-2 z-10">
                        <p className="text-xs text-muted-foreground px-2 pb-2 font-body">Subtitle Language</p>
                        <button
                          className={`w-full text-left px-2 py-1.5 rounded text-sm ${!showSubtitles ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                          onClick={() => { setShowSubtitles(false); setShowSubtitleLang(false); }}
                        >
                          Off
                        </button>
                        {availableSubtitleTracks.map((track, index) => (
                          <button
                            key={index}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm ${showSubtitles && selectedSubtitleIndex === index ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                            onClick={() => { 
                              setShowSubtitles(true);
                              switchSubtitleTrack(index); 
                              setShowSubtitleLang(false); 
                            }}
                          >
                            {track.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Audio Track Selector */}
                  {video?.dub_url && availableAudioTracks.length > 0 && (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => setShowSettings(!showSettings)}
                      >
                        <Languages className="w-4 h-4" />
                        <span className="text-xs font-body">
                          {availableAudioTracks[selectedTrackIndex]?.language?.toUpperCase() || 'Audio'}
                        </span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      {showSettings && (
                        <div className="absolute bottom-full mb-2 right-0 w-48 bg-popover border border-border rounded-lg shadow-lg p-2 z-10">
                          <p className="text-xs text-muted-foreground px-2 pb-2 font-body">Audio Track</p>
                          {availableAudioTracks.map((track, index) => (
                            <button
                              key={index}
                              className={`w-full text-left px-2 py-1.5 rounded text-sm ${selectedTrackIndex === index ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                              onClick={() => { switchAudioTrack(index); setShowSettings(false); }}
                            >
                              {track.name}
                            </button>
                          ))}
                          <p className="text-xs text-muted-foreground px-2 pt-2 mt-2 border-t border-border">
                            Switching loads a different audio track
                          </p>
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
              {duration > 0 && (
                <>
                  <span>•</span>
                  <span>{formatTime(duration)}</span>
                </>
              )}
            </div>
            
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
                {filteredSubtitles.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {subtitles.length === 0 ? 'No subtitles available' : 'No matches found'}
                  </p>
                ) : (
                  filteredSubtitles.map((sub, index) => (
                    <div
                      key={index}
                      onClick={() => jumpToTime(sub.start)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        currentSubtitle === sub ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-primary font-medium font-mono">
                          {formatTime(sub.start)}
                        </span>
                      </div>
                      <p className="text-sm font-body">{sub.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    No notes available yet
                  </p>
                ) : (
                  notes.map((line, index) => (
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
                  ))
                )}
                
                {video?.notes_url && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 w-full"
                    onClick={() => window.open(`${API_URL}/api/video/${video.id}/notes/pdf`, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                )}
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="space-y-3">
                {isGenerating ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Generating questions...</span>
                  </div>
                ) : questions.length === 0 ? (
                  <div className="text-center py-8">
                    <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Questions will be generated from video topics
                    </p>
                  </div>
                ) : (
                  questions.map((q) => (
                    <div
                      key={q.id}
                      onClick={() => q.timestamp && jumpToTime(q.timestamp)}
                      className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                    >
                      <p className="text-sm font-body">{q.text}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-body">
                        <span className={`px-1.5 py-0.5 rounded ${
                          q.difficulty === 'easy' ? 'bg-green-500/20 text-green-500' :
                          q.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-500' :
                          'bg-red-500/20 text-red-500'
                        }`}>
                          {q.difficulty}
                        </span>
                        <span>{q.topic}</span>
                        {q.timestamp && (
                          <span className="text-primary font-mono">
                            @ {formatTime(q.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoPlayer;
