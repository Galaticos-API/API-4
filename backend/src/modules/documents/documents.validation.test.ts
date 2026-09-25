import test from "node:test";
import assert from "node:assert/strict";
import { AppError, ValidationError } from "../../shared/errors.js";
import { extensionOf, formatLimit, inspectDocument, sanitizeFileName } from "./documents.validation.js";
import { docxBuffer, pdfBuffer } from "./documents.fakes.js";

const LIMIT = 1024 * 1024;

test("aceita PDF, DOCX, MD e TXT com conteúdo coerente e define o MIME pelo conteúdo", () => {
  assert.equal(inspectDocument("Escopo.pdf", pdfBuffer(), LIMIT).mime, "application/pdf");
  assert.equal(
    inspectDocument("Escopo.docx", docxBuffer(), LIMIT).mime,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(inspectDocument("notas.md", Buffer.from("# Título\n\nTexto com acentuação."), LIMIT).mime, "text/markdown");
  assert.equal(inspectDocument("notas.TXT", Buffer.from("texto simples"), LIMIT).extensao, ".txt");
});

test("recusa extensões fora da lista permitida", () => {
  for (const name of ["programa.exe", "planilha.xlsx", "antigo.doc", "sem-extensao", ".md", "arquivo."]) {
    assert.throws(() => inspectDocument(name, Buffer.from("conteudo"), LIMIT), ValidationError, name);
  }
});

test("MIME falso: extensão .pdf com conteúdo de texto é recusada", () => {
  assert.throws(() => inspectDocument("falso.pdf", Buffer.from("isto não é um PDF"), LIMIT), /não corresponde ao formato \.pdf/);
});

test("MIME falso: executável renomeado para .txt ou .md é recusado", () => {
  const executable = Buffer.concat([Buffer.from("MZ"), Buffer.from([0x90, 0x00, 0x03, 0x00])]);
  assert.throws(() => inspectDocument("instalador.txt", executable, LIMIT), ValidationError);
  assert.throws(() => inspectDocument("instalador.md", executable, LIMIT), ValidationError);
});

test("MIME falso: ZIP genérico e PDF renomeados para .docx são recusados", () => {
  const zipWithoutWordPart = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml", "latin1")]);
  assert.throws(() => inspectDocument("planilha.docx", zipWithoutWordPart, LIMIT), ValidationError);
  assert.throws(() => inspectDocument("relatorio.docx", pdfBuffer(), LIMIT), ValidationError);
});

test("texto com bytes inválidos em UTF-8 é recusado", () => {
  assert.throws(() => inspectDocument("quebrado.txt", Buffer.from([0xff, 0xfe, 0xfd]), LIMIT), ValidationError);
});

test("recusa arquivo vazio e arquivo acima do limite com código 413", () => {
  assert.throws(() => inspectDocument("vazio.txt", Buffer.alloc(0), LIMIT), /vazio/);
  try {
    inspectDocument("grande.txt", Buffer.alloc(LIMIT + 1, 0x61), LIMIT);
    assert.fail("deveria recusar");
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 413);
    assert.equal(error.code, "PAYLOAD_TOO_LARGE");
    assert.match(error.message, /1 MB/);
  }
});

test("aceita arquivo exatamente no limite", () => {
  assert.equal(inspectDocument("limite.txt", Buffer.alloc(LIMIT, 0x61), LIMIT).nome, "limite.txt");
});

test("sanitiza nome: remove caminho, controles e recusa nome vazio ou longo", () => {
  assert.equal(sanitizeFileName("C:\\Users\\ana\\..\\Escopo final.pdf"), "Escopo final.pdf");
  assert.equal(sanitizeFileName("../../etc/passwd.txt"), "passwd.txt");
  assert.equal(sanitizeFileName("no\u0000me\u001f.md"), "nome.md");
  assert.throws(() => sanitizeFileName("   "), ValidationError);
  assert.throws(() => sanitizeFileName(`${"a".repeat(256)}.txt`), /255/);
});

test("funções auxiliares de extensão e limite", () => {
  assert.equal(extensionOf("Arquivo.Final.PDF"), ".pdf");
  assert.equal(extensionOf(".gitignore"), "");
  assert.equal(formatLimit(20 * 1024 * 1024), "20 MB");
  assert.equal(formatLimit(1.5 * 1024 * 1024), "1.5 MB");
});
