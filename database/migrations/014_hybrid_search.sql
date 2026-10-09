-- S2-06: speed up Portuguese full-text candidate retrieval for the hybrid search.
CREATE INDEX IF NOT EXISTS idx_chunk_text_search_portuguese
  ON chunk USING GIN (to_tsvector('portuguese', texto));
