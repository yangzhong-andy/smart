/**
 * InteractiveButton 使用示例
 * 
 * 这是一个示例文件，展示如何使用 InteractiveButton 组件
 */

"use client";

import InteractiveButton from "./InteractiveButton";
import { useAction } from "@/hooks/useAction";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";

export function ExampleUsage() {
  // 使用 useAction Hook 管理操作状态
  const saveAction = useAction({
    onSuccess: (data) => {
      toast.success("保存成功！");
    },
    onError: (error) => {
      toast.error(`保存失败：${error.message}`);
    },
  });

  const handleSave = async () => {
    await saveAction.execute(async () => {
      // 模拟 API 调用
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // 操作完成
      console.log("Action completed");
    });
  };

  return (
    <div className="space-x-4">
      {/* 基础用法 - 自动显示 loading 和成功图标 */}
      <InteractiveButton onClick={handleSave}>
        保存
      </InteractiveButton>

      {/* 带图标 */}
      <InteractiveButton 
        onClick={handleSave}
        icon={<Save className="h-4 w-4" />}
        iconPosition="left"
      >
        保存数据
      </InteractiveButton>

      {/* 不同变体 */}
      <InteractiveButton variant="primary">主要操作</InteractiveButton>
      <InteractiveButton variant="secondary">次要操作</InteractiveButton>
      <InteractiveButton variant="danger" icon={<Trash2 className="h-4 w-4" />}>
        删除
      </InteractiveButton>
      <InteractiveButton variant="success">成功操作</InteractiveButton>
      <InteractiveButton variant="ghost">幽灵按钮</InteractiveButton>

      {/* 不同尺寸 */}
      <InteractiveButton size="sm">小按钮</InteractiveButton>
      <InteractiveButton size="md">中等按钮</InteractiveButton>
      <InteractiveButton size="lg">大按钮</InteractiveButton>

      {/* 禁用成功图标 */}
      <InteractiveButton 
        onClick={handleSave}
        showSuccessIcon={false}
      >
        不显示成功图标
      </InteractiveButton>
    </div>
  );
}
