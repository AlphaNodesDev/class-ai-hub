import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useActiveProcessingJobs, useProcessingProgress } from '@/hooks/useProcessingProgress';
import VideoProcessingProgress from './VideoProcessingProgress';
import { 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActiveProcessingWidgetProps {
  className?: string;
  compact?: boolean;
}

const ActiveProcessingWidget: React.FC<ActiveProcessingWidgetProps> = ({ 
  className,
  compact = false 
}) => {
  const { jobs, isLoading, refetch } = useActiveProcessingJobs();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Auto-expand first job if only one
  useEffect(() => {
    if (jobs.length === 1 && !expandedJob) {
      setExpandedJob(jobs[0].videoId);
    }
  }, [jobs, expandedJob]);

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return null; // Don't show widget when no processing
  }

  const displayedJobs = showAll ? jobs : jobs.slice(0, 3);

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {displayedJobs.map((job) => (
          <div 
            key={job.videoId}
            className="flex items-center gap-3 p-2 bg-secondary/30 rounded-lg"
          >
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{job.videoName}</p>
              <Progress value={job.overallProgress} className="h-1 mt-1" />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {Math.round(job.overallProgress)}%
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Processing Videos
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {jobs.length} active
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayedJobs.map((job) => (
          <div key={job.videoId} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-3 hover:bg-secondary/20 transition-colors"
              onClick={() => setExpandedJob(expandedJob === job.videoId ? null : job.videoId)}
            >
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{job.videoName}</p>
                <p className="text-xs text-muted-foreground">{job.currentStep}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{Math.round(job.overallProgress)}%</span>
                {expandedJob === job.videoId ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>
            
            {expandedJob === job.videoId && (
              <div className="px-3 pb-3 border-t bg-secondary/5">
                <div className="pt-3 space-y-2">
                  {job.steps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2">
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      ) : step.status === 'processing' ? (
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-muted" />
                      )}
                      <span className={cn(
                        "text-xs flex-1",
                        step.status === 'pending' && "text-muted-foreground",
                        step.status === 'processing' && "text-foreground font-medium",
                        step.status === 'completed' && "text-muted-foreground"
                      )}>
                        {step.name}
                      </span>
                      {step.status === 'processing' && step.progress !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(step.progress)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {jobs.length > 3 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Less' : `Show ${jobs.length - 3} More`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveProcessingWidget;
