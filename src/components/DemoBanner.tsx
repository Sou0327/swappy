import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Github } from "lucide-react";

const GITHUB_URL = "https://github.com/Sou0327/undefined-exchange";

export const DemoBanner = () => {
  const { isDemoMode } = useAuth();

  if (!isDemoMode) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
      <div className="container mx-auto px-4 py-2">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">🎭</span>
            <span className="font-medium">ショーケースモードで閲覧中</span>
            <span className="hidden sm:inline text-amber-100">
              - 機能をお試しいただけます
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 hover:text-white h-8 px-3"
            asChild
          >
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">GitHub で見る</span>
              <span className="sm:hidden">GitHub</span>
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DemoBanner;
