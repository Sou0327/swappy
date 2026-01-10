import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Github } from "lucide-react";

const GITHUB_URL = "https://github.com/Sou0327/undefined-exchange";

type RestrictedFeature =
  | "入金"
  | "出金"
  | "取引"
  | "送金"
  | "両替"
  | "KYC"
  | "セキュリティ設定"
  | "アカウント設定";

interface DemoRestrictionNoticeProps {
  feature: RestrictedFeature;
  className?: string;
}

export const DemoRestrictionNotice = ({
  feature,
  className = "",
}: DemoRestrictionNoticeProps) => {
  const { isDemoMode } = useAuth();

  if (!isDemoMode) return null;

  return (
    <Card className={`border-amber-200 bg-amber-50 ${className}`}>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-amber-800 text-lg">
              ショーケースモードでは{feature}機能をお試しいただけません
            </h3>
            <p className="text-sm text-amber-700 mt-2">
              このプラットフォームはショーケースモードで閲覧中です。
              実際の{feature}操作は無効化されています。
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="outline" asChild>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="w-4 h-4 mr-2" />
                  GitHub で見る
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DemoRestrictionNotice;
