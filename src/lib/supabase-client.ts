import { createClient } from '@supabase/supabase-js';

// Supabase 配置
// 请确保在 .env.local 文件中配置了以下环境变量：
// NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 检查环境变量是否配置
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase 环境变量未配置！请在 .env.local 文件中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY');
  // 开发环境下提供占位值，避免运行时错误
  if (typeof window !== 'undefined') {
    console.warn('使用占位值创建 Supabase 客户端，登录功能将无法正常工作');
  }
}

// 创建 Supabase 客户端（即使环境变量为空也会创建，但功能不可用）
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
