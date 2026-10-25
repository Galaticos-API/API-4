import { Button } from '../common/ui';

export function BacklogListContinuation({ hasMore, loadingMore, moreError, loadMore }: {
  hasMore: boolean; loadingMore: boolean; moreError: string; loadMore: () => void;
}) {
  return <div className="project-actions">
    {moreError && <p role="alert">{moreError}</p>}
    {hasMore && <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
      {loadingMore ? 'Carregando…' : moreError ? 'Tentar carregar mais' : 'Carregar mais'}
    </Button>}
  </div>;
}
