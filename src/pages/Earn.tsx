import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coins, TrendingUp, Shield, Clock } from "lucide-react";
import { PLATFORM_NAME } from "@/config/branding";

const Earn = () => {
  const { t } = useTranslation('earn');

  const earningOptions = [
    {
      title: t('options.flexible.title'),
      description: t('options.flexible.description'),
      apy: "8.5%",
      riskKey: "low",
      lockupKey: "none",
      icon: <Coins className="h-5 w-5 text-primary" />,
    },
    {
      title: t('options.fixed.title'),
      description: t('options.fixed.description'),
      apy: "12.8%",
      riskKey: "low",
      lockupKey: "days30to90",
      icon: <Shield className="h-5 w-5 text-success" />,
    },
    {
      title: t('options.liquidity.title'),
      description: t('options.liquidity.description'),
      apy: "15.2%",
      riskKey: "medium",
      lockupKey: "none",
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
    },
    {
      title: t('options.launchpad.title'),
      description: t('options.launchpad.description'),
      apy: t('lockupOptions.variable'),
      riskKey: "high",
      lockupKey: "projectBased",
      icon: <Clock className="h-5 w-5 text-accent" />,
    },
  ];

  const topPools = [
    { name: t('poolNames.btcFlexible'), apy: "6.8%", tvl: "$125M", participants: "15.2K" },
    { name: t('poolNames.ethFixed30'), apy: "9.5%", tvl: "$89M", participants: "8.7K" },
    { name: t('poolNames.solUsdcLp'), apy: "18.3%", tvl: "$45M", participants: "3.2K" },
    { name: t('poolNames.maticStaking'), apy: "11.2%", tvl: "$67M", participants: "12.1K" },
  ];

  return (
    <div className="min-h-screen pt-20">
      {/* Header */}
      <section className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-primary">{t('pageTitle')}</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary mb-2">$1.2B+</div>
              <div className="text-muted-foreground">{t('stats.totalAssets')}</div>
            </CardContent>
          </Card>
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-success mb-2">45K+</div>
              <div className="text-muted-foreground">{t('stats.activeStakers')}</div>
            </CardContent>
          </Card>
          <Card className="trading-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary mb-2">15.2%</div>
              <div className="text-muted-foreground">{t('stats.avgApy')}</div>
            </CardContent>
          </Card>
        </div>

        {/* Earning Options */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-8 text-center">{t('selectStrategy')}</h2>
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
                    <div className="text-sm text-muted-foreground">{t('apy')}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{t('riskLevel')}</span>
                      <Badge variant={option.riskKey === "low" ? "default" : option.riskKey === "medium" ? "secondary" : "destructive"}>
                        {t(`risk.${option.riskKey}`)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{t('lockup')}</span>
                      <span className="text-sm">{t(`lockupOptions.${option.lockupKey}`)}</span>
                    </div>
                  </div>
                  <Button className="w-full" variant={index === 0 ? "default" : "secondary"}>
                    {t('startEarning')}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Top Pools */}
        <Card className="trading-card">
          <CardHeader>
            <CardTitle>{t('pools.title')}</CardTitle>
            <CardDescription>{t('pools.subtitle')}</CardDescription>
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
                      <span>{t('pools.participants')} {pool.participants}</span>
                    </div>
                    <Progress value={Math.random() * 100} className="mt-2 h-2" />
                  </div>
                  <Button className="ml-4" size="sm">
                    {t('pools.stakeNow')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center mt-12 p-8 rounded-2xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
          <h3 className="text-2xl font-bold mb-4">{t('cta.title')}</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {t('cta.subtitle', { platform: PLATFORM_NAME })}
          </p>
          <Button size="lg" className="hero-button">
            {t('cta.button')}
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Earn;