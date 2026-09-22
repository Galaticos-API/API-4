export interface OrganizationPolicy {
  justificativa_alteracao_obrigatoria: boolean;
  updated_at: string;
  updated_by: { id: string; nome: string } | null;
}

export interface OrganizationPolicyInput {
  justificativa_alteracao_obrigatoria: boolean;
}
