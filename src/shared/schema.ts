export const migrations: Array<[number, string, string]> = [
  [1, 'initial_schema', `
    CREATE TABLE IF NOT EXISTS programmes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT, description TEXT, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS semesters (id INTEGER PRIMARY KEY AUTOINCREMENT, programme_id INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE, name TEXT NOT NULL, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE, name TEXT NOT NULL, code TEXT, credits INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#4f46e5', description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS units (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY AUTOINCREMENT, unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE, name TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), notes TEXT, order_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, event_type TEXT NOT NULL DEFAULT 'event', start_at TEXT NOT NULL, end_at TEXT, all_day INTEGER NOT NULL DEFAULT 0, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, location TEXT, recurrence TEXT NOT NULL DEFAULT 'none', color TEXT NOT NULL DEFAULT '#7c3aed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, due_at TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'pending', estimated_minutes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT, scheduled_at TEXT NOT NULL, recurrence TEXT NOT NULL DEFAULT 'once', until_at TEXT, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), entity_type TEXT, entity_id INTEGER, notification_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, frequency TEXT NOT NULL DEFAULT 'daily', target INTEGER NOT NULL DEFAULT 1, color TEXT NOT NULL DEFAULT '#10b981', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS habit_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE, entry_date TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), count INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(habit_id, entry_date));
    CREATE TABLE IF NOT EXISTS study_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL, title TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_minutes INTEGER NOT NULL DEFAULT 0, elapsed_seconds INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS availability (id INTEGER PRIMARY KEY AUTOINCREMENT, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL, label TEXT, available INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS timetable_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL, location TEXT, recurrence TEXT NOT NULL DEFAULT 'weekly', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `],
  [2, 'indexes', `
    CREATE INDEX IF NOT EXISTS idx_semesters_programme ON semesters(programme_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_semester ON subjects(semester_id);
    CREATE INDEX IF NOT EXISTS idx_units_subject ON units(subject_id);
    CREATE INDEX IF NOT EXISTS idx_topics_unit ON topics(unit_id);
    CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_date ON habit_entries(habit_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_study_subject ON study_sessions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_sessions(day_of_week);
    CREATE INDEX IF NOT EXISTS idx_availability_day ON availability(day_of_week);
  `],
];

export const initialAcademicProfilePreset = `
  -- Academic Programme 1: Vignan B.Tech ECE
  INSERT INTO programmes (id, name, code, description, status)
  VALUES (1, 'Bachelor of Technology', 'B.Tech - ECE', 'Vignan University - Department of Electronics and Communication Engineering (ECE). Undergraduate Engineering, Year 1.', 'active');

  INSERT INTO semesters (id, programme_id, name, status)
  VALUES (1, 1, 'Semester 1', 'active');

  -- Subject 1: Engineering Mathematics (26MT101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (1, 1, 'Engineering Mathematics', '26MT101', 4, '#3b82f6', 'First year engineering mathematics covering linear algebra and vector spaces.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (1, 1, 'Known Topics', 'Core syllabus topics identified from curriculum', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (1, 'Eigenvalues and Eigenvectors', 0, 1),
    (1, 'Diagonalization', 0, 2),
    (1, 'Vector Spaces', 0, 3),
    (1, 'Inner Product Spaces', 0, 4),
    (1, 'Gram-Schmidt Process', 0, 5),
    (1, 'QR Decomposition', 0, 6),
    (1, 'Singular Value Decomposition (SVD)', 0, 7);

  -- Subject 2: Engineering Physics (26PY101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (2, 1, 'Engineering Physics', '26PY101', 3, '#8b5cf6', 'Optoelectronics, laser physics, solids and optical fibres.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (2, 2, 'Known Topics', 'Core physics syllabus topics', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (2, 'Solids', 0, 1),
    (2, 'Optoelectronics', 0, 2),
    (2, 'Lasers', 0, 3),
    (2, 'Optical Fibres', 0, 4);

  -- Subject 3: Basic Electrical and Electronics Engineering (26EE101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (3, 1, 'Basic Electrical and Electronics Engineering', '26EE101', 3, '#f59e0b', 'Circuits, electrical machines, and foundational semiconductor devices.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (3, 3, 'Known Topics', 'Core electrical & electronics topics', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (3, 'AC Circuits', 0, 1),
    (3, 'Electrical Machines', 0, 2),
    (3, 'Rectifiers', 0, 3),
    (3, 'Zener Diode', 0, 4);

  -- Subject 4: C Programming (26CS101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (4, 1, 'C Programming', '26CS101', 3, '#10b981', 'Structured programming in C, pointers, memory management and data structures.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (4, 4, 'Known Topics', 'C programming core syllabus topics', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (4, 'Arrays', 0, 1),
    (4, 'Functions', 0, 2),
    (4, 'Pointers', 0, 3),
    (4, 'Strings', 0, 4),
    (4, 'Structures', 0, 5),
    (4, 'Unions', 0, 6),
    (4, 'Dynamic Memory Allocation', 0, 7);

  -- Subject 5: Electronics and Communication Engineering (26EC101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (5, 1, 'Electronics and Communication Engineering', '26EC101', 2, '#06b6d4', 'ECE fundamentals, technical software tools, and productivity/AI tools.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (5, 5, 'Known Topics', 'Foundational departmental topics', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (5, 'Electronics and Communication Engineering fundamentals', 0, 1),
    (5, 'Technical tools and software', 0, 2),
    (5, 'AI tools and productivity tools', 0, 3);

  -- Academic Programme 2: IIT Madras BS in AST
  INSERT INTO programmes (id, name, code, description, status)
  VALUES (2, 'BS in Aeronautics and Space Technology', 'IITM-BS-AST', 'Indian Institute of Technology Madras (IIT Madras) - Online BS Programme. Focus: Aeronautics, Space Tech, Mathematics, Electronic Systems, Programming.', 'active');

  INSERT INTO semesters (id, programme_id, name, status)
  VALUES (2, 2, 'Semester 1 / Qualifier', 'active');

  -- Course 1: Mathematics for Electronics I (BSMA1101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (6, 2, 'Mathematics for Electronics I', 'BSMA1101', 4, '#6366f1', 'Foundational mathematics for electronic systems and analysis.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (6, 6, 'Known Topics', 'Core topics from qualifier preparation', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (6, 'Functions, Domain and Range', 0, 1),
    (6, 'Straight Lines', 0, 2),
    (6, 'Quadratic Equations', 0, 3),
    (6, 'Systems of Linear Equations', 0, 4),
    (6, 'Matrices', 0, 5),
    (6, 'Sequences', 0, 6),
    (6, 'Boundedness', 0, 7),
    (6, 'Monotonicity', 0, 8),
    (6, 'Convergence', 0, 9),
    (6, 'Limits and Continuity', 0, 10);

  -- Course 2: Electronic Systems Thinking and Circuits (BSEE1101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (7, 2, 'Electronic Systems Thinking and Circuits', 'BSEE1101', 4, '#ec4899', 'Systems thinking, passive components, and foundational circuit analysis.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (7, 7, 'Known Topics', 'Core circuit and systems concepts', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (7, 'Electronic Components', 0, 1),
    (7, 'Batteries', 0, 2),
    (7, 'Electrical Circuits', 0, 3),
    (7, 'Kirchhoff''s Current Law', 0, 4),
    (7, 'Kirchhoff''s Voltage Law', 0, 5),
    (7, 'Capacitors', 0, 6),
    (7, 'Inductors', 0, 7),
    (7, 'Signals', 0, 8),
    (7, 'Circuit Analysis', 0, 9);

  -- Course 3: Introduction to C Programming (BSCS1101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (8, 2, 'Introduction to C Programming', 'BSCS1101', 4, '#14b8a6', 'Computer architecture concepts and foundational programming in C.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (8, 8, 'Known Topics', 'Core programming fundamentals', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (8, 'Computer Architecture', 0, 1),
    (8, 'Number Systems', 0, 2),
    (8, 'Compilation', 0, 3),
    (8, 'Variables', 0, 4),
    (8, 'Operators', 0, 5),
    (8, 'Loops', 0, 6),
    (8, 'Conditional Statements', 0, 7),
    (8, 'Control Flow', 0, 8);

  -- Course 4: English I (BSHS1101)
  INSERT INTO subjects (id, semester_id, name, code, credits, color, description)
  VALUES (9, 2, 'English I', 'BSHS1101', 4, '#84cc16', 'Communication skills, phonetics, and grammatical accuracy.');

  INSERT INTO units (id, subject_id, name, description, order_index)
  VALUES (9, 9, 'Known Topics', 'Core English topics', 1);

  INSERT INTO topics (unit_id, name, completed, order_index) VALUES
    (9, 'Pronunciation', 0, 1),
    (9, 'Grammar', 0, 2),
    (9, 'Vocabulary', 0, 3),
    (9, 'Idioms', 0, 4),
    (9, 'Spoken Communication', 0, 5);
`;
