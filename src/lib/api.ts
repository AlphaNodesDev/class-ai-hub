// Backend API client for Class360

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ApiResponse<T> {
  success?: boolean;
  error?: string;
  data?: T;
}

const fetchApi = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  
  return data;
};

// Health check
export const checkHealth = async () => {
  return fetchApi<{ status: string; firebase: string; queue: number; processing: boolean }>('/health');
};

// Video endpoints
export const uploadVideo = async (
  file: File,
  options: {
    classId?: string;
    subject?: string;
    date?: string;
    teacherId?: string;
    splitByTimetable?: boolean;
    language?: string;
  }
) => {
  const formData = new FormData();
  formData.append('video', file);
  
  if (options.classId) formData.append('classId', options.classId);
  if (options.subject) formData.append('subject', options.subject);
  if (options.date) formData.append('date', options.date);
  if (options.teacherId) formData.append('teacherId', options.teacherId);
  if (options.splitByTimetable) formData.append('splitByTimetable', 'true');
  if (options.language) formData.append('language', options.language);
  
  const response = await fetch(`${API_BASE_URL}/video/upload`, {
    method: 'POST',
    body: formData,
  });
  
  return response.json();
};

export const processVideo = async (videoId: string, type: string, options?: Record<string, unknown>) => {
  return fetchApi(`/video/${videoId}/process`, {
    method: 'POST',
    body: JSON.stringify({ type, options }),
  });
};

export const getVideoStatus = async (videoId: string) => {
  return fetchApi(`/video/${videoId}/status`);
};

export const getVideos = async (filters?: { classId?: string; teacherId?: string }) => {
  const params = new URLSearchParams();
  if (filters?.classId) params.append('classId', filters.classId);
  if (filters?.teacherId) params.append('teacherId', filters.teacherId);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchApi<{ videos: unknown[] }>(`/videos${query}`);
};

// Camera endpoints
export const startCameraRecording = async (classId: string, cameraSource?: string) => {
  return fetchApi(`/camera/${classId}/start`, {
    method: 'POST',
    body: JSON.stringify({ cameraSource }),
  });
};

export const stopCameraRecording = async (classId: string) => {
  return fetchApi(`/camera/${classId}/stop`, {
    method: 'POST',
  });
};

export const getCameraStatus = async (classId: string) => {
  return fetchApi<{ isRecording: boolean; duration?: number }>(`/camera/${classId}/status`);
};

// Class endpoints
export const createClass = async (data: { name: string; institutionId?: string; cameraEnabled?: boolean; cameraType?: string }) => {
  return fetchApi('/classes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateTimetable = async (classId: string, timetable: Record<string, unknown[]>) => {
  return fetchApi(`/classes/${classId}/timetable`, {
    method: 'PUT',
    body: JSON.stringify({ timetable }),
  });
};

export const updateCameraSettings = async (classId: string, settings: { enabled: boolean; cameraId?: string; cameraType: string }) => {
  return fetchApi(`/classes/${classId}/camera`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
};

export const getClasses = async () => {
  return fetchApi<{ classes: unknown[] }>('/classes');
};

// User endpoints
export const getUsers = async (role?: string) => {
  const query = role ? `?role=${role}` : '';
  return fetchApi<{ users: unknown[] }>(`/users${query}`);
};

export const enrollStudent = async (userId: string, classId: string) => {
  return fetchApi(`/users/${userId}/enroll`, {
    method: 'POST',
    body: JSON.stringify({ classId }),
  });
};

export const assignTeacher = async (userId: string, classId: string) => {
  return fetchApi(`/users/${userId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ classId }),
  });
};

// Jobs endpoint
export const getJobs = async () => {
  return fetchApi<{ queue: unknown[]; isProcessing: boolean; activeRecordings: unknown[] }>('/jobs');
};

// Notes download
export const downloadNotesPdf = (videoId: string) => {
  window.open(`${API_BASE_URL}/video/${videoId}/notes/pdf`, '_blank');
};

export default {
  checkHealth,
  uploadVideo,
  processVideo,
  getVideoStatus,
  getVideos,
  startCameraRecording,
  stopCameraRecording,
  getCameraStatus,
  createClass,
  updateTimetable,
  updateCameraSettings,
  getClasses,
  getUsers,
  enrollStudent,
  assignTeacher,
  getJobs,
  downloadNotesPdf,
};
