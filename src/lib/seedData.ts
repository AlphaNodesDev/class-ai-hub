import { dbSet } from '@/lib/firebase';

// Initial test data for Firebase Realtime Database
export const seedTestData = async () => {
  const timestamp = new Date().toISOString();

  // Users
  const users = {
    institution_abc: {
      id: 'institution_abc',
      role: 'institution',
      name: 'Electrex College',
      email: 'admin@electrex.edu',
      password: 'admin123',
      created_at: timestamp,
    },
    teacher_raj: {
      id: 'teacher_raj',
      role: 'faculty',
      name: 'Raj Kumar',
      email: 'raj@electrex.edu',
      password: 'teacher123',
      created_by: 'institution_abc',
      assigned_classes: ['class_eee_3A'],
      created_at: timestamp,
    },
    teacher_priya: {
      id: 'teacher_priya',
      role: 'faculty',
      name: 'Priya Sharma',
      email: 'priya@electrex.edu',
      password: 'teacher123',
      created_by: 'institution_abc',
      assigned_classes: ['class_eee_3A'],
      created_at: timestamp,
    },
    student_abhiram: {
      id: 'student_abhiram',
      role: 'student',
      name: 'Abhiram',
      email: 'abhiram@student.edu',
      password: 'student123',
      created_by: 'institution_abc',
      enrolled_classes: ['class_eee_3A'],
      created_at: timestamp,
    },
    student_meera: {
      id: 'student_meera',
      role: 'student',
      name: 'Meera Nair',
      email: 'meera@student.edu',
      password: 'student123',
      created_by: 'institution_abc',
      enrolled_classes: ['class_eee_3A'],
      created_at: timestamp,
    },
  };

  // Institution
  const institutions = {
    institution_abc: {
      id: 'institution_abc',
      name: 'Electrex College',
      admins: ['institution_abc'],
      teachers: ['teacher_raj', 'teacher_priya'],
      students: ['student_abhiram', 'student_meera'],
      created_at: timestamp,
    },
  };

  // Classes
  const classes = {
    class_eee_3A: {
      id: 'class_eee_3A',
      name: 'EEE 3A',
      institution_id: 'institution_abc',
      timetable: {
        monday: [
          { hour: 1, start: '09:00', end: '09:50', subject: 'Circuits', teacher: 'teacher_raj' },
          { hour: 2, start: '09:50', end: '10:40', subject: 'Signals', teacher: 'teacher_raj' },
          { hour: 3, start: '11:00', end: '11:50', subject: 'Electromagnetics', teacher: 'teacher_priya' },
        ],
        tuesday: [
          { hour: 1, start: '09:00', end: '09:50', subject: 'Control Systems', teacher: 'teacher_priya' },
          { hour: 2, start: '09:50', end: '10:40', subject: 'Circuits', teacher: 'teacher_raj' },
        ],
        wednesday: [
          { hour: 1, start: '09:00', end: '09:50', subject: 'Signals', teacher: 'teacher_raj' },
          { hour: 2, start: '09:50', end: '10:40', subject: 'Electromagnetics', teacher: 'teacher_priya' },
        ],
      },
      camera: {
        prototype_camera_id: 'camera_1',
        camera_type: 'upload',
      },
    },
  };

  // Sample videos
  const videos = {
    video_20251211_class1: {
      id: 'video_20251211_class1',
      class_id: 'class_eee_3A',
      subject: 'Circuits - Ohm\'s Law',
      teacher_id: 'teacher_raj',
      date: '2025-12-11',
      duration: 2700,
      original_video_url: '',
      subtitle_url: '',
      dub_url: '',
      notes_url: '',
      status: {
        uploaded: true,
        trimmed: true,
        subtitles: true,
        dubbed: false,
        ocr_notes: false,
      },
      processing_jobs: {},
      created_at: timestamp,
    },
    video_20251210_class2: {
      id: 'video_20251210_class2',
      class_id: 'class_eee_3A',
      subject: 'Circuits - Kirchhoff\'s Laws',
      teacher_id: 'teacher_raj',
      date: '2025-12-10',
      duration: 2280,
      original_video_url: '',
      subtitle_url: '',
      dub_url: '',
      notes_url: '',
      status: {
        uploaded: true,
        trimmed: true,
        subtitles: true,
        dubbed: true,
        ocr_notes: true,
      },
      processing_jobs: {},
      created_at: timestamp,
    },
  };

  // Question bank
  const question_bank = {
    class_eee_3A: {
      q1: {
        id: 'q1',
        text: 'Explain Ohm\'s Law with examples',
        year: 2023,
        linked_video_id: 'video_20251211_class1',
        start_time: 300,
        end_time: 420,
      },
      q2: {
        id: 'q2',
        text: 'State and prove Kirchhoff\'s Current Law',
        year: 2022,
        linked_video_id: 'video_20251210_class2',
        start_time: 600,
        end_time: 780,
      },
      q3: {
        id: 'q3',
        text: 'Derive the power formula from Ohm\'s Law',
        year: 2023,
        linked_video_id: 'video_20251211_class1',
        start_time: 900,
        end_time: 1020,
      },
    },
  };

  try {
    await dbSet('users', users);
    await dbSet('institutions', institutions);
    await dbSet('classes', classes);
    await dbSet('videos', videos);
    await dbSet('question_bank', question_bank);
    return { success: true, message: 'Test data seeded successfully!' };
  } catch (error) {
    console.error('Error seeding data:', error);
    return { success: false, message: 'Failed to seed data', error };
  }
};

// Test credentials for quick reference
export const testCredentials = {
  institution: { email: 'admin@electrex.edu', password: 'admin123' },
  teacher: { email: 'raj@electrex.edu', password: 'teacher123' },
  student: { email: 'abhiram@student.edu', password: 'student123' },
};
