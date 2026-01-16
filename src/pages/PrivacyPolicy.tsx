import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PLATFORM_NAME } from "@/config/branding";

const PrivacyPolicy = () => {
  const { t } = useTranslation('legal');

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-base md:text-base font-bold text-gray-900">{t('privacyPolicy.title')}</h1>
              <p className="text-gray-600">{t('privacyPolicy.lastUpdated')}</p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.introduction.title')}</h2>
                <p className="leading-relaxed" dangerouslySetInnerHTML={{ __html: t('privacyPolicy.sections.introduction.content', { platformName: PLATFORM_NAME }) }} />
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.collectedInfo.title')}</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">{t('privacyPolicy.sections.collectedInfo.personalInfo.title')}</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    {t('privacyPolicy.sections.collectedInfo.personalInfo.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">{t('privacyPolicy.sections.collectedInfo.technicalInfo.title')}</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    {t('privacyPolicy.sections.collectedInfo.technicalInfo.items', { returnObjects: true }).map((item: string, index: number) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.purpose.title')}</h2>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('privacyPolicy.sections.purpose.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.sharing.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.sharing.intro')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('privacyPolicy.sections.sharing.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.security.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.security.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.rights.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.rights.intro')}</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  {t('privacyPolicy.sections.rights.items', { returnObjects: true }).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.cookies.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.cookies.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.changes.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.changes.content')}</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">{t('privacyPolicy.sections.contact.title')}</h2>
                <p className="leading-relaxed">{t('privacyPolicy.sections.contact.content')}</p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;