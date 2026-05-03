CREATE TABLE IF NOT EXISTS "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    UNIQUE ("email") ON CONFLICT REPLACE
);

INSERT INTO "User" (name, email) VALUES
  ('Alice', 'alice@example.com'),
  ('Bob', 'bob@example.com'),
  ('Carol', 'carol@example.com');
