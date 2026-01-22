/**
 * 图片压缩工具函数
 * 自动压缩大图，确保系统加载速度，同时保证字迹清晰
 * 支持多种图片格式：JPEG, PNG, GIF, WebP, BMP, HEIC, HEIF 等
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeKB?: number; // 最大文件大小（KB）
  outputFormat?: "auto" | "jpeg" | "png" | "webp"; // 输出格式，auto 表示保持原格式
}

// 支持的图片格式
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/tif",
  "image/svg+xml"
] as const;

/**
 * 检测是否为支持的图片格式
 */
export function isSupportedImageType(file: File): boolean {
  const type = file.type.toLowerCase();
  return SUPPORTED_IMAGE_TYPES.some(supported => type.includes(supported.replace("image/", "")));
}

/**
 * 根据文件类型确定最佳输出格式
 */
function getOutputFormat(fileType: string, outputFormat: "auto" | "jpeg" | "png" | "webp"): string {
  if (outputFormat !== "auto") {
    return `image/${outputFormat}`;
  }

  const lowerType = fileType.toLowerCase();
  
  // 保持原始格式（如果支持）
  if (lowerType.includes("png")) return "image/png";
  if (lowerType.includes("webp")) return "image/webp";
  if (lowerType.includes("gif")) return "image/gif"; // GIF 保持原格式以保留动画
  // 其他格式统一转换为 JPEG
  return "image/jpeg";
}

/**
 * 压缩图片
 * @param file 原始图片文件
 * @param options 压缩选项
 * @returns 压缩后的Base64字符串
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<string> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    maxSizeKB = 500,
    outputFormat = "auto"
  } = options;

  // 验证文件格式
  if (!isSupportedImageType(file)) {
    throw new Error(`不支持的图片格式: ${file.type}。支持的格式: JPEG, PNG, GIF, WebP, BMP, HEIC, HEIF, TIFF, SVG`);
  }

  // SVG 是矢量图，不需要压缩，直接读取
  if (file.type.toLowerCase().includes("svg")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("SVG 文件读取失败"));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 计算压缩后的尺寸
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        // 创建canvas进行压缩
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("无法创建canvas上下文"));
          return;
        }

        // 对于 PNG，确保背景是白色（而不是透明）
        if (file.type.toLowerCase().includes("png") && outputFormat === "jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height);

        // 确定输出格式
        const targetFormat = getOutputFormat(file.type, outputFormat);
        const useQuality = targetFormat === "image/png" ? undefined : quality; // PNG 不支持质量参数

        // 转换为Blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("图片压缩失败"));
              return;
            }

            // 如果文件仍然太大，进一步降低质量（仅对 JPEG/WebP）
            if (blob.size > maxSizeKB * 1024 && useQuality !== undefined) {
              let currentQuality = quality;
              const maxIterations = 5;
              let iteration = 0;

              const tryCompress = (q: number): void => {
                if (iteration >= maxIterations) {
                  // 最后一次尝试，直接使用最低质量
                  const reader2 = new FileReader();
                  reader2.onload = () => resolve(reader2.result as string);
                  reader2.onerror = () => reject(new Error("读取压缩图片失败"));
                  reader2.readAsDataURL(blob);
                  return;
                }

                iteration++;
                canvas.toBlob(
                  (newBlob) => {
                    if (!newBlob) {
                      reject(new Error("图片压缩失败"));
                      return;
                    }
                    
                    if (newBlob.size <= maxSizeKB * 1024 || q <= 0.3) {
                      const reader2 = new FileReader();
                      reader2.onload = () => resolve(reader2.result as string);
                      reader2.onerror = () => reject(new Error("读取压缩图片失败"));
                      reader2.readAsDataURL(newBlob);
                    } else {
                      // 继续降低质量
                      tryCompress(Math.max(0.3, q * 0.8));
                    }
                  },
                  targetFormat,
                  q
                );
              };

              tryCompress(Math.max(0.3, quality * 0.7));
            } else {
              const reader2 = new FileReader();
              reader2.onload = () => resolve(reader2.result as string);
              reader2.onerror = () => reject(new Error("读取压缩图片失败"));
              reader2.readAsDataURL(blob);
            }
          },
          targetFormat,
          useQuality
        );
      };
      img.onerror = () => reject(new Error("图片加载失败，请确保是有效的图片文件"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * 从剪贴板获取图片
 * @param clipboardData 剪贴板数据
 * @returns 图片文件数组
 */
export function getImagesFromClipboard(clipboardData: DataTransfer): File[] {
  const files: File[] = [];
  const items = clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  return files;
}
