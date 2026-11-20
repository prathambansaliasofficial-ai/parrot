/**
 * Seeds FreeResources with real reference metadata only: universities,
 * programmes, categories, academic years, site settings and FAQs.
 *
 * It creates NO academic resources and NO subjects by default. The fabricated
 * SAMPLE catalog (sample subjects, sample PDFs, fake download counters) is a
 * development fixture and is only inserted with --with-fixtures.
 *
 * Run: node scripts/seed.mjs [--force] [--with-fixtures]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { buildPdf } from "./pdf.mjs";

const root = process.cwd();
const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(root, "db", "freeresources.db");
const storageDir = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(root, "storage", "uploads");
const force = process.argv.includes("--force");
/** Development/test fixture only. Never enable for a production database. */
const withFixtures = process.argv.includes("--with-fixtures");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(storageDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));

const existing = db.prepare("SELECT COUNT(*) AS count FROM universities").get().count;
if (existing > 0 && !force) {
  console.log(`Database already has ${existing} universities. Use --force to reset.`);
  process.exit(0);
}

if (force) {
  db.pragma("foreign_keys = OFF");
  for (const table of [
    "downloads",
    "resource_files",
    "resources",
    "contributions",
    "requests",
    "tickets",
    "subjects",
    "branches",
    "colleges",
    "universities",
    "programmes",
    "categories",
    "academic_years",
    "community_links",
    "advertisements",
    "faqs",
    "announcements",
    "site_settings",
    "search_queries",
    "audit_log",
    "sessions",
    "users",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.pragma("foreign_keys = ON");
}

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/* ------------------------------------------------------------------ users */

const adminEmail = (process.env.ADMIN_EMAIL || "admin@freeresources.in").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "FreeResources@2026";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

db.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')").run(
  id(),
  adminEmail,
  "FreeResources Admin",
  hashPassword(adminPassword),
);

/* -------------------------------------------------------------- reference */

const categories = [
  ["previous-year-papers", "Previous Year Papers", "pyq", "Question papers from past university examinations.", 10],
  ["question-bank", "Question Bank", "pyq", "Collected and predicted questions by unit.", 20],
  ["handwritten-notes", "Handwritten Notes", "notes", "Student-written notes, scanned or photographed.", 30],
  ["digital-notes", "Class / Digital Notes", "notes", "Typed notes covering the full syllabus.", 40],
  ["toppers-notes", "Toppers' Notes", "notes", "Notes shared by high-scoring students.", 50],
  ["important-questions", "Important Questions", "notes", "Frequently asked questions, grouped by unit.", 60],
  ["one-page-notes", "One-Page Notes", "notes", "Condensed one-page revision sheets.", 65],
  ["unit-wise-notes", "Unit-wise Notes", "notes", "One file per syllabus unit.", 70],
  ["revision-notes", "Revision Notes", "notes", "Condensed material for the night before.", 80],
  ["quantum", "Quantum / Exam Prep", "notes", "Rapid revision packs and formula sheets.", 90],
  ["syllabus", "Syllabus", "syllabus", "Official or transcribed university syllabus.", 100],
  ["practical-files", "Practical Files", "practical", "Complete lab files with experiments and readings.", 110],
  ["lab-manual", "Lab Manual", "practical", "University lab manual and experiment list.", 120],
  ["assignments", "Assignments", "other", "Solved and unsolved assignments.", 130],
  ["other", "Other Resources", "other", "Anything else useful for the course.", 140],
];

const insertCategory = db.prepare(
  "INSERT INTO categories (id, slug, name, group_slug, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
);
const categoryIds = {};
for (const [slug, name, group, description, sort] of categories) {
  const cid = id();
  categoryIds[slug] = cid;
  insertCategory.run(cid, slug, name, group, description, sort);
}

const programmeRows = [
  ["btech", "B.Tech", "B.Tech", "Undergraduate", "Bachelor of Technology — four-year engineering programmes."],
  ["bca", "Bachelor of Computer Applications", "BCA", "Undergraduate", "Three-year undergraduate computer applications programme."],
  ["mca", "Master of Computer Applications", "MCA", "Postgraduate", "Postgraduate computer applications programme."],
  ["bba", "Bachelor of Business Administration", "BBA", "Undergraduate", "Undergraduate management programme."],
  ["mba", "Master of Business Administration", "MBA", "Postgraduate", "Postgraduate management programme."],
  ["bcom", "Bachelor of Commerce", "B.Com", "Undergraduate", "Undergraduate commerce programme."],
  ["ba", "Bachelor of Arts", "BA", "Undergraduate", "Undergraduate arts and humanities programme."],
  ["bsc", "Bachelor of Science", "B.Sc", "Undergraduate", "Undergraduate science programme."],
  ["mtech", "M.Tech", "M.Tech", "Postgraduate", "Postgraduate engineering programme."],
  ["diploma", "Diploma", "Diploma", "Diploma", "Polytechnic and diploma programmes."],
];
const insertProgramme = db.prepare(
  "INSERT INTO programmes (id, slug, name, short_name, level, description) VALUES (?, ?, ?, ?, ?, ?)",
);
const programmeIds = {};
for (const [slug, name, shortName, level, description] of programmeRows) {
  const pid = id();
  programmeIds[slug] = pid;
  insertProgramme.run(pid, slug, name, shortName, level, description);
}

const insertYear = db.prepare(
  "INSERT INTO academic_years (id, label, ordinal, semester_from, semester_to) VALUES (?, ?, ?, ?, ?)",
);
[
  ["1st Year", 1, 1, 2],
  ["2nd Year", 2, 3, 4],
  ["3rd Year", 3, 5, 6],
  ["4th Year", 4, 7, 8],
].forEach(([label, ordinal, from, to]) => insertYear.run(id(), label, ordinal, from, to));

/* --------------------------------------------------------- universities */

const universities = [
  {
    slug: "aktu",
    name: "Dr. A.P.J. Abdul Kalam Technical University",
    shortName: "AKTU",
    aliases: "aktu, apj abdul kalam technical university, uptu, lucknow university",
    state: "Uttar Pradesh",
    city: "Lucknow",
    type: "State",
    website: "https://aktu.ac.in",
    featured: 1,
    description:
      "A state technical university in Lucknow affiliating engineering, management and pharmacy colleges across Uttar Pradesh. Formerly UPTU, AKTU is one of the largest technical universities in India.",
  },
  {
    slug: "dtu",
    name: "Delhi Technological University",
    shortName: "DTU",
    aliases: "dtu, delhi technological university, delhi college of engineering, dce",
    state: "Delhi",
    city: "New Delhi",
    type: "State",
    website: "https://dtu.ac.in",
    featured: 1,
    description:
      "A state university in New Delhi, formerly Delhi College of Engineering, offering engineering, technology and management programmes.",
  },
  {
    slug: "nsut",
    name: "Netaji Subhas University of Technology",
    shortName: "NSUT",
    aliases: "nsut, nsit, netaji subhas university of technology",
    state: "Delhi",
    city: "New Delhi",
    type: "State",
    website: "https://nsut.ac.in",
    featured: 1,
    description:
      "A state university in Dwarka, New Delhi, focused on engineering and technology programmes. Formerly NSIT.",
  },
  {
    slug: "ggsipu",
    name: "Guru Gobind Singh Indraprastha University",
    shortName: "GGSIPU",
    aliases: "ggsipu, ipu, ip university, indraprastha university",
    state: "Delhi",
    city: "New Delhi",
    type: "State",
    website: "https://ipu.ac.in",
    featured: 1,
    description:
      "A state university in Delhi with a large network of affiliated colleges offering engineering, computer applications, law, management and health programmes.",
  },
  {
    slug: "ccsu",
    name: "Chaudhary Charan Singh University",
    shortName: "CCSU",
    aliases: "ccsu, meerut university, chaudhary charan singh university",
    state: "Uttar Pradesh",
    city: "Meerut",
    type: "State",
    website: "https://ccsuniversity.ac.in",
    featured: 1,
    description:
      "A state university in Meerut, Uttar Pradesh, offering undergraduate and postgraduate programmes in arts, science, commerce and computer applications.",
  },
  {
    slug: "aud",
    name: "Dr. B.R. Ambedkar University Delhi",
    shortName: "AUD",
    aliases: "aud, ambedkar university delhi, br ambedkar university",
    state: "Delhi",
    city: "New Delhi",
    type: "State",
    website: "https://aud.ac.in",
    featured: 0,
    description:
      "A state university in Delhi focused on liberal arts, humanities and social sciences, with campuses across the city.",
  },
  {
    slug: "du",
    name: "University of Delhi",
    shortName: "DU",
    aliases: "du, delhi university, university of delhi",
    state: "Delhi",
    city: "New Delhi",
    type: "Central",
    website: "https://du.ac.in",
    featured: 1,
    description:
      "A central university in New Delhi with colleges across the city, offering undergraduate and postgraduate programmes under the Choice Based Credit System.",
  },
  {
    slug: "ignou",
    name: "Indira Gandhi National Open University",
    shortName: "IGNOU",
    aliases: "ignou, indira gandhi national open university",
    state: "Delhi",
    city: "New Delhi",
    type: "Central",
    website: "https://ignou.ac.in",
    featured: 1,
    description:
      "A central open university offering distance and online programmes to learners across India through regional centres.",
  },
];

const insertUniversity = db.prepare(
  `INSERT INTO universities (id, slug, name, short_name, aliases, state, city, type, description, website, featured)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const universityIds = {};
for (const u of universities) {
  const uid = id();
  universityIds[u.slug] = uid;
  insertUniversity.run(
    uid,
    u.slug,
    u.name,
    u.shortName,
    u.aliases,
    u.state,
    u.city,
    u.type,
    u.description,
    u.website,
    u.featured,
  );
}

/* -------------------------------------------------------------- branches */

const branchRows = [
  ["aktu", "btech", "cse", "Computer Science Engineering", "CSE"],
  ["aktu", "btech", "it", "Information Technology", "IT"],
  ["aktu", "btech", "ece", "Electronics and Communication Engineering", "ECE"],
  ["aktu", "btech", "me", "Mechanical Engineering", "ME"],
  ["aktu", "btech", "ce", "Civil Engineering", "CE"],
  ["dtu", "btech", "cse", "Computer Science Engineering", "CSE"],
  ["dtu", "btech", "it", "Information Technology", "IT"],
  ["dtu", "btech", "ece", "Electronics and Communication Engineering", "ECE"],
  ["dtu", "btech", "me", "Mechanical Engineering", "ME"],
  ["nsut", "btech", "cse", "Computer Science Engineering", "CSE"],
  ["nsut", "btech", "it", "Information Technology", "IT"],
  ["nsut", "btech", "ece", "Electronics and Communication Engineering", "ECE"],
  ["ggsipu", "btech", "cse", "Computer Science Engineering", "CSE"],
  ["ggsipu", "btech", "it", "Information Technology", "IT"],
  ["ggsipu", "btech", "ece", "Electronics and Communication Engineering", "ECE"],
];
const insertBranch = db.prepare(
  "INSERT INTO branches (id, slug, name, code, university_id, programme_id) VALUES (?, ?, ?, ?, ?, ?)",
);
const branchIds = {};
for (const [uni, prog, slug, name, code] of branchRows) {
  const bid = id();
  const globalSlug = `${uni}-${prog}-${slug}`;
  branchIds[globalSlug] = bid;
  insertBranch.run(bid, globalSlug, name, code, universityIds[uni], programmeIds[prog]);
}

/* -------------------------------------------------------------- subjects */

const subjects = [
  {
    slug: "aktu-btech-cse-sem3-data-structures",
    name: "Data Structures",
    code: "BCS301",
    university: "aktu",
    programme: "btech",
    branch: "aktu-btech-cse",
    semester: 3,
    credits: "4",
    // Paraphrased syllabus text is not an official document, so this subject is
    // fixture-only too until a real AKTU PDF is approved for it.
    sample: 1,
    description:
      "Core third-semester AKTU subject covering arrays, linked lists, stacks, queues, trees, graphs, searching, sorting and hashing.",
    syllabusText:
      "Unit 1: Introduction to data structures, abstract data types, arrays and their representations. Unit 2: Linked lists, stacks and queues. Unit 3: Trees, binary search trees, AVL trees and heaps. Unit 4: Graphs, traversal algorithms and spanning trees. Unit 5: Searching, sorting and hashing.",
  },
  {
    slug: "aktu-btech-cse-sem4-operating-systems",
    name: "Operating Systems",
    code: "BCS401",
    university: "aktu",
    programme: "btech",
    branch: "aktu-btech-cse",
    semester: 4,
    credits: "4",
    // Paraphrased syllabus text is not an official document, so this subject is
    // fixture-only too until a real AKTU PDF is approved for it.
    sample: 1,
    description:
      "Fourth-semester AKTU subject covering process management, scheduling, synchronisation, memory management and file systems.",
    syllabusText:
      "Unit 1: Introduction to operating systems and system calls. Unit 2: Process scheduling and synchronisation. Unit 3: Deadlocks and memory management. Unit 4: Virtual memory and file systems. Unit 5: I/O systems and case studies.",
  },
  {
    slug: "dtu-btech-cse-sem3-data-structures",
    name: "Data Structures",
    code: null,
    university: "dtu",
    programme: "btech",
    branch: "dtu-btech-cse",
    semester: 3,
    credits: null,
    sample: 1,
    description:
      "Sample subject record for DTU B.Tech CSE third semester. Confirm the current scheme code with your department before relying on it.",
    syllabusText: null,
  },
  {
    slug: "ggsipu-btech-cse-sem3-data-structures",
    name: "Data Structures",
    code: null,
    university: "ggsipu",
    programme: "btech",
    branch: "ggsipu-btech-cse",
    semester: 3,
    credits: null,
    sample: 1,
    description:
      "Sample subject record for GGSIPU B.Tech CSE third semester. Confirm the current scheme code with your institute.",
    syllabusText: null,
  },
  {
    slug: "ccsu-bca-sem2-programming-in-c",
    name: "Programming in C",
    code: null,
    university: "ccsu",
    programme: "bca",
    branch: null,
    semester: 2,
    credits: null,
    sample: 1,
    description:
      "Sample subject record for CCSU BCA second semester. Confirm the current syllabus with your college.",
    syllabusText: null,
  },
  {
    slug: "du-bsc-computer-science-sem3-data-structures",
    name: "Data Structures",
    code: null,
    university: "du",
    programme: "bsc",
    branch: null,
    semester: 3,
    credits: null,
    sample: 1,
    description:
      "Sample subject record for University of Delhi B.Sc (Hons) Computer Science, third semester.",
    syllabusText: null,
  },
  {
    slug: "ignou-bca-sem2-programming-in-c",
    name: "Programming in C",
    code: null,
    university: "ignou",
    programme: "bca",
    branch: null,
    semester: 2,
    credits: null,
    sample: 1,
    description: "Sample subject record for IGNOU BCA second semester.",
    syllabusText: null,
  },
];

const insertSubject = db.prepare(
  `INSERT INTO subjects (id, slug, name, code, university_id, programme_id, branch_id, semester, credits, description, syllabus_text, is_sample)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
// Sample subjects exist only to hold the sample resources. Without
// --with-fixtures they are never created, so production has no placeholder
// subjects masquerading as real curricula.
const seededSubjects = withFixtures ? subjects : subjects.filter((s) => !s.sample);
const subjectIds = {};
for (const s of seededSubjects) {
  const sid = id();
  subjectIds[s.slug] = sid;
  insertSubject.run(
    sid,
    s.slug,
    s.name,
    s.code,
    universityIds[s.university],
    programmeIds[s.programme],
    s.branch ? branchIds[s.branch] : null,
    s.semester,
    s.credits,
    s.description,
    s.syllabusText,
    s.sample,
  );
}

/* ------------------------------------------------------------- resources */

const sampleNotice =
  "THIS IS A SAMPLE FILE created by FreeResources.in to demonstrate preview and download. It is not an actual question paper, note or syllabus, and it contains no university content.";

const resourceSeed = [
  {
    title: "Data Structures — Previous Year Paper (Sample)",
    slugBase: "data-structures-previous-year-paper-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "previous-year-papers",
    session: "2024-25",
    description:
      "Sample placeholder for an AKTU BCS301 end-semester paper. Replace it with a verified paper from your university archive before relying on it.",
    body: [
      "SAMPLE QUESTION PAPER — AKTU B.Tech CSE, Semester 3",
      "Subject: Data Structures (BCS301)",
      "Section A: Short answer questions",
      "1. Define an abstract data type.",
      "2. Differentiate between a stack and a queue.",
      "Section B: Long answer questions",
      "3. Explain AVL tree rotations with an example.",
      "4. Write an algorithm for depth-first search.",
      "This file is a demonstration only. Real papers are added by verified contributors.",
    ],
    featured: 1,
  },
  {
    title: "Data Structures — Handwritten Notes (Sample)",
    slugBase: "data-structures-handwritten-notes-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "handwritten-notes",
    session: "2024-25",
    description: "A sample of how handwritten notes look in the library. Content is intentionally abbreviated.",
    body: [
      "SAMPLE HANDWRITTEN NOTES — Data Structures",
      "Unit 1: Arrays, structures and abstract data types.",
      "Unit 2: Singly and doubly linked lists, stacks, queues.",
      "Unit 3: Binary trees, traversals, binary search trees.",
      "Unit 4: Graph representations, BFS and DFS.",
      "Unit 5: Bubble sort, merge sort, quick sort, hashing.",
      "This is demonstration content for the FreeResources platform.",
    ],
    featured: 1,
  },
  {
    title: "Data Structures — Important Questions (Sample)",
    slugBase: "data-structures-important-questions-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "important-questions",
    session: "2024-25",
    description: "Sample unit-wise list of frequently asked question styles for BCS301.",
    body: [
      "IMPORTANT QUESTIONS — SAMPLE SET",
      "Unit 1: Complexity analysis, array address calculation.",
      "Unit 2: Convert an infix expression to postfix using a stack.",
      "Unit 3: Insert and delete nodes in a BST; explain AVL rotations.",
      "Unit 4: Prim's and Kruskal's algorithms; BFS and DFS.",
      "Unit 5: Compare sorting algorithms by time complexity.",
    ],
    featured: 0,
  },
  {
    title: "Data Structures — Syllabus Overview (Sample)",
    slugBase: "data-structures-syllabus-overview-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "syllabus",
    session: "2024-25",
    description: "A transcribed, abbreviated syllabus overview. Always confirm the official PDF with AKTU.",
    body: [
      "SYLLABUS OVERVIEW (SAMPLE TRANSCRIPTION)",
      "AKTU B.Tech CSE, Semester 3, Data Structures (BCS301)",
      "Unit 1: Introduction, arrays, complexity.",
      "Unit 2: Linked lists, stacks and queues.",
      "Unit 3: Trees and heaps.",
      "Unit 4: Graphs and spanning trees.",
      "Unit 5: Searching, sorting and hashing.",
      "Confirm details with the official AKTU syllabus document.",
    ],
    featured: 1,
  },
  {
    title: "Operating Systems — Syllabus Overview (Sample)",
    slugBase: "operating-systems-syllabus-overview-sample",
    subject: "aktu-btech-cse-sem4-operating-systems",
    category: "syllabus",
    session: "2024-25",
    description: "Abbreviated sample syllabus for AKTU BCS401.",
    body: [
      "SYLLABUS OVERVIEW (SAMPLE TRANSCRIPTION)",
      "AKTU B.Tech CSE, Semester 4, Operating Systems (BCS401)",
      "Unit 1: OS structure, system calls.",
      "Unit 2: Process scheduling, synchronisation.",
      "Unit 3: Deadlocks, memory management.",
      "Unit 4: Virtual memory, file systems.",
      "Unit 5: I/O systems, case studies.",
    ],
    featured: 0,
  },
  {
    title: "Operating Systems — Unit-wise Notes (Sample)",
    slugBase: "operating-systems-unit-wise-notes-sample",
    subject: "aktu-btech-cse-sem4-operating-systems",
    category: "unit-wise-notes",
    session: "2024-25",
    description: "Sample unit-wise notes demonstrating the resource format.",
    body: [
      "SAMPLE UNIT-WISE NOTES — Operating Systems",
      "Unit 1: Kernel, user mode, system calls.",
      "Unit 2: FCFS, SJF, round robin; semaphores and mutexes.",
      "Unit 3: Banker's algorithm, paging, segmentation.",
      "Unit 4: Page replacement policies, inodes.",
      "Unit 5: Interrupt handling and disk scheduling.",
    ],
    featured: 0,
  },
  {
    title: "Data Structures — Previous Year Paper (Sample)",
    slugBase: "dtu-data-structures-previous-year-paper-sample",
    subject: "dtu-btech-cse-sem3-data-structures",
    category: "previous-year-papers",
    session: "2023-24",
    description: "Sample DTU paper placeholder. Add the verified paper when available.",
    body: [
      "SAMPLE QUESTION PAPER — DTU B.Tech CSE, Semester 3",
      "Subject: Data Structures",
      "1. Explain the time complexity of merge sort.",
      "2. Implement a queue using two stacks.",
      "3. Discuss graph traversal with an example.",
      "Demonstration content only.",
    ],
    featured: 0,
  },
  {
    title: "Data Structures — Handwritten Notes (Sample)",
    slugBase: "ggsipu-data-structures-handwritten-notes-sample",
    subject: "ggsipu-btech-cse-sem3-data-structures",
    category: "handwritten-notes",
    session: "2024-25",
    description: "Sample GGSIPU notes placeholder.",
    body: [
      "SAMPLE NOTES — GGSIPU B.Tech CSE, Semester 3",
      "Topics: arrays, stacks, queues, trees, graphs, sorting.",
      "This is demonstration content for FreeResources.",
    ],
    featured: 0,
  },
  {
    title: "Programming in C — Previous Year Paper (Sample)",
    slugBase: "ccsu-programming-in-c-previous-year-paper-sample",
    subject: "ccsu-bca-sem2-programming-in-c",
    category: "previous-year-papers",
    session: "2024-25",
    description: "Sample CCSU BCA paper placeholder.",
    body: [
      "SAMPLE QUESTION PAPER — CCSU BCA, Semester 2",
      "Subject: Programming in C",
      "1. Explain the structure of a C program.",
      "2. Write a program to reverse a string without library functions.",
      "3. Differentiate between call by value and call by reference.",
    ],
    featured: 0,
  },
  {
    title: "Programming in C — Class Notes (Sample)",
    slugBase: "ccsu-programming-in-c-class-notes-sample",
    subject: "ccsu-bca-sem2-programming-in-c",
    category: "digital-notes",
    session: "2024-25",
    description: "Sample typed notes covering C fundamentals.",
    body: [
      "SAMPLE CLASS NOTES — Programming in C",
      "Data types, operators, control flow, functions, arrays, pointers, structures and file handling.",
      "Demonstration content only.",
    ],
    featured: 1,
  },
  {
    title: "Data Structures — Digital Notes (Sample)",
    slugBase: "du-data-structures-digital-notes-sample",
    subject: "du-bsc-computer-science-sem3-data-structures",
    category: "digital-notes",
    session: "2023-24",
    description: "Sample DU notes placeholder.",
    body: [
      "SAMPLE NOTES — University of Delhi, B.Sc (Hons) Computer Science",
      "Data structures fundamentals with examples.",
      "Demonstration content only.",
    ],
    featured: 0,
  },
  {
    title: "Programming in C — Question Bank (Sample)",
    slugBase: "ignou-programming-in-c-question-bank-sample",
    subject: "ignou-bca-sem2-programming-in-c",
    category: "question-bank",
    session: "2024-25",
    description: "Sample IGNOU question bank placeholder.",
    body: [
      "SAMPLE QUESTION BANK — IGNOU BCA, Semester 2",
      "Unit-wise practice questions for Programming in C.",
      "Demonstration content only.",
    ],
    featured: 0,
  },
  {
    title: "Data Structures — Question Bank (Sample)",
    slugBase: "data-structures-question-bank-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "question-bank",
    session: "2023-24",
    description: "Sample unit-wise question bank for BCS301.",
    body: [
      "SAMPLE QUESTION BANK — Data Structures (BCS301)",
      "Unit 1: 10 short-answer questions.",
      "Unit 2: Stack and queue implementation tasks.",
      "Unit 3: Tree traversal exercises.",
      "Unit 4: Graph algorithm exercises.",
      "Unit 5: Sorting complexity comparisons.",
    ],
    featured: 0,
  },
  {
    title: "Data Structures — Practical File (Sample)",
    slugBase: "data-structures-practical-file-sample",
    subject: "aktu-btech-cse-sem3-data-structures",
    category: "practical-files",
    session: "2024-25",
    description: "Sample practical file listing typical lab experiments.",
    body: [
      "SAMPLE PRACTICAL FILE — Data Structures",
      "Experiment 1: Implement a stack using an array.",
      "Experiment 2: Implement a circular queue.",
      "Experiment 3: Binary search tree operations.",
      "Experiment 4: Graph traversal using BFS and DFS.",
      "Demonstration content only.",
    ],
    featured: 0,
  },
];

const insertResource = db.prepare(
  `INSERT INTO resources
     (id, slug, title, description, subject_id, category_id, university_id, programme_id, branch_id,
      semester, session, status, is_sample, featured, contributor_name, view_count, download_count, published_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, 'FreeResources sample library', 0, 0, ?)`,
);
const insertFile = db.prepare(
  `INSERT INTO resource_files (id, resource_id, storage_key, original_name, mime_type, size_bytes, is_primary)
   VALUES (?, ?, ?, ?, 'application/pdf', ?, 1)`,
);

const publishedDaysAgo = [2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 15, 18, 20, 22];

const seededResources = withFixtures ? resourceSeed : [];
seededResources.forEach((r, index) => {
  const subject = subjects.find((s) => s.slug === r.subject);
  const rid = id();
  const publishedAt = new Date(Date.now() - publishedDaysAgo[index % publishedDaysAgo.length] * 86400000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  insertResource.run(
    rid,
    `${r.slugBase}-${index + 1}`,
    r.title,
    r.description,
    subjectIds[r.subject],
    categoryIds[r.category],
    universityIds[subject.university],
    programmeIds[subject.programme],
    subject.branch ? branchIds[subject.branch] : null,
    subject.semester,
    r.session,
    r.featured,
    publishedAt,
  );

  const pdf = buildPdf({
    title: r.title,
    subtitle: `${subject.name}${subject.code ? ` · ${subject.code}` : ""}`,
    paragraphs: [sampleNotice, "", ...r.body, "", "Uploaded to demonstrate the FreeResources library. Replace with verified material before sharing."],
    footer: "Sample file generated by FreeResources.in — freeresources.in",
  });
  const storageKey = `${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(storageDir, storageKey), pdf);
  insertFile.run(id(), rid, storageKey, `${r.slugBase}.pdf`, pdf.byteLength);
});

/* ------------------------------------------------------------ site content */

const insertFaq = db.prepare(
  "INSERT INTO faqs (id, question, answer, category, sort_order, published) VALUES (?, ?, ?, ?, ?, 1)",
);
[
  [
    "Is FreeResources really free?",
    "Yes. Every published resource can be previewed and downloaded without an account. Accounts are only needed to contribute material or track submissions.",
    "General",
    10,
  ],
  [
    "Who uploads the resources?",
    "Students and contributors submit material, and an administrator reviews it before it appears publicly. Sample records are labelled so you always know what is verified and what is a placeholder.",
    "Contributing",
    20,
  ],
  [
    "My university is not listed. What now?",
    "Send a request through the Request a Resource page with your university, course and semester. New universities are added through the admin dashboard as material becomes available.",
    "Coverage",
    30,
  ],
  [
    "Can I download previous year papers without signing in?",
    "Yes. Papers, notes and syllabus files are publicly downloadable. Downloads are counted so the library can show which material students actually use.",
    "Resources",
    40,
  ],
  [
    "How do I report a broken file or a wrong paper?",
    "Use the Support page and choose the relevant category. Every report gets a ticket ID so you can follow up.",
    "Support",
    50,
  ],
  [
    "Do you guarantee that a paper is the latest version?",
    "No. Always check the academic session shown on the resource page and confirm with your department. The library records the session for every upload, but universities occasionally revise schemes.",
    "Resources",
    60,
  ],
].forEach(([question, answer, category, sort]) => insertFaq.run(id(), question, answer, category, sort));

db.prepare("INSERT INTO announcements (id, title, body, tone) VALUES (?, ?, ?, ?)").run(
  id(),
  "FreeResources is indexing AKTU academic material",
  "University and programme pages are real reference metadata. Resource lists stay empty until a verified document is approved, so nothing here is filled in with sample content.",
  "info",
);

const setting = db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?)");
setting.run("home_headline", "Your College. Your Resources. All in One Place.");
setting.run(
  "home_subhead",
  "Papers, notes and syllabus for your course — free, and organised by semester.",
);

console.log("Seeded FreeResources reference metadata.");
console.log(`  Universities: ${universities.length}`);
console.log(`  Subjects:     ${seededSubjects.length}`);
console.log(`  Resources:    ${seededResources.length}${withFixtures ? " (SAMPLE FIXTURES — development only)" : " (none; real resources come from the acquisition pipeline)"}`);
console.log(`  Admin login:  ${adminEmail} / ${process.env.ADMIN_PASSWORD ? "(password from ADMIN_PASSWORD)" : adminPassword}`);
console.log(`  Database:     ${dbPath}`);
console.log(`  Files:        ${storageDir}`);
