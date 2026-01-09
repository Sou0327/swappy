import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { Info, TrendingUp } from "lucide-react";

const EarnOverview = () => {
  const navigate = useNavigate();
  const earningOptions = [
    { 
      symbol: "BTC", 
      name: "Bitcoin",
      earnLimit: "0.0002 BTC to 200 BTC",
      durations: [
        { days: "フレキシブル", rate: "8.78 % BTC", active: false },
        { days: "7", rate: "8.78 % BTC", active: true },
        { days: "30", rate: "8.78 % BTC", active: true },
        { days: "90", rate: "8.78 % BTC", active: true },
        { days: "180", rate: "8.78 % BTC", active: true },
        { days: "365", rate: "8.78 % BTC", active: true }
      ]
    },
    { 
      symbol: "ETH", 
      name: "Ethereum",
      earnLimit: "0.005 ETH to 5,000 ETH",
      durations: [
        { days: "フレキシブル", rate: "10.56 % ETH", active: false },
        { days: "7", rate: "10.56 % ETH", active: true },
        { days: "30", rate: "10.56 % ETH", active: true },
        { days: "90", rate: "10.56 % ETH", active: true },
        { days: "180", rate: "10.56 % ETH", active: true },
        { days: "365", rate: "10.56 % ETH", active: true }
      ]
    },
    { 
      symbol: "USDT", 
      name: "TetherUS",
      earnLimit: "10 USDT to 10,000,000 USDT",
      durations: [
        { days: "フレキシブル", rate: "22.52 % USDT", active: false },
        { days: "7", rate: "22.52 % USDT", active: true },
        { days: "30", rate: "22.52 % USDT", active: true },
        { days: "90", rate: "22.52 % USDT", active: true },
        { days: "180", rate: "22.52 % USDT", active: true },
        { days: "365", rate: "22.52 % USDT", active: true }
      ]
    },
    { 
      symbol: "USDC", 
      name: "USD Coin",
      earnLimit: "10 USDC to 10,000,000 USDC",
      durations: [
        { days: "フレキシブル", rate: "18.31 % USDC", active: false },
        { days: "7", rate: "18.31 % USDC", active: true },
        { days: "30", rate: "18.31 % USDC", active: true },
        { days: "90", rate: "18.31 % USDC", active: true },
        { days: "180", rate: "18.31 % USDC", active: true },
        { days: "365", rate: "18.31 % USDC", active: true }
      ]
    }
  ];

  const getCoinIcon = (symbol: string) => {
    return symbol; // Return just the symbol without emoji
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">稼ぐ</h1>
        </div>

        {/* Total Asset Valuation */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">合計資産評価額</span>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">
                  $ 0.00 <span className="text-sm font-normal text-muted-foreground">≈ 0.00 BTC</span>
                </div>
              </div>
              <Button onClick={() => navigate("/earn-history")}>履歴を稼ぐ</Button>
            </div>
          </CardContent>
        </Card>

        {/* Earning Options Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">コイン/トークン</th>
                    <th className="text-left p-4 font-medium">稼ぐ制限</th>
                    <th className="text-left p-4 font-medium">期間 (日)</th>
                    <th className="text-left p-4 font-medium">利息</th>
                    <th className="text-left p-4 font-medium">アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {earningOptions.map((option) => (
                    <tr key={option.symbol} className="border-b">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">{option.symbol.slice(0, 2)}</span>
                          </div>
                          <div>
                            <div className="font-semibold">{option.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">{option.earnLimit}</td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {option.durations.map((duration, index) => (
                            <Badge 
                              key={index}
                              variant={duration.active ? "default" : "secondary"}
                              className={`text-xs ${duration.active ? "bg-primary" : "bg-muted"}`}
                            >
                              {duration.days}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-medium">{option.durations[1].rate}</td>
                      <td className="p-4">
                        <Button size="sm" className="bg-destructive hover:bg-destructive/90">
                          購読
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Additional earning options would continue here with more coins like XRP, BNB, SOL, etc. */}
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">さらなる稼ぐオプションを見る</p>
          <Button variant="outline">すべてのプールを探索</Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default EarnOverview;