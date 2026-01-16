import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PLATFORM_NAME } from "@/config/branding";

const TermsOfService = () => {
  const { t } = useTranslation('legal');

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-base md:text-base font-bold text-gray-900">{t('termsOfService.title')}</h1>
              <p className="text-gray-600">{t('termsOfService.lastUpdated')}</p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.introduction.title')}</h2>
                <p className="leading-relaxed" dangerouslySetInnerHTML={{ __html: t('termsOfService.sections.introduction.content', { platformName: PLATFORM_NAME }) }} />
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.serviceDescription.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.serviceDescription.intro')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('termsOfService.sections.serviceDescription.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.accountRegistration.title')}</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.accountRegistration.eligibility.title')}</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    {t('termsOfService.sections.accountRegistration.eligibility.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.accountRegistration.information.title')}</h3>
                  <p className="leading-relaxed">
                    {t('termsOfService.sections.accountRegistration.information.content')}
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.tradingRules.title')}</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.tradingRules.fees.title')}</h3>
                  <p className="leading-relaxed">
                    {t('termsOfService.sections.tradingRules.fees.content')}
                  </p>

                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.tradingRules.limits.title')}</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    {t('termsOfService.sections.tradingRules.limits.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.prohibitedActions.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.prohibitedActions.intro')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('termsOfService.sections.prohibitedActions.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.security.title')}</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.security.userResponsibility.title')}</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    {t('termsOfService.sections.security.userResponsibility.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">{t('termsOfService.sections.security.companyEffort.title')}</h3>
                  <p className="leading-relaxed">
                    {t('termsOfService.sections.security.companyEffort.content')}
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.disclaimer.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.disclaimer.intro')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('termsOfService.sections.disclaimer.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.serviceChanges.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.serviceChanges.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.termsChanges.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.termsChanges.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.governingLaw.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.governingLaw.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('termsOfService.sections.contact.title')}</h2>
                <p className="leading-relaxed">{t('termsOfService.sections.contact.content')}</p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TermsOfService;
