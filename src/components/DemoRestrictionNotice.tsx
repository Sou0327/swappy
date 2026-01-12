import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { GITHUB_URL } from "@/config/branding";
import { AlertTriangle, Github } from "lucide-react";
import { useTranslation } from "react-i18next";

// Feature keys that map to demo.json features.*
export type RestrictedFeature =
  | "deposit"
  | "withdraw"
  | "trading"
  | "transfer"
  | "convert"
  | "kyc"
  | "security"
  | "account";

interface DemoRestrictionNoticeProps {
  feature: RestrictedFeature;
  className?: string;
}

export const DemoRestrictionNotice = ({
  feature,
  className = "",
}: DemoRestrictionNoticeProps) => {
  const { isDemoMode } = useAuth();
  const { t } = useTranslation('demo');

  if (!isDemoMode) return null;

  // Get translated feature name
  const featureName = t(`features.${feature}`);

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
              {t('restriction.title', { feature: featureName })}
            </h3>
            <p className="text-sm text-amber-700 mt-2">
              {t('restriction.description')}{' '}
              {t('restriction.disabledMessage', { feature: featureName })}
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              <Button variant="outline" asChild>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="w-4 h-4 mr-2" />
                  {t('restriction.viewGithub')}
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
