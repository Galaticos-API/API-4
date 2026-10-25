import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { OrganizationQualitySettings } from './OrganizationQualitySettings';
import { ApiError } from '../../api/api_auth';
import { getOrganizationConfiguration,getQualityHistory,saveOrganizationConfiguration,type OrganizationConfiguration } from '../../api/api_organization_quality';
vi.mock('../../api/api_organization_quality',()=>({getOrganizationConfiguration:vi.fn(),getQualityHistory:vi.fn(),saveOrganizationConfiguration:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();});
const config:OrganizationConfiguration={version:2,updated_at:'2026-10-25T12:00:00Z',updated_by:null,vague_terms:['rápido'],exigir_justificativa_item_concluido:true,
  levels:{epico:{campos_obrigatorios:true,criterios_aceitacao:true,termos_vagos:true},feature:{campos_obrigatorios:true,criterios_aceitacao:false,termos_vagos:true},pbi:{titulo_infinitivo:true,historia_completa:true,cenario_estruturado:true,termos_vagos:true,prototipo_vinculado:true}}};
function setup(){vi.mocked(getOrganizationConfiguration).mockResolvedValue(structuredClone(config));vi.mocked(getQualityHistory).mockResolvedValue({items:[config],next_before:null});render(<OrganizationQualitySettings/>);}
it('protege a edição ao recarregar a configuração e ao atualizar a aba',async()=>{
  setup();await screen.findByRole('group',{name:'Épico'});
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  const field=screen.getByLabelText('Termos vagos (um por linha)');
  fireEvent.change(field,{target:{value:'termo ainda não salvo'}});
  const before=new Event('beforeunload',{cancelable:true});window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Recarregar configuração'}));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(getOrganizationConfiguration).toHaveBeenCalledTimes(1);
  expect(field).toHaveValue('termo ainda não salvo');
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button',{name:'Recarregar configuração'}));
  await screen.findByRole('group',{name:'Épico'});
  expect(screen.getByLabelText('Termos vagos (um por linha)')).toHaveValue('rápido');
  const clean=new Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
});
it.each(['\u2028','\u2029'])('separa termos colados com quebra Unicode %j',async separator=>{
  setup();await screen.findByRole('group',{name:'Épico'});
  vi.mocked(saveOrganizationConfiguration).mockResolvedValue({...config,version:3,vague_terms:['ágil','ótimo']});
  fireEvent.change(screen.getByLabelText('Termos vagos (um por linha)'),{target:{value:'ágil'+separator+'ótimo'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar verificações'}));
  await screen.findByText(/Configuração salva/);
  expect(saveOrganizationConfiguration).toHaveBeenCalledWith(expect.anything(),['ágil','ótimo']);
});
it('configura um nível e o dicionário sem alterar os outros níveis',async()=>{
  setup();await screen.findByRole('group',{name:'Épico'});
  fireEvent.click(within(screen.getByRole('group',{name:'Épico'})).getByLabelText('Campos obrigatórios do guia'));
  fireEvent.change(screen.getByLabelText('Termos vagos (um por linha)'),{target:{value:'ágil\nótimo'}});
  vi.mocked(saveOrganizationConfiguration).mockResolvedValue({...config,version:3,updated_by:{id:'admin',nome:'Ana'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar verificações'}));
  await screen.findByText(/Configuração salva/);
  expect(saveOrganizationConfiguration).toHaveBeenCalledWith(expect.objectContaining({version:2,levels:expect.objectContaining({epico:expect.objectContaining({campos_obrigatorios:false}),feature:config.levels.feature,pbi:config.levels.pbi})}),['ágil','ótimo']);
});
it('mantém o formulário quando o serviço falha e permite nova tentativa',async()=>{
  setup();await screen.findByRole('group',{name:'PBI'});
  fireEvent.change(screen.getByLabelText('Termos vagos (um por linha)'),{target:{value:'novo termo'}});
  vi.mocked(saveOrganizationConfiguration).mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button',{name:'Salvar verificações'}));
  await screen.findByRole('alert');expect(screen.getByLabelText('Termos vagos (um por linha)')).toHaveValue('novo termo');
  expect(screen.getByRole('button',{name:'Salvar verificações'})).toBeEnabled();
});
it('oferece recuperação quando a configuração não carrega',async()=>{
  vi.mocked(getOrganizationConfiguration).mockRejectedValue(new Error('offline'));
  vi.mocked(getQualityHistory).mockResolvedValue({items:[],next_before:null});render(<OrganizationQualitySettings/>);
  await screen.findByRole('alert');vi.mocked(getOrganizationConfiguration).mockResolvedValue(config);
  fireEvent.click(screen.getByRole('button',{name:'Recarregar configuração'}));await screen.findByRole('group',{name:'Épico'});
});
it('avisa conflito e preserva as alterações até recarregar explicitamente',async()=>{
  setup();await screen.findByRole('group',{name:'Épico'});
  const field=within(screen.getByRole('group',{name:'Épico'})).getByLabelText('Campos obrigatórios do guia');
  fireEvent.click(field);vi.mocked(saveOrganizationConfiguration).mockRejectedValue(new ApiError(409));
  fireEvent.click(screen.getByRole('button',{name:'Salvar verificações'}));
  await screen.findByText('Outra pessoa alterou a configuração. Recarregue e confira as mudanças antes de salvar.');
  expect(field).not.toBeChecked();
});
it('não permite paginar um histórico antigo enquanto recarrega a configuração',async()=>{
  vi.mocked(getOrganizationConfiguration).mockResolvedValue(structuredClone(config));
  vi.mocked(getQualityHistory).mockResolvedValue({items:[config],next_before:config.version});
  render(<OrganizationQualitySettings/>);
  await screen.findByRole('group',{name:'Épico'});
  fireEvent.click(screen.getByText('Histórico das configurações'));
  vi.mocked(getOrganizationConfiguration).mockImplementationOnce(()=>new Promise(()=>{}));
  fireEvent.click(screen.getByRole('button',{name:'Recarregar configuração'}));
  expect(screen.getByRole('button',{name:'Carregar mais configurações'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Carregar mais configurações'}));
  expect(getQualityHistory).toHaveBeenCalledTimes(2);
});
