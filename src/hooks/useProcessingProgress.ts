import { useState, useEffect, useCallback, useRef } from 'react';
import { ProcessingStatus, ProcessingStep } from '@/components/video/VideoProcessingProgress';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useProcessingProgress = (videoId?: string) => {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback((id: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${API_URL}/api/processing/progress/${id}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      console.log('SSE connected for video:', id);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);

        // Auto-disconnect when processing is complete
        if (data.overallProgress >= 100) {
          setTimeout(() => {
            disconnect();
          }, 2000);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setIsConnected(false);
      eventSource.close();
    };

    return eventSource;
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Connect when videoId changes
  useEffect(() => {
    if (videoId) {
      connect(videoId);
    }
    return () => disconnect();
  }, [videoId, connect, disconnect]);

  // Fetch current status (for initial state or when not using SSE)
  const fetchStatus = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/processing/status/${id}`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        return data;
      }
    } catch (error) {
      console.error('Error fetching processing status:', error);
    }
    return null;
  }, []);

  // List all active processing jobs
  const fetchActiveJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/processing/active`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    }
    return [];
  }, []);

  return {
    status,
    isConnected,
    connect,
    disconnect,
    fetchStatus,
    fetchActiveJobs,
  };
};

// Hook for tracking all active processing jobs
export const useActiveProcessingJobs = () => {
  const [jobs, setJobs] = useState<ProcessingStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/processing/active`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Poll for updates every 3 seconds
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  return { jobs, isLoading, refetch: fetchJobs };
};
