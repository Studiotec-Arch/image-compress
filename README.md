# @studiotec-arch/image-compress

Compressão de imagem no browser, **antes** do upload. Biblioteca compartilhada do ecossistema
Studiotec — Portal RDO, Requisições de Compras e Portal Studiotec.

O gargalo não é o disco: é a subida. O coordenador fotografa a obra com um celular de 12 MP
(4–6 MB por foto) e envia pelo 4G do canteiro. Reduzindo para ~400 KB, cai o tempo de upload,
o espaço no Google Drive e o tempo de carregamento de quem consulta o relatório depois.

Uma foto de 5 MB vira ~400 KB — redução de cerca de 90%, sem perda visível em tela nem em
relatório impresso.

## Por que biblioteca e não serviço

Pelo critério do [ADR 0001](https://github.com/Studiotec-Arch/portal-studiotec/blob/main/docs/adr/0001-codigo-e-servicos-compartilhados.md)
do Portal: função pura, sem estado, que roda no processo do próprio app. Um serviço seria pior
que inútil aqui — mandar 5 MB pela rede para receber 400 KB de volta destrói exatamente o ganho
que se busca.

Pelo mesmo motivo o pacote **não exporta componente React**. Os consumidores não compartilham
camada visual (RDO e RC usam Vite + Tailwind; o Portal usa Next + CSS puro), então a UI —
botão, preview, indicador de progresso — fica em cada app. Aqui mora só a função.

> **Nome do escopo:** o ADR 0001 previa `@studiotec/*`, mas o GitHub Packages exige que o escopo
> npm seja igual ao login do owner. Como a org é `Studiotec-Arch`, o pacote é
> `@studiotec-arch/image-compress`. Mudar isso exigiria renomear a organização.

## Instalação

Instale pela URL de git, **sempre fixada numa tag** (nunca `main`, por ordem do catálogo da
plataforma compartilhada):

```bash
npm install git+https://github.com/Studiotec-Arch/image-compress.git#v1.0.1
```

Use a URL `git+https` completa, e não o atalho `github:` — o npm resolve o atalho para
`git+ssh` no lockfile, que não funciona dentro de um container sem chave. A imagem de build
precisa ter `git` (`node:22`, não `node:22-slim`); o `prepare` compila no install, então não há
passo de build no consumidor.

> **Por que não um registro npm.** O ADR 0001 previa GitHub Packages, mas ele **exige
> autenticação até para instalar**, inclusive pacote público — o que obrigaria cada app a
> carregar um PAT em todo build de Docker, na VPS e no CI. Este repositório é público e não tem
> nada de negócio dentro (é redimensionamento de imagem), então a URL de git elimina a
> credencial de todos os consumidores. É o mesmo mecanismo que o ADR já escolheu para o
> `studiotec-core` em Python: pacote fixado por tag, sem registro privado.

## Licença

`UNLICENSED` — o repositório é **público para ser instalável sem credencial**, não para ser
código aberto. Todos os direitos reservados à Studiotec; não há concessão de uso a terceiros.

## Uso

```ts
import { compressImage, compressImages } from '@studiotec-arch/image-compress';

// Um arquivo
const menor = await compressImage(file);

// O que um input[type=file] multiple devolve
const menores = await compressImages(event.target.files);

// Padrões: 1920 px no maior lado, JPEG qualidade 0.8
const thumb = await compressImage(file, { maxEdge: 800, quality: 0.7 });
```

### Garantias

- **Nunca piora o arquivo.** Se o resultado ficar maior que a entrada (acontece com print de
  tela pequeno em PNG), devolve o original.
- **Nunca quebra o upload.** Qualquer falha de decodificação devolve o original: compressão é
  otimização, não requisito.
- **Não toca no que não deve rasterizar.** SVG (vetor) e GIF (pode ser animado) passam intactos.
- **Não amplia.** Imagem menor que `maxEdge` mantém as dimensões.
- **Corrige a orientação.** A rotação do EXIF é aplicada aos pixels — sem isso a foto tirada em
  pé sairia deitada, já que o EXIF morre no reencode.

### EXIF é descartado

O reencode remove todos os metadados, inclusive **data/hora e GPS**. É intencional (decisão da
Studiotec). Quem precisar desses dados deve lê-los do `File` original antes de chamar a função.

## Compatibilidade

Caminho principal: `createImageBitmap` + `OffscreenCanvas` — decodifica fora da thread principal
e não trava a UI com 20 fotos de uma vez. Safari abaixo da 16.4 não tem `OffscreenCanvas` e cai
num fallback com `<img>` + `<canvas>`, ainda relevante para iPhone de obra.

## Desenvolvimento

```bash
npm install
npm test
```

Os testes cobrem as partes puras e o contrato de borda. A rasterização em si só existe no
browser e não é exercitada no CI — o que se garante é que nenhum caminho de erro devolva um
arquivo pior que o original.

## Lançar uma versão

Não há publicação em registro: a **tag é o artefato**. O CI roda os testes e confere que a tag
bate com o `package.json`.

```bash
npm version minor
git push origin main --tags
```

Use `--tags`, e não `--follow-tags`: o `npm version` cria tag anotada, mas uma tag criada à mão
com `git tag vX.Y.Z` é leve e o `--follow-tags` a ignora em silêncio — o consumidor fica com um
`npm install` apontando para uma tag que não existe no remoto.

Depois, atualize a tag fixada em cada app consumidor e registre a versão no catálogo da
plataforma compartilhada, no repositório do Portal.
