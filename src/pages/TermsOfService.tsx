import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PLATFORM_NAME } from "@/config/branding";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-base md:text-base font-bold text-gray-900">利用規約</h1>
              <p className="text-gray-600">最終更新日: 2024年12月15日</p>
            </div>

            <div className="space-y-8 text-gray-700">
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">1. はじめに</h2>
                <p className="leading-relaxed">
                  本利用規約（以下「本規約」）は、{PLATFORM_NAME} Exchange（以下「当社」）が提供する暗号資産取引サービス（以下「本サービス」）の利用に関する条件を定めたものです。
                  本サービスをご利用いただく前に、必ず本規約をお読みいただき、同意の上でご利用ください。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">2. サービスの内容</h2>
                <p className="leading-relaxed">本サービスは以下の機能を提供します：</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>暗号資産の売買および取引</li>
                  <li>ウォレット機能による暗号資産の保管</li>
                  <li>暗号資産の入金・出金</li>
                  <li>取引履歴の管理・閲覧</li>
                  <li>その他当社が定める関連サービス</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">3. アカウント登録</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">3.1 登録資格</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>満18歳以上の個人または法人</li>
                    <li>日本国内に居住している方</li>
                    <li>本人確認書類を提出可能な方</li>
                    <li>当社が定める条件を満たす方</li>
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">3.2 登録情報</h3>
                  <p className="leading-relaxed">
                    ユーザーは、正確かつ最新の情報を登録し、変更があった場合は速やかに更新する必要があります。
                    虚偽の情報を登録した場合、アカウントを停止する場合があります。
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">4. 取引に関する規定</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">4.1 取引手数料</h3>
                  <p className="leading-relaxed">
                    各取引には、当社が定める手数料が発生します。手数料は予告なく変更される場合があります。
                  </p>

                  <h3 className="text-base font-medium text-gray-800">4.2 取引制限</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>1日あたりの取引上限額の設定</li>
                    <li>本人確認レベルに応じた制限</li>
                    <li>システム保守時の取引停止</li>
                    <li>市場の異常時における緊急停止</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">5. 禁止行為</h2>
                <p className="leading-relaxed">ユーザーは以下の行為を行ってはなりません：</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>マネーロンダリングその他の資金洗浄行為</li>
                  <li>不正アクセスやシステムへの攻撃</li>
                  <li>虚偽情報の提供や身分の偽装</li>
                  <li>第三者の権利を侵害する行為</li>
                  <li>公序良俗に反する行為</li>
                  <li>法令に違反する行為</li>
                  <li>その他当社が不適切と判断する行為</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">6. セキュリティ</h2>
                <div className="space-y-3">
                  <h3 className="text-base font-medium text-gray-800">6.1 ユーザーの責任</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>パスワードの適切な管理</li>
                    <li>二段階認証の設定</li>
                    <li>定期的なパスワード変更</li>
                    <li>不正アクセスの疑いがある場合の即座な報告</li>
                  </ul>

                  <h3 className="text-base font-medium text-gray-800">6.2 当社の取り組み</h3>
                  <p className="leading-relaxed">
                    当社は、業界最高水準のセキュリティ対策を講じ、ユーザーの資産と情報を保護します。
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">7. 免責事項</h2>
                <p className="leading-relaxed">
                  当社は、以下の事項について責任を負いません：
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>暗号資産の価格変動による損失</li>
                  <li>ユーザーの操作ミスによる損害</li>
                  <li>第三者によるハッキングやフィッシング</li>
                  <li>通信障害やシステム障害による損害</li>
                  <li>天災地変その他の不可抗力による損害</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">8. サービスの変更・停止</h2>
                <p className="leading-relaxed">
                  当社は、事前の通知をもって、本サービスの内容を変更または停止することができます。
                  ただし、緊急時には事前通知なしに停止する場合があります。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">9. 規約の変更</h2>
                <p className="leading-relaxed">
                  本規約は、法令の変更やサービスの改善により変更される場合があります。
                  変更後の規約は、ウェブサイトでの公表をもって効力を生じます。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">10. 準拠法・管轄</h2>
                <p className="leading-relaxed">
                  本規約は日本法に準拠し、本規約に関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">11. お問い合わせ</h2>
                <p className="leading-relaxed">
                  本規約に関するご質問は、お問い合わせください。
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

export default TermsOfService;