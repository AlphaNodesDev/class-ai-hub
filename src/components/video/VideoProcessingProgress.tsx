import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Scissors, 
  Subtitles, 
  Languages, 
  FileText,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

export interface ProcessingStatus {
  videoId: string;
  videoName: string;
  overallProgress: number;
  currentStep: string;
  steps: ProcessingStep[];
  startedAt?: string;
  estimatedTimeRemaining?: number;
}

interface VideoProcessingProgressProps {
  status: ProcessingStatus | null;
  onClose?: () => void;
}

const stepIcons: Record<string, React.ReactNode> = {
  trim: <Scissors className="w-4 h-4" />,
  subtitles: <Subtitles className="w-4 h-4" />,
  dub: <Languages className="w-4 h-4" />,
  ocr: <FileText className="w-4 h-4" />,
  analyze: <Sparkles className="w-4 h-4" />,
};

const VideoProcessingProgress: React.FC<VideoProcessingProgressProps> = ({ status, onClose }) => {
  if (!status) return null;

  const getStepIcon = (step: ProcessingStep) => {
    if (step.status === 'completed') {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (step.status === 'failed') {
      return <XCircle className="w-4 h-4 text-destructive" />;
    }
    if (step.status === 'processing') {
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    }
    return stepIcons[step.id] || <div className="w-4 h-4 rounded-full bg-muted" />;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-secondary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Processing Video
          </CardTitle>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{status.videoName}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{Math.round(status.overallProgress)}%</span>
          </div>
          <Progress value={status.overallProgress} className="h-2" />
          {status.estimatedTimeRemaining && status.estimatedTimeRemaining > 0 && (
            <p className="text-xs text-muted-foreground">
              ~{formatTime(status.estimatedTimeRemaining)} remaining
            </p>
          )}
        </div>

        {/* Individual steps */}
        <div className="space-y-3">
          {status.steps.map((step) => (
            <div key={step.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                {getStepIcon(step)}
                <span className={cn(
                  "text-sm flex-1",
                  step.status === 'pending' && "text-muted-foreground",
                  step.status === 'processing' && "text-foreground font-medium",
                  step.status === 'completed' && "text-muted-foreground",
                  step.status === 'failed' && "text-destructive"
                )}>
                  {step.name}
                </span>
                {step.status === 'processing' && step.progress !== undefined && (
                  <span className="text-xs text-muted-foreground">{Math.round(step.progress)}%</span>
                )}
              </div>
              {step.status === 'processing' && (
                <Progress value={step.progress || 0} className="h-1" />
              )}
              {step.message && step.status === 'processing' && (
                <p className="text-xs text-muted-foreground pl-6">{step.message}</p>
              )}
              {step.status === 'failed' && step.message && (
                <p className="text-xs text-destructive pl-6">{step.message}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoProcessingProgress;
