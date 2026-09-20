ALTER TABLE articles
  ALTER COLUMN published_at DROP NOT NULL,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX articles_public_listing_idx ON articles (status, published_at DESC);
