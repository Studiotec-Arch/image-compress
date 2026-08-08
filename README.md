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

O registro é o GitHub Packages, que **exige autenticação mesmo para leitura**. No app consumidor,
crie um `.npmrc`:

```
@studiotec-arch:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

E instale fixando a versão (nunca `latest`, por ordem do catálogo da plataforma compartilhada):

```bash
npm install @studiotec-arch/image-compress@1.0.0
```

O `GITHUB_PACKAGES_TOKEN` é um PAT clássico com escopo `read:packages`, autorizado para a org
`Studiotec-Arch`. Em build via Docker ele entra como secret de build, não como `ARG` — `ARG`
fica gravado no histórico da imagem.

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

## Publicação

Versão nova = tag nova. O workflow `publish.yml` roda os testes, confere que a tag bate com o
`package.json` e publica no GitHub Packages:

```bash
npm version minor
git push --follow-tags
```
