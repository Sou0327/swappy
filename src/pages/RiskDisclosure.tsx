import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AlertTriangle, TrendingDown, Shield } from "lucide-react";

const RiskDisclosure = () => {
  const { t } = useTranslation('legal');

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center mb-4">
                <AlertTriangle className="h-12 w-12 text-gray-600" />
              </div>
              <h1 className="text-base md:text-base font-bold text-gray-900">{t('riskDisclosure.title')}</h1>
              <p className="text-gray-600">{t('riskDisclosure.subtitle')}</p>
            </div>

            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-gray-600 mr-2" />
                <p className="font-semibold text-gray-800">{t('riskDisclosure.warnings.important')}</p>
              </div>
              <p className="text-gray-700 mt-2">
                {t('riskDisclosure.warnings.content')}
              </p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
                  <TrendingDown className="h-5 w-5 mr-2 text-gray-600" />
                  {t('riskDisclosure.sections.priceVolatility.title')}
                </h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.priceVolatility.content')}
                </p>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-2">{t('riskDisclosure.sections.priceVolatility.specificRisks.title')}</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {t('riskDisclosure.sections.priceVolatility.specificRisks.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.liquidity.title')}</h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.liquidity.content')}
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('riskDisclosure.sections.liquidity.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.technical.title')}</h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.technical.content')}
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-2">{t('riskDisclosure.sections.technical.platform.title')}</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      {t('riskDisclosure.sections.technical.platform.items', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-800 mb-2">{t('riskDisclosure.sections.technical.blockchain.title')}</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      {t('riskDisclosure.sections.technical.blockchain.items', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-gray-600" />
                  {t('riskDisclosure.sections.security.title')}
                </h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.security.content')}
                </p>
                <div className="space-y-3">
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">{t('riskDisclosure.sections.security.hacking.title')}</h4>
                    <p className="text-gray-700 text-sm">{t('riskDisclosure.sections.security.hacking.content')}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">{t('riskDisclosure.sections.security.phishing.title')}</h4>
                    <p className="text-gray-700 text-sm">{t('riskDisclosure.sections.security.phishing.content')}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <h4 className="font-medium text-gray-800">{t('riskDisclosure.sections.security.keyLoss.title')}</h4>
                    <p className="text-gray-700 text-sm">{t('riskDisclosure.sections.security.keyLoss.content')}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.regulatory.title')}</h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.regulatory.content')}
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('riskDisclosure.sections.regulatory.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.operational.title')}</h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.operational.content')}
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <ul className="list-disc list-inside space-y-2">
                    {t('riskDisclosure.sections.operational.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.mitigation.title')}</h2>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-3">{t('riskDisclosure.sections.mitigation.safeTrading.title')}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      {t('riskDisclosure.sections.mitigation.safeTrading.investment', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      {t('riskDisclosure.sections.mitigation.safeTrading.security', { returnObjects: true }).map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.disclaimer.title')}</h2>
                <div className="bg-gray-100 p-4 rounded-lg border-2 border-gray-300">
                  <p className="leading-relaxed font-medium text-gray-800">
                    {t('riskDisclosure.sections.disclaimer.content')}
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('riskDisclosure.sections.contact.title')}</h2>
                <p className="leading-relaxed">
                  {t('riskDisclosure.sections.contact.content')}
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RiskDisclosure;
