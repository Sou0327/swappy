import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Target,
  Award,
  Globe,
  TrendingUp,
  Shield,
  Zap,
  Heart
} from "lucide-react";
import { PLATFORM_NAME } from "@/config/branding";

const About = () => {
  const team = [
    {
      name: "サラ・チェン",
      role: "CEO & 共同創設者",
      bio: "元ゴールドマンサックス副社長、従来の金融と暗号通貨で15年以上の経験",
      image: "https://images.unsplash.com/photo-1494790108755-2616b612b1e8?w=400&h=400&fit=crop&crop=face"
    },
    {
      name: "マーカス・ロドリゲス",
      role: "CTO & 共同創設者", 
      bio: "元Google上級エンジニア、10年以上の経験を持つブロックチェーン専門家",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face"
    },
    {
      name: "エレナ・ボルコフ",
      role: "セキュリティ責任者",
      bio: "一流金融機関出身のサイバーセキュリティ専門家",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face"
    },
    {
      name: "デビッド・キム",
      role: "プロダクト責任者",
      bio: "Apple及びフィンテックスタートアップでの経験を持つプロダクトリーダー",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face"
    }
  ];

  const milestones = [
    { year: "2019", event: `暗号通貨のベテランによって${PLATFORM_NAME}設立`, icon: <Users className="h-5 w-5" /> },
    { year: "2020", event: "50の取引ペアでローンチ", icon: <Zap className="h-5 w-5" /> },
    { year: "2021", event: "100万人以上の登録ユーザーに到達", icon: <TrendingUp className="h-5 w-5" /> },
    { year: "2022", event: "グローバル規制ライセンスを取得", icon: <Shield className="h-5 w-5" /> },
    { year: "2023", event: "100億ドル以上の取引高を達成", icon: <Award className="h-5 w-5" /> },
    { year: "2024", event: "200以上の国に拡大", icon: <Globe className="h-5 w-5" /> }
  ];

  const values = [
    {
      icon: <Shield className="h-5 w-5 text-primary" />,
      title: "セキュリティ第一",
      description: "何よりもユーザー資金のセキュリティを優先し、業界最高レベルのセキュリティ慣行を採用しています。"
    },
    {
      icon: <Users className="h-5 w-5 text-success" />,
      title: "ユーザー中心",
      description: "すべての機能はユーザーを念頭に置いて設計され、最高の取引体験を創造しています。"
    },
    {
      icon: <Globe className="h-5 w-5 text-primary" />,
      title: "グローバルアクセス",
      description: "場所や背景に関係なく、すべての人がどこでも暗号通貨取引を利用できるようにします。"
    },
    {
      icon: <Heart className="h-5 w-5 text-destructive" />,
      title: "透明性",
      description: "私たちの運営、手数料、企業慣行において完全な透明性を信じています。"
    }
  ];

  return (
    <div className="min-h-screen pt-20">
      {/* Header */}
      <section className="container mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-primary">{PLATFORM_NAME}</span>について
          </h1>
          <p className="text-base text-muted-foreground max-w-3xl mx-auto">
            革新的技術、妥協のないセキュリティ、卓越したユーザーエクスペリエンスを通じて
            暗号通貨取引へのアクセスを民主化することが私たちの使命です。
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <Card className="trading-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Target className="h-5 w-5 text-primary" />
                私たちの使命
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                世界で最も信頼され、ユーザーフレンドリーな暗号通貨取引所を構築し、
                数百万人の人々が自信を持ってデジタル経済に参加できるよう支援します。
                暗号通貨を通じて、すべての人が経済的自由にアクセスできるべきだと信じています。
              </p>
            </CardContent>
          </Card>

          <Card className="trading-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <TrendingUp className="h-5 w-5 text-success" />
                私たちのビジョン
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                従来の金融と分散化された未来の架け橋となり、
                誰もが機関レベルのセキュリティとシンプルさで暗号通貨を通じて
                取引、投資、富を築くことができるシームレスなエコシステムを創造することです。
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-16">
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-primary mb-2">5M+</div>
              <div className="text-muted-foreground">グローバルユーザー</div>
            </CardContent>
          </Card>
          <Card className="trading-card text-center">
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-success mb-2">200+</div>
              <div className="text-muted-foreground">サービス提供国</div>
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
              <div className="text-muted-foreground">プラットフォーム稼働率</div>
            </CardContent>
          </Card>
        </div>

        {/* Company Values */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-4">私たちの核となる価値観</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              これらの原則は私たちが行うすべてを導き、企業文化を形作っています
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <Card key={index} className="trading-card text-center hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="mb-4 flex justify-center">{value.icon}</div>
                  <CardTitle className="text-base">{value.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {value.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-4">私たちの歩み</h2>
            <p className="text-muted-foreground">
              暗号通貨取引を革命化する使命における主要なマイルストーン
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {milestones.map((milestone, index) => (
              <Card key={index} className="trading-card">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      {milestone.icon}
                    </div>
                    <div>
                      <Badge className="mb-2">{milestone.year}</Badge>
                      <p className="text-sm text-muted-foreground">{milestone.event}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-4">リーダーシップチーム</h2>
            <p className="text-muted-foreground">
              {PLATFORM_NAME}を前進させる経験豊富な専門家たちをご紹介します
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <Card key={index} className="trading-card text-center">
                <CardContent className="p-6">
                  <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-4 overflow-hidden">
                    <img 
                      src={member.image} 
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-semibold text-base mb-1">{member.name}</h3>
                  <Badge variant="secondary" className="mb-3">{member.role}</Badge>
                  <p className="text-sm text-muted-foreground">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-8 rounded-2xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
          <h3 className="text-2xl font-bold mb-4">私たちの使命に参加</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            暗号通貨革命の一部となり、金融の未来を形作る手助けをしてください
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="hero-button">
              今日から取引開始
            </Button>
            <Button size="lg" variant="secondary">
              キャリアを探索
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;