import { useEffect, useRef } from "react";

/**
 * PBI-01.1.5 Cenário 2: avisa sobre perda de alterações não salvas antes de sair da tela.
 * Cobre fechar/atualizar a aba (beforeunload) e navegação dentro do app (confirmLeave).
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function confirmLeave(): boolean {
    if (!dirtyRef.current) return true;
    return window.confirm("Você tem alterações não salvas. Deseja realmente sair sem salvar?");
  }

  return { confirmLeave };
}
