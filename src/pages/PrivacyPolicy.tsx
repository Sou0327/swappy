import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PLATFORM_NAME } from "@/config/branding";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-base md:text-base font-bold text-gray-900">プライバシーポリシー</h1>
              <p className="text-gray-600">最終更新日: 2024年12月15日</p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">1. はじめに</h2>
                <p className="leading-relaxed">
                  {PLATFORM_NAME} Exchange（以下「当社」）は、ユーザーの皆様のプライバシーを尊重し、個人情報の保護に努めています。
                  本プライバシーポリシーは、当社のサービスをご利用いただく際に収集する情報の種類、使用方法、保護方法について説明します。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">2. 収集する情報</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">個人情報</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>氏名、メールアドレス、電話番号</li>
                    <li>本人確認のための書類情報</li>
                    <li>取引履歴および口座残高情報</li>
                    <li>ウォレットアドレスおよび取引データ</li>
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">技術的情報</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>IPアドレス、ブラウザタイプ、デバイス情報</li>
                    <li>ログイン情報およびセッションデータ</li>
                    <li>クッキーおよび類似の技術による情報</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">3. 情報の使用目的</h2>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>アカウントの作成・管理および本人確認</li>
                  <li>取引の実行・決済・記録の維持</li>
                  <li>法的義務の履行およびコンプライアンスの確保</li>
                  <li>不正行為の防止・検出・調査</li>
                  <li>カスタマーサポートの提供</li>
                  <li>サービスの改善・新機能の開発</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">4. 情報の共有</h2>
                <p className="leading-relaxed">
                  当社は、以下の場合を除き、お客様の個人情報を第三者に開示することはありません：
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>法令に基づく開示が必要な場合</li>
                  <li>お客様の同意がある場合</li>
                  <li>サービス提供に必要な業務委託先への開示</li>
                  <li>合併・買収等の企業再編時</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">5. セキュリティ</h2>
                <p className="leading-relaxed">
                  当社は、お客様の個人情報を保護するため、業界標準のセキュリティ対策を実施しています。
                  これには、暗号化技術、アクセス制御、定期的なセキュリティ監査が含まれます。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">6. お客様の権利</h2>
                <p className="leading-relaxed">
                  お客様には、以下の権利があります：
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>個人情報の開示・訂正・削除を求める権利</li>
                  <li>個人情報の利用停止を求める権利</li>
                  <li>データポータビリティの権利</li>
                  <li>マーケティングメールの配信停止</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">7. クッキーについて</h2>
                <p className="leading-relaxed">
                  当社のウェブサイトでは、ユーザー体験の向上とサービスの分析のためにクッキーを使用しています。
                  ブラウザの設定でクッキーを無効にすることができますが、一部の機能が制限される場合があります。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">8. 変更について</h2>
                <p className="leading-relaxed">
                  本プライバシーポリシーは、法令の変更やサービスの改善に伴い更新される場合があります。
                  重要な変更がある場合は、ウェブサイトでの告知やメールでお知らせします。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">9. お問い合わせ</h2>
                <p className="leading-relaxed">
                  本プライバシーポリシーに関するご質問やご意見は、お問い合わせください。
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

export default PrivacyPolicy;