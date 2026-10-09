import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  createProject,
  type ProjectInput
} from "../../api/api_projects";
import "../../assets/styles/projects.css";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";

const empty: ProjectInput = {
  nome: "",
  cliente: "",
  descricao: "",
};

export function ProjectForm() {
  const [values, setValues] =
    useState<ProjectInput>(empty);

  const [errors, setErrors] = useState<
    Partial<ProjectInput>
  >({});

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);

  const form =
    useRef<HTMLFormElement>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const valid =
    values.nome.trim().length > 0 &&
    values.cliente.trim().length > 0 &&
    values.nome.trim().length <= 255 &&
    values.cliente.trim().length <= 255 &&
    Object.keys(errors).length === 0;

  return (
    <div className="page-container">
      <div className="crumb-bar">
        <button
          onClick={() => navigate("/projects")}
        >
          Projetos
        </button>

        <span>/</span>

        <b>Novo projeto</b>
      </div>

      <h1>Crie um espaço de trabalho</h1>

      <p className="muted">
        O projeto será o contexto para backlog,
        documentos e decisões.
      </p>

      <article
        className="ds-card"
        style={{
          maxWidth: "700px",
          marginTop: "24px",
        }}
      >
        <form
          ref={form}
          noValidate
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();

            if (submitting.current) {
              return;
            }

            const input = Object.fromEntries(
              Object.entries(values).map(
                ([key, value]) => [
                  key,
                  value.trim(),
                ],
              ),
            ) as unknown as ProjectInput;

            const invalid: Partial<ProjectInput> =
              {};

            if (!input.nome) {
              invalid.nome =
                "Informe o nome do projeto.";
            }

            if (!input.cliente) {
              invalid.cliente =
                "Informe o cliente.";
            }

            if (input.nome.length > 255) {
              invalid.nome =
                "O nome não pode exceder 255 caracteres.";
            }

            if (input.cliente.length > 255) {
              invalid.cliente =
                "O cliente não pode exceder 255 caracteres.";
            }

            setErrors(invalid);
            setMessage("");

            if (
              Object.keys(invalid).length
            ) {
              form.current
                ?.querySelector<HTMLElement>(
                  `[name="${Object.keys(invalid)[0]}"]`,
                )
                ?.focus();

              return;
            }

            submitting.current = true;
            setBusy(true);

            try {
              const project =
                await createProject(input);

              if (mounted.current) {
                navigate(
                  `/projects/${project.id}`,
                );
              }
            } catch (error) {
              if (!mounted.current) {
                return;
              }

              if (
                error instanceof ApiError &&
                error.status === 409
              ) {
                setErrors({
                  nome: "Este nome já está em uso por um projeto ativo.",
                });
              } else {
                setMessage(
                  error instanceof ApiError &&
                    error.status === 401
                    ? "É necessário entrar para criar projetos."
                    : error instanceof
                      ApiError &&
                      error.status === 403
                      ? "Você não tem permissão para criar projetos. Entre em contato com o administrador."
                      : error instanceof
                        ApiError &&
                        [400, 422].includes(
                          error.status,
                        )
                        ? "Revise os dados informados. O servidor recusou o cadastro."
                        : "Não foi possível confirmar a criação. Consulte a lista de projetos antes de tentar novamente.",
                );
              }
            } finally {
              submitting.current = false;

              if (mounted.current) {
                setBusy(false);
              }
            }
          }}
        >
          <div className="ds-field ds-field--spaced">
            <label htmlFor="nome">
              Nome do projeto
            </label>

            <input
              id="nome"
              name="nome"
              type="text"
              className="ds-input"
              required
              disabled={busy}
              value={values.nome}
              aria-invalid={Boolean(
                errors.nome,
              )}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  nome: event.target.value,
                }));

                setErrors((value) => {
                  const next = {
                    ...value,
                  };

                  delete next.nome;
                  return next;
                });

                setMessage("");
              }}
            />

            <span className="help">
              O nome deve ser único entre
              projetos ativos.
            </span>

            {errors.nome && (
              <p
                id="nome-error"
                role="alert"
                style={{
                  color: "var(--status-danger)",
                  fontSize: "12px",
                  margin: "2px 0 0",
                }}
              >
                {errors.nome}
              </p>
            )}
          </div>

          <div className="ds-field ds-field--spaced">
            <label htmlFor="cliente">
              Cliente
            </label>

            <input
              id="cliente"
              name="cliente"
              type="text"
              className="ds-input"
              required
              disabled={busy}
              value={values.cliente}
              aria-invalid={Boolean(
                errors.cliente,
              )}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  cliente:
                    event.target.value,
                }));

                setErrors((value) => {
                  const next = {
                    ...value,
                  };

                  delete next.cliente;
                  return next;
                });

                setMessage("");
              }}
            />

            {errors.cliente && (
              <p
                id="cliente-error"
                role="alert"
                style={{
                  color: "var(--status-danger)",
                  fontSize: "12px",
                  margin: "2px 0 0",
                }}
              >
                {errors.cliente}
              </p>
            )}
          </div>

          <div className="ds-field ds-field--spaced">
            <label htmlFor="descricao">
              Descrição
            </label>

            <input
              id="descricao"
              name="descricao"
              type="text"
              className="ds-input"
              disabled={busy}
              value={values.descricao}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  descricao:
                    event.target.value,
                }));

                setMessage("");
              }}
            />
          </div>

          {message && (
            <p
              role="alert"
              style={{
                color: "var(--status-danger)",
              }}
            >
              {message}
            </p>
          )}

          <p role="status">
            {busy
              ? "Criando projeto…"
              : valid
                ? "Dados preenchidos. Pronto para criar."
                : "Preencha os campos para criar o projeto."}
          </p>

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <Button
              type="submit"
              variant="primary"
              disabled={busy}
            >
              {busy
                ? "Criando…"
                : "Criar projeto"}
            </Button>
          </div>
        </form>
      </article>
    </div>
  );
}
