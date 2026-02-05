"use client";

import React, { useState, useRef, useEffect } from "react";
import { compressImage, getImagesFromClipboard, isSupportedImageType, SUPPORTED_IMAGE_TYPES } from "@/lib/image-utils";
import { X, Upload } from "lucide-react";

export interface ImageUploaderProps {
  value: string | string[]; // 单个图片Base64或图片数组
  onChange: (value: string | string[]) => void;
  multiple?: boolean; // 是否支持多图
  label?: string;
  required?: boolean;
  placeholder?: string;
  maxImages?: number; // 最大图片数量
  maxSizeKB?: number; // 单张图片压缩后最大 KB，默认 500，产品表单建议 200 以减小请求体
  onError?: (error: string) => void;
}

export default function ImageUploader({
  value,
  onChange,
  multiple = false,
  label = "上传图片",
  required = false,
  placeholder = "点击上传或直接 Ctrl + V 粘贴图片",
  maxImages = 5,
  maxSizeKB = 500,
  onError
}: ImageUploaderProps) {
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [imageViewModal, setImageViewModal] = useState<{ images: string[]; currentIndex: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);

  // 初始化图片数组
  useEffect(() => {
    if (Array.isArray(value)) {
      setImages(value);
    } else if (value) {
      setImages([value]);
    } else {
      setImages([]);
    }
  }, [value]);

  // 使用 ref 存储最新的 images，避免闭包问题
  const imagesRef = useRef<string[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 处理图片上传
  const handleImageUpload = React.useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // 检查数量限制（使用 ref 获取最新值）
    const currentImages = imagesRef.current;
    const remainingSlots = multiple ? maxImages - currentImages.length : 1 - currentImages.length;
    if (remainingSlots <= 0) {
      onError?.(`最多只能上传${multiple ? maxImages : 1}张图片`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const compressedImages: string[] = [];

      for (const file of filesToProcess) {
        if (!file.type.startsWith("image/")) {
          onError?.(`文件 "${file.name}" 不是图片文件`);
          continue;
        }

        if (!isSupportedImageType(file)) {
          const supportedFormats = SUPPORTED_IMAGE_TYPES.map(t => t.replace("image/", "").toUpperCase()).join(", ");
          onError?.(`不支持的图片格式: ${file.type}。支持的格式: ${supportedFormats}`);
          continue;
        }

        try {
          const compressed = await compressImage(file, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.85,
            maxSizeKB,
            outputFormat: "auto" // 自动选择最佳输出格式
          });
          compressedImages.push(compressed);
        } catch (error) {
          console.error("图片压缩失败:", error);
          const errorMessage = error instanceof Error ? error.message : "图片压缩失败，请重试";
          onError?.(errorMessage);
        }
      }

      if (compressedImages.length > 0) {
        setImages((prevImages) => {
          const newImages = multiple ? [...prevImages, ...compressedImages] : compressedImages;
          const result = multiple ? newImages : (newImages[0] || "");
          // 调试：检查返回的数据
          if (!multiple && result) {
            console.log("ImageUploader 返回数据长度:", typeof result === "string" ? result.length : "非字符串");
            console.log("ImageUploader 返回数据前缀:", typeof result === "string" ? result.substring(0, 50) : "非字符串");
          }
          onChange(result);
          return newImages;
        });
      }
    } catch (error) {
      console.error("图片上传失败:", error);
      onError?.("图片上传失败，请重试");
    } finally {
      setIsUploading(false);
    }
  }, [multiple, maxImages, onChange, onError]);

  // 全局粘贴事件监听 - 允许在页面上任何地方粘贴图片
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // 检查上传区域是否存在
      if (!uploadAreaRef.current) return;
      
      // 检查是否在输入框或文本区域中（避免干扰正常的文本输入）
      const activeElement = document.activeElement;
      if (activeElement && (
        (activeElement.tagName === "INPUT" && (activeElement as HTMLInputElement).type !== "file") ||
        activeElement.tagName === "TEXTAREA" ||
        ((activeElement as HTMLElement).isContentEditable && activeElement !== document.body)
      )) {
        // 如果焦点在输入框中，检查是否在上传区域内
        if (!uploadAreaRef.current.contains(activeElement)) {
          return; // 不在上传区域内，不处理，让输入框正常处理粘贴
        }
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const imageFiles = getImagesFromClipboard(clipboardData);
      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        await handleImageUpload(imageFiles);
      }
    };

    // 添加全局粘贴监听（使用捕获阶段，确保优先处理）
    document.addEventListener("paste", handleGlobalPaste, true);
    
    return () => {
      document.removeEventListener("paste", handleGlobalPaste, true);
    };
  }, [handleImageUpload]);

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    // 重置input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 处理剪贴板粘贴
  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    const imageFiles = getImagesFromClipboard(clipboardData);

    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleImageUpload(imageFiles);
    }
  };

  // 删除图片
  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    const result = multiple ? newImages : (newImages[0] || "");
    onChange(result);
  };

  // 点击上传区域
  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };

  // 拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    handleImageUpload(files);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>

      {/* 上传区域 */}
      <div
        ref={uploadAreaRef}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleUploadAreaClick}
        className={`
          relative border-2 border-dashed rounded-lg p-4 cursor-pointer
          transition-all duration-300
          ${isUploading 
            ? "border-[#00E5FF] bg-[#00E5FF]/10 shadow-glow-blue" 
            : "border-white/20 bg-slate-900/30 hover:border-[#00E5FF]/50 hover:bg-slate-800/30 upload-area-dash"
          }
        `}
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_TYPES.join(",")}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center text-center space-y-2">
          {isUploading ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400"></div>
              <p className="text-sm text-slate-400">正在处理图片...</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-[#00E5FF]" />
              <p className="text-sm text-slate-300">{placeholder}</p>
              <p className="text-xs text-slate-500">
                支持格式: JPEG, PNG, GIF, WebP, BMP, HEIC, HEIF, TIFF, SVG
              </p>
              {multiple && images.length > 0 && (
                <p className="text-xs text-slate-500">
                  已上传 {images.length}/{maxImages} 张
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 图片预览列表 */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={index}
              className="relative group rounded-lg border border-slate-700 overflow-hidden bg-slate-900 cursor-pointer"
              onClick={() => setImageViewModal({ images, currentIndex: index })}
            >
              <img
                src={img}
                alt={`预览 ${index + 1}`}
                className="w-full h-32 object-cover"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(index);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="删除"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                图片 {index + 1} - 点击查看
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 图片查看弹窗 */}
      {imageViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setImageViewModal(null)}
        >
          <div 
            className="relative max-w-6xl max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setImageViewModal(null)}
              className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            >
              ✕
            </button>
            
            {/* 图片导航 */}
            {imageViewModal.images.length > 1 && (
              <div className="absolute top-4 left-4 right-16 flex items-center justify-center gap-2 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageViewModal({
                      images: imageViewModal.images,
                      currentIndex: imageViewModal.currentIndex > 0 
                        ? imageViewModal.currentIndex - 1 
                        : imageViewModal.images.length - 1
                    });
                  }}
                  className="bg-black/70 hover:bg-black/90 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  ←
                </button>
                <span className="text-white text-sm bg-black/70 px-3 py-1 rounded">
                  {imageViewModal.currentIndex + 1} / {imageViewModal.images.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageViewModal({
                      images: imageViewModal.images,
                      currentIndex: imageViewModal.currentIndex < imageViewModal.images.length - 1
                        ? imageViewModal.currentIndex + 1
                        : 0
                    });
                  }}
                  className="bg-black/70 hover:bg-black/90 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  →
                </button>
              </div>
            )}

            {/* 当前图片 */}
            {(() => {
              const currentImage = imageViewModal.images[imageViewModal.currentIndex];
              let imageSrc = currentImage;
              
              // 处理 base64 图片
              if (currentImage && /^[A-Za-z0-9+/=]+$/.test(currentImage) && currentImage.length > 100 && !currentImage.startsWith('data:')) {
                imageSrc = `data:image/jpeg;base64,${currentImage}`;
              }
              
              return (
                <img 
                  src={imageSrc || currentImage} 
                  alt={`图片 ${imageViewModal.currentIndex + 1}`}
                  className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain bg-white/5"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.error-message')) {
                      const errorDiv = document.createElement("div");
                      errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                      errorDiv.innerHTML = `<div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div><div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>`;
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* 提示信息 */}
      {multiple && images.length >= maxImages && (
        <p className="text-xs text-amber-400">已达到最大上传数量（{maxImages}张）</p>
      )}
    </div>
  );
}
