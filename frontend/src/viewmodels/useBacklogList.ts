import { useCallback, useEffect, useRef, useState } from 'react';
import type { BacklogPage } from '../api/api_backlog';

type ListResult<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; items: T[] };
export const BACKLOG_PAGE_SIZE = 100;

export function useBacklogList<T extends { id: string }>(load: (offset: number, signal: AbortSignal, before?: string) => Promise<BacklogPage<T>>) {
  const [result, setResult] = useState<ListResult<T>>({ state: 'loading' });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const offset = useRef(0);
  const cursor = useRef<string | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    offset.current = 0;
    cursor.current = undefined;
    busy.current = true;
    setResult({ state: 'loading' });
    setHasMore(false);
    setLoadingMore(false);
    setMoreError('');
    void load(0, controller.signal).then(({ items, nextCursor }) => {
      if (controller.signal.aborted) return;
      offset.current = items.length;
      cursor.current = nextCursor ?? undefined;
      setHasMore(nextCursor === undefined ? items.length === BACKLOG_PAGE_SIZE : nextCursor !== null);
      setResult({ state: 'ready', items });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ state: 'error', message: 'Não foi possível carregar os itens.' });
    }).finally(() => { if (!controller.signal.aborted) busy.current = false; });
    return () => { controller.abort(); request.current?.abort(); };
  }, [load, attempt]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || result.state !== 'ready') return;
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const { items, nextCursor } = await load(offset.current, controller.signal, cursor.current);
      if (controller.signal.aborted) return;
      offset.current += items.length;
      cursor.current = nextCursor ?? undefined;
      setHasMore(nextCursor === undefined ? items.length === BACKLOG_PAGE_SIZE : nextCursor !== null);
      setResult(previous => previous.state === 'ready'
        ? { state: 'ready', items: [...new Map([...previous.items, ...items].map(item => [item.id, item])).values()] }
        : previous);
    } catch {
      if (!controller.signal.aborted) setMoreError('Não foi possível carregar mais itens. Tente novamente.');
    } finally {
      if (!controller.signal.aborted) { busy.current = false; setLoadingMore(false); }
    }
  }, [load, hasMore, result.state]);

  return { result, hasMore, loadingMore, moreError, loadMore, retry: () => setAttempt(value => value + 1) };
}
