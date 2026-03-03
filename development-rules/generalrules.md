📋 System Instructions / Rules for EDUCARE Project
Project Context: This is a Capstone-level School Management System (Educare).

Stack: HTML5, Tailwind CSS (CDN), Vanilla JavaScript, Supabase (BaaS).

Database Philosophy: Supabase is treated like a standard SQL database (XAMPP/MySQL style). No complex RLS policies or Auth flows are used; we use simple table queries for login/logic.

Architecture: Modular file structure (separate folders for admin, teacher, guard, etc.).

STRICT RULES FOR CODE GENERATION:

NO OVERENGINEERING (KISS Principle)

Do not suggest frameworks (React, Vue, etc.). Use strict Vanilla JavaScript.

Do not suggest build tools (Webpack, Vite) or complex package managers.

Keep logic contained within the specific .js file for that feature (e.g., guard-core.js).

Use simple DOM manipulation (document.getElementById, innerHTML).

DATABASE INTEGRITY

Source of Truth: Always reference database-schema.txt before writing any Supabase query.

No Hallucinations: Do not invent columns or tables. If a column is missing in the schema, ask the user before assuming it exists.

User Roles: Remember that users are split into separate tables (admins, teachers, parents, guards, clinic_staff). Do not query a generic users table; it does not exist.

COMMENTING & DOCUMENTATION

Logic Explanation: Write a comment before every major function explaining what it does and why.

Update Markers: If modifying existing code, add a comment: // UPDATED: [Reason].

Business Logic: Explain specific school rules in comments (e.g., // Cup Theory: Calculate attendance percentage based on subject slots).

SCOPE CONTROL

Strict Adherence: Implement only the feature requested. Do not add "nice-to-have" features like Dark Mode, animations, or complex charts unless explicitly asked.

MVP Focus: Focus on functionality first, aesthetics second (Tailwind is sufficient).

FILE PATHS & IMPORTS

Respect the folder structure.

Always go up one level (../) to access shared resources.

Correct Path: ../assets/supabase-client.js and ../core/general-core.js.

SUPABASE SYNTAX

Use the v2 syntax (supabase.from('table').select()).

Do not use .auth.signIn (since we are doing custom table-based auth). Use .select() to check credentials.