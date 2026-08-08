/**
 * Testes das partes puras — as que não dependem de canvas.
 *
 * A rasterização em si (`createImageBitmap`/`OffscreenCanvas`) só existe no browser e não é
 * exercitada aqui; o que se garante é o contrato de borda, que é onde os erros doem: nunca
 * devolver arquivo pior que o original e nunca destruir um formato que não deve ser rasterizado.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compressImage, jpegFileName, targetSize } from '../dist/index.js';

test('targetSize reduz pelo maior lado e preserva a proporção', () => {
  assert.deepEqual(targetSize({ width: 4000, height: 3000 }, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(targetSize({ width: 3000, height: 4000 }, 1920), { width: 1440, height: 1920 });
});

test('targetSize não amplia imagem menor que o limite', () => {
  assert.deepEqual(targetSize({ width: 800, height: 600 }, 1920), { width: 800, height: 600 });
});

test('targetSize nunca chega a zero em imagem muito estreita', () => {
  assert.deepEqual(targetSize({ width: 4000, height: 3 }, 1920), { width: 1920, height: 1 });
});

test('jpegFileName troca a extensão e aguenta nome sem extensão', () => {
  assert.equal(jpegFileName('IMG_0042.HEIC'), 'IMG_0042.jpg');
  assert.equal(jpegFileName('foto.da.obra.png'), 'foto.da.obra.jpg');
  assert.equal(jpegFileName('rascunho'), 'rascunho.jpg');
});

test('compressImage devolve o original quando o arquivo não é imagem', async () => {
  const pdf = new File(['%PDF-1.4'], 'orcamento.pdf', { type: 'application/pdf' });

  assert.equal(await compressImage(pdf), pdf);
});

test('compressImage não rasteriza SVG nem GIF', async () => {
  // SVG é vetor (rasterizar destrói) e GIF pode ser animado (o canvas guardaria um quadro só).
  const svg = new File(['<svg/>'], 'planta.svg', { type: 'image/svg+xml' });
  const gif = new File(['GIF89a'], 'animacao.gif', { type: 'image/gif' });

  assert.equal(await compressImage(svg), svg);
  assert.equal(await compressImage(gif), gif);
});

test('compressImage devolve o original quando o browser não sabe decodificar', async () => {
  // Em Node não existe canvas: o caminho de erro é o mesmo de um arquivo corrompido em campo.
  const quebrada = new File(['nao é uma imagem'], 'foto.jpg', { type: 'image/jpeg' });

  assert.equal(await compressImage(quebrada), quebrada);
});
