import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Zap, 
  BarChart3, 
  Smartphone, 
  Lock, 
  TrendingUp,
  Globe,
  Users,
  Clock,
  DollarSign,
  Layers,
  Target
} from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: <Shield className="h-5 w-5 text-primary" />,
      title: "銀行級セキュリティ",
      description: "コールドストレージ、2FA、保険補償を備えた多層セキュリティ",
      benefits: ["コールドウォレット保管", "保険基金", "定期監査", "24時間365日監視"]
    },
    {
      icon: <Zap className="h-5 w-5 text-success" />,
      title: "超高速",
      description: "平均実行時間50msの超低レイテンシ取引",
      benefits: ["50msレイテンシ", "高頻度取引", "リアルタイムデータ", "即座の決済"]
    },
    {
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      title: "高度な取引ツール",
      description: "テクニカル分析とポートフォリオ管理のためのプロ級ツール",
      benefits: ["100以上のインジケーター", "カスタム戦略", "リスク管理", "APIアクセス"]
    },
    {
      icon: <Smartphone className="h-5 w-5 text-accent" />,
      title: "モバイルファースト",
      description: "外出先での取引のための全機能モバイルアプリ",
      benefits: ["iOS & Android", "プッシュ通知", "生体認証ログイン", "オフラインモード"]
    },
    {
      icon: <DollarSign className="h-5 w-5 text-success" />,
      title: "低手数料",
      description: "シンプルで透明性の高い手数料構造",
      benefits: ["0.02%基本手数料", "出来高割引", "メーカーリベート", "隠れた手数料なし"]
    },
    {
      icon: <Globe className="h-5 w-5 text-primary" />,
      title: "グローバルアクセス",
      description: "現地の支払い方法で世界中で利用可能",
      benefits: ["200以上の国", "50以上の法定通貨", "現地銀行", "多言語対応"]
    }
  ];

  const tradingFeatures = [
    {
      icon: <Target className="h-5 w-5 text-primary" />,
      title: "注文タイプ",
      description: "成行、指値、ストップロス、利確、および高度な注文タイプ"
    },
    {
      icon: <Layers className="h-5 w-5 text-success" />,
      title: "証拠金取引",
      description: "選択された暗号通貨ペアで最大100倍のレバレッジ"
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      title: "コピー取引",
      description: "成功したトレーダーをフォローして自動的に取引をコピー"
    },
    {
      icon: <Clock className="h-5 w-5 text-accent" />,
      title: "自動取引",
      description: "取引ボットと自動戦略を設定"
    }
  ];

  return (
    <div className="min-h-screen pt-20">
      {/* Header */}
      <section className="container mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            強力な<span className="text-primary">機能</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            プロフェッショナルな暗号通貨取引と投資に必要なすべて
          </p>
        </div>

        {/* Core Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card key={index} className="trading-card hover:border-primary/50 transition-all duration-300 group">
              <CardHeader>
                <div className="mb-4 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <CardTitle className="text-base mb-2">{feature.title}</CardTitle>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {feature.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trading Features */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-4">高度な取引機能</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              本格的なトレーダーと投資家のために設計されたプロフェッショナルツール
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tradingFeatures.map((feature, index) => (
              <Card key={index} className="trading-card text-center p-6 hover:border-primary/50 transition-colors">
                <div className="mb-4 flex justify-center">{feature.icon}</div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Security Section */}
        <Card className="trading-card mb-16">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              セキュリティファーストアプローチ
            </CardTitle>
            <CardDescription className="text-base max-w-2xl mx-auto">
              あなたのセキュリティが私たちの最優先事項です。資産を保護するために業界最高レベルのセキュリティ対策を採用しています
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">コールドストレージ</h4>
                <p className="text-sm text-muted-foreground">
                  資金の95%を軍事級コールドストレージ施設でオフライン保管
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-5 w-5 text-success" />
                </div>
                <h4 className="font-semibold mb-2">マルチシグネチャ</h4>
                <p className="text-sm text-muted-foreground">
                  セキュリティ強化のため、すべての取引に複数の署名が必要
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-5 w-5 text-accent" />
                </div>
                <h4 className="font-semibold mb-2">保険</h4>
                <p className="text-sm text-muted-foreground">
                  潜在的な侵害からユーザー資産を保護する1億ドルの保険基金
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-16">
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-primary mb-2">500+</div>
              <div className="text-muted-foreground">取引ペア</div>
            </CardContent>
          </Card>
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-success mb-2">5M+</div>
              <div className="text-muted-foreground">アクティブユーザー</div>
            </CardContent>
          </Card>
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-primary mb-2">$50B+</div>
              <div className="text-muted-foreground">取引高</div>
            </CardContent>
          </Card>
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-success mb-2">99.9%</div>
              <div className="text-muted-foreground">稼働率</div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center p-8 rounded-2xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
          <h3 className="text-2xl font-bold mb-4">すべての機能を体験</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            数百万人のユーザーに参加して、最も先進的な暗号通貨プラットフォームで取引を始めましょう
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="hero-button">
              今すぐ取引開始
            </Button>
            <Button size="lg" variant="secondary">
              デモを見る
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Features;