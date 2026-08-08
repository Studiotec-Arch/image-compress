/**
 * Compressão de imagem no browser, antes do upload.
 *
 * Existe porque o gargalo do ecossistema Studiotec é a subida: o coordenador fotografa a obra
 * com um celular de 12 MP (4–6 MB por foto) e envia pelo 4G do canteiro. Reduzir para ~400 KB
 * corta o tempo de upload, o espaço no Drive e o tempo de carregamento de quem consulta depois.
 *
 * Biblioteca, e não serviço, pelo critério do ADR 0001 do Portal: função pura, sem estado, que
 * roda no processo do app. Mandar 5 MB pela rede para receber 400 KB de volta destruiria
 * justamente o ganho que se busca.
 *
 * Sem dependências e sem React de propósito — os consumidores não compartilham camada visual
 * (RDO e RC usam Vite + Tailwind; o Portal usa Next + CSS puro). A UI fica em cada app.
 */

/** Padrões calibrados para foto de obra: legível em tela e em relatório impresso. */
export const DEFAULT_MAX_EDGE = 1920;
export const DEFAULT_QUALITY = 0.8;

export interface CompressImageOptions {
  /** Maior lado da imagem final, em pixels. Nunca amplia. */
  maxEdge?: number;
  /** Qualidade do JPEG, de 0 a 1. */
  quality?: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Dimensões finais preservando a proporção. Só reduz — imagem menor que `maxEdge` passa
 * intacta, porque ampliar inventa pixel e aumenta o arquivo.
 */
export function targetSize({ width, height }: Size, maxEdge: number): Size {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Troca a extensão do arquivo por `.jpg`, já que a saída é sempre JPEG. */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'foto'}.jpg`;
}

/**
 * Reduz e reencoda a imagem em JPEG.
 *
 * Devolve o arquivo original — sem tocar — quando não é imagem, quando o browser não sabe
 * decodificar, ou quando o resultado ficaria maior que a entrada (acontece com print de tela
 * pequeno em PNG). Nunca piorar é regra: o pior caso é o comportamento de hoje.
 *
 * Os metadados EXIF são descartados no reencode, incluindo data/hora e GPS. É intencional
 * (decisão da Studiotec); quem precisar desses dados deve lê-los antes de chamar esta função.
 */
export async function compressImage(file: File, options: CompressImageOptions = {}): Promise<File> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  if (!file.type.startsWith('image/')) return file;
  // SVG é vetor: rasterizar destrói o arquivo em vez de otimizá-lo. GIF pode ser animado, e o
  // canvas guardaria só o primeiro quadro.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  try {
    const blob = await render(file, maxEdge, quality);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    // Compressão é otimização, não requisito: se falhar, o upload segue com o original.
    return file;
  }
}

/** Comprime uma lista (o que um `input[type=file] multiple` devolve), em paralelo. */
export async function compressImages(
  files: ArrayLike<File>,
  options: CompressImageOptions = {},
): Promise<File[]> {
  return Promise.all(Array.from(files, (file) => compressImage(file, options)));
}

/**
 * Caminho preferido: `createImageBitmap` + `OffscreenCanvas`, que decodifica fora da thread
 * principal e não trava a UI enquanto o coordenador escolhe 20 fotos de uma vez.
 *
 * `imageOrientation: 'from-image'` é obrigatório aqui: como o EXIF morre no reencode, a
 * rotação precisa ser aplicada aos pixels, ou a foto tirada em pé sai deitada.
 */
async function render(file: File, maxEdge: number, quality: number): Promise<Blob | null> {
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const size = targetSize(bitmap, maxEdge);
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality });
    } finally {
      bitmap.close();
    }
  }
  return renderWithImageElement(file, maxEdge, quality);
}

/**
 * Fallback para Safari abaixo da 16.4, que não tem `OffscreenCanvas` — ainda comum em iPhone
 * de obra. Aqui a orientação EXIF vem do próprio decode do browser ao carregar o `<img>`.
 */
function renderWithImageElement(file: File, maxEdge: number, quality: number): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const size = targetSize({ width: image.naturalWidth, height: image.naturalHeight }, maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, size.width, size.height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível decodificar a imagem.'));
    };
    image.src = url;
  });
}
