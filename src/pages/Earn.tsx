import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coins, TrendingUp, Shield, Clock } from "lucide-react";
import { PLATFORM_NAME } from "@/config/branding";

const Earn = () => {
  const earningOptions = [
    {
      title: "フレキシブルステーキング",
      description: "ロックアップ期間なしで報酬を獲得",
      apy: "8.5%",
      risk: "低",
      lockup: "ロックなし",
      icon: <Coins className="h-5 w-5 text-primary" />,
    },
    {
      title: "固定ステーキング",
      description: "固定期間でより高い報酬",
      apy: "12.8%",
      risk: "低",
      lockup: "30-90日",
      icon: <Shield className="h-5 w-5 text-success" />,
    },
    {
      title: "流動性マイニング",
      description: "流動性を提供して手数料を獲得",
      apy: "15.2%",
      risk: "中",
      lockup: "ロックなし",
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
    },
    {
      title: "ローンチパッドステーキング",
      description: "新プロジェクトへの参加のためにステーキング",
      apy: "変動",
      risk: "高",
      lockup: "プロジェクト依存",
      icon: <Clock className="h-5 w-5 text-accent" />,
    },
  ];

  const topPools = [
    { name: "BTC フレキシブル", apy: "6.8%", tvl: "$125M", participants: "15.2K" },
    { name: "ETH 固定 30日", apy: "9.5%", tvl: "$89M", participants: "8.7K" },
    { name: "SOL-USDC LP", apy: "18.3%", tvl: "$45M", participants: "3.2K" },
    { name: "MATIC ステーキング", apy: "11.2%", tvl: "$67M", participants: "12.1K" },
  ];

  return (
    <div className="min-h-screen pt-20">
      {/* Header */}
      <section className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-primary">パッシブ収入</span>を稼ぐ
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            競争力のある利回りと柔軟な条件で暗号資産を成長させる多数の方法
          </p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary mb-2">$1.2B+</div>
              <div className="text-muted-foreground">総預かり資産</div>
            </CardContent>
          </Card>
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-success mb-2">45K+</div>
              <div className="text-muted-foreground">アクティブステーカー</div>
            </CardContent>
          </Card>
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary mb-2">15.2%</div>
              <div className="text-muted-foreground">平均年利</div>
            </CardContent>
          </Card>
        </div>

        {/* Earning Options */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-8 text-center">収益戦略を選択</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {earningOptions.map((option, index) => (
              <Card key={index} className="trading-card hover:border-primary/50 transition-colors">
                <CardHeader className="text-center">
                  <div className="mb-4 flex justify-center">{option.icon}</div>
                  <CardTitle className="text-base">{option.title}</CardTitle>
                  <CardDescription>{option.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{option.apy}</div>
                    <div className="text-sm text-muted-foreground">年利</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">リスクレベル:</span>
                      <Badge variant={option.risk === "低" ? "default" : option.risk === "中" ? "secondary" : "destructive"}>
                        {option.risk}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ロックアップ:</span>
                      <span className="text-sm">{option.lockup}</span>
                    </div>
                  </div>
                  <Button className="w-full" variant={index === 0 ? "default" : "secondary"}>
                    稼ぎ始める
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Top Pools */}
        <Card className="trading-card">
          <CardHeader>
            <CardTitle>人気の収益プール</CardTitle>
            <CardDescription>最もアクティブで収益性の高いステーキングプールに参加</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {topPools.map((pool, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{pool.name}</h4>
                      <div className="text-base font-bold text-primary">{pool.apy}</div>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>TVL: {pool.tvl}</span>
                      <span>参加者: {pool.participants}</span>
                    </div>
                    <Progress value={Math.random() * 100} className="mt-2 h-2" />
                  </div>
                  <Button className="ml-4" size="sm">
                    今すぐステーキング
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center mt-12 p-8 rounded-2xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
          <h3 className="text-2xl font-bold mb-4">稼ぎ始める準備はできましたか？</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {PLATFORM_NAME}で既にパッシブ収入を得ている数万人のユーザーに参加しましょう
          </p>
          <Button size="lg" className="hero-button">
            全プールを探索
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Earn;