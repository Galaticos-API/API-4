#!/usr/bin/env python3
"""
Gera o PDF do Backlog de Produto a partir dos arquivos Markdown deste diretório.

Uso:
    python3 docs/backlog/build_pdf.py            # versão completa
    python3 docs/backlog/build_pdf.py --resumo   # só as histórias, para o cliente

Não depende de pandoc nem weasyprint: converte para HTML e imprime com o
Chrome headless. O bloco de cenário é o ponto sensível — DADO, QUANDO e ENTÃO
precisam sair uma cláusula por linha, com a palavra-chave em coluna própria.
Rodando tudo num parágrafo, o padrão do cliente deixa de ser legível.
"""

import html
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

VERSAO = "1.1"
DATA = "08/09/2026"

ORDEM = [
    "README.md",
    "EP-01-especificar-backlog.md",
    "EP-02-preservar-conhecimento.md",
    "EP-03-apoio-inteligencia-artificial.md",
    "EP-04-consultar-conhecimento.md",
    "EP-05-competencias-equipe.md",
    "EP-06-acesso-controlado.md",
]

# Seções do README que não vão para o cliente na versão resumida.
CORTE_RESUMO = (
    "Habilitadores técnicos",
    "Pendências que afetam este backlog",
    "Como este backlog é organizado",
    "Definição de pronto",
    "Priorização",
    "Registro da revisão do cliente",
)
# No resumo, o que fica de cada item é a história — cenário e regra saem.
CORTE_ITEM = ("Descrição", "Escopo macro", "Fora de escopo", "Critérios de aceitação")


def inline(t):
    """Formatação dentro da linha. A ordem importa: código antes de negrito."""
    t = html.escape(t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)          # link vira só o texto
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", t)
    return t


PAROU = re.compile(r"^(#{1,4}\s|\||>|-{3,}$|[-*]\s|\d+\.\s|\*\*|DADO\b|QUANDO\b|ENT\u00c3O\b|COMO UM\b|EU QUERO\b|PARA QUE\b)")


def continuar(linhas, i, texto):
    """No Markdown a cláusula pode quebrar em duas linhas. Junta a continuação."""
    while i < len(linhas):
        c = linhas[i].strip()
        if not c or PAROU.match(c):
            break
        texto += " " + c
        i += 1
    return i, texto


def tabela(linhas):
    out = ['<table>']
    for i, ln in enumerate(linhas):
        celulas = [c.strip() for c in ln.strip().strip("|").split("|")]
        if i == 1 and all(set(c) <= set(":- ") for c in celulas):
            continue                                          # linha de alinhamento
        tag = "th" if i == 0 else "td"
        out.append("<tr>" + "".join(f"<{tag}>{inline(c)}</{tag}>" for c in celulas) + "</tr>")
    out.append("</table>")
    return "\n".join(out)


def converter(md, resumo=False):
    linhas = md.split("\n")
    out, i = [], 0
    pulando = False

    while i < len(linhas):
        ln = linhas[i]
        bruto = ln.strip()

        # --- corte de seções na versão resumida ---
        if bruto.startswith("## "):
            titulo = bruto[3:].strip()
            pulando = resumo and (
                any(titulo.startswith(c) for c in CORTE_RESUMO)
                or titulo in CORTE_ITEM
            )
        if pulando and not bruto.startswith("# "):
            i += 1
            continue

        if not bruto:
            i += 1
            continue

        # --- régua ---
        if re.fullmatch(r"-{3,}", bruto):
            out.append('<hr>')
            i += 1
            continue

        # --- títulos ---
        m = re.match(r"^(#{1,4})\s+(.*)$", bruto)
        if m:
            n = len(m.group(1))
            texto = m.group(2)
            classe = ""
            if n == 3 and texto.startswith("PBI-"):
                classe = ' class="pbi"'
            elif n == 2 and texto.startswith("FT-"):
                classe = ' class="feature"'
            out.append(f"<h{n}{classe}>{inline(texto)}</h{n}>")
            i += 1
            continue

        # --- história do usuário: COMO UM / EU QUERO / PARA QUE ---
        if bruto.startswith("COMO UM"):
            bloco = []
            for chave in ("COMO UM", "EU QUERO", "PARA QUE"):
                if i < len(linhas) and linhas[i].strip().startswith(chave):
                    resto = linhas[i].strip()[len(chave):].strip()
                    i += 1
                    i, resto = continuar(linhas, i, resto)
                    i -= 1
                    bloco.append(
                        f'<div class="cl"><span class="kw">{chave}</span>'
                        f'<span class="tx">{inline(resto)}</span></div>'
                    )
                    i += 1
            out.append('<div class="historia">' + "".join(bloco) + "</div>")
            continue

        # --- cenário: cabeçalho em negrito + DADO / QUANDO / ENTÃO ---
        m = re.match(r"^\*\*(Cenário[^*]*)\*\*\s*$", bruto)
        if m:
            titulo = m.group(1)
            i += 1
            clausulas = []
            while i < len(linhas):
                c = linhas[i].strip()
                mk = re.match(r"^(DADO|QUANDO|ENTÃO|E)\b\s*(.*)$", c)
                if not mk:
                    break
                i += 1
                i, texto = continuar(linhas, i, mk.group(2))
                clausulas.append(
                    f'<div class="cl"><span class="kw">{mk.group(1)}</span>'
                    f'<span class="tx">{inline(texto)}</span></div>'
                )
            if resumo:
                continue
            if clausulas:
                out.append(
                    f'<div class="cenario"><div class="cen-t">{inline(titulo)}</div>'
                    + "".join(clausulas) + "</div>"
                )
            else:
                out.append(f"<p><strong>{inline(titulo)}</strong></p>")
            continue

        # --- tabela ---
        if bruto.startswith("|"):
            bloco = []
            while i < len(linhas) and linhas[i].strip().startswith("|"):
                bloco.append(linhas[i])
                i += 1
            out.append(tabela(bloco))
            continue

        # --- citação ---
        if bruto.startswith(">"):
            bloco = []
            while i < len(linhas) and linhas[i].strip().startswith(">"):
                bloco.append(linhas[i].strip().lstrip(">").strip())
                i += 1
            out.append('<blockquote>' + inline(" ".join(bloco)) + "</blockquote>")
            continue

        # --- lista ---
        if re.match(r"^[-*]\s+", bruto) or re.match(r"^\d+\.\s+", bruto):
            ordenada = bool(re.match(r"^\d+\.", bruto))
            tag = "ol" if ordenada else "ul"
            itens = []
            while i < len(linhas):
                c = linhas[i].strip()
                m2 = re.match(r"^[-*]\s+(.*)$", c) or re.match(r"^\d+\.\s+(.*)$", c)
                if not m2:
                    break
                i += 1
                i, texto = continuar(linhas, i, m2.group(1))
                itens.append(f"<li>{inline(texto)}</li>")
            out.append(f"<{tag}>" + "".join(itens) + f"</{tag}>")
            continue

        # --- "Regras e observações" e os blocos de detalhe saem do resumo ---
        if resumo and bruto.startswith("**Regras e observações"):
            while i < len(linhas) and linhas[i].strip():
                i += 1
            continue

        # --- parágrafo (junta linhas até a próxima em branco) ---
        bloco = []
        while i < len(linhas) and linhas[i].strip() and not re.match(
            r"^(#{1,4}\s|\||>|-{3,}$|[-*]\s|\d+\.\s|COMO UM|\*\*Cenário)", linhas[i].strip()
        ):
            bloco.append(linhas[i].strip())
            i += 1
        if bloco:
            out.append("<p>" + inline(" ".join(bloco)) + "</p>")

    return "\n".join(out)


CSS = """
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
       font-size: 10.5pt; line-height: 1.55; color: #16181D; margin: 0; }

.capa { height: 247mm; display: flex; flex-direction: column; justify-content: center;
        page-break-after: always; }
.capa .marca { width: 44pt; height: 8pt; background: #ED6A32; margin-bottom: 22pt; }
.capa h1 { page-break-before: avoid; font-size: 30pt; line-height: 1.12; margin: 0 0 10pt 0; color: #0B0D10;
           border: 0; padding: 0; letter-spacing: -0.4pt; }
.capa .sub { font-size: 13pt; color: #6B7280; margin: 0 0 34pt 0; }
.capa .meta { font-size: 10.5pt; color: #16181D; line-height: 2; }
.capa .meta b { display: inline-block; width: 88pt; color: #6B7280; font-weight: 600; }

h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 14pt 0; padding-bottom: 7pt;
     border-bottom: 2.5pt solid #ED6A32; color: #0B0D10; page-break-before: always;
     page-break-after: avoid; }
h2 { font-size: 13.5pt; margin: 20pt 0 8pt 0; color: #0B0D10; page-break-after: avoid; }
h2.feature { border-left: 3pt solid #ED6A32; padding-left: 8pt; }
h3 { font-size: 11.5pt; margin: 16pt 0 7pt 0; color: #0B0D10; page-break-after: avoid; }
h3.pbi { background: #F7F7F8; border-left: 2.5pt solid #C4C7CC; padding: 6pt 9pt;
         margin-left: -2pt; }
h4 { font-size: 10.5pt; margin: 12pt 0 5pt 0; color: #16181D; page-break-after: avoid; }

p { margin: 0 0 8pt 0; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 9pt; white-space: nowrap;
       background: #F1F2F4; padding: 1pt 3pt; border-radius: 2pt; color: #9A4318; }
strong { font-weight: 600; }
del { color: #9A9DA4; }
hr { border: 0; border-top: 0.5pt solid #DDDFE2; margin: 14pt 0; }

ul, ol { margin: 0 0 8pt 0; padding-left: 16pt; }
li { margin-bottom: 3pt; }

blockquote { margin: 9pt 0; padding: 8pt 11pt; background: #FBF6F3;
             border-left: 2.5pt solid #F1885B; font-size: 10pt; color: #3A3D44; }

table { width: 100%; border-collapse: collapse; margin: 9pt 0 12pt 0;
        font-size: 9.5pt; page-break-inside: avoid; }
th { background: #F1F2F4; text-align: left; font-weight: 600; color: #16181D;
     padding: 5pt 7pt; border: 0.5pt solid #DDDFE2; }
td { padding: 5pt 7pt; border: 0.5pt solid #DDDFE2; vertical-align: top; }

/* --- história e cenário: uma cláusula por linha, palavra-chave em coluna --- */
.historia { margin: 9pt 0 11pt 0; padding: 9pt 11pt; background: #FAFAFB;
            border: 0.5pt solid #E4E6E9; border-radius: 3pt; page-break-inside: avoid; }
.cenario { margin: 9pt 0; padding: 9pt 11pt; border: 0.5pt solid #E4E6E9;
           border-radius: 3pt; page-break-inside: avoid; }
.cen-t { font-weight: 600; font-size: 10pt; margin-bottom: 6pt; color: #0B0D10; }
.cl { display: flex; align-items: baseline; margin-bottom: 3pt; }
.cl:last-child { margin-bottom: 0; }
.kw { flex: 0 0 54pt; white-space: nowrap; font-family: "SF Mono", Menlo, monospace;
      font-size: 8pt; font-weight: 700; letter-spacing: 0.3pt; color: #C2551F; }
.tx { flex: 1; font-size: 10pt; line-height: 1.5; }
"""


# O resumido é um documento de leitura rápida: mesma tipografia, menos respiro.
CSS_RESUMO = """
body { font-size: 10pt; line-height: 1.45; }
h1 { font-size: 17pt; margin-bottom: 11pt; }
h2 { font-size: 12.5pt; margin: 15pt 0 6pt 0; }
h3.pbi { font-size: 10.5pt; padding: 4pt 8pt; margin: 11pt 0 4pt 0; }
p { margin: 0 0 6pt 0; }
.historia { margin: 4pt 0 8pt 0; padding: 6pt 9pt; }
.cl { margin-bottom: 2pt; }
.tx { font-size: 9.5pt; line-height: 1.4; }
table { margin: 7pt 0 9pt 0; font-size: 9pt; }
th, td { padding: 4pt 6pt; }
blockquote { margin: 7pt 0; padding: 6pt 9pt; font-size: 9.5pt; }
"""


def capa(resumo):
    titulo = "Backlog de Produto"
    sub = "Sinapse — base inteligente de requisitos"
    extra = "<div><b>Formato</b> Histórias de usuário</div>" if resumo else ""
    return f"""
<div class="capa">
  <div class="marca"></div>
  <h1>{titulo}</h1>
  <p class="sub">{sub}</p>
  <div class="meta">
    <div><b>Cliente</b> PRO4TECH</div>
    <div><b>Equipe</b> Grupo Galáticos — Fatec São José dos Campos</div>
    <div><b>Versão</b> {VERSAO} — {DATA}</div>
    <div><b>Padrão</b> Guia de Especificação de Itens de Trabalho</div>
    {extra}
  </div>
</div>
"""


def main():
    resumo = "--resumo" in sys.argv
    partes = [capa(resumo)]

    for nome in ORDEM:
        caminho = AQUI / nome
        if not caminho.exists():
            print(f"  ! faltando: {nome}", file=sys.stderr)
            continue
        md = caminho.read_text(encoding="utf-8")
        if nome == "README.md":
            # O cabeçalho do README já está na capa.
            md = md.split("---", 1)[1] if "---" in md else md
        partes.append(converter(md, resumo=resumo))

    corpo = "\n".join(partes)
    css = CSS + (CSS_RESUMO if resumo else "")
    doc = (f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>"
           f"<title>Backlog de Produto — Sinapse v{VERSAO}</title>"
           f"<style>{css}</style></head><body>{corpo}</body></html>")

    sufixo = "_resumido" if resumo else ""
    base = f"Backlog_Produto_Sinapse_v{VERSAO}{sufixo}"
    htm = AQUI / f".{base}.html"
    pdf = AQUI / f"{base}.pdf"
    htm.write_text(doc, encoding="utf-8")

    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf}", str(htm)],
        check=True, capture_output=True,
    )
    htm.unlink()
    print(f"{pdf.name} — {pdf.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
