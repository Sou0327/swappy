import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ローディングスピナー
export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  return (
    <Loader2 
      className={cn("animate-spin", sizeClasses[size], className)} 
    />
  );
}

// ローディング状態付きボタン
export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
  loadingText?: string;
}

export function LoadingButton({ 
  loading = false, 
  children, 
  loadingText,
  disabled,
  className,
  ...props 
}: LoadingButtonProps) {
  return (
    <button
      disabled={loading || disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {loading ? (loadingText || "処理中...") : children}
    </button>
  );
}

// ページレベルのローディング表示
export interface PageLoadingProps {
  message?: string;
}

export function PageLoading({ message = "読み込み中..." }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// データローディング表示（テーブル等で使用）
export interface DataLoadingProps {
  rows?: number;
  columns?: number;
}

export function DataLoading({ rows = 5, columns = 4 }: DataLoadingProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-3">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className={cn(
                "h-4 bg-muted animate-pulse rounded",
                colIndex === 0 ? "w-20" : "flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// コンテンツの条件付きレンダリング用
export interface LoadingStateProps {
  loading: boolean;
  error?: unknown;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
}

export function LoadingState({ 
  loading, 
  error, 
  children, 
  loadingComponent,
  errorComponent 
}: LoadingStateProps) {
  if (loading) {
    return <>{loadingComponent || <PageLoading />}</>;
  }

  if (error) {
    return <>{errorComponent || (
      <div className="text-center py-8">
        <p className="text-destructive">エラーが発生しました</p>
        <p className="text-sm text-muted-foreground mt-1">
          ページを再読み込みして再度お試しください
        </p>
      </div>
    )}</>;
  }

  return <>{children}</>;
}