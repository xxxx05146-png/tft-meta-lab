CREATE TABLE meta_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT,
  refresh_after INTEGER NOT NULL
);
