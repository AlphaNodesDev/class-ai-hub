import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, push, update, remove, onValue, DataSnapshot } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCgOUPoJcq5x5k2PNiV2bp6Rxirvo0wNeA",
  authDomain: "electrex-a5251.firebaseapp.com",
  databaseURL: "https://electrex-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "electrex",
  storageBucket: "electrex.appspot.com",
  messagingSenderId: "737002541169",
  appId: "1:737002541169:web:648b40ec7a3bfb5d238bd0",
  measurementId: "G-L3PVBQ39JN"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

// Database helper functions
export const dbRef = (path: string) => ref(database, path);

export const dbSet = async (path: string, data: unknown) => {
  await set(ref(database, path), data);
};

export const dbGet = async (path: string) => {
  const snapshot = await get(ref(database, path));
  return snapshot.val();
};

export const dbPush = async (path: string, data: unknown) => {
  const newRef = push(ref(database, path));
  await set(newRef, data);
  return newRef.key;
};

export const dbUpdate = async (path: string, data: unknown) => {
  await update(ref(database, path), data as Record<string, unknown>);
};

export const dbRemove = async (path: string) => {
  await remove(ref(database, path));
};

export const dbListen = (path: string, callback: (data: unknown) => void) => {
  return onValue(ref(database, path), (snapshot: DataSnapshot) => {
    callback(snapshot.val());
  });
};

// Types
export interface User {
  id: string;
  role: 'institution' | 'faculty' | 'student';
  name: string;
  email: string;
  password: string;
  created_by?: string;
  assigned_classes?: string[];
  enrolled_classes?: string[];
  created_at?: string;
}

export interface Institution {
  id: string;
  name: string;
  admins: string[];
  teachers: string[];
  students: string[];
  created_at: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  institution_id: string;
  timetable: Record<string, TimetableSlot[]>;
  camera?: {
    prototype_camera_id: string;
    camera_type: string;
  };
}

export interface TimetableSlot {
  hour: number;
  start: string;
  end: string;
  subject: string;
  teacher: string;
}

export interface Video {
  id: string;
  class_id: string;
  subject: string;
  date: string;
  original_video_url: string;
  subtitle_url?: string;
  dub_url?: string;
  notes_url?: string;
  status: {
    uploaded: boolean;
    trimmed: boolean;
    subtitles: boolean;
    dubbed: boolean;
    ocr_notes: boolean;
  };
  processing_jobs: Record<string, unknown>;
}

export interface Question {
  id: string;
  text: string;
  year: number;
  linked_video_id?: string;
  start_time?: number;
  end_time?: number;
}

export default app;
