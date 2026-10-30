-- Things; money is cents.
CREATE TABLE things (
  id TEXT PRIMARY KEY,
  -- a comment inside; with a semicolon in it.
  cents INTEGER NOT NULL
);
CREATE TRIGGER things_no_delete BEFORE DELETE ON things
BEGIN
  SELECT RAISE(ABORT, 'never delete; tombstone instead');
END;
